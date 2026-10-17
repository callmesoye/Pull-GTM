begin;
create table if not exists public.pull_workflow_schedules(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 workflow_id uuid not null,interval_seconds integer not null check(interval_seconds between 3600 and 604800),
 enabled boolean not null default true,next_run_at timestamptz not null,last_run_at timestamptz,last_status text,last_revision bigint,
 created_at timestamptz not null default now(),unique(user_id,workflow_id),foreign key(workflow_id,user_id) references public.pull_automations(id,user_id)
);
alter table public.pull_workflow_schedules enable row level security;
revoke all on public.pull_workflow_schedules from public,anon,authenticated;
grant select on public.pull_workflow_schedules to authenticated;
grant insert(user_id,workflow_id,interval_seconds,enabled,next_run_at) on public.pull_workflow_schedules to authenticated;
grant update(interval_seconds,enabled,next_run_at) on public.pull_workflow_schedules to authenticated;
drop policy if exists "Own workflow schedules" on public.pull_workflow_schedules;
create policy "Own workflow schedules" on public.pull_workflow_schedules for all to authenticated using(user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true') with check(user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true');
create index if not exists pull_schedule_due on public.pull_workflow_schedules(next_run_at) where enabled;
create index if not exists pull_schedule_workflow on public.pull_workflow_schedules(workflow_id,user_id);
create or replace function pull_private.limit_workflow_schedules() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.enabled then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pull_schedules:'||new.user_id::text,0));
  if (select count(*) from public.pull_workflow_schedules where user_id=new.user_id and enabled and id<>new.id)>=10 then raise exception 'Pause a schedule before enabling another' using errcode='54000';end if;
 end if;return new;
end;$$;
revoke all on function pull_private.limit_workflow_schedules() from public,anon,authenticated;
drop trigger if exists pull_schedule_limit on public.pull_workflow_schedules;
create trigger pull_schedule_limit before insert or update on public.pull_workflow_schedules for each row execute function pull_private.limit_workflow_schedules();
create table if not exists pull_private.schedule_tickets(
 ticket_hash text primary key,schedule_id uuid not null references public.pull_workflow_schedules(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','claimed','completed','failed')),
 workflow_updated_at timestamptz not null,base_revision bigint,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '2 minutes'
);
alter table pull_private.schedule_tickets enable row level security;
revoke all on pull_private.schedule_tickets from public,anon,authenticated;
create index if not exists pull_schedule_ticket_schedule on pull_private.schedule_tickets(schedule_id,created_at desc);

create or replace function pull_private.dispatch_due_workflows() returns integer
language plpgsql security definer set search_path='' as $$
declare s public.pull_workflow_schedules%rowtype; w public.pull_automations%rowtype; nonce text; queued integer:=0;
begin
 for s in select * from public.pull_workflow_schedules where enabled and next_run_at<=now() order by next_run_at for update skip locked limit 10 loop
  select * into w from public.pull_automations where id=s.workflow_id and user_id=s.user_id and enabled and not archived;
  if not found then update public.pull_workflow_schedules set enabled=false,last_status='workflow_unavailable' where id=s.id;continue;end if;
  if not exists(select 1 from public.pull_workspaces where user_id=s.user_id) then update public.pull_workflow_schedules set enabled=false,last_status='workspace_unavailable' where id=s.id;continue;end if;
  update pull_private.schedule_tickets set status='failed' where schedule_id=s.id and status in ('pending','claimed') and expires_at<=now();
  if exists(select 1 from pull_private.schedule_tickets where schedule_id=s.id and status in('pending','claimed')) then continue;end if;
  nonce:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into pull_private.schedule_tickets(ticket_hash,schedule_id,workflow_updated_at) values(encode(sha256(convert_to(nonce,'UTF8')),'hex'),s.id,w.updated_at);
  perform net.http_post(url:='https://cyakphnpljeesotbjerz.supabase.co/functions/v1/pull-scheduler',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||nonce),timeout_milliseconds:=15000);
  update public.pull_workflow_schedules set next_run_at=now()+make_interval(secs=>s.interval_seconds),last_status='queued' where id=s.id;
  queued:=queued+1;
 end loop;
 return queued;
