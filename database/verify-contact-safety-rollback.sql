-- Run as database administrator AFTER setup.sql, agents.sql and contact-safety.sql.
-- Uses two disposable Auth fixtures and rolls back every row/revision/token.
-- No prospect sources or external services are queried. If any assertion fails,
-- issue ROLLBACK before doing anything else.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  perform set_config('pull_test.contact_a',a::text,true);
  perform set_config('pull_test.contact_b',b::text,true);
  perform set_config('pull_test.contact_hash',repeat(replace(a::text,'-',''),2),true);
  perform set_config('pull_test.contact_base','{"version":1,"prospects":[],"shortlist":[],"drafts":{},"audit":[],"mode":"import","identity":"Rollback verification","context":"company","website":"","offer":"Private-business support","remember":false,"setup":false,"duplicates":0,"rules":{"roles":"Founder","industries":"","countries":"","min":"","max":"","signals":"","evidence":true,"days":"90"}}',true);
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,is_anonymous)
  values
    (a,'authenticated','authenticated','pull-contact-qa-a-'||a||'@example.invalid','!',now(),'{}','{}',false),
    (b,'authenticated','authenticated','pull-contact-qa-b-'||b||'@example.invalid','!',now(),'{}','{}',false);
  if has_function_privilege('anon','pull_private.contact_ascii(text)','EXECUTE')
     or has_function_privilege('authenticated','pull_private.contact_ascii(text)','EXECUTE')
     or has_function_privilege('authenticated','pull_private.contact_url(text)','EXECUTE')
     or has_function_privilege('authenticated','pull_private.contact_record_keys(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','pull_private.contact_safety_payload(jsonb,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','pull_private.preserve_contact_safety()','EXECUTE') then
    raise exception 'Private contact helpers are client callable';
  end if;
  if pull_private.contact_url('https://WWW.Twitter.com/Ada/?tracking=1')<>'https://x.com/ada'
     or pull_private.contact_url('https://m.facebook.com/profile.php?id=123&tracking=1')<>'https://facebook.com/profile.php?id=123'
     or pull_private.contact_url('https://fb.com/profile.php?id=123&id=456')<>''
     or pull_private.contact_url('https://example.test/Case?utm_source=tracking')<>'https://example.test/Case'
     or pull_private.contact_url('https://example.test/case')<>'https://example.test/case'
     or pull_private.contact_url('https://example.test/person?id=123')<>''
     or pull_private.contact_url('https://user:secret@example.test/person')<>''
     or pull_private.contact_url('http://example.test/person')<>'' then
    raise exception 'Conservative profile canonicalization failed';
  end if;
  if pull_private.contact_record_keys('{"id":"import-1","source_url":"https://directory.example.test/shared"}'::jsonb)<>'{}'::text[] then
    raise exception 'Transient row IDs or shared evidence became contact identities';
  end if;
  if not ('entity:|example works'=any(pull_private.contact_record_keys('{"company":"Example Works"}'::jsonb))) then
    raise exception 'Company-only do-not-contact identity is missing';
  end if;
  insert into public.pull_workspaces(user_id,payload,revision)
  values(b,current_setting('pull_test.contact_base')::jsonb,1);
end $$;

