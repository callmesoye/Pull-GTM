-- Candidate V2-only schema. Verified in isolated PostgreSQL tests before deployment.
begin;
create schema if not exists pull_private;
create table if not exists public.pull_offer_versions(
 user_id uuid not null references auth.users(id) on delete cascade,
 offer_id uuid not null,
 version integer not null check(version between 1 and 100),
 fields jsonb not null check(jsonb_typeof(fields)='object' and octet_length(fields::text)<=8000),
 exact_terms jsonb not null check(jsonb_typeof(exact_terms)='array' and jsonb_array_length(exact_terms) between 1 and 6),
 confirmed_at timestamptz not null default clock_timestamp(),
 primary key(user_id,offer_id,version)
);
alter table public.pull_offer_versions enable row level security;
revoke all on public.pull_offer_versions from public,anon,authenticated;
grant select on public.pull_offer_versions to authenticated;
drop policy if exists offer_owner_read on public.pull_offer_versions;
create policy offer_owner_read on public.pull_offer_versions for select to authenticated
 using((select auth.uid())=user_id and coalesce((select auth.jwt())->>'is_anonymous','false')<>'true');
create index if not exists offer_owner_recent on public.pull_offer_versions(user_id,confirmed_at desc);

create or replace function pull_private.save_offer(p_offer uuid,p_expected_version integer,p_fields jsonb,p_exact_terms jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); latest public.pull_offer_versions%rowtype; result public.pull_offer_versions%rowtype; pair record;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner required' using errcode='42501';end if;
 if p_offer is null or p_expected_version is null or p_expected_version not between 0 and 99
 or p_fields is null or jsonb_typeof(p_fields)<>'object' or octet_length(p_fields::text)>8000
 or p_exact_terms is null or jsonb_typeof(p_exact_terms)<>'array' then raise exception 'Invalid offer' using errcode='22023';end if;
 if jsonb_array_length(p_exact_terms) not between 1 and 6 then raise exception 'Invalid exact terms' using errcode='22023';end if;
 for pair in select * from jsonb_each(p_fields) loop
  if pair.key not in ('product','location','price','condition','quantity','delivery','model','year','variant','material','capacity','service_scope','category')
  or jsonb_typeof(pair.value) not in ('string','null')
  or (jsonb_typeof(pair.value)='string' and (length(btrim(pair.value #>> '{}'))<1 or length(pair.value #>> '{}')>case pair.key when 'product' then 500 when 'location' then 120 else 250 end))
  then raise exception 'Invalid offer fields' using errcode='22023';end if;
 end loop;
 if p_fields->>'category' is not null and p_fields->>'category' not in ('goods','service','wholesale') then raise exception 'Invalid offer category' using errcode='22023';end if;
 if coalesce(length(btrim(p_fields->>'product')),0)=0 or coalesce(length(btrim(p_fields->>'location')),0)=0 then raise exception 'Product and location required' using errcode='22023';end if;
 for pair in select value from jsonb_array_elements(p_exact_terms) loop
  if jsonb_typeof(pair.value)<>'string' or length(btrim(pair.value #>> '{}')) not between 1 and 80
  or position(lower(pair.value #>> '{}') in lower(p_fields->>'product'))=0 then raise exception 'Invalid exact term' using errcode='22023';end if;
 end loop;
 -- Serialize per owner for both version consistency and the daily insertion cap.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offer:'||owner::text,0));
 select * into latest from public.pull_offer_versions where user_id=owner and offer_id=p_offer order by version desc limit 1;
 if found then
  if latest.version=p_expected_version+1 and latest.fields=p_fields and latest.exact_terms=p_exact_terms then return to_jsonb(latest);end if;
  if latest.version<>p_expected_version then raise exception 'Offer changed' using errcode='40001';end if;
 elsif p_expected_version<>0 then raise exception 'Offer changed' using errcode='40001';end if;
 if (select count(*) from public.pull_offer_versions where user_id=owner and confirmed_at>clock_timestamp()-interval '24 hours')>=200 then raise exception 'Daily save limit';end if;
 insert into public.pull_offer_versions(user_id,offer_id,version,fields,exact_terms) values(owner,p_offer,p_expected_version+1,p_fields,p_exact_terms) returning * into result;
 return to_jsonb(result);
end;$$;
revoke all on function pull_private.save_offer(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant usage on schema pull_private to authenticated;
grant execute on function pull_private.save_offer(uuid,integer,jsonb,jsonb) to authenticated;
create or replace function public.save_pull_offer(p_offer uuid,p_expected_version integer,p_fields jsonb,p_exact_terms jsonb)
returns jsonb language sql security invoker set search_path='' as $$select pull_private.save_offer(p_offer,p_expected_version,p_fields,p_exact_terms);$$;
revoke all on function public.save_pull_offer(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_pull_offer(uuid,integer,jsonb,jsonb) to authenticated;
commit;
