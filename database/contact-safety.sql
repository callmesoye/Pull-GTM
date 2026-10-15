-- Apply after setup.sql to the dedicated Pull project. No external sources are
-- queried. Existing owner RLS and grants remain in force. This migration makes
-- do-not-contact history monotonic even for older clients and workflow RPCs.
begin;

create schema if not exists pull_private;
-- Preserve authenticated USAGE required by the separately guarded AI quota RPC.
revoke all on schema pull_private from public, anon;
revoke create on schema pull_private from authenticated;

-- Conservative counterpart of dist/prospect-records.js. ASCII values have the
-- same whitespace/case normalization; Unicode/NFKC identities are handled by
-- the shared application validator and their existing ledger keys are retained.
create or replace function pull_private.contact_ascii(value text) returns text
language sql immutable strict set search_path = '' as $$
  select case when value collate pg_catalog."C" !~ '[^ -~[:space:]]'
    then pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(value,'[[:space:]]+',' ','g')) collate pg_catalog."C")
    else '' end;
$$;

create or replace function pull_private.contact_url(value text) returns text
language plpgsql immutable strict set search_path = '' as $$
declare
  parts text[];
  host text;
  port text;
  path text;
  query text;
  facebook_id text[];
begin
  -- Reject credentials, non-ASCII/escaped hosts, whitespace, path escapes and
  -- dot segments rather than deriving a key different from the browser URL API.
  parts := pg_catalog.regexp_match(pg_catalog.btrim(value),
    '^https://([a-z0-9.-]+)(:[0-9]{1,5})?(/[^?#[:space:]]*)?(\?[^#[:space:]]*)?(#[^[:space:]]*)?$','i');
  if parts is null then return ''; end if;
  host := pg_catalog.lower(pg_catalog.regexp_replace(parts[1],'^(www|m|mobile)\.','','i') collate pg_catalog."C");
  if host='twitter.com' then host:='x.com'; end if;
  if host='fb.com' then host:='facebook.com'; end if;
  port := coalesce(parts[2],'');
  if port<>'' then
    if pg_catalog.substring(port,2)::integer>65535 then return ''; end if;
    port := case when pg_catalog.substring(port,2)::integer=443 then ''
      else ':'||(pg_catalog.substring(port,2)::integer)::text end;
  end if;
  path := coalesce(parts[3],'');
  if host in ('linkedin.com','x.com','instagram.com','facebook.com') then path:=pg_catalog.lower(path collate pg_catalog."C"); end if;
  if path collate pg_catalog."C" !~ '^[/A-Za-z0-9._~!$&()*+,;=:@-]*$' or path ~ '(^|/)\.\.?(/|$)' then return ''; end if;
  path := pg_catalog.regexp_replace(path,'/+$','');
  query := coalesce(parts[4],'');
  if host='facebook.com' and path='/profile.php' then
    -- Numeric profile IDs are identity, unlike tracking query parameters.
    if (select count(*) from pg_catalog.unnest(pg_catalog.string_to_array(pg_catalog.substring(query,2),'&')) item
        where pg_catalog.split_part(item,'=',1)='id')<>1 then return ''; end if;
    facebook_id := pg_catalog.regexp_match(query,'[?&]id=([0-9]+)(&|$)');
    if facebook_id is null then return ''; end if;
    query := '?id='||facebook_id[1];
  else
    -- Generic paths can be case-sensitive and non-tracking query parameters can
    -- identify different people/listings. Skip these URLs instead of collapsing
    -- them; the application preserves and canonicalizes their identity query.
    if host not in ('linkedin.com','x.com','instagram.com','facebook.com') and query<>''
      and exists (select 1 from pg_catalog.unnest(pg_catalog.string_to_array(pg_catalog.substring(query,2),'&')) item
        where pg_catalog.split_part(item,'=',1) !~* '^(utm_.*|trk|trackingId|gclid|fbclid)$') then return ''; end if;
    query:='';
  end if;
  return 'https://'||host||port||path||query;
end;
$$;

create or replace function pull_private.contact_record_keys(prospect jsonb) returns text[]
language plpgsql immutable strict set search_path = '' as $$
declare
  keys text[] := '{}';
  field text;
  value text;
  person_name text;
  company_name text;
