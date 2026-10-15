begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); hash text:=repeat('a',64); p jsonb; proposed jsonb; result jsonb; again jsonb; base jsonb; stamp timestamptz; runs jsonb;
begin
 insert into auth.users(id,email,is_anonymous) values(a,'action-a@example.invalid',false),(b,'action-b@example.invalid',false);
 perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims','{"is_anonymous":false}',true);
 base:='{"version":1,"prospects":[],"shortlist":[],"drafts":{},"audit":[],"mode":"import"}';
 insert into public.pull_workspaces(user_id,payload,revision) values(a,base,1);
 insert into public.pull_automations(id,user_id,name,kind,trigger) values(w,a,'Review audience','audience_review','manual') returning updated_at into stamp;
 insert into public.pull_agent_tokens(id,user_id,label,token_hash,scopes,expires_at) values(t,a,'QA relay',hash,array['workspace:read','chat:relay'],now()+interval '1 day');
 insert into public.pull_agent_chat_requests(id,user_id,question,use_workspace) values(q,a,'Review my audience',true);
 update public.pull_agent_chat_requests set status='claimed',agent_token_id=t,claimed_at=now() where id=q;
 proposed:=public.propose_pull_agent_workflow(hash,q,w,1);
 if proposed->>'proposed'<>'true' then raise exception 'No proposal';end if;
 if (select revision from public.pull_workspaces where user_id=a)<>1 or exists(select 1 from public.pull_automation_runs where user_id=a) then raise exception 'Proposal executed prematurely';end if;
 runs:=jsonb_build_array(jsonb_build_object('id',w,'updated_at',stamp,'counts',jsonb_build_object('matches',0)));
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.execute_pull_agent_workflow(q,1,base,runs);raise exception 'Cross-owner execution succeeded' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.execute_pull_agent_workflow(q,2,base,runs);raise exception 'Stale execution succeeded' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 update public.pull_agent_tokens set revoked_at=now() where id=t;
 begin perform public.execute_pull_agent_workflow(q,1,base,runs);raise exception 'Revoked execution succeeded' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 update public.pull_agent_tokens set revoked_at=null where id=t;
 result:=public.execute_pull_agent_workflow(q,1,base,runs);again:=public.execute_pull_agent_workflow(q,1,base,runs);
 if result<>again or (result->>'revision')::int<>2 or (select count(*) from public.pull_automation_runs where user_id=a)<>1 then raise exception 'Idempotent receipt failed';end if;
 if (select workflow_result from public.pull_agent_chat_requests where id=q)<>result then raise exception 'Receipt not recorded';end if;
 -- useWorkspace=false cannot authorize a proposal, even for the owning agent.
 update public.pull_agent_chat_requests set workflow_proposal=null,workflow_result=null,use_workspace=false where id=q;
 if public.propose_pull_agent_workflow(hash,q,w,2)->>'error'<>'QUESTION_UNAVAILABLE' then raise exception 'Workspace opt-out ignored';end if;
 if has_function_privilege('anon','public.execute_pull_agent_workflow(uuid,bigint,jsonb,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.propose_pull_agent_workflow(text,uuid,uuid,bigint)','EXECUTE') then raise exception 'Unexpected function grant';end if;
end;$$;
select 'PASS: agent workflow execution; all fixtures rolled back' as verification;
rollback;
