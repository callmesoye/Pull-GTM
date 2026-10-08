# Pull GTM

A prospect workbench built around a reason for every prospect. A spacious light interface, clear search, grouped navigation and restrained periwinkle accents follow Pull's identity. The supplied branding boards and The Org screenshots inform identity and clarity; their claims and personal information are not copied.

## Working today

- Today, Buyers, Engage and AI mode, with shortlist/conversation tabs and Results/Connections utilities. Every existing workflow remains accessible.
- Company or personal workspace context, a business brief, and a searchable Pull guide.
- CSV import, duplicate detection, explicit exclusions, source dates, worldwide targeting, and inspectable qualification criteria.
- Reviewed shortlists, editable message templates, do-not-contact handling, backups, exports, and a local activity trail.
- Clearly labelled fictional examples. Unknown or conflicting information stays visible.
- A Vercel backend for email/password sign-in, private cloud saves, restore, session renewal, and protection against overwriting a newer save.
- AI conversations through Vercel AI Gateway, with bounded context, real provider responses and authenticated daily usage limits.
- Owner-issued agent tokens and a Supabase MCP endpoint for reading reviewed prospects and proposing drafts. Access expires, can be revoked, and never permits sending.

Authentication, cloud saves and AI require deployment configuration. Their interfaces report unavailable or provider errors honestly. Live discovery, web research, mailbox sending and reply synchronization are not connected. Imported data is assessed against explicit rules; a source link is not independent verification. Saving to the browser is optional and off by default. Cloud saves are explicit. AI does not change the workspace or send messages.

## Preview and checks

Use Node.js 22.9 or newer. There are no package dependencies; the backend uses the documented Supabase Auth and PostgREST APIs through the server.

```sh
npm run dev
```

Open http://127.0.0.1:4173 in Opera GX. Page routes use URL fragments. Account and workspace requests go to the included server routes. An optional local `.env` configures the backend during development.

```sh
npm test
npm run check
```

## GitHub and Vercel

Connect this repository to Vercel with the repository root selected. The committed `vercel.json` sets the framework to Other, checks JavaScript and 63 focused tests during the build, publishes `dist`, and includes the four functions under `api`. There are no service credentials in this source.

Provision a dedicated Pull GTM project in the selected Supabase organization. Apply `database/setup.sql` to that project and run `database/verify.sql`. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Vercel for production, preview, and development. Use an enabled publishable key, never a service-role or secret key. Redeploy after configuration. The application keeps access and refresh tokens in HttpOnly cookies and checks each user with Supabase before database access.

Apply `database/agents.sql` for scoped agent access and AI quotas. Deploy `supabase/functions/pull-mcp/index.ts` with its relative JavaScript files. The function authenticates owner-issued agent tokens itself; `verify_jwt=false` is intentional for this custom authentication, not anonymous access. Platform service credentials remain inside Supabase's server runtime. See the function README for setup and protocol details.

AI Gateway uses the deployment's `VERCEL_OIDC_TOKEN`, or an explicitly configured server-only `AI_GATEWAY_API_KEY`. `AI_GATEWAY_MODEL` optionally overrides the default model. A valid gateway account and credits are required; the app does not substitute fake responses when unavailable. Usage is limited to 20 requests per account/day and 200 project-wide/day.

Configure Supabase's Site URL for the production domain. Keep email confirmation enabled. Configure a production email sender before opening registration beyond the users supported by Supabase's default sender. After confirming their email, users return to the app and sign in. Confirmation tokens are not consumed by the frontend.

Before marking the backend live, verify sign-in, sign-out, a save and restore on another device, and isolation between two test accounts. Unit tests mock provider responses and do not prove a remote database's RLS configuration. Run Supabase's security advisors on the actual project after applying the schema.

Connect the GitHub repository to the Vercel project. Review future page changes on a branch deployment, then merge approved changes into the production branch. Verify the actual deployment status and URL before calling a release live.

Vercel's current configuration and Git integration documentation: [project configuration](https://vercel.com/docs/project-configuration), [GitHub deployments](https://vercel.com/docs/git/vercel-for-github).

## Our iteration loop

1. Upload the reference for one page and name the page.
2. Explain the parts to carry forward: layout, typography, interactions, illustration, or atmosphere.
3. Implement the reference as a functioning page using Pull's own identity and truthful states.
4. Review the full page in Opera on its Vercel preview.
5. Refine that page, then move to the next one.

Illustrator is not part of the requested workflow. References do not become instructions to copy claims, testimonials, customer logos, or unsupported results.

See [research and product decisions](docs/RESEARCH.md) for the evidence behind this version and the remaining live-service work. Deployment status and the verified source revision are recorded in [release status](docs/RELEASE.md).
