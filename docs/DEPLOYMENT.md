# Deploy the combined Pull release

Use the existing private [callmesoye/Pull-GTM repository](https://github.com/callmesoye/Pull-GTM), existing Vercel `pull-gtm` project, and Supabase project `cyakphnpljeesotbjerz`. These instructions are a release procedure, not confirmation that the combined source has been published.

## Application configuration

Vercel serves `dist` and the seven routes in `api`. The committed `vercel.json` runs syntax checks and the complete test suite. Select the repository root and a supported Node.js version, 22.9 or newer.

| Variable | Where / purpose |
| --- | --- |
| `SUPABASE_URL` | Vercel/local server: `https://cyakphnpljeesotbjerz.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel/local server: this project’s publishable or legacy anon key; service-role/secret keys are rejected |
| `PULL_APP_URL` | Google sign-in: exact app origin, e.g. `https://pull-gtm.vercel.app`; no path, query, or fragment |
| `GOOGLE_AUTH_ENABLED` | Set exactly `true` only after completing provider setup; otherwise Google is unavailable |
| `PULL_OAUTH_COOKIE_SECRET` | Google sign-in: private random value of at least 32 characters; stable across the deployment |
| `AI_GATEWAY_API_KEY` | Optional server-only AI Gateway credential; otherwise the code uses Vercel’s injected `VERCEL_OIDC_TOKEN` |
| `AI_GATEWAY_MODEL` | Optional model override; current code default is `openai/gpt-5.4-mini` |
| `PORT` | Local preview only; defaults to `4173` |

Keep actual credentials in environment settings or an ignored local `.env`. Do not add a Supabase service-role key to the Vercel app. Gateway access requires an available model and credits; the UI reports configuration, quota, and provider failures.

## Existing Supabase project

Review which migrations are already applied. Apply missing updates in dependency order: `database/setup.sql`, `database/agents.sql`, `database/account-registry.sql`, `database/automations.sql`, then `database/harden-automatic-rls.sql`. The profile registry and automations schema are needed by the newly merged screens. Review the complete SQL before applying it to the existing project.

Run the supplied `database/verify.sql`, `database/verify-agents.sql`, and `database/verify-automations-rollback.sql` as appropriate. The latter two use transaction fixtures and roll back. Record results from the actual project separately from local tests.

For Google sign-in, enable Google in Supabase Auth and configure its client credentials there. The Google provider redirects through `https://cyakphnpljeesotbjerz.supabase.co/auth/v1/callback`. Set the Supabase Site URL to the production origin and allow Pull’s return URL `https://pull-gtm.vercel.app/api/auth`. Each preview origin needs its own matching `PULL_APP_URL` and allowed return URL. For local testing use an allowed localhost origin and `/api/auth`. Email confirmation and production email delivery must also be configured for email registration.

Deploy `supabase/functions/pull-mcp/index.ts` with its adjacent JavaScript files and `verify_jwt=false`. The function authenticates each owner-issued bearer key itself. Its runtime uses injected `SUPABASE_SECRET_KEYS.default` or legacy `SUPABASE_SERVICE_ROLE_KEY`; those credentials stay inside Supabase.

The Edge Function allows the production app origin by default. Optional `PULL_MCP_ALLOWED_ORIGINS` is a comma-separated list of additional exact origins, configured in the Edge environment. Native clients can omit Origin. Keep the Edge eligibility engine synchronized with `dist/engine.js`; the tests check this.

## Publish and record evidence

1. Run `npm test` and `npm run check` from the consolidated repository. Review the diff and confirm no credentials or prospect data are included.
2. Connect the existing Vercel project to the single private repository with access scoped to that repository. Publish the reviewed source through the intended production branch or deployment flow.
3. Wait for an actual successful Vercel build. Open its deployment URL and the production address; verify the expected source revision rather than relying on an older live page.
4. Test email sign-in/sign-out, optional Google sign-in, profile editing, save/restore, and two-account isolation. Check a manual workflow and an enabled after-import workflow against saved data.
5. Test a real AI reply when configured. Create a read-only key in Connect your AI, run Test access, connect a supported external client, and read a saved workspace. Verify revocation and expired access fail; check draft permission and revision conflict handling separately.
6. Record the commit, deployment URL, database/function revision, checks performed, and any unavailable feature in [RELEASE.md](RELEASE.md).

A passing server access check establishes key acceptance and the returned tool list. It does not confirm that the user’s external client is connected.
