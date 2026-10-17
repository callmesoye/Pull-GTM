# Deploy the combined Pull release

Use the existing private [callmesoye/Pull-GTM repository](https://github.com/callmesoye/Pull-GTM), existing Vercel `pull-gtm` project, and Supabase project `your-project-ref`. These instructions are a release procedure, not confirmation that the combined source has been published.

## Application configuration

Vercel serves `dist` and the routes in `api`. The committed `vercel.json` runs syntax checks and the complete test suite. Select the repository root and a supported Node.js version, 22.9 or newer.

| Variable | Where / purpose |
| --- | --- |
| `SUPABASE_URL` | Vercel/local server: `https://your-project-ref.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel/local server: this project’s publishable or legacy anon key; service-role/secret keys are rejected |
| `PULL_APP_URL` | Google sign-in: exact app origin, e.g. `https://pull-gtm.vercel.app`; no path, query, or fragment |
| `GOOGLE_AUTH_ENABLED` | Set exactly `true` only after completing provider setup; otherwise Google is unavailable |
| `PULL_OAUTH_COOKIE_SECRET` | Google sign-in: private random value of at least 32 characters; stable across the deployment |
| `EXA_API_KEY` | Optional server-only Exa key. Preferred when present unless the provider is explicitly selected; adapter implemented, live connection and relevance unverified |
| `SERPER_API_KEY` | Optional server-only Serper key for source-page searches; selected after Exa when no explicit provider is set |
| `BRAVE_SEARCH_API_KEY` | Alternative server-only search key |
| `PULL_SEARCH_PROVIDER` | Optional `exa`, `serper`, or `brave`; never automatically falls back to another provider after a failure |
| `PULL_SEARCH_MAX_QUERIES` | Per-search provider request cap from 1 to 12; default 8, with a 45-second search time limit. This does not guarantee the requested prospect count |
| `PULL_SERPER_QUERY_MODE` | `plain` by default for the current free-only Serper setup. Optional `auto` tries source operators once and switches to plain queries if restricted. Source filters remain enforced on returned records |
| `AI_GATEWAY_API_KEY` | Optional server-only AI Gateway credential; otherwise the code uses Vercel’s injected `VERCEL_OIDC_TOKEN` |
| `PULL_HOSTED_AI_ENABLED` | Optional emergency off switch: set exactly `false` to disable model calls. Pull AI otherwise uses an available Gateway credential, subject to daily database budgets. |
| `AI_GATEWAY_MODEL` | Optional model override; current code default is `openai/gpt-5.4-mini` |
| `PORT` | Local preview only; defaults to `4173` |

Keep actual credentials in environment settings or an ignored local `.env`. Do not add a Supabase service-role key to the Vercel app. Gateway access requires an available model and credits; the UI reports configuration, quota, and provider failures.

## Existing Supabase project

Review which migrations are already applied. Apply missing updates in dependency order: `database/setup.sql`, `database/agents.sql`, `database/account-registry.sql`, `database/automations.sql`, `database/automation-destinations.sql`, `database/harden-automatic-rls.sql`, `database/agent-chat.sql`, then `database/search-budget.sql` and `database/contact-safety.sql`. The profile registry, automations and agent conversation tables are needed by the current screens. The contact-safety migration preserves do-not-contact history across replacement lists and direct workflow writes; it was applied to production on 15 October 2026 and its rollback-only verification passed. Respect the release authorization in [QUALITY-AND-RELEASE-GATES.md](QUALITY-AND-RELEASE-GATES.md). Review the complete SQL before applying it to the existing project.

Run the supplied `database/verify.sql`, `database/verify-agents.sql`, `database/verify-automations-rollback.sql`, and `database/verify-agent-chat-rollback.sql` as appropriate. The latter three use transaction fixtures and roll back. Record results from the actual project separately from local tests.

For Google sign-in, enable Google in Supabase Auth and configure its client credentials there. The Google provider redirects through `https://your-project-ref.supabase.co/auth/v1/callback`. Set the Supabase Site URL to the production origin and allow Pull’s return URL `https://pull-gtm.vercel.app/api/auth`. Each preview origin needs its own matching `PULL_APP_URL` and allowed return URL. For local testing use an allowed localhost origin and `/api/auth`. Email confirmation and production email delivery must also be configured for email registration.

The dedicated Google Cloud project created for login is `your-google-cloud-project` (display name Pull GTM, owner account `owner-account@example.invalid`). Billing was not linked. On 9 October 2026, the initial Google Cloud account-access block cleared. Consent setup is waiting for the owner's approval of Google's API Services User Data Policy; no OAuth client has been created yet. Supabase's exact return URL is allowlisted, and Vercel production has the app origin and a private login-state signing value prepared. Google remains disabled. Do not mark Google login ready until client creation, Supabase provider setup, Vercel configuration, and a complete live sign-in/sign-out test have succeeded.

## Search setup and cost

Search adapters support Exa, Serper, and Brave. Configure one server key and redeploy. Neither account creation nor a search-provider purchase is performed by the code. Keep keys out of browser code, GitHub, and search URLs. Candidate pages stay in memory; no search-result cache is stored. Search filters exclude government/public sources and pages without explicit private-sector wording. This conservative screen is not an ownership audit or evidence of buying intent; verify the entity and source before importing prospects.

The server claims one database budget unit immediately before each provider request: at most 100 provider requests per owner and 500 across the project per UTC day in the current source SQL. Verify the actual deployed counters and limits before release. Unused adaptive-search capacity is not reserved; failed provider attempts still count. Requests stop when the target, request cap, time limit, or daily budget is reached, and retrieved evidence survives a later failure. These counters limit requests rather than provider billing. The current free-only setup uses plain Serper queries and does not probe known restricted source operators. The code neither changes provider plans nor purchases credits.

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


### Optional Exa free-quota adapter

The Exa adapter calls only the [Search endpoint](https://exa.ai/docs/reference/search), using natural-language queries, `type: auto`, highlights, and a maximum of 20 results per request. Search has no pagination; Pull tries distinct queries within the existing request/time limits. An explicit source selection can supply a domain/path filter; all returned profiles still pass the original role, industry, personal-location, source, and private-sector checks. No Agent or contact-enrichment endpoint is used.

[Exa pricing](https://exa.ai/pricing), checked 18 October 2026, advertises $10 in monthly free credits and a $10 onboarding bonus without a payment method. This is a finite allowance, not unlimited free usage. Keep the account on its free plan for the current free-only scope. The adapter stops on credit errors, never purchases credits, and never switches to another provider on failure. Provider billing settings and available quota are controlled in the owner's account.

This is an implemented optional connection awaiting an owner-supplied `EXA_API_KEY`. No live Exa call or comparison benchmark has been run; neither superior relevance nor a requested prospect count is established.
