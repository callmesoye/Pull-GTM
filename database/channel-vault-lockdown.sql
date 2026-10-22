-- Apply only after the server version using the channel RPCs is Ready.
begin;
revoke all on public.pull_channel_connections from public,anon,authenticated;
grant select(id,user_id,provider,account_id,label,avatar_url,expires_at,revoked_at,created_at)
 on public.pull_channel_connections to authenticated;
drop policy if exists "Own channel connections" on public.pull_channel_connections;
drop policy if exists "Read own channel connections" on public.pull_channel_connections;
create policy "Read own channel connections" on public.pull_channel_connections
 for select to authenticated using(user_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true');
commit;
