-- Candidate additive schema; test locally before an independently reviewed deployment.
-- Requires search-budget.sql. Provision only the double-hashed research capability
-- in pull_private.research_capability; no server secret belongs in a client or repo.
begin;
create schema if not exists pull_private;
create table if not exists pull_private.research_capability (
 singleton boolean primary key default true check(singleton),
 capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$')
);
alter table pull_private.research_capability enable row level security;
revoke all on pull_private.research_capability from public,anon,authenticated,service_role;

create table if not exists public.pull_research_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_key uuid not null,
 goal_hash text not null check(goal_hash ~ '^[0-9a-f]{64}$'),
 input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=32000),
 status text not null default 'running' check(status in ('running','complete','cancelled')),
 max_requests integer not null check(max_requests between 1 and 8),
 requests_used integer not null default 0 check(requests_used>=0 and requests_used<=max_requests),
 revision bigint not null default 1,
 lease_token uuid,
 lease_expires_at timestamptz,
 snapshot jsonb check(snapshot is null or (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=250000)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 retain_until timestamptz not null default now()+interval '30 days',
 unique(user_id,request_key)
);
alter table public.pull_research_runs enable row level security;
revoke all on public.pull_research_runs from public,anon,authenticated;
grant select(id,user_id,request_key,input,status,max_requests,requests_used,revision,snapshot,created_at,updated_at,retain_until) on public.pull_research_runs to authenticated;
drop policy if exists research_owner_read on public.pull_research_runs;
create policy research_owner_read on public.pull_research_runs for select to authenticated
 using ((select auth.uid())=user_id and coalesce((select auth.jwt())->>'is_anonymous','false')<>'true');
create index if not exists research_owner_created on public.pull_research_runs(user_id,created_at desc);
create index if not exists research_retention on public.pull_research_runs(retain_until);

create table if not exists pull_private.research_steps (
 run_id uuid not null references public.pull_research_runs(id) on delete cascade,
 step_key text not null check(step_key ~ '^[0-9a-f]{64}$'),
 status text not null check(status in ('reserved','complete','uncertain')),
 lease_token uuid not null,
 response jsonb check(response is null or (jsonb_typeof(response)='object' and octet_length(response::text)<=100000)),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 primary key(run_id,step_key)
);
alter table pull_private.research_steps enable row level security;
revoke all on pull_private.research_steps from public,anon,authenticated,service_role;

create or replace function pull_private.research_owner(p_capability text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid();
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
  raise exception 'Owner authentication required' using errcode='42501';
 end if;
 if p_capability is null or p_capability !~ '^[0-9a-f]{64}$' or not exists(
  select 1 from pull_private.research_capability where singleton and
   capability_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_capability,'UTF8')),'hex')
 ) then raise exception 'Server research authorization required' using errcode='42501';end if;
 return owner;
end;$$;
revoke all on function pull_private.research_owner(text) from public,anon,authenticated,service_role;

create or replace function pull_private.start_research(p_key uuid,p_goal text,p_input jsonb,p_max integer,p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=pull_private.research_owner(p_capability); r public.pull_research_runs%rowtype; state text;
begin
 if p_key is null or p_goal is null or p_goal !~ '^[0-9a-f]{64}$' or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>32000 or p_max is null or p_max not between 1 and 8 then
  raise exception 'Invalid investigation' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('research:'||owner::text||':'||p_key::text,0));
 select * into r from public.pull_research_runs where user_id=owner and request_key=p_key for update;
 if found then
  if r.goal_hash<>p_goal then raise exception 'Request key belongs to another goal' using errcode='22023';end if;
  if r.status='cancelled' or r.retain_until<=clock_timestamp() then raise exception 'Investigation unavailable' using errcode='42501';end if;
  if r.status='complete' then state:='replay';
  elsif r.lease_expires_at>clock_timestamp() then state:='busy';
  else
   -- A crash after reservation may already have charged the external provider.
   -- Never automatically repeat that request; mark the outcome uncertain.
   update pull_private.research_steps set status='uncertain',finished_at=clock_timestamp()
    where run_id=r.id and status='reserved';
   update public.pull_research_runs set lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '90 seconds',revision=revision+1,updated_at=clock_timestamp()
    where id=r.id returning * into r;
   state:='resumed';
  end if;
 else
  insert into public.pull_research_runs(user_id,request_key,goal_hash,input,max_requests,lease_token,lease_expires_at)
   values(owner,p_key,p_goal,p_input,p_max,gen_random_uuid(),clock_timestamp()+interval '90 seconds') returning * into r;
  state:='created';
 end if;
 return jsonb_build_object('state',state,'id',r.id,'input',r.input,'snapshot',r.snapshot,'requestsUsed',r.requests_used,'maxRequests',r.max_requests,'revision',r.revision,'lease',case when state in ('created','resumed') then r.lease_token else null end);
