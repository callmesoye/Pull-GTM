begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();w uuid:=gen_random_uuid();s uuid:=gen_random_uuid();hash text:=repeat('e',64);base jsonb:='{"version":1,"prospects":[],"shortlist":[],"drafts":{},"audit":[],"mode":"import"}';stamp timestamptz;t jsonb;r jsonb;
begin
 insert into auth.users(id,email,is_anonymous) values(a,'schedule-a@example.invalid',false),(b,'schedule-b@example.invalid',false);
 insert into public.pull_workspaces(user_id,payload,revision) values(a,base,1);
 insert into public.pull_automations(id,user_id,name,kind,trigger) values(w,a,'QA daily review','audience_review','manual') returning updated_at into stamp;
 insert into public.pull_workflow_schedules(id,user_id,workflow_id,interval_seconds,next_run_at) values(s,a,w,86400,now()+interval '1 day');
 insert into pull_private.schedule_tickets(ticket_hash,schedule_id,workflow_updated_at) values(hash,s,stamp);
 t:=public.claim_pull_schedule(hash);if (t->>'revision')::int<>1 or t->'workflow'->>'id'<>w::text then raise exception 'Wrong task claimed';end if;
 if public.claim_pull_schedule(hash)->>'error'<>'UNAVAILABLE' then raise exception 'Ticket claimed twice';end if;
 update public.pull_workflow_schedules set enabled=false where id=s;
 begin perform public.commit_pull_schedule(hash,1,base,'{}');raise exception 'Paused schedule executed' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 update public.pull_workflow_schedules set enabled=true where id=s;
 begin perform public.commit_pull_schedule(hash,2,base,'{}');raise exception 'Stale schedule executed' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 r:=public.commit_pull_schedule(hash,1,base,'{"matches":0}');if (r->>'revision')::int<>2 then raise exception 'Schedule did not commit';end if;
 begin perform public.commit_pull_schedule(hash,1,base,'{}');raise exception 'Schedule executed twice' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 if (select count(*) from public.pull_automation_runs where user_id=a)<>1 or (select last_status from public.pull_workflow_schedules where id=s)<>'completed' then raise exception 'Missing run receipt';end if;
 if has_function_privilege('authenticated','public.claim_pull_schedule(text)','EXECUTE') or has_function_privilege('anon','public.commit_pull_schedule(text,bigint,jsonb,jsonb)','EXECUTE') then raise exception 'Worker callable by client';end if;
 perform set_config('pull_test.schedule_b',b::text,true);
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('pull_test.schedule_b'),true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $$begin if exists(select 1 from public.pull_workflow_schedules) then raise exception 'Other owner schedules visible';end if;end;$$;
reset role;
select 'PASS: scheduled workflow claim, pause, CAS, replay and ownership checks; all fixtures rolled back' as verification;
rollback;
