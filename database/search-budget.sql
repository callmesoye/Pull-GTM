-- Search credits have separate counters from hosted AI. No prospect data is stored.
create table if not exists pull_private.search_daily_usage (
  day date not null,
  owner text not null,
  requests integer not null check (requests >= 0),
  primary key (day, owner)
);
alter table pull_private.search_daily_usage enable row level security;
revoke all on pull_private.search_daily_usage from public, anon, authenticated;

create or replace function pull_private.claim_search_requests(p_requests integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
begin
  if owner_id is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_requests is null or p_requests < 1 or p_requests > 3 then
    raise exception 'Invalid request budget' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pull_search:' || today::text, 0));
  if coalesce((select requests from pull_private.search_daily_usage where day=today and owner=owner_id::text),0) + p_requests > 20
    or coalesce((select requests from pull_private.search_daily_usage where day=today and owner='project'),0) + p_requests > 200 then
    return false;
  end if;
  insert into pull_private.search_daily_usage(day,owner,requests)
    values(today,owner_id::text,p_requests),(today,'project',p_requests)
    on conflict (day,owner) do update set requests=search_daily_usage.requests+excluded.requests;
  return true;
end;
$$;
revoke all on function pull_private.claim_search_requests(integer) from public, anon, authenticated;
grant usage on schema pull_private to authenticated;
grant execute on function pull_private.claim_search_requests(integer) to authenticated;
create or replace function public.claim_pull_search_requests(p_requests integer) returns boolean
language sql security invoker set search_path = '' as $$ select pull_private.claim_search_requests(p_requests); $$;
revoke all on function public.claim_pull_search_requests(integer) from public, anon, authenticated;
grant execute on function public.claim_pull_search_requests(integer) to authenticated;
