# Pull GTM release status

Updated 8 October 2026.

## Source and interface

The refined light interface includes grouped Today / Buyers / Engage / AI navigation, broad workspace search, secondary shortlist and conversation tabs, expandable audience controls, private cloud saves and scoped agent access. Sixty-three local tests pass. Build checks run before publication.

GitHub repository: https://github.com/callmesoye/Pull-GTM. Initial commit: 33530343f57520095281eecd6735da52bc8c71ba. The complete source release is being uploaded. The owner requests private access; GitHub account verification is needed to confirm the visibility change. No service credentials or customer data are committed.

## Hosting

Existing production URL: https://pull-gtm.vercel.app. It was visibly serving an older interface in Opera GX. Vercel project pull-gtm is in exclamation-studio, ID prj_yuXViw3hMBiA0Iljfot5Y6y6eJBT. Its Git settings showed no connected repository. Vercel currently lists the exclamationstudios-art GitHub namespace, while Pull-GTM belongs to callmesoye; connecting the intended repository requires that namespace access. The Vercel connector returned a scope authorization error, so the signed-in dashboard is the publishing fallback. A new production deployment is not yet verified.

## Backend

Dedicated Supabase project cyakphnpljeesotbjerz in exclamation studio is active. Workspace RLS and two-account isolation were verified with rollback-only SQL fixtures. Scoped token tables, authenticated AI quotas and service-only agent RPCs are now applied. MCP endpoint deployment and its live verification are in progress. No sending or prospect discovery provider is connected.

The local login route reached real Supabase and rejected nonexistent credentials correctly. Successful end-user sign-in, cloud save and restore across the production UI still require verification. Supabase email confirmation remains enabled; configure a production sender before broad registration.

AI mode makes actual gateway calls only when configured; it returns honest setup or provider errors otherwise. No live model response is claimed in this release note.