begin
  if pg_catalog.jsonb_typeof(prospect) is distinct from 'object' then return keys; end if;
  if pg_catalog.jsonb_typeof(prospect->'email')='string' then
    value:=pull_private.contact_ascii(prospect->>'email');
    if value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then keys:=pg_catalog.array_append(keys,'email:'||value); end if;
  end if;
  foreach field in array array['profile_url','linkedin_url','x_url','instagram_url','facebook_url','jiji_url'] loop
    if pg_catalog.jsonb_typeof(prospect->field)='string' then
      value:=pull_private.contact_url(prospect->>field);
      if value<>'' then keys:=pg_catalog.array_append(keys,'profile:'||value); end if;
    end if;
  end loop;
  person_name:=case when pg_catalog.jsonb_typeof(prospect->'name')='string' then pull_private.contact_ascii(prospect->>'name') else '' end;
  company_name:=case when pg_catalog.jsonb_typeof(prospect->'company')='string' then pull_private.contact_ascii(prospect->>'company') else '' end;
  if person_name<>'' and company_name<>'' then keys:=pg_catalog.array_append(keys,'entity:'||person_name||'|'||company_name); end if;
  if coalesce(prospect->>'name','') ~ '^[[:space:]]*$' and company_name<>'' then keys:=pg_catalog.array_append(keys,'entity:|'||company_name); end if;
  if coalesce(prospect->>'name','') ~ '^[[:space:]]*$' and pg_catalog.jsonb_typeof(prospect->'website_url')='string' then
    value:=pull_private.contact_url(prospect->>'website_url');
    if value<>'' then keys:=pg_catalog.array_append(keys,'business:'||value); end if;
  end if;
  -- Row IDs and source_url are deliberately never contact identities.
  return keys;
end;
$$;

