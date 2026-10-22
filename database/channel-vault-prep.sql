-- Add server-authorized channel storage before deploying the matching API.
-- Existing connections and delivery receipts remain intact.
begin;
alter table public.pull_channel_connections add column if not exists avatar_url text;
alter table public.pull_channel_connections drop constraint if exists pull_channel_connections_provider_check;
alter table public.pull_channel_connections add constraint pull_channel_connections_provider_check
 check(provider in ('gmail','x','linkedin'));
alter table public.pull_channel_connections drop constraint if exists pull_channel_connections_user_id_provider_key;
create unique index if not exists pull_channel_owner_provider_account
 on public.pull_channel_connections(user_id,provider,account_id);
alter table public.pull_channel_connections drop constraint if exists pull_channel_avatar_url_check;
alter table public.pull_channel_connections add constraint pull_channel_avatar_url_check
 check(avatar_url is null or (length(avatar_url)<=1200 and avatar_url like 'https://%'));

create or replace function public.put_pull_channel_connection(
 p_provider text,p_account text,p_label text,p_token_cipher text,p_expires_at timestamptz,p_avatar_url text,p_capability text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); row_id uuid;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
 perform pull_private.require_delivery_capability(p_capability);
 if p_provider not in ('gmail','x','linkedin') or length(coalesce(p_account,'')) not between 1 and 200
  or length(coalesce(p_label,'')) not between 1 and 254 or length(coalesce(p_token_cipher,'')) not between 30 and 40000
  or p_token_cipher !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  or p_expires_at is null or p_expires_at<=now()
  or (p_avatar_url is not null and (length(p_avatar_url)>1200 or p_avatar_url not like 'https://%'))
 then raise exception 'Invalid channel connection' using errcode='22023';end if;
 insert into public.pull_channel_connections(user_id,provider,account_id,label,token_cipher,expires_at,avatar_url,revoked_at)
 values(owner,p_provider,p_account,p_label,p_token_cipher,p_expires_at,p_avatar_url,null)
 on conflict (user_id,provider,account_id) do update set label=excluded.label,token_cipher=excluded.token_cipher,
 expires_at=excluded.expires_at,avatar_url=excluded.avatar_url,revoked_at=null
 returning id into row_id;
 return jsonb_build_object('id',row_id);
end;$$;
revoke all on function public.put_pull_channel_connection(text,text,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.put_pull_channel_connection(text,text,text,text,timestamptz,text,text) to authenticated;

create or replace function public.read_pull_channel_secret(p_connection uuid,p_provider text,p_capability text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); c public.pull_channel_connections%rowtype;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
 perform pull_private.require_delivery_capability(p_capability);
 select * into c from public.pull_channel_connections where id=p_connection and user_id=owner and provider=p_provider and revoked_at is null;
 if not found then return null;end if;
 return jsonb_build_object('id',c.id,'provider',c.provider,'account_id',c.account_id,'label',c.label,'token_cipher',c.token_cipher,'revoked_at',c.revoked_at);
end;$$;
revoke all on function public.read_pull_channel_secret(uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_pull_channel_secret(uuid,text,text) to authenticated;

create or replace function public.refresh_pull_channel_secret(p_connection uuid,p_provider text,p_old_cipher text,p_token_cipher text,p_expires_at timestamptz,p_capability text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); row_id uuid;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
 perform pull_private.require_delivery_capability(p_capability);
 if length(coalesce(p_token_cipher,'')) not between 30 and 40000 or p_token_cipher !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  or p_expires_at is null or p_expires_at<=now() then raise exception 'Invalid channel refresh' using errcode='22023';end if;
 update public.pull_channel_connections set token_cipher=p_token_cipher,expires_at=p_expires_at
 where id=p_connection and user_id=owner and provider=p_provider and revoked_at is null and token_cipher=p_old_cipher returning id into row_id;
 return jsonb_build_object('updated',row_id is not null);
end;$$;
revoke all on function public.refresh_pull_channel_secret(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.refresh_pull_channel_secret(uuid,text,text,text,timestamptz,text) to authenticated;

create or replace function public.revoke_pull_channel_connection(p_connection uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); row_id uuid;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501';end if;
 update public.pull_channel_connections set token_cipher='',revoked_at=now(),avatar_url=null
 where id=p_connection and user_id=owner and provider=p_provider and revoked_at is null returning id into row_id;
 return jsonb_build_object('revoked',row_id is not null);
end;$$;
revoke all on function public.revoke_pull_channel_connection(uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_pull_channel_connection(uuid,text) to authenticated;
commit;
