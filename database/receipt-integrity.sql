-- Apply after channels.sql on existing installations. Idempotent; preserves jobs and connections.
-- Provision the capability digest as described in docs/NATIVE-DELIVERY.md before enabling sends.
begin;
-- Only a digest of the purpose-specific server capability is provisioned by a database admin.
-- Never grant clients access to this table; an owner's browser cannot certify provider results.
create schema if not exists pull_private;
create table if not exists pull_private.delivery_receipt_capability (
 singleton boolean primary key default true check(singleton),
 capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$')
);
alter table pull_private.delivery_receipt_capability enable row level security;
revoke all on pull_private.delivery_receipt_capability from public,anon,authenticated,service_role;
create or replace function pull_private.require_delivery_capability(p_capability text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_capability is null or p_capability !~ '^[0-9a-f]{64}$' or not exists (
  select 1 from pull_private.delivery_receipt_capability
  where singleton and capability_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_capability,'UTF8')),'hex')
 ) then raise exception 'Server delivery authorization required' using errcode='42501';end if;
end;$$;
revoke all on function pull_private.require_delivery_capability(text) from public,anon,authenticated,service_role;
-- Remove the browser-callable signatures, including on an existing installation.
drop function if exists public.reserve_pull_delivery(uuid,text,text,text,bigint,text);
drop function if exists public.finish_pull_delivery(uuid,text,text);
create or replace function public.reserve_pull_delivery(p_connection uuid,p_key text,p_recipient text,p_prospect text,p_revision bigint,p_consent text,p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.pull_delivery_jobs%rowtype; owner uuid:=auth.uid();
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
 perform pull_private.require_delivery_capability(p_capability);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pull_delivery:'||owner::text,0));
 if not exists(select 1 from public.pull_channel_connections where id=p_connection and user_id=owner and revoked_at is null) or not exists(select 1 from public.pull_workspaces where user_id=owner and revision=p_revision) then raise exception 'Connection or workspace changed' using errcode='P0001';end if;
 update public.pull_delivery_jobs set status='uncertain',finished_at=now() where user_id=owner and connection_id=p_connection and status='sending' and created_at<now()-interval '2 minutes';
 select * into j from public.pull_delivery_jobs where user_id=owner and dedupe_key=p_key;
 if found then
  if j.status='failed' and j.attempts<3 and j.finished_at<now()-interval '1 minute'
   and not exists(select 1 from public.pull_delivery_jobs where user_id=owner and connection_id=p_connection and status='sending')
   and (select coalesce(sum(attempts),0) from public.pull_delivery_jobs where user_id=owner and created_at>now()-interval '1 day')<100 then
   update public.pull_delivery_jobs set status='sending',attempts=attempts+1,created_at=now(),finished_at=null where id=j.id returning * into j;
   return jsonb_build_object('claimed',true,'id',j.id,'status',j.status);
  end if;
  return jsonb_build_object('claimed',false,'id',j.id,'status',j.status,'receipt',j.provider_receipt);
 end if;
 -- Do not overlap refreshes/sends for one account; ambiguous requests are never retried automatically.
 if exists(select 1 from public.pull_delivery_jobs where user_id=owner and connection_id=p_connection and status='sending') then raise exception 'A send is pending; inspect it before sending again' using errcode='P0001';end if;
 if (select coalesce(sum(attempts),0) from public.pull_delivery_jobs where user_id=owner and created_at>now()-interval '1 day')>=100 then raise exception 'Daily delivery limit reached' using errcode='54000';end if;
 insert into public.pull_delivery_jobs(user_id,connection_id,dedupe_key,recipient,prospect_id,workspace_revision,consent_evidence) values(owner,p_connection,p_key,p_recipient,p_prospect,p_revision,p_consent) returning * into j;
 return jsonb_build_object('claimed',true,'id',j.id,'status',j.status);
end;$$;
revoke all on function public.reserve_pull_delivery(uuid,text,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.reserve_pull_delivery(uuid,text,text,text,bigint,text,text) to authenticated;
create or replace function public.finish_pull_delivery(p_job uuid,p_status text,p_receipt text,p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.pull_delivery_jobs%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
 perform pull_private.require_delivery_capability(p_capability);
 if p_status is null or p_status not in ('submitted','failed','uncertain') or length(coalesce(p_receipt,''))>500 or (p_status='submitted' and coalesce(length(p_receipt),0)=0) then raise exception 'Invalid receipt' using errcode='22023';end if;
 update public.pull_delivery_jobs set status=p_status,provider_receipt=nullif(p_receipt,''),finished_at=now() where id=p_job and user_id=auth.uid() and status='sending' returning * into j;
 if not found then select * into j from public.pull_delivery_jobs where id=p_job and user_id=auth.uid();end if;
 if not found then raise exception 'Delivery unavailable' using errcode='42501';end if;
 return jsonb_build_object('id',j.id,'status',j.status,'receipt',j.provider_receipt);
end;$$;
revoke all on function public.finish_pull_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_pull_delivery(uuid,text,text,text) to authenticated;
commit;
