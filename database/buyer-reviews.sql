-- Candidate V2-only preparation. Requires offer-versions.sql and research-runs.sql.
begin;
create table if not exists public.pull_buyer_reviews(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid not null references public.pull_research_runs(id) on delete cascade,
 source_id text not null,
 offer_id uuid not null,
 offer_version integer not null,
 revision integer not null check(revision between 1 and 100),
 request_key uuid not null,
 candidate jsonb not null,
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 answers jsonb not null,
 note text not null check(length(note)<=1000),
 basis text not null default 'seller_reported' check(basis='seller_reported'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,offer_id,offer_version) references public.pull_offer_versions(user_id,offer_id,version) on delete cascade,
 unique(user_id,request_key),
 unique(user_id,run_id,source_id,revision)
);
create table if not exists public.pull_buyer_outcomes(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 review_id uuid not null references public.pull_buyer_reviews(id) on delete cascade,
 run_id uuid not null references public.pull_research_runs(id) on delete cascade,
 source_id text not null,
 request_key uuid not null,
 kind text not null check(kind in ('contacted','replied','not_interested','sale','correction')),
 note text not null check(length(btrim(note)) between 10 and 1000),
 supersedes_id uuid references public.pull_buyer_outcomes(id) on delete cascade,
 basis text not null default 'seller_reported' check(basis='seller_reported'),
 reported_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_key)
);
alter table public.pull_buyer_reviews enable row level security;
alter table public.pull_buyer_outcomes enable row level security;
revoke all on public.pull_buyer_reviews,public.pull_buyer_outcomes from public,anon,authenticated;
grant select on public.pull_buyer_reviews,public.pull_buyer_outcomes to authenticated;
drop policy if exists buyer_review_owner_read on public.pull_buyer_reviews;
create policy buyer_review_owner_read on public.pull_buyer_reviews for select to authenticated using(
 (select auth.uid())=user_id and coalesce((select auth.jwt())->>'is_anonymous','false')<>'true'
 and exists(select 1 from public.pull_research_runs r where r.id=run_id and r.retain_until>clock_timestamp()));
drop policy if exists buyer_outcome_owner_read on public.pull_buyer_outcomes;
create policy buyer_outcome_owner_read on public.pull_buyer_outcomes for select to authenticated using(
 (select auth.uid())=user_id and coalesce((select auth.jwt())->>'is_anonymous','false')<>'true'
 and exists(select 1 from public.pull_buyer_reviews r where r.id=review_id));
create index if not exists buyer_review_recent on public.pull_buyer_reviews(user_id,run_id,source_id,revision desc);
create index if not exists buyer_review_daily on public.pull_buyer_reviews(user_id,created_at);
create index if not exists buyer_outcome_recent on public.pull_buyer_outcomes(user_id,run_id,source_id,reported_at desc);
create index if not exists buyer_outcome_daily on public.pull_buyer_outcomes(user_id,reported_at);

create or replace function pull_private.buyer_review_context(p_run uuid,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); run public.pull_research_runs%rowtype; candidate jsonb; offer uuid; version integer; latest integer;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner required' using errcode='42501';end if;
 if p_source is null or p_source !~ '^buyer-source-[a-f0-9]{20}$' then raise exception 'Invalid source' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offer:'||owner::text,0));
 select * into run from public.pull_research_runs where id=p_run and user_id=owner and status='complete' and retain_until>clock_timestamp();
 if not found then raise exception 'Saved research unavailable' using errcode='42501';end if;
 select item into candidate from jsonb_array_elements(run.snapshot->'result'->'opportunities') item where item->>'id'=p_source;
 if candidate is null then raise exception 'Source not found in research' using errcode='42501';end if;
 offer:=(run.snapshot->'result'->'offerReference'->>'id')::uuid;
 version:=(run.snapshot->'result'->'offerReference'->>'version')::integer;
 select max(v.version) into latest from public.pull_offer_versions v where v.user_id=owner and v.offer_id=offer;
 if latest is null or version is null then raise exception 'Offer unavailable' using errcode='42501';end if;
 if latest<>version then raise exception 'Offer changed; research its latest version' using errcode='40001';end if;
 return jsonb_build_object('candidate',candidate,'offer_id',offer,'offer_version',version);
end;$$;

