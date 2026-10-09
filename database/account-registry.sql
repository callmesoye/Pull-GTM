-- Pull GTM account registry. Apply only to the dedicated Pull GTM project.
-- Run the preflight and post-install checks in docs/ACCOUNT-MANAGEMENT.md.
-- PostgreSQL 15+ is required by the dashboard-only security-invoker view.
begin;

create schema if not exists pull_private;
-- Preserve authenticated USAGE used by the AI quota function in agents.sql.
-- Individual account-registry objects remain inaccessible to ordinary users.
revoke all on schema pull_private from public, anon;
revoke create on schema pull_private from authenticated;

create table if not exists public.pull_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default ''
    constraint pull_profile_display_name_length check (char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pull_profiles enable row level security;
revoke all on table public.pull_profiles from public, anon, authenticated;
-- Remove possible earlier column grants as well as table grants.
revoke all (id, display_name, created_at, updated_at)
  on public.pull_profiles from public, anon, authenticated;
grant select on public.pull_profiles to authenticated;
grant update (display_name) on public.pull_profiles to authenticated;

drop policy if exists "Read own Pull profile" on public.pull_profiles;
create policy "Read own Pull profile" on public.pull_profiles
  for select to authenticated using ((select auth.uid()) = id
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));

drop policy if exists "Update own Pull profile name" on public.pull_profiles;
create policy "Update own Pull profile name" on public.pull_profiles
  for update to authenticated using ((select auth.uid()) = id
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = id
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));

create or replace function pull_private.create_pull_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_name text;
begin
  -- Metadata is only a display label, never an authorization decision.
  -- Non-string, absent and excessively long values cannot violate the limit.
  supplied_name := case
    when pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string'
      then new.raw_user_meta_data ->> 'display_name'
    when pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string'
      then new.raw_user_meta_data ->> 'full_name'
    when pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'name') = 'string'
      then new.raw_user_meta_data ->> 'name'
    else ''
  end;
  insert into public.pull_profiles (id, display_name, created_at, updated_at)
  values (
    new.id,
    pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.left(supplied_name, 100), '[[:cntrl:]]', ' ', 'g')),
    coalesce(new.created_at, pg_catalog.now()),
    pg_catalog.now()
  ) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function pull_private.create_pull_profile() from public, anon, authenticated;

drop trigger if exists on_pull_auth_user_created on auth.users;
create trigger on_pull_auth_user_created
  after insert on auth.users
  for each row execute function pull_private.create_pull_profile();

create or replace function pull_private.touch_pull_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function pull_private.touch_pull_profile() from public, anon, authenticated;

drop trigger if exists on_pull_profile_updated on public.pull_profiles;
create trigger on_pull_profile_updated
  before update on public.pull_profiles
  for each row execute function pull_private.touch_pull_profile();

-- Existing accounts get the same safe name extraction. Existing names are kept.
insert into public.pull_profiles (id, display_name, created_at, updated_at)
select u.id,
  pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.left(case
    when pg_catalog.jsonb_typeof(u.raw_user_meta_data -> 'display_name') = 'string' then u.raw_user_meta_data ->> 'display_name'
    when pg_catalog.jsonb_typeof(u.raw_user_meta_data -> 'full_name') = 'string' then u.raw_user_meta_data ->> 'full_name'
    when pg_catalog.jsonb_typeof(u.raw_user_meta_data -> 'name') = 'string' then u.raw_user_meta_data ->> 'name'
    else '' end, 100), '[[:cntrl:]]', ' ', 'g')),
  coalesce(u.created_at, pg_catalog.now()), pg_catalog.now()
from auth.users u
on conflict (id) do nothing;

-- A private, read-only overview for the SQL editor's administrator role only.
-- It contains no passwords, tokens, raw metadata or prospect payloads.
create or replace view pull_private.account_overview
with (security_invoker = true)
as select p.id, p.display_name, u.email, u.email_confirmed_at,
  u.banned_until, u.created_at as registered_at, u.last_sign_in_at,
  w.updated_at as workspace_saved_at
from public.pull_profiles p
join auth.users u on u.id = p.id
left join public.pull_workspaces w on w.user_id = p.id;
revoke all on table pull_private.account_overview from public, anon, authenticated;

commit;