set local role authenticated;
do $$
declare
  a uuid:=current_setting('pull_test.contact_a')::uuid;
  b uuid:=current_setting('pull_test.contact_b')::uuid;
  base jsonb:=current_setting('pull_test.contact_base')::jsonb;
  saved public.pull_workspaces%rowtype;
  original_ledger jsonb;
  invalid_ledger jsonb;
  before_invalid public.pull_workspaces%rowtype;
  changed integer;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('request.jwt.claim.sub',a::text,true);
  insert into public.pull_workspaces(user_id,payload,revision)
  values(a,base||'{"prospects":[{"id":"blocked-original","name":"Ada Owner","company":"Example Works","email":"Blocked@Example.test","profile_url":"https://WWW.Twitter.com/Ada/?tracking=1","suppressed":true,"suppression_origin":"explicit"},{"id":"blocked-alias","name":"Other Name","company":"Elsewhere","email":"blocked@example.test","profile_url":"https://x.com/OtherPerson","suppressed":false},{"id":"kept","name":"Safe Person","company":"Safe Works","email":"safe@example.test","suppressed":false}],"shortlist":["blocked-original","blocked-alias","kept"],"drafts":{"blocked-original":{"subject":"Hello","body":"Review me","channel":"email","ready":true},"blocked-alias":{"subject":"Hello","body":"Review me","channel":"email","ready":true},"kept":{"subject":"Hello","body":"Review me","channel":"email","ready":true}}}'::jsonb,1);
  select * into strict saved from public.pull_workspaces where user_id=a;
  original_ledger:=saved.payload->'suppressions';
  if not (original_ledger @> '["email:blocked@example.test","profile:https://x.com/ada","entity:ada owner|example works"]'::jsonb)
     or saved.payload#>>'{prospects,1,suppressed}' is distinct from 'true'
     or saved.payload#>>'{prospects,1,suppression_origin}' is distinct from 'matched'
     or saved.payload->'shortlist' is distinct from '["kept"]'::jsonb
     or saved.payload#>>'{drafts,blocked-original,ready}' is distinct from 'false'
     or saved.payload#>>'{drafts,blocked-alias,ready}' is distinct from 'false'
     or saved.payload#>>'{drafts,kept,ready}' is distinct from 'true' then
    raise exception 'Suppression seeding, alias matching or approval invalidation failed';
  end if;
  -- Revalidation must remain stable and must not spread a shared-inbox match to
  -- the other person's unrelated profile or personal identity.
  update public.pull_workspaces set payload=payload where user_id=a;
  select * into strict saved from public.pull_workspaces where user_id=a;
  if saved.payload->'suppressions' is distinct from original_ledger
     or saved.payload->'suppressions' @> '["profile:https://x.com/otherperson"]'::jsonb
     or saved.payload->'suppressions' @> '["entity:other name|elsewhere"]'::jsonb then
    raise exception 'A shared-inbox match became an explicit exclusion of another person';
  end if;
  update public.pull_workspaces set payload=jsonb_set(payload,'{prospects,1,email}','"other-person@example.test"'::jsonb),revision=revision+1 where user_id=a;
  select * into strict saved from public.pull_workspaces where user_id=a;
  if saved.payload#>>'{prospects,1,suppressed}' is distinct from 'false'
     or saved.payload#>>'{prospects,0,suppressed}' is distinct from 'true'
     or saved.payload->'suppressions' is distinct from original_ledger
     or saved.payload#>>'{drafts,blocked-alias,ready}' is distinct from 'false' then
    raise exception 'A changed contact kept a stale derived exclusion or revived outreach approval';
  end if;
  update public.pull_workspaces set payload=payload where user_id=a;
  select * into strict saved from public.pull_workspaces where user_id=a;
  if saved.payload#>>'{prospects,1,suppressed}' is distinct from 'false'
     or saved.payload->'suppressions' is distinct from original_ledger then
    raise exception 'Revalidation revived a stale shared-inbox exclusion';
  end if;
  update public.pull_workspaces set payload=base||'{"suppressions":[],"prospects":[{"id":"rediscovered","email":"blocked@example.test","suppressed":false}],"shortlist":["rediscovered"],"drafts":{"rediscovered":{"subject":"Hello","body":"Needs review","channel":"email","ready":true}}}'::jsonb,revision=revision+1 where user_id=a and revision=saved.revision;
  select * into strict saved from public.pull_workspaces where user_id=a;
  if not (saved.payload->'suppressions' @> original_ledger)
     or saved.payload#>>'{prospects,0,suppressed}' is distinct from 'true'
     or saved.payload->'shortlist' is distinct from '[]'::jsonb
     or saved.payload#>>'{drafts,rediscovered,ready}' is distinct from 'false' then
    raise exception 'Replacement list erased suppression or revived approval';
  end if;
  update public.pull_workspaces set payload=base||'{"suppressions":[]}'::jsonb,revision=revision+1 where user_id=a;
  select * into strict saved from public.pull_workspaces where user_id=a;
  if not (saved.payload->'suppressions' @> original_ledger) or saved.payload->'prospects' is distinct from '[]'::jsonb then
    raise exception 'Clearing prospect rows erased do-not-contact history';
  end if;
  -- A later old-client save omits the ledger and attempts to restore approval.
  update public.pull_workspaces set payload=base||'{"prospects":[{"id":"rediscovered","email":"BLOCKED@example.test","suppressed":false}],"shortlist":["rediscovered"],"drafts":{}}'::jsonb,revision=revision+1 where user_id=a;
  select * into strict saved from public.pull_workspaces where user_id=a;
  if saved.payload#>>'{prospects,0,suppressed}' is distinct from 'true' or saved.payload->'shortlist' is distinct from '[]'::jsonb then
    raise exception 'Omitted ledger bypassed a saved suppression';
  end if;
  update public.pull_workspaces set payload=base,revision=revision+1 where user_id=a and revision=saved.revision-1;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Stale revision unexpectedly committed'; end if;
  if exists (select 1 from public.pull_workspaces where user_id=b) then raise exception 'Account A can read account B'; end if;
  update public.pull_workspaces set payload=base where user_id=b;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Account A can change account B'; end if;
  begin
    perform pull_private.contact_record_keys('{}'::jsonb);
    raise exception 'Authenticated caller executed a private helper';
  exception when insufficient_privilege then null; end;
  select * into strict before_invalid from public.pull_workspaces where user_id=a;
  foreach invalid_ledger in array array['null'::jsonb,'[1]'::jsonb,'["other:key"]'::jsonb,jsonb_build_array('email:'||repeat('x',1024))] loop
    begin
      update public.pull_workspaces set payload=jsonb_set(payload,'{suppressions}',invalid_ledger),revision=revision+1 where user_id=a;
      raise exception 'Malformed suppression key unexpectedly committed';
    exception when invalid_parameter_value then null; end;
  end loop;
  select jsonb_agg('email:person'||n||'@example.test') into invalid_ledger from generate_series(1,10001) n;
  begin
    update public.pull_workspaces set payload=jsonb_set(payload,'{suppressions}',invalid_ledger),revision=revision+1 where user_id=a;
    raise exception 'Suppression overflow unexpectedly committed';
  exception when program_limit_exceeded then null; end;
  select * into strict saved from public.pull_workspaces where user_id=a;
  if saved is distinct from before_invalid then raise exception 'Rejected suppression write partially changed the workspace'; end if;
  insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
  values(a,'Rollback contact guard',current_setting('pull_test.contact_hash'),array['workspace:read','drafts:write'],now()+interval '1 day');
  raise notice 'PASS: owner-scoped monotonic suppression, replacement, clear, stale revision and malformed/overflow rejection';
