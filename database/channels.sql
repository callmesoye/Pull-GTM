begin;
create table if not exists public.pull_channel_connections (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('gmail','x')),account_id text not null check(length(account_id) between 1 and 200),
 label text not null check(length(label) between 1 and 254),token_cipher text not null check(length(token_cipher)<=40000),
 expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now(),unique(user_id,provider)
);
alter table public.pull_channel_connections enable row level security;
revoke all on public.pull_channel_connections from public,anon,authenticated;
grant select,insert,update on public.pull_channel_connections to authenticated;
drop policy if exists "Own channel connections" on public.pull_channel_connections;
create policy "Own channel connections" on public.pull_channel_connections for all to authenticated
 using(user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true')
 with check(user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true');
create index if not exists pull_channels_owner on public.pull_channel_connections(user_id);
create table if not exists public.pull_delivery_jobs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid not null references public.pull_channel_connections(id),dedupe_key text not null check(dedupe_key~'^[0-9a-f]{64}$'),
 recipient text not null check(length(recipient) between 1 and 254),prospect_id text not null check(length(prospect_id) between 1 and 200),workspace_revision bigint not null,
 consent_evidence text not null check(length(consent_evidence) between 12 and 1000),
 attempts integer not null default 1 check(attempts between 1 and 3),
 status text not null default 'sending' check(status in('sending','submitted','failed','uncertain')),provider_receipt text,
 created_at timestamptz not null default now(),finished_at timestamptz,unique(user_id,dedupe_key)
);
alter table public.pull_delivery_jobs enable row level security;
revoke all on public.pull_delivery_jobs from public,anon,authenticated;
grant select on public.pull_delivery_jobs to authenticated;
drop policy if exists "Read own delivery receipts" on public.pull_delivery_jobs;
create policy "Read own delivery receipts" on public.pull_delivery_jobs for select to authenticated
 using(user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true');
create index if not exists pull_delivery_owner_created on public.pull_delivery_jobs(user_id,created_at desc);
create or replace function public.reserve_pull_delivery(p_connection uuid,p_key text,p_recipient text,p_prospect text,p_revision bigint,p_consent text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.pull_delivery_jobs%rowtype; owner uuid:=auth.uid();
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
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
revoke all on function public.reserve_pull_delivery(uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.reserve_pull_delivery(uuid,text,text,text,bigint,text) to authenticated;
create or replace function public.finish_pull_delivery(p_job uuid,p_status text,p_receipt text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.pull_delivery_jobs%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
 if p_status not in ('submitted','failed','uncertain') or length(coalesce(p_receipt,''))>500 or (p_status='submitted' and coalesce(length(p_receipt),0)=0) then raise exception 'Invalid receipt' using errcode='22023';end if;
 update public.pull_delivery_jobs set status=p_status,provider_receipt=nullif(p_receipt,''),finished_at=now() where id=p_job and user_id=auth.uid() and status='sending' returning * into j;
 if not found then select * into j from public.pull_delivery_jobs where id=p_job and user_id=auth.uid();end if;
 if not found then raise exception 'Delivery unavailable' using errcode='42501';end if;
 return jsonb_build_object('id',j.id,'status',j.status,'receipt',j.provider_receipt);
end;$$;
revoke all on function public.finish_pull_delivery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_pull_delivery(uuid,text,text) to authenticated;
commit;
