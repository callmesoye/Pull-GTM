# Pull GTM V2 — Codex continuation

Handoff date: 24 October 2026. Latest implementation and research: `docs/PULL-V2-LIVE-DISCOVERY-2026-10-24.md`; scenario design: `docs/PULL-V2-530-SCENARIO-LAB.md`; buyer-request checkpoint: `docs/PULL-V2-BUYER-REQUEST-STATUS.md`; engineering audit: `docs/PULL-V2-QUALITY-AUDIT.md`. Repository: `callmesoye/Pull-GTM`. Branch: `v2/product-led-intelligence`. Open this branch in Codex and read this file first. Do not assume the original ChatGPT filesystem path exists on the Mac or in Codex cloud.

## Preserve the working product

V2 is a separate development line. Do not merge it into `main`, deploy it to the V1 Vercel project, or apply its SQL to V1 Supabase. Read `docs/PULL-V2-ISOLATION.md`. The V2 build/runtime guards require a dedicated project, origin and database. Cloud infrastructure has not been provisioned by this handoff. Do not weaken the guards to make a deployment pass.

This GitHub handoff is a snapshot of the local development line based on `6285b2f2b94ecda79f8581c37b5e0271eb8d6786`; the latest functional local checkpoint was `bbf1ff1` before this handoff file. Snapshot and original local commit IDs may differ. Inspect actual HEAD and working tree before editing. Later changes on `main` must be reviewed and selectively integrated, not silently overwritten or assumed present.

## What the founder is building

Pull helps a seller find relevant buyers for a specific offer, including difficult local markets. Intake can eventually be a product photo, seller listing URL, website or description. Pull normalizes the offer, asks for essential confirmation, investigates multiple permitted sources, checks original evidence, qualifies real buyer responses, and gives the seller a useful next step. It has no ready buyer database. It should remain a calm, simple product, with everyday labels and sophisticated logic underneath. Do not turn it into a WhatsApp chatbot or a generic lead list generator.

## Implemented versus proposed

- Existing AI backend, authentication, research and platform policy boundaries remain the source of truth.
- A 530-case research lab: 520 hypothetical seller cases across 52 sectors plus 10 adversarial specifications, 20 purchase mechanisms and 51 background/technical sources. Bounded case guidance now enters product-led AI planning. This is not a ready buyer database or independent accuracy benchmark.
- Actual external public-web research across all 520 cases: 656 attributed searches including 136 feedback-generated follow-ups, 2,794 deduplicated policy-admissible URLs and nine selected original-content checks. Captured material is assessed through PULL source policy/observation code. These are not 520 real sellers, a live production-provider benchmark or verified buyers. Outcome and independent relevance metrics remain unknown.
- Discovery feedback now carries buyer jobs, observed gaps and provenance through initial/refined model results; generic keyword and retail-copy filtering, within-tier ordering and reservation of an original-page check support downstream investigation. No extra model round or source cap was added.
- Explicit compatible quantity, minimum-order and unit-price subtotal checks in first-party request qualification. Unknown units, quote basis, delivered cost and full fit remain unknown. Optional minimum order requires the updated isolated V2 offer schema; no live migration has been applied.
- Separate offline 98% review aids for opportunity precision and offer-level buyer finding, requiring confidence bounds and registered independent evidence. No helper verifies its submitted evidence or authorizes deployment.
- Bounded buyer research: up to four hypotheses/eight source reservations, supported search providers, durable journal/recovery contracts and evidence tiers.
- Saved offer API, immutable version storage preparation, seller confirmation form and actual backend research binding. Optional bounded checks of approved original pages. See `docs/PULL-V2-OFFER-FLOW-STATUS.md` for enablement and limits.
- Original-page request/budget/year observations, persistent seller assessments, linked correction history and reported outcomes. These do not establish independently verified buyers.
- First-party buyer request intake, separate discovery/contact consent, immutable revisions, canonical withdrawal, category-bound saved-offer matching and a workspace outside chat. Defaults private; requires isolated V2 schema/flag setup. No populated buyer pool or independent buyer verification is claimed.
- Permissioned CRM integration handoff contract in `server/integration-handoff.js`.
- Opportunity precision and offer-level buyer finding evaluation in `server/v2-evaluation.js`, using synthetic tests only. No real buyer finding rate has been measured.
- V2 isolation guard and SQL preparation. Preparation does not mean SQL is deployed.
- Not yet implemented end to end: private image intake/vision, semantic original-request/buyer verification, specific-offer buyer responses, external partner feeds, lead campaign integration, and a production outcome-learning worker. Opening an original page or posting a request is not independent buyer verification.
- There is no evidence of either 70% or 98% live buyer finding performance. 98% is an aspiration; precision of cards is a different metric from offers receiving buyers or sales.

## Read in this order

1. `docs/PULL-V2-BUYER-FINDING-EXECUTION-PROMPT.md` — main detailed execution prompt, current research, metric definitions, engineering slices and acceptance criteria.
2. `docs/PULL-V2-CODEX-IMPLEMENTATION-BRIEF.md` — contracts and staged backend work.
3. `docs/PULL-V2-DEMAND-DISCOVERY-ENGINE.md` — product and route architecture.
4. `docs/RESEARCH-BACKEND-ARCHITECTURE.md` and `docs/PRODUCT-LED-BUYER-RESEARCH.md` — current journal, security and research plumbing.
5. `docs/PULL-V2-IMAGE-TO-BUYER-RESEARCH.md`, `docs/PULL-V2-BUYER-SYSTEMS.md`, `docs/PULL-V2-INTEGRATIONS-COMPANION.md` and `docs/JIJI-INTEGRATION.md` — supporting research and boundaries.

## Continue with implementation

First inspect applicable AGENTS.md, git status, actual source and tests. Run `npm ci --ignore-scripts` and `npm run quality` in a clean checkout. The latest local suite passed **535 tests**, syntax and whitespace checks. Source observation version 2 preserves block boundaries, abstains on ambiguous pages and leaves bare dollar currencies unresolved. Scenario compilation and live research-record validation do not establish buyer accuracy. That is local verification, not GitHub Actions or a live production-provider result.

Next extend the implemented source research and first-party request matching with seller-approved in-Pull introductions, authenticated responses about a specific offer, attributable permitted partner feeds and independent pilot adjudication. Product words and a confirmed email account do not establish full fit or buyer qualification. Cars in Lagos/Abuja are one pilot; include service and wholesale cases. Preserve source rights, government/public-institution exclusions, owner isolation, journal reservations, cost caps and explicit send approvals. Do not lower qualification just to increase the count.

Subsequent slices include seller-approved demand capture, deeper qualification, verified outcome recording and controlled evaluation. Never fabricate a buyer, use directory presence as purchase intent, infer personal wealth from lifestyle, or count snippets/self-reports as verified demand. Use seller-approved activation when public requests are scarce. Research, messages, ad spending and transactions have separate authority and evidence requirements.

Report changed files, actual behavior, test output, what is still missing, and the next concrete step. This task authorizes development and local tests, not live deployments, account changes, migrations, campaigns or outreach.
