-- Apply after database/setup.sql. Raw agent tokens never enter the database.
create schema if not exists pull_private;
revoke all on schema pull_private from public, anon, authenticated;

create table if not exists public.pull_agent_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 2 and
    scopes <@ array['workspace:read','drafts:write']::text[] and
    'workspace:read' = any(scopes)
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  revoked_at timestamptz,
  request_day date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count between 0 and 500)
);
create index if not exists pull_agent_tokens_owner_idx on public.pull_agent_tokens(user_id);
alter table public.pull_agent_tokens enable row level security;
revoke all on public.pull_agent_tokens from public, anon, authenticated;
grant select (id,user_id,label,scopes,expires_at,created_at,revoked_at) on public.pull_agent_tokens to authenticated;
grant insert (user_id,label,token_hash,scopes,expires_at) on public.pull_agent_tokens to authenticated;
grant update (revoked_at) on public.pull_agent_tokens to authenticated;
grant all on public.pull_agent_tokens to service_role;

drop policy if exists "Read own agent metadata" on public.pull_agent_tokens;
create policy "Read own agent metadata" on public.pull_agent_tokens for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
drop policy if exists "Create own agent access" on public.pull_agent_tokens;
create policy "Create own agent access" on public.pull_agent_tokens for insert to authenticated
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
drop policy if exists "Revoke own agent access" on public.pull_agent_tokens;
create policy "Revoke own agent access" on public.pull_agent_tokens for update to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true')
  with check ((select auth.uid()) = user_id and revoked_at is not null and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');

-- Owner insert limits are serialized to prevent simultaneous requests exceeding ten.
create or replace function pull_private.limit_agent_tokens() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'Owner authentication required' using errcode = '42501';
  end if;
  -- Clamp the requested lifetime to the database clock, avoiding clock drift
  -- between a Vercel Function and Postgres while preserving the thirty-day cap.
  new.expires_at := least(new.expires_at,new.created_at + interval '30 days');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pull_agents:' || new.user_id::text,0));
  if (select count(*) from public.pull_agent_tokens where user_id = new.user_id and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'Revoke an existing agent before creating another' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function pull_private.limit_agent_tokens() from public, anon, authenticated;
drop trigger if exists pull_agent_token_limit on public.pull_agent_tokens;
create trigger pull_agent_token_limit before insert on public.pull_agent_tokens
  for each row execute function pull_private.limit_agent_tokens();

create table if not exists pull_private.ai_daily_usage (
  day date not null,
  owner text not null,
  requests integer not null check (requests >= 0),
  primary key (day,owner)
);
alter table pull_private.ai_daily_usage enable row level security;
revoke all on pull_private.ai_daily_usage from public, anon, authenticated;

-- A private definer is necessary to keep counters inaccessible to clients.
-- The caller's verified auth.uid() is the only accepted owner; there is no UID argument.
create or replace function pull_private.claim_ai_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
begin
  if owner_id is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pull_ai:' || today::text,0));
  if coalesce((select requests from pull_private.ai_daily_usage where day=today and owner=owner_id::text),0) >= 20
    or coalesce((select requests from pull_private.ai_daily_usage where day=today and owner='project'),0) >= 200 then
    return false;
  end if;
  insert into pull_private.ai_daily_usage(day,owner,requests) values(today,owner_id::text,1),(today,'project',1)
    on conflict (day,owner) do update set requests=ai_daily_usage.requests+1;
  return true;
end;
$$;
revoke all on function pull_private.claim_ai_request() from public, anon, authenticated;
grant usage on schema pull_private to authenticated;
grant execute on function pull_private.claim_ai_request() to authenticated;
create or replace function public.claim_pull_ai_request() returns boolean
language sql security invoker set search_path = '' as $$ select pull_private.claim_ai_request(); $$;
revoke all on function public.claim_pull_ai_request() from public, anon, authenticated;
grant execute on function public.claim_pull_ai_request() to authenticated;

-- Only the Edge Function's platform-provided server credential can call these.
-- This is an invoker function: no public SECURITY DEFINER entry point exists.
create or replace function public.authenticate_pull_agent(p_token_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  token public.pull_agent_tokens%rowtype;
  today date := (now() at time zone 'utc')::date;
begin
  select * into token from public.pull_agent_tokens where token_hash=p_token_hash for update;
  if not found or token.revoked_at is not null or token.expires_at <= now() then return null; end if;
  if token.request_day=today and token.request_count >= 500 then
    return jsonb_build_object('limited',true);
  end if;
  update public.pull_agent_tokens set request_day=today,
    request_count=case when token.request_day=today then token.request_count+1 else 1 end
    where id=token.id;
  return jsonb_build_object('id',token.id,'user_id',token.user_id,'scopes',token.scopes,
    'expires_at',token.expires_at,'revoked_at',token.revoked_at);
end;
$$;
revoke all on function public.authenticate_pull_agent(text) from public, anon, authenticated;
grant execute on function public.authenticate_pull_agent(text) to service_role;
grant select, update on public.pull_workspaces to service_role;

-- Recheck token and revision under row locks immediately before writing. The
-- function constructs the change from the existing row; agents cannot replace
-- prospects, rules, identity, approvals, delivery counts, or another owner's data.
create or replace function public.commit_pull_agent_draft(
  p_token_hash text, p_revision bigint, p_prospect_id text,
  p_subject text, p_body text, p_channel text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  token public.pull_agent_tokens%rowtype;
  workspace public.pull_workspaces%rowtype;
  changed jsonb;
begin
  select * into token from public.pull_agent_tokens where token_hash=p_token_hash for update;
  if not found or token.revoked_at is not null or token.expires_at <= now()
    or not ('workspace:read'=any(token.scopes) and 'drafts:write'=any(token.scopes)) then
    return jsonb_build_object('error','ACCESS_DENIED');
  end if;
  select * into workspace from public.pull_workspaces where user_id=token.user_id for update;
  if not found then return jsonb_build_object('error','WORKSPACE_MISSING'); end if;
  if workspace.revision <> p_revision then return jsonb_build_object('error','REVISION_CONFLICT'); end if;
  if p_prospect_id is null or length(p_prospect_id) not between 1 and 200
    or p_subject is null or length(p_subject) > 200
    or p_body is null or length(btrim(p_body)) not between 1 and 5000
    or p_channel is null or p_channel not in ('email','personal','company') then
    return jsonb_build_object('error','INVALID_DRAFT');
  end if;
  if not (workspace.payload->'shortlist' @> jsonb_build_array(p_prospect_id))
    or not exists (select 1 from jsonb_array_elements(workspace.payload->'prospects') prospect
      where prospect->>'id'=p_prospect_id and coalesce(prospect->>'suppressed','false') <> 'true') then
    return jsonb_build_object('error','REVIEW_REQUIRED');
  end if;
  changed := jsonb_set(workspace.payload,array['drafts'],coalesce(workspace.payload->'drafts','{}'::jsonb)
    || jsonb_build_object(p_prospect_id,jsonb_build_object('body',p_body,'subject',p_subject,'channel',p_channel,'ready',false)));
  changed := jsonb_set(changed,array['audit'],coalesce(changed->'audit','[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('action','Agent draft proposed','detail','An agent proposed a draft for your review; nothing sent.',
      'at',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))));
  update public.pull_workspaces set payload=changed,revision=workspace.revision+1,updated_at=now() where user_id=token.user_id;
  return jsonb_build_object('revision',workspace.revision+1,'prospectId',p_prospect_id,'ready',false,'delivery','not_sent');
end;
$$;
revoke all on function public.commit_pull_agent_draft(text,bigint,text,text,text,text) from public, anon, authenticated;
grant execute on function public.commit_pull_agent_draft(text,bigint,text,text,text,text) to service_role;
