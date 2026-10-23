# Pull GTM V2 — Codex continuation

Handoff date: 23 October 2026. Latest engineering audit: `docs/PULL-V2-QUALITY-AUDIT.md`; workflow checkpoint: `docs/PULL-V2-BUYER-REVIEW-STATUS.md`; previous offer/page layer: `docs/PULL-V2-OFFER-FLOW-STATUS.md`. Repository: `callmesoye/Pull-GTM`. Branch: `v2/product-led-intelligence`. Open this branch in Codex and read this file first. Do not assume the original ChatGPT filesystem path exists on the Mac or in Codex cloud.

## Preserve the working product

V2 is a separate development line. Do not merge it into `main`, deploy it to the V1 Vercel project, or apply its SQL to V1 Supabase. Read `docs/PULL-V2-ISOLATION.md`. The V2 build/runtime guards require a dedicated project, origin and database. Cloud infrastructure has not been provisioned by this handoff. Do not weaken the guards to make a deployment pass.

This GitHub handoff is a snapshot of the local development line based on `6285b2f2b94ecda79f8581c37b5e0271eb8d6786`; the latest functional local checkpoint was `bbf1ff1` before this handoff file. Snapshot and original local commit IDs may differ. Inspect actual HEAD and working tree before editing. Later changes on `main` must be reviewed and selectively integrated, not silently overwritten or assumed present.

## What the founder is building

Pull helps a seller find relevant buyers for a specific offer, including difficult local markets. Intake can eventually be a product photo, seller listing URL, website or description. Pull normalizes the offer, asks for essential confirmation, investigates multiple permitted sources, checks original evidence, qualifies real buyer responses, and gives the seller a useful next step. It has no ready buyer database. It should remain a calm, simple product, with everyday labels and sophisticated logic underneath. Do not turn it into a WhatsApp chatbot or a generic lead list generator.

## Implemented versus proposed

- Existing AI backend, authentication, research and platform policy boundaries remain the source of truth.
- Bounded buyer research: up to four hypotheses/eight source reservations, supported search providers, durable journal/recovery contracts and evidence tiers.
- Saved offer API, immutable version storage preparation, seller confirmation form and actual backend research binding. Optional bounded checks of approved original pages. See `docs/PULL-V2-OFFER-FLOW-STATUS.md` for enablement and limits.
- Original-page request/budget/year observations, persistent seller assessments, linked correction history and reported outcomes. These do not establish independently verified buyers.
- Permissioned CRM integration handoff contract in `server/integration-handoff.js`.
- Opportunity precision and offer-level buyer finding evaluation in `server/v2-evaluation.js`, using synthetic tests only. No real buyer finding rate has been measured.
- V2 isolation guard and SQL preparation. Preparation does not mean SQL is deployed.
- Not yet implemented end to end: private image intake/vision, semantic original-request/buyer verification, an opt-in buyer pool, lead campaign integration, and a production outcome-learning worker. Opening an original page is implemented but is not buyer verification.
- There is no evidence of either 70% or 98% live buyer finding performance. 98% is an aspiration; precision of cards is a different metric from offers receiving buyers or sales.

## Read in this order

1. `docs/PULL-V2-BUYER-FINDING-EXECUTION-PROMPT.md` — main detailed execution prompt, current research, metric definitions, engineering slices and acceptance criteria.
2. `docs/PULL-V2-CODEX-IMPLEMENTATION-BRIEF.md` — contracts and staged backend work.
3. `docs/PULL-V2-DEMAND-DISCOVERY-ENGINE.md` — product and route architecture.
4. `docs/RESEARCH-BACKEND-ARCHITECTURE.md` and `docs/PRODUCT-LED-BUYER-RESEARCH.md` — current journal, security and research plumbing.
5. `docs/PULL-V2-IMAGE-TO-BUYER-RESEARCH.md`, `docs/PULL-V2-BUYER-SYSTEMS.md`, `docs/PULL-V2-INTEGRATIONS-COMPANION.md` and `docs/JIJI-INTEGRATION.md` — supporting research and boundaries.

## Continue with implementation

First inspect applicable AGENTS.md, git status, actual source and tests. Run `npm ci --ignore-scripts` and `npm run quality` in a clean checkout. The latest local suite passed **495 tests**, syntax and whitespace checks. Source observation version 2 preserves block boundaries, abstains on ambiguous pages and leaves bare dollar currencies unresolved. That is local verification, not GitHub Actions or a live integration result.

Next extend the implemented saved offer → bounded search → original-page observations → persistent seller assessment/reporting flow with trusted buyer-response or partner-request evidence and independent pilot adjudication. Cars in Lagos/Abuja are one pilot; include service and wholesale fixtures so the abstraction is not car-only. Implement in small tested commits. Preserve identity validation, source rights, government/public-institution exclusions, owner isolation, journal reservations, cost caps and explicit send approvals. Do not lower qualification just to increase the count.

The subsequent slices are consented buyer request intake, seller-approved demand capture, qualification, outcome recording and controlled evaluation. Never fabricate a buyer, use directory presence as purchase intent, infer personal wealth from lifestyle, or count snippets as verified demand. Use seller-approved activation when public requests are scarce. Research, messages, ad spending and transactions have separate authority and evidence requirements.

Report changed files, actual behavior, test output, what is still missing, and the next concrete step. This task authorizes development and local tests, not live deployments, account changes, migrations, campaigns or outreach.
