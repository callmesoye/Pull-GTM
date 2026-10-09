-- Run as the database administrator AFTER applying automations.sql and the
-- non-anonymous workspace/profile policies. No substitutions are required.
-- Creates two temporary Auth fixtures inside this transaction, then rolls back.
-- All fixtures, revision changes and the test constraint are rolled back.
-- If any statement fails, issue ROLLBACK before doing anything else.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  perform set_config('pull_test.user_a',a::text,true);
  perform set_config('pull_test.user_b',b::text,true);
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,is_anonymous)
  values
    (a,'authenticated','authenticated','pull-workflow-qa-a-'||a||'@example.invalid','!',now(),'{"provider":"email","providers":["email"]}','{}',false),
    (b,'authenticated','authenticated','pull-workflow-qa-b-'||b||'@example.invalid','!',now(),'{"provider":"email","providers":["email"]}','{}',false);
end $$;

do $$
declare a uuid := current_setting('pull_test.user_a')::uuid;
        b uuid := current_setting('pull_test.user_b')::uuid;
begin
  if a = b or (select count(*) from auth.users where id in (a,b)) <> 2 then
    raise exception 'Temporary Auth fixtures were not created correctly';
  end if;
  if exists (select 1 from public.pull_workspaces where user_id in (a,b)
             and revision >= 9007199254740990) then
    raise exception 'Fixture revision is too large for this verification';
  end if;
  -- Authenticated schema USAGE supports the separately guarded AI quota helper.
  -- Administrative views and trigger helpers must remain inaccessible.
  if has_schema_privilege('anon','pull_private','USAGE')
     or has_table_privilege('authenticated','pull_private.account_overview','SELECT')
     or has_table_privilege('anon','pull_private.account_overview','SELECT')
     or has_function_privilege('authenticated','pull_private.create_pull_profile()','EXECUTE')
     or has_function_privilege('anon','pull_private.create_pull_profile()','EXECUTE') then
    raise exception 'Application/public role can access private administrative registry objects';
  end if;
  perform set_config('pull_test.workflow_a1',gen_random_uuid()::text,true);
  perform set_config('pull_test.workflow_a2',gen_random_uuid()::text,true);
  perform set_config('pull_test.workflow_b',gen_random_uuid()::text,true);
end $$;

-- Keep every existing payload unchanged, including during successful test runs.
-- A minimal valid empty workspace is inserted only if a test account lacks one.
insert into public.pull_workspaces(user_id,payload,revision)
select id, '{"version":1,"prospects":[],"shortlist":[],"drafts":{},"audit":[],"mode":"empty","identity":"Rollback verification","context":"company","website":"","offer":"","remember":false,"setup":false,"duplicates":0,"rules":{"roles":"Founder","industries":"","countries":"","min":"","max":"","signals":"","evidence":true,"days":"90"}}'::jsonb, 1
from auth.users where id in (current_setting('pull_test.user_a')::uuid,current_setting('pull_test.user_b')::uuid)
on conflict (user_id) do nothing;

insert into public.pull_automations(id,user_id,name,kind,trigger,enabled)
values
  (current_setting('pull_test.workflow_a1')::uuid,current_setting('pull_test.user_a')::uuid,'Rollback-only review','audience_review','manual',true),
  (current_setting('pull_test.workflow_a2')::uuid,current_setting('pull_test.user_a')::uuid,'Rollback-only draft suggestions','draft_suggestions','manual',true),
  (current_setting('pull_test.workflow_b')::uuid,current_setting('pull_test.user_b')::uuid,'Rollback-only other account','audience_review','manual',true);

