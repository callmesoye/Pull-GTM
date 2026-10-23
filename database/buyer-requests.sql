-- Additive, isolated V2 preparation. Requires offer-versions.sql.
-- The Supabase CLI is unavailable in this workspace; register in the target
-- migration workflow and run advisors before staging enablement.
begin;
create schema if not exists pull_private;
create table if not exists public.pull_buyer_requests(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null check(revision between 1 and 2147483647),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=8000),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null
);
create table if not exists public.pull_buyer_request_versions(
 request_id uuid not null references public.pull_buyer_requests(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null check(revision between 1 and 2147483647),
 request_key uuid not null,
 payload jsonb not null,
 saved_at timestamptz not null default clock_timestamp(),
 primary key(request_id,revision),unique(user_id,request_key)
);
create table if not exists pull_private.buyer_request_lookups(
 user_id uuid not null references auth.users(id) on delete cascade,
 lookup_day date not null,
 used integer not null check(used between 1 and 200),
 primary key(user_id,lookup_day)
);
alter table public.pull_buyer_requests enable row level security;
alter table public.pull_buyer_request_versions enable row level security;
alter table pull_private.buyer_request_lookups enable row level security;
revoke all on public.pull_buyer_requests,public.pull_buyer_request_versions,pull_private.buyer_request_lookups from public,anon,authenticated,service_role;
grant select on public.pull_buyer_requests,public.pull_buyer_request_versions to authenticated;
drop policy if exists buyer_request_owner on public.pull_buyer_requests;
create policy buyer_request_owner on public.pull_buyer_requests for select to authenticated
 using((select auth.uid())=user_id and coalesce((select auth.jwt())->>'is_anonymous','false')<>'true');
drop policy if exists buyer_request_version_owner on public.pull_buyer_request_versions;
create policy buyer_request_version_owner on public.pull_buyer_request_versions for select to authenticated
 using((select auth.uid())=user_id and coalesce((select auth.jwt())->>'is_anonymous','false')<>'true');
create index if not exists buyer_request_recent on public.pull_buyer_requests(updated_at desc,id);
create index if not exists buyer_request_owner_recent on public.pull_buyer_requests(user_id,updated_at desc);
create index if not exists buyer_request_discoverable on public.pull_buyer_requests(updated_at desc,id)
 where payload->>'status'='open' and payload->>'discoverable'='true';
create index if not exists buyer_request_daily_saves on public.pull_buyer_request_versions(user_id,saved_at);

create or replace function pull_private.save_buyer_request(p_request uuid,p_expected_revision integer,p_request_key uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); latest public.pull_buyer_requests%rowtype; retry public.pull_buyer_request_versions%rowtype;
 result public.pull_buyer_requests%rowtype; pair record; budget jsonb; amount numeric; withdrawing boolean;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true'
 then raise exception 'Signed in owner required' using errcode='42501';end if;
 if p_request is null or p_request_key is null or p_expected_revision is null or p_expected_revision not between 0 and 2147483646
 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8000 then raise exception 'Invalid request' using errcode='22023';end if;
 if not p_payload ?& array['product','location','category','requirements','budget','validForDays','status','discoverable','contactAllowed']
 or p_payload-array['product','location','category','requirements','budget','validForDays','status','discoverable','contactAllowed']<>'{}'::jsonb
 or jsonb_typeof(p_payload->'product')<>'string' or length(btrim(p_payload->>'product')) not between 1 and 500
 or jsonb_typeof(p_payload->'location')<>'string' or length(btrim(p_payload->>'location')) not between 1 and 120
 or jsonb_typeof(p_payload->'category')<>'string' or jsonb_typeof(p_payload->'status')<>'string'
 or p_payload->>'category' not in ('goods','service','wholesale') or p_payload->>'status' not in ('open','closed')
 or jsonb_typeof(p_payload->'validForDays')<>'number' or (p_payload->>'validForDays')!~'^(?:[1-9]|[12][0-9]|30)$'
 or jsonb_typeof(p_payload->'discoverable')<>'boolean' or jsonb_typeof(p_payload->'contactAllowed')<>'boolean'
 or jsonb_typeof(p_payload->'requirements')<>'object'
 then raise exception 'Invalid request fields' using errcode='22023';end if;
 for pair in select * from jsonb_each(p_payload->'requirements') loop
  if pair.key not in ('model','year','variant','condition','material','capacity','service_scope','quantity','delivery')
  or jsonb_typeof(pair.value)<>'string' or length(btrim(pair.value #>> '{}')) not between 1 and 250
  or pair.key='year' and (pair.value #>> '{}')!~'^\d{4}$'
  then raise exception 'Invalid requirement' using errcode='22023';end if;
 end loop;
 budget:=p_payload->'budget';
 if budget<>'null'::jsonb then
  if jsonb_typeof(budget)<>'object' then raise exception 'Invalid budget' using errcode='22023';end if;
  if not budget ?& array['currency','maxAmount','basis'] or budget-array['currency','maxAmount','basis']<>'{}'::jsonb
  or jsonb_typeof(budget->'currency')<>'string' or jsonb_typeof(budget->'basis')<>'string'
  or budget->>'currency' not in ('NGN','USD','GBP','EUR') or budget->>'basis' not in ('total','per_unit')
  or jsonb_typeof(budget->'maxAmount')<>'number' then raise exception 'Invalid budget' using errcode='22023';end if;
  amount:=(budget->>'maxAmount')::numeric;
  if amount<=0 or amount>1000000000000 or trunc(amount,2)<>amount then raise exception 'Invalid budget amount' using errcode='22023';end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('buyer-request:'||owner::text,0));
 select * into latest from public.pull_buyer_requests where id=p_request for update;
 if found and latest.user_id<>owner then raise exception 'Request unavailable' using errcode='42501';end if;
 select * into retry from public.pull_buyer_request_versions where user_id=owner and request_key=p_request_key;
 if found then
  if retry.request_id<>p_request or retry.revision<>p_expected_revision+1 or retry.payload<>p_payload
  then raise exception 'Retry changed' using errcode='22023';end if;
  -- Return the latest canonical state if another tab has since updated it.
  return to_jsonb(latest);
 end if;
 withdrawing:=latest.id is not null and p_payload=latest.payload||jsonb_build_object('status','closed','discoverable',false,'contactAllowed',false);
 if not withdrawing and not exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then raise exception 'Confirmed email account required' using errcode='42501';end if;
 if withdrawing and latest.payload=p_payload then return to_jsonb(latest);end if;
 if coalesce(latest.revision,0)<>p_expected_revision then raise exception 'Request changed' using errcode='40001';end if;
 if not withdrawing and (select count(*) from public.pull_buyer_request_versions where user_id=owner and saved_at>clock_timestamp()-interval '24 hours')>=50
 then raise exception 'Daily request limit' using errcode='P0001';end if;
 if latest.id is null then
  insert into public.pull_buyer_requests(id,user_id,revision,payload,expires_at)
   values(p_request,owner,1,p_payload,clock_timestamp()+make_interval(days=>(p_payload->>'validForDays')::integer)) returning * into result;
 else
  update public.pull_buyer_requests set revision=latest.revision+1,payload=p_payload,updated_at=clock_timestamp(),
   expires_at=clock_timestamp()+make_interval(days=>(p_payload->>'validForDays')::integer)
   where id=p_request returning * into result;
 end if;
 insert into public.pull_buyer_request_versions(request_id,user_id,revision,request_key,payload) values(p_request,owner,result.revision,p_request_key,p_payload);
 return to_jsonb(result);
end;$$;

create or replace function pull_private.withdraw_buyer_request(p_request uuid,p_expected_revision integer,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); latest public.pull_buyer_requests%rowtype;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('buyer-request:'||owner::text,0));
 select * into latest from public.pull_buyer_requests where id=p_request and user_id=owner for update;
 if not found then raise exception 'Request unavailable' using errcode='42501';end if;
 return pull_private.save_buyer_request(p_request,p_expected_revision,p_request_key,latest.payload||jsonb_build_object('status','closed','discoverable',false,'contactAllowed',false));
end;$$;

create or replace function pull_private.match_buyer_requests(p_offer uuid,p_offer_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); offer public.pull_offer_versions%rowtype; rows jsonb; usage_count integer;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true'
 then raise exception 'Signed in owner required' using errcode='42501';end if;
 if p_offer is null or p_offer_version is null or p_offer_version not between 1 and 100 then raise exception 'Invalid offer' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offer:'||owner::text,0));
 select * into offer from public.pull_offer_versions where user_id=owner and offer_id=p_offer order by version desc limit 1;
 if not found then raise exception 'Offer unavailable' using errcode='42501';end if;
 if offer.version<>p_offer_version then raise exception 'Offer changed' using errcode='40001';end if;
 if coalesce(offer.fields->>'category','') not in ('goods','service','wholesale') then raise exception 'Offer category required' using errcode='22023';end if;
 insert into pull_private.buyer_request_lookups(user_id,lookup_day,used) values(owner,(clock_timestamp() at time zone 'UTC')::date,1)
 on conflict(user_id,lookup_day) do update set used=pull_private.buyer_request_lookups.used+1
 where pull_private.buyer_request_lookups.used<200 returning used into usage_count;
 if usage_count is null then raise exception 'Daily lookup limit' using errcode='P0001';end if;
 select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at desc,candidate.id),'[]'::jsonb) into rows from (
  select r.id,r.revision,r.payload,r.created_at,r.updated_at,r.expires_at
  from public.pull_buyer_requests r
  where r.user_id<>owner and r.payload->>'status'='open' and r.payload->>'discoverable'='true' and r.expires_at>clock_timestamp()
  and r.payload->>'category'=offer.fields->>'category'
  and exists(select 1 from auth.users u where u.id=r.user_id and u.email_confirmed_at is not null)
  and not exists(select 1 from jsonb_array_elements_text(offer.exact_terms) term where
   position((' '||btrim(regexp_replace(lower(pg_catalog.normalize(term,'NFKC')),'[^[:alnum:]]+',' ','g'))||' ') in
    (' '||btrim(regexp_replace(lower(pg_catalog.normalize(r.payload->>'product','NFKC')),'[^[:alnum:]]+',' ','g'))||' '))=0)
  order by r.updated_at desc,r.id limit 101
 ) candidate;
 return jsonb_build_object('requests',case when jsonb_array_length(rows)>100 then rows-100 else rows end,'hasMore',jsonb_array_length(rows)>100);
