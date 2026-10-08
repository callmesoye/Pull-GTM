-- Apply to the dedicated Pull GTM Supabase project, then verify RLS with two users.
create table if not exists public.pull_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.pull_workspaces enable row level security;
revoke all on public.pull_workspaces from anon, authenticated;
grant select, insert, update on public.pull_workspaces to authenticated;

drop policy if exists "Read own Pull workspace" on public.pull_workspaces;
create policy "Read own Pull workspace" on public.pull_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own Pull workspace" on public.pull_workspaces;
create policy "Create own Pull workspace" on public.pull_workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own Pull workspace" on public.pull_workspaces;
create policy "Update own Pull workspace" on public.pull_workspaces
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Anonymous users receive no table privileges. No service-role key is needed.