end;$$;

create or replace function pull_private.reserve_research_step(p_run uuid,p_lease uuid,p_step text,p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=pull_private.research_owner(p_capability); r public.pull_research_runs%rowtype; s pull_private.research_steps%rowtype;
begin
 select * into r from public.pull_research_runs where id=p_run and user_id=owner for update;
 if not found or r.status<>'running' or p_lease is null or r.lease_token is distinct from p_lease or r.lease_expires_at<=clock_timestamp() or r.retain_until<=clock_timestamp() then raise exception 'Investigation lease unavailable' using errcode='42501';end if;
 if p_step is null or p_step !~ '^[0-9a-f]{64}$' then raise exception 'Invalid research step' using errcode='22023';end if;
 select * into s from pull_private.research_steps where run_id=r.id and step_key=p_step;
 if found then
  return jsonb_build_object('state',case when s.status='complete' then 'replay' else 'uncertain' end,'response',s.response,'requestsUsed',r.requests_used,'revision',r.revision);
 end if;
 if r.requests_used>=r.max_requests then return jsonb_build_object('state','denied','requestsUsed',r.requests_used,'revision',r.revision);end if;
 -- Per-run reservation and existing owner/project daily quota commit together.
 if not pull_private.claim_search_requests(1) then return jsonb_build_object('state','denied','requestsUsed',r.requests_used,'revision',r.revision);end if;
 insert into pull_private.research_steps(run_id,step_key,status,lease_token) values(r.id,p_step,'reserved',p_lease);
 update public.pull_research_runs set requests_used=requests_used+1,revision=revision+1,updated_at=clock_timestamp()
  where id=r.id returning * into r;
 return jsonb_build_object('state','claimed','requestsUsed',r.requests_used,'revision',r.revision);
end;$$;

create or replace function pull_private.finish_research_step(p_run uuid,p_lease uuid,p_step text,p_response jsonb,p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=pull_private.research_owner(p_capability); r public.pull_research_runs%rowtype; s pull_private.research_steps%rowtype;
begin
 select * into r from public.pull_research_runs where id=p_run and user_id=owner for update;
 if not found or r.status<>'running' or p_lease is null or r.lease_token is distinct from p_lease or r.lease_expires_at<=clock_timestamp() or r.retain_until<=clock_timestamp() then raise exception 'Investigation lease unavailable' using errcode='42501';end if;
 if p_response is null or jsonb_typeof(p_response)<>'object' or octet_length(p_response::text)>100000 then raise exception 'Invalid research response' using errcode='22023';end if;
 select * into s from pull_private.research_steps where run_id=r.id and step_key=p_step for update;
 if not found or s.lease_token is distinct from p_lease or s.status='uncertain' then raise exception 'Research step unavailable' using errcode='42501';end if;
 if s.status='complete' then
  if s.response is distinct from p_response then raise exception 'Research response already recorded' using errcode='22023';end if;
  return jsonb_build_object('revision',r.revision);
 end if;
 update pull_private.research_steps set status='complete',response=p_response,finished_at=clock_timestamp() where run_id=r.id and step_key=p_step;
 update public.pull_research_runs set revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 return jsonb_build_object('revision',r.revision);
end;$$;

create or replace function pull_private.checkpoint_research(p_run uuid,p_lease uuid,p_revision bigint,p_snapshot jsonb,p_complete boolean,p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=pull_private.research_owner(p_capability); r public.pull_research_runs%rowtype;
begin
 select * into r from public.pull_research_runs where id=p_run and user_id=owner for update;
 if not found or r.status<>'running' or p_lease is null or r.lease_token is distinct from p_lease or r.lease_expires_at<=clock_timestamp() or r.retain_until<=clock_timestamp() then raise exception 'Investigation lease unavailable' using errcode='42501';end if;
 if p_revision is null or p_revision<>r.revision then raise exception 'Investigation changed' using errcode='40001';end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>250000 or p_complete is null then raise exception 'Invalid checkpoint' using errcode='22023';end if;
 update public.pull_research_runs set snapshot=p_snapshot,status=case when p_complete then 'complete' else 'running' end,
  revision=revision+1,updated_at=clock_timestamp(),lease_token=case when p_complete then null else lease_token end,
  lease_expires_at=case when p_complete then null else lease_expires_at end where id=r.id returning * into r;
 return jsonb_build_object('revision',r.revision,'status',r.status);
end;$$;

revoke all on function pull_private.start_research(uuid,text,jsonb,integer,text) from public,anon,authenticated,service_role;
revoke all on function pull_private.reserve_research_step(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function pull_private.finish_research_step(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function pull_private.checkpoint_research(uuid,uuid,bigint,jsonb,boolean,text) from public,anon,authenticated,service_role;
grant usage on schema pull_private to authenticated;
grant execute on function pull_private.start_research(uuid,text,jsonb,integer,text),pull_private.reserve_research_step(uuid,uuid,text,text),pull_private.finish_research_step(uuid,uuid,text,jsonb,text),pull_private.checkpoint_research(uuid,uuid,bigint,jsonb,boolean,text) to authenticated;

create or replace function public.start_pull_research(p_key uuid,p_goal text,p_input jsonb,p_max integer,p_capability text) returns jsonb
language sql security invoker set search_path='' as $$ select pull_private.start_research(p_key,p_goal,p_input,p_max,p_capability); $$;
create or replace function public.reserve_pull_research_step(p_run uuid,p_lease uuid,p_step text,p_capability text) returns jsonb
language sql security invoker set search_path='' as $$ select pull_private.reserve_research_step(p_run,p_lease,p_step,p_capability); $$;
create or replace function public.finish_pull_research_step(p_run uuid,p_lease uuid,p_step text,p_response jsonb,p_capability text) returns jsonb
language sql security invoker set search_path='' as $$ select pull_private.finish_research_step(p_run,p_lease,p_step,p_response,p_capability); $$;
create or replace function public.checkpoint_pull_research(p_run uuid,p_lease uuid,p_revision bigint,p_snapshot jsonb,p_complete boolean,p_capability text) returns jsonb
language sql security invoker set search_path='' as $$ select pull_private.checkpoint_research(p_run,p_lease,p_revision,p_snapshot,p_complete,p_capability); $$;
revoke all on function public.start_pull_research(uuid,text,jsonb,integer,text),public.reserve_pull_research_step(uuid,uuid,text,text),public.finish_pull_research_step(uuid,uuid,text,jsonb,text),public.checkpoint_pull_research(uuid,uuid,bigint,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.start_pull_research(uuid,text,jsonb,integer,text),public.reserve_pull_research_step(uuid,uuid,text,text),public.finish_pull_research_step(uuid,uuid,text,jsonb,text),public.checkpoint_pull_research(uuid,uuid,bigint,jsonb,boolean,text) to authenticated;
commit;
