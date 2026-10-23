# Pull V2 isolation

Pull V1 stays on `main` at `6285b2f2b94ecda79f8581c37b5e0271eb8d6786`. New buyer intelligence work is on `v2/product-led-intelligence` in the separate `pull-gtm-v2` worktree. Do not merge this branch into V1's `main` as part of a V2 deployment.

## Dedicated infrastructure

1. Create a **new Vercel project** for Pull V2 and point it at the V2 branch. Keep V1's Vercel project connected to `main`. A new Vercel project's first deployment can be production even if the source branch is not `main`; project separation is essential.
2. Enable Vercel system environment variables for the V2 project. Record that project's `VERCEL_PROJECT_ID` as `PULL_V2_PROJECT_ID` in its own environment. Give it a distinct production origin in `PULL_APP_URL`; configure OAuth callbacks for that origin.
3. Create a **new Supabase project** for V2. Set its URL, publishable key, and host in `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `PULL_V2_SUPABASE_HOST`. Set its auth configuration, secrets, storage, rate limits, search provider keys, and budgets independently. Do not copy V1's auth or production secrets.
4. Apply V2 SQL migrations, including `database/research-runs.sql`, **only** to the V2 database. Provision the research capability secret there per `docs/RESEARCH-BACKEND-ARCHITECTURE.md`. Leave `PULL_BUYER_RESEARCH_ENABLED` and `PULL_RESEARCH_DURABLE_ENABLED` false until the V2 pilot is ready.
5. Validate a V2 signup, research run, evidence display, rate limit, and recovery flow on the new project. Route only opted-in V2 testers there. Make a later, explicit cutover decision with rollback to V1.

`vercel.json` invokes `scripts/check-v2-deploy.mjs` at build time. It fails closed unless the project ID matches the V2 setting, the HTTPS Supabase host matches its V2 setting and differs from V1, and the app origin and production URL differ from V1. `server/config.js` applies the same check for Vercel API requests. The guard is a configuration safety net; a dedicated Vercel project and database remain required. Local development can run without deployment variables.

Use `CODEX_START_HERE.md` for the current branch handoff. These steps do not provision cloud projects, migrate data, or change V1's live deployment.