end;$$;

revoke all on function pull_private.save_buyer_request(uuid,integer,uuid,jsonb),pull_private.match_buyer_requests(uuid,integer),pull_private.withdraw_buyer_request(uuid,integer,uuid) from public,anon,authenticated,service_role;
grant usage on schema pull_private to authenticated;
grant execute on function pull_private.save_buyer_request(uuid,integer,uuid,jsonb),pull_private.match_buyer_requests(uuid,integer),pull_private.withdraw_buyer_request(uuid,integer,uuid) to authenticated;
create or replace function public.save_pull_buyer_request(p_request uuid,p_expected_revision integer,p_request_key uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select pull_private.save_buyer_request(p_request,p_expected_revision,p_request_key,p_payload);$$;
create or replace function public.match_pull_buyer_requests(p_offer uuid,p_offer_version integer)
returns jsonb language sql security invoker set search_path='' as $$select pull_private.match_buyer_requests(p_offer,p_offer_version);$$;
create or replace function public.withdraw_pull_buyer_request(p_request uuid,p_expected_revision integer,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$select pull_private.withdraw_buyer_request(p_request,p_expected_revision,p_request_key);$$;
revoke all on function public.save_pull_buyer_request(uuid,integer,uuid,jsonb),public.match_pull_buyer_requests(uuid,integer),public.withdraw_pull_buyer_request(uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_pull_buyer_request(uuid,integer,uuid,jsonb),public.match_pull_buyer_requests(uuid,integer),public.withdraw_pull_buyer_request(uuid,integer,uuid) to authenticated;
commit;