end $$;

set local role service_role;
do $$
declare revision bigint; result jsonb;
begin
  select w.revision into strict revision from public.pull_workspaces w where user_id=current_setting('pull_test.contact_a')::uuid;
  result:=public.commit_pull_agent_draft(current_setting('pull_test.contact_hash'),revision,'rediscovered','Hello','This must remain blocked.','email');
  if result->>'error' is distinct from 'REVIEW_REQUIRED' then raise exception 'Atomic agent draft commit bypassed suppression'; end if;
  raise notice 'PASS: existing atomic agent draft commit blocks ledger-matched records';
end $$;

set local role authenticated;
do $$
declare a uuid:=current_setting('pull_test.contact_a')::uuid; b uuid:=current_setting('pull_test.contact_b')::uuid; saved public.pull_workspaces%rowtype;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists (select 1 from public.pull_workspaces where user_id=a) then raise exception 'Account B can read account A'; end if;
  select * into strict saved from public.pull_workspaces where user_id=b;
  if saved.payload->'suppressions' is distinct from '[]'::jsonb then raise exception 'Account A suppression leaked into account B'; end if;
  raise notice 'PASS: second-account suppression isolation';
end $$;
reset role;
rollback;
select 'PASS: contact safety verification completed; all fixtures and revisions rolled back' as verification;
