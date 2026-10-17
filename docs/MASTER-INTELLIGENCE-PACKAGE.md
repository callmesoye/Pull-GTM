# Pull GTM — development source of truth

Updated 18 October 2026. Repository: callmesoye/Pull-GTM. Supabase: your-project-ref.

## Product
Pull helps professionals and merchants define an audience, discover evidence-backed private-sector opportunities, qualify matches, prepare outreach, and execute supported actions with authorization. Professional GTM includes clients, business decision makers, and private-sector career opportunities. Commerce GTM includes merchants and realistic buyer-intent research. Public-sector sources and prospects are excluded. Mascots are out of scope.

## Current implementation and verification
- Google authentication: server-side PKCE, signed temporary cookie, verified Supabase identity, HttpOnly session cookies. Automated tests cover replay, expiry, CSRF and provider failures. Read-only production inspection on 18 October shows Google disabled and its client ID/secret empty in Supabase. Provider configuration and a real sign-in remain separate deployment checks.
- Email: registration, confirmation-required response, password sign-in, session refresh and logout are implemented. The local candidate adds resend, server-side confirmation and PKCE password recovery; see AUTH-EMAIL-SETUP.md. Confirmation email delivery depends on Supabase configuration. No claim of live verification follows from a passing unit test.
- Account arrival: minimal pending-email or signed-in confirmation; reduced-motion-aware Pull animation; check for saved cloud work before onboarding.
- Onboarding: Professional or Commerce selection, business/career purpose, brief and audience setup. Keeps prospects, drafts and existing evidence requirements. Creating the workspace attempts a private cloud save; failed saves keep local work and show an unsaved state.
- Pull AI: direct hosted chat and optional own-agent relay; bounded workspace context. Production /api/ai currently reports configured:false; Vercel shows $5 monthly free Gateway credit but the project has no Gateway credential configured. The local candidate adds typed source discovery, saved-workspace review, and workflow listing to hosted chat. Research is opt-out and uses source budgets. Adding results and running workflows remain explicit user actions. No chat sending or command execution is enabled.
- Execution: owner-approved workflow preparation and consent-gated delivery adapters. Receipt integrity migration `20261017231200_harden_delivery_receipt_capability` applied to production on 18 October 2026. The live transaction rollback check passed for missing/wrong server capability rejection, ownership and immutable receipt replay. Legacy browser-only RPC signatures are removed. There were no active connections or sending jobs; post-checks show no connection/delivery rows or QA users retained. Capability provisioning remains empty, so delivery fails closed. A researched source or implemented adapter is not a verified live connection.

## Outstanding release gates
1. Verify Google and email confirmation on production with the intended account and callback URLs.
2. Verify the production hosted model can return a real answer; check quota and provider errors.
3. Complete OAuth 2.1 authorization for simplified remote MCP; current private bearer configuration is not OAuth 2.1.
4. Deploy and verify the typed research/review/workflow tools with real provider responses. Expand approved execution separately; current tools do not execute or send.
5. Verify each social provider separately after developer credentials, permissions and review are available.
6. Measure relevance, duplicate rate, source freshness, requested-count shortfalls and delivery outcomes. Never fill count shortages with fabricated leads. Current free Serper plan rejects source-restricted queries and has not demonstrated 30 qualified matches. The optional Exa adapter needs a free key and has not been live-benchmarked. See RELEVANCE-BASELINE.md.
7. Before activating native delivery, provision only the derived receipt capability digest and verify a controlled provider submission with the matching API. The production receipt migration and rollback checks passed on 18 October; no provider account is connected and no delivery capability was provisioned during verification.

## Change control
Use isolated branches, preserve working data, test changed flows, and record live verification separately from local tests. Provider costs, platform permissions and unavailable evidence must be visible rather than disguised as successful results.

## Receipt security advisor review — 18 October 2026
The production security advisor reports informational policy-free RLS on the intentionally private capability/quota/ticket tables, and warnings for authenticated SECURITY DEFINER workflow/delivery RPCs, `pg_net` in public, and disabled leaked-password protection. Delivery RPCs intentionally require both owner authentication and the server capability; the rollback check verified this guard. These findings are recorded, not presented as a clean advisor result. Remediation references: [RPC execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [extension schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
