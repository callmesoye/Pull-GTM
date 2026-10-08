# Pull GTM release status

Updated 8 October 2026.

## Source and interface

The refined light interface includes grouped Today / Buyers / Engage / AI navigation, broad workspace search, secondary shortlist and conversation tabs, expandable audience controls, private cloud saves and scoped agent access. Sixty-three local tests pass. Build checks run before publication.

GitHub repository: https://github.com/callmesoye/Pull-GTM. The complete source release is committed on main at c07e37e43e2044ad14728d1f23ec45f8a3cb53cb. Repository metadata confirms private visibility. No service credentials or customer data are committed.

## Hosting

Existing production URL: https://pull-gtm.vercel.app. It was visibly serving an older interface in Opera GX. Vercel project pull-gtm is in exclamation-studio, ID prj_yuXViw3hMBiA0Iljfot5Y6y6eJBT. Its Git settings showed no connected repository. Vercel currently lists the exclamationstudios-art GitHub namespace, while Pull-GTM belongs to callmesoye; connecting the intended repository requires that namespace access. The Vercel connector returned a scope authorization error, so the signed-in dashboard is the publishing fallback. A new production deployment is not yet verified.

## Backend

Dedicated Supabase project cyakphnpljeesotbjerz in exclamation studio is active. Scoped token tables, authenticated AI quotas and service-only agent RPCs are applied. The pull-mcp Edge Function is ACTIVE, version 1, with custom token authentication. No sending or prospect discovery provider is connected.

Remote transaction-only assertions passed for account isolation, anonymous rejection, hidden token hashes, helper/RPC access, token expiry, revocation, active-token limits, user/project AI quotas, unsent drafts and stale-revision protection. All fixtures and usage-counter changes were rolled back. A real external MCP client request and production browser save/restore remain unverified.

Security advisors report an informational notice for the private quota table's intentionally denying RLS policy state, plus leaked-password protection being disabled. Supabase documents that leaked-password protection requires Pro or above; this project remains on the owner-approved free plan. No paid upgrade was made. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

The local login route reached real Supabase and rejected nonexistent credentials correctly. Successful end-user sign-in, cloud save and restore across the production UI still require verification. Supabase email confirmation remains enabled; configure a production sender before broad registration.

AI mode makes actual gateway calls only when configured; it returns honest setup or provider errors otherwise. No live model response is claimed in this release note.

The Vercel repository connection is awaiting approval for access to callmesoye/Pull-GTM only. Automatic approval review rejected opening the connection because the new access scope was unconfirmed. The existing live URL still serves the prior interface until that connection and a successful deployment are verified.