create or replace function pull_private.contact_safety_payload(current_payload jsonb,previous_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  previous jsonb := coalesce(previous_payload,'{}'::jsonb);
  ledger jsonb;
  entry jsonb;
  keys text[];
  blocked text[];
begin
  if pg_catalog.jsonb_typeof(current_payload) is distinct from 'object'
     or pg_catalog.jsonb_typeof(current_payload->'prospects') is distinct from 'array'
     or pg_catalog.jsonb_typeof(current_payload->'shortlist') is distinct from 'array'
     or pg_catalog.jsonb_typeof(current_payload->'drafts') is distinct from 'object' then
    raise exception 'Invalid workspace contact state' using errcode='22023';
  end if;
  if pg_catalog.octet_length(current_payload::text)>3*1024*1024 then raise exception 'Workspace is too large' using errcode='54000'; end if;
  for ledger in select coalesce(previous->'suppressions','[]'::jsonb) union all select coalesce(current_payload->'suppressions','[]'::jsonb) loop
    if pg_catalog.jsonb_typeof(ledger) is distinct from 'array' then raise exception 'Invalid do-not-contact history' using errcode='22023'; end if;
    for entry in select value from pg_catalog.jsonb_array_elements(ledger) loop
      if pg_catalog.jsonb_typeof(entry) is distinct from 'string'
         or pg_catalog.char_length(entry#>>'{}') not between 1 and 1024
         or (entry#>>'{}') !~ '^(email|profile|entity|business):'
         or (entry#>>'{}') ~ '[[:cntrl:]]' then
        raise exception 'Invalid do-not-contact history' using errcode='22023';
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_catalog.jsonb_array_elements(current_payload->'prospects') prospect
    where pg_catalog.jsonb_typeof(prospect) is distinct from 'object') then
    raise exception 'Invalid workspace prospect' using errcode='22023';
  end if;
  -- Preserve old keys and derive identities from both old and new explicit
  -- suppressions before replacing any prospect list. There is no clear action.
  with all_keys as (
    select value#>>'{}' as key from pg_catalog.jsonb_array_elements(coalesce(previous->'suppressions','[]'::jsonb))
    union all select value#>>'{}' from pg_catalog.jsonb_array_elements(coalesce(current_payload->'suppressions','[]'::jsonb))
    union all select key from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(previous->'prospects')='array' then previous->'prospects' else '[]'::jsonb end) prospect
      cross join lateral pg_catalog.unnest(pull_private.contact_record_keys(prospect)) key where prospect->'suppressed'='true'::jsonb and coalesce(prospect->>'suppression_origin','')<>'matched'
    union all select key from pg_catalog.jsonb_array_elements(current_payload->'prospects') prospect
      cross join lateral pg_catalog.unnest(pull_private.contact_record_keys(prospect)) key where prospect->'suppressed'='true'::jsonb and coalesce(prospect->>'suppression_origin','')<>'matched'
  ) select coalesce(pg_catalog.array_agg(distinct key order by key),'{}'::text[]) into keys from all_keys;
  if pg_catalog.cardinality(keys)>10000 then raise exception 'Do-not-contact history is full' using errcode='54000'; end if;
  if exists (select 1 from pg_catalog.unnest(keys) key where pg_catalog.char_length(key)>1024 or key ~ '[[:cntrl:]]') then
    raise exception 'Invalid do-not-contact history' using errcode='22023';
  end if;
  current_payload:=pg_catalog.jsonb_set(current_payload,'{suppressions}',pg_catalog.to_jsonb(keys),true);
  -- A shared inbox can match a different named person. Preserve that exclusion
  -- without promoting all of the other person's identifiers into the ledger.
  select coalesce(pg_catalog.jsonb_agg(case when prospect->'suppressed'='true'::jsonb and coalesce(prospect->>'suppression_origin','')<>'matched' then prospect
      when pull_private.contact_record_keys(prospect) && keys then pg_catalog.jsonb_set(pg_catalog.jsonb_set(prospect,'{suppressed}','true'::jsonb,true),'{suppression_origin}','"matched"'::jsonb,true)
      when prospect->>'suppression_origin'='matched' then pg_catalog.jsonb_set(prospect,'{suppressed}','false'::jsonb,true)
      else prospect end order by ordinal),'[]'::jsonb)
    into ledger from pg_catalog.jsonb_array_elements(current_payload->'prospects') with ordinality as records(prospect,ordinal);
  current_payload:=pg_catalog.jsonb_set(current_payload,'{prospects}',ledger,true);
  select coalesce(pg_catalog.array_agg(prospect->>'id'),'{}'::text[]) into blocked
    from pg_catalog.jsonb_array_elements(ledger) prospect where prospect->'suppressed'='true'::jsonb;
  select coalesce(pg_catalog.jsonb_agg(id order by ordinal),'[]'::jsonb) into ledger
    from pg_catalog.jsonb_array_elements(current_payload->'shortlist') with ordinality as shortlist(id,ordinal)
    where not (id#>>'{}'=any(blocked));
  current_payload:=pg_catalog.jsonb_set(current_payload,'{shortlist}',ledger,true);
  select coalesce(pg_catalog.jsonb_object_agg(id,case when id=any(blocked)
      then pg_catalog.jsonb_set(draft,'{ready}','false'::jsonb,true) else draft end),'{}'::jsonb)
    into ledger from pg_catalog.jsonb_each(current_payload->'drafts') as drafts(id,draft);
  current_payload:=pg_catalog.jsonb_set(current_payload,'{drafts}',ledger,true);
  if pg_catalog.octet_length(current_payload::text)>3*1024*1024 then raise exception 'Workspace is too large' using errcode='54000'; end if;
  return current_payload;
end;
$$;

create or replace function pull_private.preserve_contact_safety() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'Workspace ownership is immutable' using errcode='42501'; end if;
    new.payload:=pull_private.contact_safety_payload(new.payload,old.payload);
  else
    new.payload:=pull_private.contact_safety_payload(new.payload);
  end if;
  return new;
end;
$$;

revoke all on function pull_private.contact_ascii(text) from public, anon, authenticated;
revoke all on function pull_private.contact_url(text) from public, anon, authenticated;
revoke all on function pull_private.contact_record_keys(jsonb) from public, anon, authenticated;
revoke all on function pull_private.contact_safety_payload(jsonb,jsonb) from public, anon, authenticated;
revoke all on function pull_private.preserve_contact_safety() from public, anon, authenticated;
drop trigger if exists pull_workspace_contact_safety on public.pull_workspaces;
create trigger pull_workspace_contact_safety before insert or update on public.pull_workspaces
  for each row execute function pull_private.preserve_contact_safety();

-- Seed only rows whose normalized contact state actually differs. Reapplying
-- this migration leaves already-normalized rows and their revisions unchanged.
-- The transaction fails instead of dropping any record or ledger entry.
update public.pull_workspaces set payload=pull_private.contact_safety_payload(payload,payload),revision=revision+1,updated_at=pg_catalog.clock_timestamp()
where payload is distinct from pull_private.contact_safety_payload(payload,payload);
commit;
