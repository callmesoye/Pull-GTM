# Deploy the combined Pull release

Use the existing private [callmesoye/Pull-GTM repository](https://github.com/callmesoye/Pull-GTM), existing Vercel `pull-gtm` project, and Supabase project `cyakphnpljeesotbjerz`. These instructions are a release procedure, not confirmation that the combined source has been published.

## Application configuration

Vercel serves `dist` and the routes in `api`. The committed `vercel.json` runs syntax checks and the complete test suite. Select the repository root and a supported Node.js version, 22.9 or newer.

| Variable | Where / purpose |
| --- | --- |
| `SUPABASE_URL` | Vercel/local server: `https://cyakphnpljeesotbjerz.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel/local server: this project’s publishable or legacy anon key; service-role/secret keys are rejected |
| `PULL_APP_URL` | Google sign-in: exact app origin, e.g. `https://pull-gtm.vercel.app`; no path, query, or fragment |
| `GOOGLE_AUTH_ENABLED` | Set exactly `true` only after completing provider setup; otherwise Google is unavailable |
| `PULL_OAUTH_COOKIE_SECRET` | Google sign-in: private random value of at least 32 characters; stable across the deployment |
| `SERPER_API_KEY` | Optional server-only Serper key for source-page searches; preferred when present |
| `BRAVE_SEARCH_API_KEY` | Alternative server-only search key |
| `PULL_SEARCH_PROVIDER` | Optional `serper` or `brave`; never automatically falls back to a second paid provider after a failure |
| `PULL_SEARCH_MAX_QUERIES` | Per-search provider request cap from 1 to 3; default 2. This is not a daily or account-wide spend limit |
| `AI_GATEWAY_API_KEY` | Optional server-only AI Gateway credential; otherwise the code uses Vercel’s injected `VERCEL_OIDC_TOKEN` |
| `PULL_HOSTED_AI_ENABLED` | `false` by default. Set exactly `true` only if Pull will fund hosted model calls; the user-agent relay works without it. |
| `AI_GATEWAY_MODEL` | Optional model override; current code default is `openai/gpt-5.4-mini` |
| `PORT` | Local preview only; defaults to `4173` |

Keep actual credentials in environment settings or an ignored local `.env`. Do not add a Supabase service-role key to the Vercel app. Gateway access requires an available model and credits; the UI reports configuration, quota, and provider failures.

## Existing Supabase project

Review which migrations are already applied. Apply missing updates in dependency order: `database/setup.sql`, `database/agents.sql`, `database/account-registry.sql`, `database/automations.sql`, `database/automation-destinations.sql`, `database/harden-automatic-rls.sql`, `database/agent-chat.sql`, then `database/search-budget.sql`. The profile registry, automations and agent conversation tables are needed by the current screens. Review the complete SQL before applying it to the existing project.

Run the supplied `database/verify.sql`, `database/verify-agents.sql`, `database/verify-automations-rollback.sql`, and `database/verify-agent-chat-rollback.sql` as appropriate. The latter three use transaction fixtures and roll back. Record results from the actual project separately from local tests.

For Google sign-in, enable Google in Supabase Auth and configure its client credentials there. The Google provider redirects through `https://cyakphnpljeesotbjerz.supabase.co/auth/v1/callback`. Set the Supabase Site URL to the production origin and allow Pull’s return URL `https://pull-gtm.vercel.app/api/auth`. Each preview origin needs its own matching `PULL_APP_URL` and allowed return URL. For local testing use an allowed localhost origin and `/api/auth`. Email confirmation and production email delivery must also be configured for email registration.

The dedicated Google Cloud project created for login is `booming-quasar-511111-p6` (display name Pull GTM, owner account `exclamationtech@gmail.com`). Billing was not linked. On 9 October 2026, Google blocked consent/client setup until the owner enables 2-Step Verification. Do not mark Google login ready until client creation, Supabase provider setup, Vercel configuration, and a complete live sign-in/sign-out test have succeeded.

## Search setup and cost

Search adapters support Serper and Brave. Configure one server key and redeploy. Neither account creation nor a search-provider purchase is performed by the code. Keep keys out of browser code, GitHub, and search URLs. Candidate pages stay in memory; no search-result cache is stored. Search filters exclude government/public sources and pages without explicit private-sector wording. This conservative screen is not an ownership audit or evidence of buying intent; verify the entity and source before importing prospects.

The database reserves the whole per-search request budget before any paid call: at most 20 provider requests per owner and 200 across the project per UTC day. Unused reservations and failed searches are not refunded, so billing cannot exceed the reserved request allowance. At the default two-request budget this permits up to ten searches per owner per day. These are initial trial limits, not paid-plan entitlements; change them deliberately before scaling. Requests fail closed if the budget function is missing. Actual charges can vary by provider depth and pricing rules.

Published rates checked on 9 October 2026:

| Provider | Published base rate | Conditions |
| --- | --- | --- |
| [Brave](https://brave.com/blog/most-powerful-search-api-for-ai/) | $5 / 1,000 requests | $5 monthly credit; account requirements apply |
| [Serper](https://serper.dev/) | $1 / 1,000 queries at starter | $50 prepaid pack, credits valid 6 months; 2,500 trial queries advertised. $0.50 / 1,000 requires the $1,250 pack |
| [DataForSEO](https://dataforseo.com/pricing/google-serp/google-organic-serp-api) | $0.60 / 1,000 ten-result SERPs, standard queue | About five minutes average; higher depths/operators increase cost. Live base rate $2 / 1,000. Not implemented in Pull |

Serper's entry unit price is five times cheaper than Brave's paid base rate. A tenfold reduction is not verified at starter pricing. A low-cost provider does not guarantee greater accuracy. Benchmark with the same private-sector tasks and score location/role fit, valid source links, duplicates, verified entity ownership, and cost per reviewed prospect before making accuracy claims. Never treat marketplace sellers as buyers or invent private-school teachers to fill a list.

Deploy `supabase/functions/pull-mcp/index.ts` with its adjacent JavaScript files and `verify_jwt=false`. The function authenticates each owner-issued bearer key itself. Its runtime uses injected `SUPABASE_SECRET_KEYS.default` or legacy `SUPABASE_SERVICE_ROLE_KEY`; those credentials stay inside Supabase.

The Edge Function allows the production app origin by default. Optional `PULL_MCP_ALLOWED_ORIGINS` is a comma-separated list of additional exact origins, configured in the Edge environment. Native clients can omit Origin. Keep the Edge eligibility engine synchronized with `dist/engine.js`; the tests check this.

## Publish and record evidence

1. Run `npm test` and `npm run check` from the consolidated repository. Review the diff and confirm no credentials or prospect data are included.
2. Connect the existing Vercel project to the single private repository with access scoped to that repository. Publish the reviewed source through the intended production branch or deployment flow.
3. Wait for an actual successful Vercel build. Open its deployment URL and the production address; verify the expected source revision rather than relying on an older live page.
4. Test email sign-in/sign-out, optional Google sign-in, profile editing, save/restore, and two-account isolation. Check a manual workflow and an enabled after-import workflow against saved data.
5. Create a conversation relay key in Connect your AI, run Test access, start a supported external agent with Pull's startup instruction, then ask a question inside Pull. Verify the agent claims it and its actual answer appears in Pull. A key by itself cannot start or poll an external agent. Verify revocation and expired access fail; check draft permission and revision conflict handling separately. AI Mode can plan workflows, but a saved workflow still requires the owner to run it.
6. Record the commit, deployment URL, database/function revision, checks performed, and any unavailable feature in [RELEASE.md](RELEASE.md).

A passing server access check establishes key acceptance and the returned tool list. It does not confirm that the user’s external client is connected.
