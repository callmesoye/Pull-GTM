-- An opt-in relay: the user's own running agent fetches Pull questions and returns answers.
-- MCP access by itself does not start a model or prove a client is online.
begin;
alter table public.pull_agent_tokens drop constraint if exists pull_agent_tokens_scopes_check;
alter table public.pull_agent_tokens add constraint pull_agent_tokens_scopes_check
  check (cardinality(scopes) between 1 and 3 and scopes <@ array['workspace:read','drafts:write','chat:relay']::text[] and 'workspace:read'=any(scopes));
alter table public.pull_agent_tokens add column if not exists last_chat_poll_at timestamptz;
grant select (last_chat_poll_at) on public.pull_agent_tokens to authenticated;

create table if not exists public.pull_agent_chat_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (length(btrim(question)) between 1 and 5000),
  use_workspace boolean not null default true,
  answer text check (answer is null or length(btrim(answer)) between 1 and 24000),
  status text not null default 'pending' check (status in ('pending','claimed','answered')),
  agent_token_id uuid references public.pull_agent_tokens(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  answered_at timestamptz,
  expires_at timestamptz not null default now()+interval '10 minutes'
);
create index if not exists pull_agent_chat_owner_idx on public.pull_agent_chat_requests(user_id,created_at desc);
create index if not exists pull_agent_chat_pending_idx on public.pull_agent_chat_requests(user_id,created_at) where status='pending';
alter table public.pull_agent_chat_requests enable row level security;
revoke all on public.pull_agent_chat_requests from public,anon,authenticated;
grant select (id,user_id,question,use_workspace,answer,status,created_at,claimed_at,answered_at,expires_at) on public.pull_agent_chat_requests to authenticated;
grant insert (user_id,question,use_workspace) on public.pull_agent_chat_requests to authenticated;
grant all on public.pull_agent_chat_requests to service_role;
drop policy if exists "Read own agent conversation" on public.pull_agent_chat_requests;
create policy "Read own agent conversation" on public.pull_agent_chat_requests for select to authenticated
  using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
drop policy if exists "Ask own agent" on public.pull_agent_chat_requests;
create policy "Ask own agent" on public.pull_agent_chat_requests for insert to authenticated
  with check ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');

create or replace function pull_private.limit_agent_chat() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.uid()<>new.user_id or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception 'Owner authentication required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pull_chat:'||new.user_id::text,0));
  if (select count(*) from public.pull_agent_chat_requests where user_id=new.user_id and status in ('pending','claimed') and expires_at>now())>=3 then
    raise exception 'Wait for an answer before asking another question' using errcode='54000';
  end if;
  if (select count(*) from public.pull_agent_chat_requests where user_id=new.user_id and created_at>now()-interval '1 day')>=100 then
    raise exception 'Daily conversation limit reached' using errcode='54000';
  end if;
  return new;
end;$$;
revoke all on function pull_private.limit_agent_chat() from public,anon,authenticated;
drop trigger if exists pull_agent_chat_limit on public.pull_agent_chat_requests;
create trigger pull_agent_chat_limit before insert on public.pull_agent_chat_requests
  for each row execute function pull_private.limit_agent_chat();

create or replace function public.claim_pull_agent_question(p_token_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare token public.pull_agent_tokens%rowtype; question public.pull_agent_chat_requests%rowtype;
begin
  select * into token from public.pull_agent_tokens where token_hash=p_token_hash for update;
  if not found or token.revoked_at is not null or token.expires_at<=now() or not ('chat:relay'=any(token.scopes)) then
    return jsonb_build_object('error','ACCESS_DENIED');
  end if;
  update public.pull_agent_tokens set last_chat_poll_at=now() where id=token.id;
  select * into question from public.pull_agent_chat_requests
    where user_id=token.user_id and status='pending' and expires_at>now()
    order by created_at asc for update skip locked limit 1;
  if not found then return jsonb_build_object('pending',false); end if;
  update public.pull_agent_chat_requests set status='claimed',agent_token_id=token.id,claimed_at=now() where id=question.id;
  return jsonb_build_object('pending',true,'id',question.id,'question',question.question,'useWorkspace',question.use_workspace,'expiresAt',question.expires_at);
end;$$;
revoke all on function public.claim_pull_agent_question(text) from public,anon,authenticated;
grant execute on function public.claim_pull_agent_question(text) to service_role;

create or replace function public.answer_pull_agent_question(p_token_hash text,p_question_id uuid,p_answer text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare token public.pull_agent_tokens%rowtype; updated_id uuid;
begin
  select * into token from public.pull_agent_tokens where token_hash=p_token_hash for update;
  if not found or token.revoked_at is not null or token.expires_at<=now() or not ('chat:relay'=any(token.scopes)) then
    return jsonb_build_object('error','ACCESS_DENIED');
  end if;
  if p_answer is null or length(btrim(p_answer)) not between 1 and 24000 then
    return jsonb_build_object('error','INVALID_ANSWER');
  end if;
  update public.pull_agent_chat_requests set answer=btrim(p_answer),status='answered',answered_at=now()
    where id=p_question_id and user_id=token.user_id and agent_token_id=token.id
      and status='claimed' and expires_at>now() returning id into updated_id;
  if updated_id is null then return jsonb_build_object('error','QUESTION_UNAVAILABLE'); end if;
  return jsonb_build_object('answered',true,'id',updated_id);
end;$$;
revoke all on function public.answer_pull_agent_question(text,uuid,text) from public,anon,authenticated;
grant execute on function public.answer_pull_agent_question(text,uuid,text) to service_role;
commit;
