-- Transaction-only integration assertions for the dedicated Pull GTM project.
-- Any failing assertion raises an error. All fixtures and quota changes roll back.
-- Run as the project database administrator after agents.sql is applied.
begin;

do $verify$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  token_a uuid;
  token_b uuid;
  long_token uuid;
  hash_a text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  hash_b text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  hash_long text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  row_count integer;
  result jsonb;
  before_a jsonb;
  before_b jsonb;
  today date := (now() at time zone 'utc')::date;
  i integer;
begin
  if not (select relrowsecurity from pg_class where oid='public.pull_agent_tokens'::regclass) then
    raise exception 'Agent-token RLS is disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid='pull_private.ai_daily_usage'::regclass)
    or has_table_privilege('authenticated','pull_private.ai_daily_usage','SELECT')
    or has_table_privilege('authenticated','pull_private.ai_daily_usage','UPDATE') then
    raise exception 'AI usage counters are client accessible or lack RLS';
  end if;
  if exists (select 1 from pg_policy p where p.polrelid='public.pull_agent_tokens'::regclass and (
    (p.polcmd in ('r','w') and coalesce(pg_get_expr(p.polqual,p.polrelid),'') not like '%is_anonymous%')
    or (p.polcmd in ('a','w') and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') not like '%is_anonymous%')
  )) then raise exception 'Every token read/write policy must explicitly reject anonymous JWTs'; end if;
  if has_column_privilege('authenticated','public.pull_agent_tokens','token_hash','SELECT')
    or has_table_privilege('anon','public.pull_agent_tokens','SELECT')
    or has_table_privilege('anon','public.pull_agent_tokens','INSERT')
    or has_column_privilege('authenticated','public.pull_agent_tokens','scopes','UPDATE')
    or has_column_privilege('authenticated','public.pull_agent_tokens','expires_at','UPDATE')
    or has_column_privilege('authenticated','public.pull_agent_tokens','user_id','UPDATE')
    or has_table_privilege('authenticated','public.pull_agent_tokens','DELETE') then
    raise exception 'Agent table privileges expose hashes or permit unauthorized changes';
  end if;
  if has_function_privilege('anon','public.claim_pull_ai_request()','EXECUTE')
    or has_function_privilege('anon','pull_private.claim_ai_request()','EXECUTE')
    or has_function_privilege('authenticated','pull_private.limit_agent_tokens()','EXECUTE')
    or has_function_privilege('anon','pull_private.limit_agent_tokens()','EXECUTE')
    or has_function_privilege('authenticated','public.authenticate_pull_agent(text)','EXECUTE')
    or has_function_privilege('anon','public.authenticate_pull_agent(text)','EXECUTE')
    or has_function_privilege('authenticated','public.commit_pull_agent_draft(text,bigint,text,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.commit_pull_agent_draft(text,bigint,text,text,text,text)','EXECUTE') then
    raise exception 'A private helper or service-only RPC is accessible to a client role';
  end if;
  if not has_schema_privilege('authenticated','pull_private','USAGE')
    or not has_function_privilege('authenticated','pull_private.claim_ai_request()','EXECUTE')
    or not has_function_privilege('service_role','public.authenticate_pull_agent(text)','EXECUTE')
    or not has_function_privilege('service_role','public.commit_pull_agent_draft(text,bigint,text,text,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.claim_pull_ai_request()','EXECUTE') then
    raise exception 'Required server or authenticated RPC grant is missing';
  end if;
  if exists (select 1 from pg_proc p where p.oid in (
    'public.claim_pull_ai_request()'::regprocedure,
    'public.authenticate_pull_agent(text)'::regprocedure,
    'public.commit_pull_agent_draft(text,bigint,text,text,text,text)'::regprocedure
  ) and p.prosecdef) then raise exception 'A public RPC unexpectedly uses SECURITY DEFINER'; end if;
  if exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
    where p.oid in ('pull_private.limit_agent_tokens()'::regprocedure,'pull_private.claim_ai_request()'::regprocedure,
      'public.claim_pull_ai_request()'::regprocedure,'public.authenticate_pull_agent(text)'::regprocedure,
      'public.commit_pull_agent_draft(text,bigint,text,text,text,text)'::regprocedure)
      and privilege.grantee=0 and privilege.privilege_type='EXECUTE') then
    raise exception 'PUBLIC can execute an internal helper or protected RPC';
  end if;

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,is_anonymous)
    values(owner_a,'authenticated','authenticated','pull-agent-qa-a-'||owner_a||'@example.invalid','!',now(),'{"provider":"email","providers":["email"]}','{}',false),
      (owner_b,'authenticated','authenticated','pull-agent-qa-b-'||owner_b||'@example.invalid','!',now(),'{"provider":"email","providers":["email"]}','{}',false);
  before_a := jsonb_build_object('version',1,'identity','Fixture business A','context','company','offer','Fixture offer','website','',
    'prospects',jsonb_build_array(jsonb_build_object('id','A-reviewed','name','Fixture A','title','Founder','suppressed',false)),
    'shortlist',jsonb_build_array('A-reviewed'),'drafts','{}'::jsonb,'audit','[]'::jsonb,'mode','example',
    'rules',jsonb_build_object('roles','Founder','industries','','countries','','min','','max','','signals','','days','90','evidence',false));
  before_b := jsonb_set(jsonb_set(before_a,'{identity}','"Fixture business B"'::jsonb),'{prospects}',
    jsonb_build_array(jsonb_build_object('id','B-reviewed','name','Fixture B','title','Founder','suppressed',false)));
  before_b := jsonb_set(before_b,'{shortlist}',jsonb_build_array('B-reviewed'));
  insert into public.pull_workspaces(user_id,payload,revision) values(owner_a,before_a,3),(owner_b,before_b,7);
  -- Reset only the current day's project counter inside this rollback transaction,
  -- so pre-existing model usage cannot make the test nondeterministic.
  insert into pull_private.ai_daily_usage(day,owner,requests) values(today,'project',0)
    on conflict(day,owner) do update set requests=0;

  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated','email','fixture-a@example.invalid','is_anonymous',false)::text,true);
  set local role authenticated;
  insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
    values(owner_a,'QA own agent',hash_a,array['workspace:read','drafts:write'],now()+interval '29 days') returning id into token_a;
  select count(id) into row_count from public.pull_agent_tokens;
  if row_count<>1 then raise exception 'Owner A did not read exactly their own token metadata'; end if;
  select count(*) into row_count from public.pull_workspaces;
  if row_count<>1 then raise exception 'Owner A can see another owner workspace'; end if;
  begin
    perform token_hash from public.pull_agent_tokens;
    raise exception 'Owner can read token hashes';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
      values(owner_b,'Forged owner',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array['workspace:read'],now()+interval '1 day');
    raise exception 'Owner can issue another account access';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
      values(owner_a,'Invalid scope',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array['workspace:read','send:all'],now()+interval '1 day');
    raise exception 'Unsupported token scope was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
      values(owner_a,'Expired on creation',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array['workspace:read'],now()-interval '1 day');
    raise exception 'Already expired token was accepted';
  exception when check_violation then null; end;
  insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
    values(owner_a,'Lifetime clamp',hash_long,array['workspace:read'],now()+interval '100 days') returning id into long_token;
  if not (select expires_at<=created_at+interval '30 days' from public.pull_agent_tokens where id=long_token) then
    raise exception 'Token lifetime exceeds thirty days';
  end if;
  for i in 1..8 loop
    insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
      values(owner_a,'QA limit '||i,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array['workspace:read'],now()+interval '1 day');
  end loop;
  begin
    insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
      values(owner_a,'Eleventh active token',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array['workspace:read'],now()+interval '1 day');
    raise exception 'Active-token cap was not enforced';
  exception when program_limit_exceeded then null; end;
  for i in 1..20 loop
    if public.claim_pull_ai_request() is distinct from true then raise exception 'AI quota rejected request % before the user limit',i; end if;
  end loop;
  if public.claim_pull_ai_request() is distinct from false then raise exception 'The twenty-first user AI request passed'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated','email','fixture-b@example.invalid','is_anonymous',false)::text,true);
  set local role authenticated;
  insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
    values(owner_b,'QA other owner',hash_b,array['workspace:read'],now()+interval '1 day') returning id into token_b;
  select count(id) into row_count from public.pull_agent_tokens;
  if row_count<>1 then raise exception 'Owner B can see owner A token metadata'; end if;
  update public.pull_agent_tokens set revoked_at=now() where id=token_a;
  get diagnostics row_count=ROW_COUNT;
  if row_count<>0 then raise exception 'Owner B revoked owner A access'; end if;
  update public.pull_workspaces set revision=99 where user_id=owner_a;
  get diagnostics row_count=ROW_COUNT;
  if row_count<>0 then raise exception 'Owner B changed owner A workspace'; end if;
  begin
    perform public.authenticate_pull_agent(hash_a);
    raise exception 'Authenticated client called the service-only token RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform public.commit_pull_agent_draft(hash_a,3,'A-reviewed','Forged','Forged','email');
    raise exception 'Authenticated client called the service-only draft RPC';
  exception when insufficient_privilege then null; end;

  -- A signed-in anonymous JWT must fail every exposed token operation, even
  -- when its UID equals an existing token owner in this synthetic fixture.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated','is_anonymous',true)::text,true);
  select count(id) into row_count from public.pull_agent_tokens;
  if row_count<>0 then raise exception 'Anonymous JWT can read token metadata'; end if;
  update public.pull_agent_tokens set revoked_at=now();
  get diagnostics row_count=ROW_COUNT;
  if row_count<>0 then raise exception 'Anonymous JWT can revoke token access'; end if;
  begin
    insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
      values(owner_b,'Anonymous issuance',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array['workspace:read'],now()+interval '1 day');
    raise exception 'Anonymous JWT can issue tokens';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_pull_ai_request();
    raise exception 'Anonymous JWT passed the AI quota gate';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin
    perform public.claim_pull_ai_request();
    raise exception 'Anonymous role called the AI quota RPC';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Global cap is independent of one user's count. These counter updates also
  -- roll back, preserving the project's real current-day usage.
  update pull_private.ai_daily_usage set requests=199 where day=today and owner='project';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated','email','fixture-b@example.invalid','is_anonymous',false)::text,true);
  set local role authenticated;
  if public.claim_pull_ai_request() is distinct from true then raise exception 'Project request two hundred was rejected'; end if;
  if public.claim_pull_ai_request() is distinct from false then raise exception 'Project request two hundred one passed'; end if;
  reset role;

  -- A service token can authenticate, but cannot choose a different owner.
  set local role service_role;
  result:=public.authenticate_pull_agent(hash_a);
  if result->>'user_id' is distinct from owner_a::text or result ? 'token_hash' then raise exception 'Service authentication returned a wrong owner or token hash'; end if;
  if public.authenticate_pull_agent(md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text)) is not null then raise exception 'Unknown token authenticated'; end if;
  result:=public.commit_pull_agent_draft(hash_b,7,'B-reviewed','Blocked','Read-only token cannot write.','company');
  if result->>'error' is distinct from 'ACCESS_DENIED' then raise exception 'Read-only token saved a draft'; end if;
  result:=public.commit_pull_agent_draft(hash_a,3,'B-reviewed','Blocked','Wrong owner prospect.','email');
  if result->>'error' is distinct from 'REVIEW_REQUIRED' then raise exception 'An agent drafted for another owner prospect'; end if;
  result:=public.commit_pull_agent_draft(hash_a,3,'A-reviewed','Fixture subject','Review this proposed draft.','company');
  if (result->>'revision')::integer is distinct from 4 or result->>'ready' is distinct from 'false' or result->>'delivery' is distinct from 'not_sent' then
    raise exception 'Draft proposal did not remain unprepared and unsent';
  end if;
  if (select payload->'prospects'=before_a->'prospects' and payload->'rules'=before_a->'rules'
      and payload->'shortlist'=before_a->'shortlist' and payload->'identity'=before_a->'identity'
      and payload#>>'{drafts,A-reviewed,ready}'='false' and jsonb_array_length(payload->'audit')=1
      from public.pull_workspaces where user_id=owner_a) is distinct from true then raise exception 'A draft changed protected workspace fields'; end if;
  if (select payload=before_b and revision=7 from public.pull_workspaces where user_id=owner_b) is distinct from true then raise exception 'Agent changed another owner workspace'; end if;
  result:=public.commit_pull_agent_draft(hash_a,3,'A-reviewed','Stale','This must not replace the newer draft.','email');
  if result->>'error' is distinct from 'REVISION_CONFLICT' then raise exception 'Stale revision was accepted'; end if;
  if (select revision=4 and payload#>>'{drafts,A-reviewed,body}'='Review this proposed draft.' from public.pull_workspaces where user_id=owner_a) is distinct from true then raise exception 'Stale revision overwrote the saved draft'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated','email','fixture-a@example.invalid','is_anonymous',false)::text,true);
  set local role authenticated;
  update public.pull_agent_tokens set revoked_at=now() where id=token_a;
  get diagnostics row_count=ROW_COUNT;
  if row_count<>1 then raise exception 'Owner could not revoke their own token'; end if;
  begin
    update public.pull_agent_tokens set revoked_at=null where id=token_a;
    raise exception 'Revoked token was reactivated';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role service_role;
  if public.authenticate_pull_agent(hash_a) is not null then raise exception 'Revoked token authenticated'; end if;
  result:=public.commit_pull_agent_draft(hash_a,4,'A-reviewed','Revoked','This must not save.','email');
  if result->>'error' is distinct from 'ACCESS_DENIED' then raise exception 'Revoked token saved a draft'; end if;
  reset role;

  -- Convert an existing fixture into a legitimately elapsed lifetime. Only the
  -- administrator can alter created_at/expires_at, and this change rolls back.
  update public.pull_agent_tokens set created_at=now()-interval '31 days',expires_at=now()-interval '2 days' where id=long_token;
  set local role service_role;
  if public.authenticate_pull_agent(hash_long) is not null then raise exception 'Expired token authenticated'; end if;
  reset role;

  perform set_config('pull.verify_agent_results',jsonb_build_object(
    'owner_isolation',true,'anonymous_jwt_rejected',true,'token_hash_hidden',true,
    'scopes_and_lifetime_limited',true,'active_token_cap',true,'ai_user_quota',true,'ai_project_quota',true,
    'service_rpc_grants',true,'helpers_protected',true,'draft_remains_unsent',true,
    'revision_conflict_preserves_data',true,'revocation_enforced',true,'expiry_enforced',true,
    'fixtures_rolled_back_on_completion',true)::text,true);
end;
$verify$;

select current_setting('pull.verify_agent_results')::jsonb as verified_assertions;
rollback;
