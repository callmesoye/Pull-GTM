-- Test the deployed relay with disposable auth data; rollback restores the database.
begin;
do $$ declare owner_id uuid:=gen_random_uuid(); begin
  perform set_config('pull_test.chat_owner',owner_id::text,true);
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,is_anonymous)
  values(owner_id,'authenticated','authenticated','pull-chat-qa-'||owner_id||'@example.invalid','!',now(),'{}','{}',false);
end $$;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('pull_test.chat_owner'),'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('request.jwt.claim.sub',current_setting('pull_test.chat_owner'),true);
end $$;
insert into public.pull_agent_tokens(user_id,label,token_hash,scopes,expires_at)
values(current_setting('pull_test.chat_owner')::uuid,'Rollback relay',repeat('a',64),array['workspace:read','chat:relay'],now()+interval '1 day');
insert into public.pull_agent_chat_requests(user_id,question,use_workspace)
values(current_setting('pull_test.chat_owner')::uuid,'Help me prioritize my private-sector audience.',true);
set local role service_role;
do $$ declare result jsonb; qid uuid; begin
  result:=public.claim_pull_agent_question(repeat('a',64));
  if result->>'pending' <> 'true' or result->>'useWorkspace' <> 'true' then raise exception 'Agent claim failed'; end if;
  qid:=(result->>'id')::uuid;
  if (public.answer_pull_agent_question(repeat('b',64),qid,'Wrong agent')->>'error') <> 'ACCESS_DENIED' then raise exception 'Wrong key could answer'; end if;
  if (public.answer_pull_agent_question(repeat('a',64),qid,'A grounded answer in the user voice.')->>'answered') <> 'true' then raise exception 'Owner agent answer failed'; end if;
  if (public.answer_pull_agent_question(repeat('a',64),qid,'Second answer')->>'error') <> 'QUESTION_UNAVAILABLE' then raise exception 'Answered question was mutable'; end if;
  if (select answer from public.pull_agent_chat_requests where id=qid) <> 'A grounded answer in the user voice.' then raise exception 'Answer was not stored'; end if;
end $$;
rollback;
