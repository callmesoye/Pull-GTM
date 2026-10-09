-- Synthetic fixtures and counters are rolled back; no production records remain.
begin;
do $$
declare
  today date := (now() at time zone 'utc')::date;
  owner_id uuid := gen_random_uuid();
begin
  if has_table_privilege('authenticated','pull_private.search_daily_usage','SELECT')
    or has_table_privilege('anon','pull_private.search_daily_usage','SELECT')
    or has_function_privilege('anon','public.claim_pull_search_requests(integer)','EXECUTE') then
    raise exception 'Search budget access is too broad';
  end if;
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'is_anonymous',false)::text,true);
  -- Take the same lock as production callers so they cannot see fixture counters.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pull_search:' || today::text,0));
  delete from pull_private.search_daily_usage where day=today;
  for i in 1..10 loop
    if public.claim_pull_search_requests(2) is distinct from true then raise exception 'Owner budget rejected before limit'; end if;
  end loop;
  if public.claim_pull_search_requests(1) is distinct from false then raise exception 'Owner budget exceeded limit'; end if;
  update pull_private.search_daily_usage set requests=199 where day=today and owner='project';
  perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'is_anonymous',false)::text,true);
  if public.claim_pull_search_requests(2) is distinct from false then raise exception 'Project reservation exceeded limit'; end if;
  if public.claim_pull_search_requests(1) is distinct from true then raise exception 'Last project request rejected'; end if;
  if public.claim_pull_search_requests(1) is distinct from false then raise exception 'Project budget exceeded'; end if;
  begin
    perform public.claim_pull_search_requests(4);
    raise exception 'Invalid reservation accepted';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'is_anonymous',true)::text,true);
  begin
    perform public.claim_pull_search_requests(1);
    raise exception 'Anonymous caller accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
