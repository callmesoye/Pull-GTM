-- PULL product feedback + staff visibility. Not applied by committing this file.
-- Run only on the existing PULL Supabase project after reviewed release approval.
-- User-entered feedback can contain personal data: restrict retention and access.
begin;

create table if not exists public.pull_admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','analyst')),
  added_at timestamptz not null default now()
);

create table if not exists public.pull_product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bug','confusing','suggestion','positive')),
  message text not null check (char_length(btrim(message)) between 10 and 1000),
  created_at timestamptz not null default now(),
  feedback_day date not null default (timezone('UTC',now())::date),
  slot smallint not null check (slot between 1 and 5),
  constraint pull_feedback_per_user_day unique(user_id,feedback_day,slot)
);

create index if not exists pull_feedback_recent_idx
  on public.pull_product_feedback (created_at desc, id desc);

alter table public.pull_admin_members enable row level security;
alter table public.pull_product_feedback enable row level security;

revoke all on public.pull_admin_members from public, anon, authenticated;
revoke all on public.pull_product_feedback from public, anon, authenticated;
-- Don't allow an authenticated user to add or promote administrators.
grant select (user_id,role) on public.pull_admin_members to authenticated;
grant select (id,user_id,kind,message,created_at,feedback_day,slot)
  on public.pull_product_feedback to authenticated;
-- id, UTC feedback_day, and created_at are database-assigned, NOT user-writable.
grant insert (user_id,kind,message,slot) on public.pull_product_feedback to authenticated;

drop policy if exists "Read own Pull admin membership" on public.pull_admin_members;
create policy "Read own Pull admin membership" on public.pull_admin_members
  for select to authenticated
  using (user_id=(select auth.uid())
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

drop policy if exists "Submit own Pull feedback" on public.pull_product_feedback;
create policy "Submit own Pull feedback" on public.pull_product_feedback
  for insert to authenticated
  with check (user_id=(select auth.uid())
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

drop policy if exists "Read own or staffed Pull feedback" on public.pull_product_feedback;
create policy "Read own or staffed Pull feedback" on public.pull_product_feedback
  for select to authenticated
  using (
    not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false)
    and (
      user_id=(select auth.uid())
      or exists (
        select 1 from public.pull_admin_members staff
        where staff.user_id=(select auth.uid()) and staff.role in ('owner','analyst')
      )
    )
  );
-- No update/delete policies or grants. Owner console is read-only.
-- Provision owner member only through an authenticated database administrator,
-- after independently verifying that owner's auth.users UUID. Never seed by email.
commit;
