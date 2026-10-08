-- Read-only deployment checks. Results must show RLS enabled and no anonymous access.
select relname, relrowsecurity,
       has_table_privilege('anon', 'public.pull_workspaces', 'select') as anonymous_read,
       has_table_privilege('anon', 'public.pull_workspaces', 'insert') as anonymous_insert,
       has_table_privilege('authenticated', 'public.pull_workspaces', 'delete') as account_delete,
       (select json_agg(p) from (
         select policyname, cmd, roles, qual, with_check from pg_policies
         where schemaname='public' and tablename='pull_workspaces'
       ) p) as owner_policies
from pg_class where oid = 'public.pull_workspaces'::regclass;
