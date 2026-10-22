-- Apply after channel-vault-prep.sql. Preserve the existing vault and access policies.
alter table public.pull_channel_connections drop constraint if exists pull_channel_connections_provider_check;
alter table public.pull_channel_connections add constraint pull_channel_connections_provider_check
  check (provider in ('gmail','x','linkedin','instagram','facebook'));

create or replace function public.put_pull_channel_connection(
  p_provider text,p_account text,p_label text,p_token_cipher text,p_expires_at timestamptz,
  p_avatar_url text,p_capability text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); row_id uuid;
begin
 if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Owner authentication required' using errcode='42501'; end if;
 perform pull_private.require_delivery_capability(p_capability);
 if p_provider not in ('gmail','x','linkedin','instagram','facebook') or length(coalesce(p_account,'')) not between 1 and 200
    or length(coalesce(p_label,'')) not between 1 and 254 or length(coalesce(p_token_cipher,'')) not between 30 and 40000
    or p_token_cipher !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
    or p_expires_at is null or p_expires_at<=now()
    or (p_avatar_url is not null and (length(p_avatar_url)>1200 or p_avatar_url not like 'https://%'))
    then raise exception 'Invalid channel connection' using errcode='22023'; end if;
 insert into public.pull_channel_connections(user_id,provider,account_id,label,token_cipher,expires_at,avatar_url,revoked_at)
 values(owner,p_provider,p_account,p_label,p_token_cipher,p_expires_at,p_avatar_url,null)
 on conflict(user_id,provider,account_id) do update set label=excluded.label,token_cipher=excluded.token_cipher,
 expires_at=excluded.expires_at,avatar_url=excluded.avatar_url,revoked_at=null
 returning id into row_id;
 return jsonb_build_object('id',row_id);
end $$;
revoke all on function public.put_pull_channel_connection(text,text,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.put_pull_channel_connection(text,text,text,text,timestamptz,text,text) to authenticated;
