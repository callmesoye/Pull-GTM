-- Apply channels.sql/receipt-integrity.sql first. All fixtures, including the capability, roll back.
begin;
do $$
declare owner uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); connection uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,is_anonymous) values(owner,'receipt-owner@example.invalid',false),(other_owner,'receipt-other@example.invalid',false);
 insert into public.pull_workspaces(user_id,payload,revision) values(owner,'{"version":1,"prospects":[],"shortlist":[],"drafts":{},"audit":[]}',1);
 insert into public.pull_channel_connections(id,user_id,provider,account_id,label,token_cipher,expires_at) values(connection,owner,'gmail','qa','sender@example.invalid','encrypted-qa',now()+interval '1 hour');
 insert into pull_private.delivery_receipt_capability(singleton,capability_hash)
 values(true,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(repeat('e',64),'UTF8')),'hex'))
 on conflict(singleton) do update set capability_hash=excluded.capability_hash;
 perform set_config('pull_test.receipt_owner',owner::text,true);
 perform set_config('pull_test.receipt_other',other_owner::text,true);
 perform set_config('pull_test.receipt_connection',connection::text,true);
 if to_regprocedure('public.finish_pull_delivery(uuid,text,text)') is not null or to_regprocedure('public.reserve_pull_delivery(uuid,text,text,text,bigint,text)') is not null then raise exception 'Legacy browser-callable delivery function still installed';end if;
 if has_table_privilege('authenticated','pull_private.delivery_receipt_capability','SELECT') or has_table_privilege('authenticated','pull_private.delivery_receipt_capability','INSERT') or has_function_privilege('authenticated','pull_private.require_delivery_capability(text)','EXECUTE') then raise exception 'Server capability accessible to browser';end if;
 if has_function_privilege('anon','public.finish_pull_delivery(uuid,text,text,text)','EXECUTE') or has_function_privilege('anon','public.reserve_pull_delivery(uuid,text,text,text,bigint,text,text)','EXECUTE') then raise exception 'Anonymous capability RPC grant';end if;
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('pull_test.receipt_owner'),true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $$
declare connection uuid:=current_setting('pull_test.receipt_connection')::uuid; reserved jsonb; job uuid; capability text:=repeat('e',64); result jsonb;
begin
 begin
  perform public.reserve_pull_delivery(connection,repeat('a',64),'recipient@example.invalid','p',1,'Recipient requested this QA reply.',null);
  raise exception 'Missing server capability accepted' using errcode='XX000';exception when sqlstate '42501' then null;
 end;
 begin
  perform public.reserve_pull_delivery(connection,repeat('a',64),'recipient@example.invalid','p',1,'Recipient requested this QA reply.',repeat('d',64));
  raise exception 'Invented capability accepted' using errcode='XX000';exception when sqlstate '42501' then null;
 end;
 reserved:=public.reserve_pull_delivery(connection,repeat('a',64),'recipient@example.invalid','p',1,'Recipient requested this QA reply.',capability);job:=(reserved->>'id')::uuid;
 if reserved->>'claimed'<>'true' then raise exception 'Server reservation failed';end if;
 begin perform public.finish_pull_delivery(job,'submitted','forged',null);raise exception 'Owner forged receipt without capability' using errcode='XX000';exception when sqlstate '42501' then null;end;
 begin perform public.finish_pull_delivery(job,'submitted','forged',repeat('d',64));raise exception 'Owner forged receipt with wrong capability' using errcode='XX000';exception when sqlstate '42501' then null;end;
 if not exists(select 1 from public.pull_delivery_jobs where id=job and status='sending' and provider_receipt is null) then raise exception 'Denied attempt changed receipt';end if;
 perform set_config('request.jwt.claim.sub',current_setting('pull_test.receipt_other'),true);
 begin perform public.finish_pull_delivery(job,'submitted','cross-owner',capability);raise exception 'Capability bypassed ownership' using errcode='XX000';exception when sqlstate '42501' then null;end;
 perform set_config('request.jwt.claim.sub',current_setting('pull_test.receipt_owner'),true);
 begin perform public.finish_pull_delivery(job,'submitted','',capability);raise exception 'Empty submitted receipt accepted' using errcode='XX000';exception when sqlstate '22023' then null;end;
 result:=public.finish_pull_delivery(job,'submitted','qa-provider-receipt',capability);
 if result->>'status'<>'submitted' or result->>'receipt'<>'qa-provider-receipt' then raise exception 'Provider receipt was not saved';end if;
 if public.finish_pull_delivery(job,'failed','',capability)<>result then raise exception 'Final receipt changed on replay';end if;
 if public.reserve_pull_delivery(connection,repeat('a',64),'recipient@example.invalid','p',1,'Recipient requested this QA reply.',capability)->>'claimed'<>'false' then raise exception 'Receipt replay reserved a second send';end if;
 perform set_config('request.jwt.claims','{"is_anonymous":true}',true);
 begin perform public.finish_pull_delivery(job,'submitted','anonymous',capability);raise exception 'Anonymous owner accepted' using errcode='XX000';exception when sqlstate '42501' then null;end;
end;$$;
reset role;
select 'PASS: server-only receipt capability, missing/wrong proof rejection, owner isolation and immutable replay; all fixtures rolled back' as verification;
rollback;