create or replace function pull_private.save_buyer_review(p_run uuid,p_source text,p_expected_revision integer,p_request_key uuid,p_answers jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); context jsonb; latest integer; previous public.pull_buyer_reviews%rowtype; result public.pull_buyer_reviews%rowtype; pair record;
begin
 context:=pull_private.buyer_review_context(p_run,p_source);
 if p_request_key is null or p_expected_revision is null or p_expected_revision not between 0 and 99
 or p_answers is null or jsonb_typeof(p_answers)<>'object' or p_note is null or length(p_note)>1000 then raise exception 'Invalid review' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(p_answers))<>7 or coalesce(p_answers->>'actorRole','') not in ('buyer','seller','intermediary','unknown') then raise exception 'Invalid review answers' using errcode='22023';end if;
 for pair in select key,value from jsonb_each_text(p_answers) loop
  if pair.key='actorRole' then continue;end if;
  if pair.key not in ('requestActive','productFit','locationFit','termsFit','contactAllowed','reachable') or pair.value is null or pair.value not in ('yes','no','unknown') then raise exception 'Invalid review answer' using errcode='22023';end if;
 end loop;
 if (p_answers->>'actorRole'='buyer' or exists(select 1 from jsonb_each_text(p_answers) where value='yes')) and length(btrim(p_note))<20 then raise exception 'Record what was checked' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('buyer-review:'||owner::text,0));
 select * into previous from public.pull_buyer_reviews where user_id=owner and request_key=p_request_key;
 if found then
  if previous.run_id=p_run and previous.source_id=p_source and previous.answers=p_answers and previous.note=btrim(p_note) and previous.revision=p_expected_revision+1 then return to_jsonb(previous);end if;
  raise exception 'Request key reused for a different review' using errcode='40001';
 end if;
 select coalesce(max(revision),0) into latest from public.pull_buyer_reviews where user_id=owner and run_id=p_run and source_id=p_source;
 if latest<>p_expected_revision then raise exception 'Review changed' using errcode='40001';end if;
 if (select count(*) from public.pull_buyer_reviews where user_id=owner and created_at>clock_timestamp()-interval '24 hours')>=200 then raise exception 'Daily review limit';end if;
 insert into public.pull_buyer_reviews(user_id,run_id,source_id,offer_id,offer_version,revision,request_key,candidate,source_fingerprint,answers,note)
 values(owner,p_run,p_source,(context->>'offer_id')::uuid,(context->>'offer_version')::integer,latest+1,p_request_key,context->'candidate',
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((context->'candidate')::text,'UTF8')),'hex'),p_answers,btrim(p_note)) returning * into result;
 return to_jsonb(result);
end;$$;

create or replace function pull_private.record_buyer_outcome(p_review uuid,p_request_key uuid,p_kind text,p_note text,p_supersedes uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); review public.pull_buyer_reviews%rowtype; previous public.pull_buyer_outcomes%rowtype; result public.pull_buyer_outcomes%rowtype; latest integer;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner required' using errcode='42501';end if;
 select * into review from public.pull_buyer_reviews where id=p_review and user_id=owner;
 if not found then raise exception 'Review unavailable' using errcode='42501';end if;
 perform pull_private.buyer_review_context(review.run_id,review.source_id);
 if p_request_key is null or p_kind is null or p_kind not in ('contacted','replied','not_interested','sale','correction') or p_note is null or length(btrim(p_note)) not between 10 and 1000
 or (p_kind='correction')<>(p_supersedes is not null) then raise exception 'Invalid reported outcome' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('buyer-review:'||owner::text,0));
 select * into previous from public.pull_buyer_outcomes where user_id=owner and request_key=p_request_key;
 if found then
  if previous.review_id=p_review and previous.kind=p_kind and previous.note=btrim(p_note) and previous.supersedes_id is not distinct from p_supersedes then return to_jsonb(previous);end if;
  raise exception 'Request key reused for another outcome' using errcode='40001';
 end if;
 select max(revision) into latest from public.pull_buyer_reviews where user_id=owner and run_id=review.run_id and source_id=review.source_id;
 if latest<>review.revision then raise exception 'Review changed' using errcode='40001';end if;
 if p_supersedes is not null and not exists(select 1 from public.pull_buyer_outcomes o join public.pull_buyer_reviews r on r.id=o.review_id where o.id=p_supersedes and o.user_id=owner and r.run_id=review.run_id and r.source_id=review.source_id) then raise exception 'Outcome unavailable' using errcode='42501';end if;
 if (select count(*) from public.pull_buyer_outcomes where user_id=owner and reported_at>clock_timestamp()-interval '24 hours')>=500 then raise exception 'Daily outcome limit';end if;
 insert into public.pull_buyer_outcomes(user_id,review_id,run_id,source_id,request_key,kind,note,supersedes_id) values(owner,p_review,review.run_id,review.source_id,p_request_key,p_kind,btrim(p_note),p_supersedes) returning * into result;
 return to_jsonb(result);
end;$$;
revoke all on function pull_private.buyer_review_context(uuid,text),pull_private.save_buyer_review(uuid,text,integer,uuid,jsonb,text),pull_private.record_buyer_outcome(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function pull_private.save_buyer_review(uuid,text,integer,uuid,jsonb,text),pull_private.record_buyer_outcome(uuid,uuid,text,text,uuid) to authenticated;
create or replace function public.save_pull_buyer_review(p_run uuid,p_source text,p_expected_revision integer,p_request_key uuid,p_answers jsonb,p_note text)
returns jsonb language sql security invoker set search_path='' as $$select pull_private.save_buyer_review(p_run,p_source,p_expected_revision,p_request_key,p_answers,p_note);$$;
create or replace function public.record_pull_buyer_outcome(p_review uuid,p_request_key uuid,p_kind text,p_note text,p_supersedes uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select pull_private.record_buyer_outcome(p_review,p_request_key,p_kind,p_note,p_supersedes);$$;
revoke all on function public.save_pull_buyer_review(uuid,text,integer,uuid,jsonb,text),public.record_pull_buyer_outcome(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_pull_buyer_review(uuid,text,integer,uuid,jsonb,text),public.record_pull_buyer_outcome(uuid,uuid,text,text,uuid) to authenticated;
commit;