end;$$;
revoke all on function pull_private.dispatch_due_workflows() from public,anon,authenticated;

create or replace function public.claim_pull_schedule(p_ticket_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t pull_private.schedule_tickets%rowtype;s public.pull_workflow_schedules%rowtype;w public.pull_automations%rowtype;p public.pull_workspaces%rowtype;
begin
 update pull_private.schedule_tickets set status='claimed' where ticket_hash=p_ticket_hash and status='pending' and expires_at>now() returning * into t;
 if not found then return jsonb_build_object('error','UNAVAILABLE');end if;
 select * into s from public.pull_workflow_schedules where id=t.schedule_id and enabled;
 if not found then return jsonb_build_object('error','UNAVAILABLE');end if;
 select * into w from public.pull_automations where id=s.workflow_id and user_id=s.user_id and enabled and not archived and updated_at=t.workflow_updated_at;
 if not found then return jsonb_build_object('error','UNAVAILABLE');end if;
 select * into p from public.pull_workspaces where user_id=s.user_id;
 if not found then return jsonb_build_object('error','UNAVAILABLE');end if;
 update pull_private.schedule_tickets set base_revision=p.revision where ticket_hash=p_ticket_hash;
 return jsonb_build_object('workflow',to_jsonb(w),'workspace',p.payload,'revision',p.revision);
end;$$;
revoke all on function public.claim_pull_schedule(text) from public,anon,authenticated;
grant execute on function public.claim_pull_schedule(text) to service_role;

create or replace function public.commit_pull_schedule(p_ticket_hash text,p_revision bigint,p_payload jsonb,p_counts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t pull_private.schedule_tickets%rowtype;s public.pull_workflow_schedules%rowtype;w public.pull_automations%rowtype;result jsonb;old_sub text;old_claims text;
begin
 select * into t from pull_private.schedule_tickets where ticket_hash=p_ticket_hash and status='claimed' and expires_at>now() and base_revision=p_revision for update;
 if not found then raise exception 'Schedule ticket unavailable' using errcode='P0001';end if;
 select * into s from public.pull_workflow_schedules where id=t.schedule_id and enabled for update;
 if not found then raise exception 'Schedule paused' using errcode='P0001';end if;
 select * into w from public.pull_automations where id=s.workflow_id and user_id=s.user_id and enabled and not archived and updated_at=t.workflow_updated_at;
 if not found then raise exception 'Workflow changed' using errcode='P0001';end if;
 old_sub:=current_setting('request.jwt.claim.sub',true);old_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claim.sub',s.user_id::text,true);perform set_config('request.jwt.claims','{"is_anonymous":false}',true);
 result:=public.pull_apply_automations(p_revision,p_payload,jsonb_build_array(jsonb_build_object('id',w.id,'updated_at',w.updated_at,'counts',p_counts)));
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 update pull_private.schedule_tickets set status='completed' where ticket_hash=p_ticket_hash;
 update public.pull_workflow_schedules set last_run_at=now(),last_status='completed',last_revision=(result->>'revision')::bigint where id=s.id;
 return result;
end;$$;
revoke all on function public.commit_pull_schedule(text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_pull_schedule(text,bigint,jsonb,jsonb) to service_role;
create or replace function public.fail_pull_schedule(p_ticket_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.pull_workflow_schedules set last_status='failed' where id in(select schedule_id from pull_private.schedule_tickets where ticket_hash=p_ticket_hash and status in ('pending','claimed'));
 update pull_private.schedule_tickets set status='failed' where ticket_hash=p_ticket_hash and status in ('pending','claimed');return found;
end;$$;
revoke all on function public.fail_pull_schedule(text) from public,anon,authenticated;
grant execute on function public.fail_pull_schedule(text) to service_role;
commit;
