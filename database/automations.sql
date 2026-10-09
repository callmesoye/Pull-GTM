-- Owner-scoped manual and after-import workflows. No scheduler or sending provider.
begin;

create table if not exists public.pull_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  kind text not null check (kind in ('audience_review','draft_suggestions')),
  trigger text not null check (trigger in ('manual','on_import')),
  enabled boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  check (not archived or not enabled)
);

create table if not exists public.pull_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('audience_review','draft_suggestions')),
  status text not null check (status = 'completed'),
  counts jsonb not null check (jsonb_typeof(counts) = 'object'),
  base_revision bigint not null check (base_revision > 0),
  result_revision bigint not null check (result_revision = base_revision + 1),
  created_at timestamptz not null default now(),
  foreign key (automation_id,user_id) references public.pull_automations(id,user_id)
);

create index if not exists pull_automations_owner_created on public.pull_automations(user_id,created_at desc);
create index if not exists pull_automation_runs_owner_created on public.pull_automation_runs(user_id,created_at desc);
create index if not exists pull_automation_runs_workflow on public.pull_automation_runs(automation_id,user_id);

alter table public.pull_automations enable row level security;
alter table public.pull_automation_runs enable row level security;
revoke all on public.pull_automations from public,anon,authenticated;
revoke all on public.pull_automation_runs from public,anon,authenticated;
-- Reapplication must also remove earlier column-level grants.
revoke all (id,user_id,name,kind,trigger,enabled,archived,created_at,updated_at)
  on public.pull_automations from public,anon,authenticated;
revoke all (id,automation_id,user_id,name,kind,status,counts,base_revision,result_revision,created_at)
  on public.pull_automation_runs from public,anon,authenticated;
grant select on public.pull_automations, public.pull_automation_runs to authenticated;
grant insert (user_id,name,kind,trigger,enabled) on public.pull_automations to authenticated;
grant update (name,kind,trigger,enabled,archived) on public.pull_automations to authenticated;
grant insert (automation_id,user_id,name,kind,status,counts,base_revision,result_revision) on public.pull_automation_runs to authenticated;

drop policy if exists "Read own workflows" on public.pull_automations;
create policy "Read own workflows" on public.pull_automations for select to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists "Create own workflows" on public.pull_automations;
create policy "Create own workflows" on public.pull_automations for insert to authenticated
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists "Update own workflows" on public.pull_automations;
create policy "Update own workflows" on public.pull_automations for update to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false))
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists "Read own workflow runs" on public.pull_automation_runs;
create policy "Read own workflow runs" on public.pull_automation_runs for select to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists "Record own workflow runs" on public.pull_automation_runs;
create policy "Record own workflow runs" on public.pull_automation_runs for insert to authenticated
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));

-- Clients cannot spoof the version timestamp used by the run concurrency check.
create or replace function public.pull_touch_automation_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function public.pull_touch_automation_updated_at() from public,anon,authenticated;
drop trigger if exists on_pull_automation_updated on public.pull_automations;
create trigger on_pull_automation_updated before update on public.pull_automations
  for each row execute function public.pull_touch_automation_updated_at();

-- SECURITY INVOKER preserves RLS. Workspace update and run history commit together.
-- A changed workspace or workflow aborts the entire transaction.
create or replace function public.pull_apply_automations(p_revision bigint,p_payload jsonb,p_runs jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_workflow public.pull_automations%rowtype;
  v_workspace public.pull_workspaces%rowtype;
  v_run public.pull_automation_runs%rowtype;
  v_seen uuid[] := '{}';
  v_history jsonb := '[]'::jsonb;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception using errcode='42501',message='Sign in to run workflows';
  end if;
  if p_revision is null or p_revision < 1 or p_revision >= 9007199254740991
     or jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'version' is distinct from '1'
     or octet_length(p_payload::text) > 3*1024*1024
     or jsonb_typeof(p_runs) is distinct from 'array' or jsonb_array_length(p_runs) not between 1 and 100 then
    raise exception using errcode='22023',message='Invalid workflow run';
  end if;
  -- Stable lock order prevents concurrent batches from deadlocking each other.
  for v_item in select value from jsonb_array_elements(p_runs) order by (value->>'id')::uuid loop
    select * into v_workflow from public.pull_automations
      where id=(v_item->>'id')::uuid and user_id=v_user and enabled and not archived for update;
    if not found or v_workflow.id=any(v_seen)
       or v_workflow.updated_at is distinct from (v_item->>'updated_at')::timestamptz
       or jsonb_typeof(v_item->'counts') is distinct from 'object' then
      raise exception using errcode='P0001',message='Workflow changed';
    end if;
    v_seen := array_append(v_seen,v_workflow.id);
  end loop;
  update public.pull_workspaces set payload=p_payload,revision=p_revision+1,updated_at=clock_timestamp()
    where user_id=v_user and revision=p_revision returning * into v_workspace;
  if not found then
    raise exception using errcode='P0001',message='Workspace changed';
  end if;
  for v_item in select value from jsonb_array_elements(p_runs) loop
    select * into strict v_workflow from public.pull_automations where id=(v_item->>'id')::uuid and user_id=v_user;
    insert into public.pull_automation_runs(automation_id,user_id,name,kind,status,counts,base_revision,result_revision)
      values(v_workflow.id,v_user,v_workflow.name,v_workflow.kind,'completed',v_item->'counts',p_revision,p_revision+1)
      returning * into v_run;
    v_history := v_history || jsonb_build_array(to_jsonb(v_run)-'user_id');
  end loop;
  return jsonb_build_object('revision',v_workspace.revision,'updated_at',v_workspace.updated_at,'runs',v_history);
end;
$$;
revoke all on function public.pull_apply_automations(bigint,jsonb,jsonb) from public,anon;
grant execute on function public.pull_apply_automations(bigint,jsonb,jsonb) to authenticated;

comment on table public.pull_automations is 'Owner-only GTM workflows. Archived workflows keep their history. No background scheduler.';
comment on table public.pull_automation_runs is 'Committed workflow runs only. Template drafts are not sent messages.';
commit;