-- Reject only the second test workflow's history row. The first history row
-- would have been inserted already: this proves the whole batch rolls back.
do $$ begin
  execute format('alter table public.pull_automation_runs add constraint pull_rollback_verify_history
    check (automation_id <> %L::uuid) not valid',current_setting('pull_test.workflow_a2'));
end $$;

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('pull_test.user_a'),'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('request.jwt.claim.sub',current_setting('pull_test.user_a'),true);
end $$;

do $$
declare
  a uuid := current_setting('pull_test.user_a')::uuid;
  b uuid := current_setting('pull_test.user_b')::uuid;
  w1 uuid := current_setting('pull_test.workflow_a1')::uuid;
  w2 uuid := current_setting('pull_test.workflow_a2')::uuid;
  wb uuid := current_setting('pull_test.workflow_b')::uuid;
  before_row public.pull_workspaces%rowtype;
  after_row public.pull_workspaces%rowtype;
  inputs jsonb;
  changed integer;
begin
  if auth.uid() <> a then raise exception 'JWT test context is incorrect'; end if;
  if exists (select 1 from public.pull_automations where id=wb)
     or exists (select 1 from public.pull_workspaces where user_id=b)
     or exists (select 1 from public.pull_profiles where id=b) then
    raise exception 'Account A can read account B data';
  end if;
  -- Column-level UPDATE is enough for SELECT FOR UPDATE, without owner writes.
  perform 1 from public.pull_automations where id=w1 for update;
  if not found then raise exception 'Own workflow lock was denied'; end if;
  update public.pull_automations set enabled=false where id=wb;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-account workflow update succeeded'; end if;

  begin
    update public.pull_automations set user_id=b where id=w1;
    raise exception 'Owner mutation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.pull_automations set id=gen_random_uuid() where id=w1;
    raise exception 'ID mutation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.pull_automations set created_at=now() where id=w1;
    raise exception 'Creation timestamp mutation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.pull_automations set updated_at=now() where id=w1;
    raise exception 'Version timestamp mutation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pull_automation_runs(automation_id,user_id,name,kind,status,counts,base_revision,result_revision)
      values(wb,a,'Cross-owner attempt','audience_review','completed','{}',1,2);
    raise exception 'Cross-owner workflow/history reference unexpectedly allowed';
  exception when foreign_key_violation then null; end;

  select * into strict before_row from public.pull_workspaces where user_id=a;
  select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at,'counts',jsonb_build_object('matches',0)) order by case when id=w1 then 0 else 1 end)
    into inputs from public.pull_automations where id in (w1,w2);
  begin
    perform public.pull_apply_automations(before_row.revision+1,before_row.payload,inputs);
    raise exception 'Stale revision unexpectedly committed';
  exception when raise_exception then
    if sqlerrm <> 'Workspace changed' then raise; end if;
  end;
  begin
    perform public.pull_apply_automations(before_row.revision,before_row.payload,
      jsonb_set(inputs,'{0,updated_at}',to_jsonb((now()+interval '1 day')::text)));
    raise exception 'Stale workflow unexpectedly committed';
  exception when raise_exception then
    if sqlerrm <> 'Workflow changed' then raise; end if;
  end;
  begin
    perform public.pull_apply_automations(before_row.revision,before_row.payload,inputs);
    raise exception 'History rejection unexpectedly committed';
  exception when check_violation then null; end;
  select * into strict after_row from public.pull_workspaces where user_id=a;
  if after_row is distinct from before_row
     or exists (select 1 from public.pull_automation_runs where automation_id in (w1,w2)) then
    raise exception 'Failed batch partially committed workspace or history';
  end if;
  raise notice 'PASS: owner reads, immutable columns, owner FK, stale versions and atomic history failure';
end $$;

reset role;
alter table public.pull_automation_runs drop constraint pull_rollback_verify_history;
set local role authenticated;

do $$
declare
  a uuid := current_setting('pull_test.user_a')::uuid;
  w1 uuid := current_setting('pull_test.workflow_a1')::uuid;
  w2 uuid := current_setting('pull_test.workflow_a2')::uuid;
  before_row public.pull_workspaces%rowtype;
  after_row public.pull_workspaces%rowtype;
  inputs jsonb;
  result jsonb;
begin
  select * into strict before_row from public.pull_workspaces where user_id=a;
  select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at,'counts',jsonb_build_object('matches',0)))
    into inputs from public.pull_automations where id in (w1,w2);
  result := public.pull_apply_automations(before_row.revision,before_row.payload,inputs);
  select * into strict after_row from public.pull_workspaces where user_id=a;
  if after_row.revision <> before_row.revision+1 or after_row.payload is distinct from before_row.payload
     or (result->>'revision')::bigint <> after_row.revision
     or (select count(*) from public.pull_automation_runs where automation_id in (w1,w2)) <> 2 then
    raise exception 'Successful batch did not commit exactly one revision and two histories';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',true)::text,true);
  if exists (select 1 from public.pull_automations where id in (w1,w2))
     or exists (select 1 from public.pull_workspaces where user_id=a)
     or exists (select 1 from public.pull_profiles where id=a) then
    raise exception 'Anonymous-session JWT can read private account data';
  end if;
  begin
    perform public.pull_apply_automations(after_row.revision,after_row.payload,inputs);
    raise exception 'Anonymous-session JWT unexpectedly ran a workflow';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: successful batch and anonymous-session rejection';
end $$;

do $$
declare
  a uuid := current_setting('pull_test.user_a')::uuid;
  b uuid := current_setting('pull_test.user_b')::uuid;
  wb uuid := current_setting('pull_test.workflow_b')::uuid;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('request.jwt.claim.sub',b::text,true);
  if auth.uid() <> b or not exists (select 1 from public.pull_automations where id=wb)
     or exists (select 1 from public.pull_automations where user_id=a)
     or exists (select 1 from public.pull_automation_runs where user_id=a)
     or exists (select 1 from public.pull_workspaces where user_id=a)
     or exists (select 1 from public.pull_profiles where id=a) then
    raise exception 'Account B ownership boundary failed';
  end if;
  raise notice 'PASS: second-account isolation and private registry access denied';
end $$;

reset role;
rollback;
select 'PASS: rollback-only automation verification completed; fixtures and original workspace revisions restored' as verification;
