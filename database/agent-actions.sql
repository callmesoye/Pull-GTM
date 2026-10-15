-- Owner-approved execution of an agent's proposal; never a sending permission.
begin;
alter table public.pull_agent_chat_requests add column if not exists workflow_proposal jsonb;
alter table public.pull_agent_chat_requests add column if not exists workflow_result jsonb;
grant select (workflow_proposal,workflow_result) on public.pull_agent_chat_requests to authenticated;

create or replace function public.propose_pull_agent_workflow(p_token_hash text,p_question_id uuid,p_workflow_id uuid,p_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.pull_agent_tokens%rowtype; q public.pull_agent_chat_requests%rowtype; w public.pull_automations%rowtype; r bigint; proposal jsonb;
begin
 select * into t from public.pull_agent_tokens where token_hash=p_token_hash for update;
 if not found or t.revoked_at is not null or t.expires_at<=now() or not ('chat:relay'=any(t.scopes)) then return jsonb_build_object('error','ACCESS_DENIED'); end if;
 select * into q from public.pull_agent_chat_requests where id=p_question_id and user_id=t.user_id and agent_token_id=t.id for update;
 if not found or q.status not in ('claimed','answered') or q.expires_at<=now() or not q.use_workspace then return jsonb_build_object('error','QUESTION_UNAVAILABLE'); end if;
 if q.workflow_proposal is not null then
   if q.workflow_proposal->>'workflowId'=p_workflow_id::text and (q.workflow_proposal->>'revision')::bigint=p_revision then return jsonb_build_object('proposed',true,'proposal',q.workflow_proposal); end if;
   return jsonb_build_object('error','PROPOSAL_ALREADY_EXISTS');
 end if;
 select * into w from public.pull_automations where id=p_workflow_id and user_id=t.user_id and enabled and not archived;
 if not found then return jsonb_build_object('error','WORKFLOW_UNAVAILABLE'); end if;
 select revision into r from public.pull_workspaces where user_id=t.user_id;
 if r is null or r is distinct from p_revision then return jsonb_build_object('error','WORKSPACE_CHANGED'); end if;
 proposal:=jsonb_build_object('workflowId',w.id,'name',w.name,'kind',w.kind,'destination',w.destination,'revision',r,'workflowUpdatedAt',w.updated_at,'expiresAt',q.expires_at);
 update public.pull_agent_chat_requests set workflow_proposal=proposal where id=q.id;
 return jsonb_build_object('proposed',true,'proposal',proposal,'requiresOwnerApproval',true,'sendsMessages',false);
end;$$;
revoke all on function public.propose_pull_agent_workflow(text,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.propose_pull_agent_workflow(text,uuid,uuid,bigint) to service_role;

create or replace function public.execute_pull_agent_workflow(p_question_id uuid,p_revision bigint,p_payload jsonb,p_runs jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.pull_agent_chat_requests%rowtype; result jsonb; w public.pull_automations%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501'; end if;
 select * into q from public.pull_agent_chat_requests where id=p_question_id and user_id=auth.uid() for update;
 if not found then raise exception 'Proposal unavailable' using errcode='P0001'; end if;
 -- A repeated approval returns the original receipt, without running again.
 if q.workflow_result is not null then return q.workflow_result; end if;
 if not exists (select 1 from public.pull_agent_tokens where id=q.agent_token_id and user_id=auth.uid() and revoked_at is null and expires_at>now() and 'chat:relay'=any(scopes)) then raise exception 'Agent access revoked' using errcode='P0001'; end if;
 if q.workflow_proposal is null or not q.use_workspace or q.expires_at<=now() or (q.workflow_proposal->>'revision')::bigint is distinct from p_revision
   or jsonb_typeof(p_runs) is distinct from 'array' or jsonb_array_length(p_runs)<>1 or p_runs->0->>'id' is distinct from q.workflow_proposal->>'workflowId' then
   raise exception 'Proposal expired or changed' using errcode='P0001';
 end if;
 select * into w from public.pull_automations where id=(q.workflow_proposal->>'workflowId')::uuid and user_id=auth.uid() and enabled and not archived for update;
 if not found or w.updated_at is distinct from (q.workflow_proposal->>'workflowUpdatedAt')::timestamptz then raise exception 'Workflow changed' using errcode='P0001'; end if;
 result:=public.pull_apply_automations(p_revision,p_payload,p_runs);
 update public.pull_agent_chat_requests set workflow_result=result where id=q.id;
 return result;
end;$$;
revoke all on function public.execute_pull_agent_workflow(uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.execute_pull_agent_workflow(uuid,bigint,jsonb,jsonb) to authenticated;
commit;
