# Product-led buyer research: isolated first implementation

Based on main commit `6285b2f2b94ecda79f8581c37b5e0271eb8d6786` inspected on 22 October 2026. This branch does not merge or replace the separate evidence-aware research-triage branch. No production configuration, data or deployment was changed.

## Problem and behavior

Existing named-professional discovery requires a predefined audience, industry and location. A seller who knows their product but does not know who could buy it cannot get PULL to develop and investigate buying-route hypotheses through that tool.

This implementation adds `discover_buyer_routes` to hosted chat behind `PULL_BUYER_RESEARCH_ENABLED=true` and the existing per-request `allowResearch` permission. The main model proposes a bounded plan from the actual product and location. The server validates and executes it through the configured Exa, Serper or Brave provider and existing search quota. The non-durable prototype does not require a database addition. Opt-in durable operation adds the journal schema described in [RESEARCH-BACKEND-ARCHITECTURE.md](RESEARCH-BACKEND-ARCHITECTURE.md); source reservations and existing daily quota commit together. No new model subscription or separate foundation model is required.

The plan distinguishes:

- `expressed_demand`: investigate explicit product requests;
- `intermediary`: investigate dealers, brokers, distributors and other relevant buying routes;
- `market_context`: research product language and possible channels. This does not establish a buyer.

Every selected hypothesis gets its first search before fallback queries. Duplicate query strings and canonical source URLs are deduplicated. A fallback can recover from an empty or transiently failed initial query; authentication, credit and rate-limit errors stop further spending. One chat turn cannot run both this search and the existing named-professional search. The initial pass uses at most four queries. If useful allowance remains, the model can read the evidence and call `refine_buyer_routes` once with new hypotheses or vocabulary. The product, exact terms, location and result limit remain fixed. Both passes share at most eight source requests and the existing daily quota. Each pass has a 16-second search deadline; refinement must fit the remaining 35-second investigation window, which also includes the intervening model response. The transport must honor AbortSignal. Hosted chat uses at most three model rounds for this path; their tokens are included in returned usage.

The result includes proposed hypotheses, source excerpts, matched terms, unresolved facts, suggested verification steps, per-query execution records, source counts and coverage limits. New source cards render in the existing AI conversation. They cannot be imported as named people or silently added to Buyers.

## Explicit implementation boundary

This is a model-authored plan, a deterministic executor and one optional evidence-informed revision. The revision can investigate a new buyer category or buying route based on the first findings and unknowns. It is not an unbounded autonomous investigator. No live data-provider key was used for validation. Provider formats, integration, failure behavior, evidence-informed refinement and UI rendering were tested with controlled fixtures; real-market precision and model planning quality are not established.

The executor reads search-provider excerpts. It does not fetch and independently verify original pages, identify anonymous commenters, determine personal affordability, scrape private communities, send messages or complete sales. `possible_request` is only a review label. Need, buyer identity, contact permission and budget remain unconfirmed. Extracted provider publication dates are source-asserted, not independently verified; unknown dates stay unknown. Requests older than 30 days are downgraded to context. Request-cue rules currently cover selected English phrases; other languages need tested rules or a reviewed classification stage. Neither the freshness policy nor request detection is a universal market model.

Existing private-sector exclusions, unsafe-URL handling, named-person validation, auth, account isolation and action approvals remain in place. In particular, the general research report's public procurement examples are outside this repository's current private-sector-only product policy; this branch does not activate them.

## Car example: use without overfitting

For a seller-supplied `Mercedes Benz C300 2026` in Lagos, the model may propose explicit model requests, dealer acquisition/consignment routes and market discussion. The executor does not establish the year/model's validity, price or condition. Seller details need separate validation.

An apparent request remains a source to investigate, not a verified lead. `Love this car`, a price question, a luxury-lifestyle reference, `for sale` and a fulfilled request do not qualify as purchase requests. A nearby request phrase is not proof of its author's identity or current intent. The same contract is tested with a website-design service in Abuja; no automotive category template is required by the executor.

## Trying it in an isolated environment

1. Inspect the latest remote branch and any unmerged research work. Apply these changes on an isolated branch; do not overwrite newer files.
2. Run `npm run check` and `npm test`.
3. Use the existing server AI and source-provider configuration and quota database. Keep keys server-side. No credential is bundled in this change.
4. Enable `PULL_BUYER_RESEARCH_ENABLED=true` in the isolated environment only. Sign in and leave live research enabled for the question.
5. Ask for buying-route research for an actual product with an explicit service location. Review the original sources, dates, request author and commercial fit manually.
6. Record raw source yield, relevant request precision, intermediary relevance, duplicate rate, spend, time and confirmed buyer responses separately. Do not count source pages as buyers or route hypotheses as demand.
7. Leave the flag false or unset to roll back availability. Existing named-professional research remains available.

## Next mechanism, after evaluation

Add original-source verification through source-specific authorized adapters. Enable and evaluate the implemented tenant-scoped journal after its staging release gates pass; connect material unknowns to a qualification workflow. Evaluate whether the already implemented revision improves relevant yield and cost compared with a single pass. Connect appropriate permissioned buyer enquiries and their responses. That is how this initial executor can grow into PULL's broader commercial intelligence system without replacing its existing architecture.

## Current access research

- OpenAI's manager/specialist orchestration is a viable later implementation option, not a requirement for this change: https://developers.openai.com/api/docs/guides/agents/orchestration
- Jiji's own terms restrict collection and copying of user information and unsolicited contact. Existing `JIJI-INTEGRATION.md` remains controlling; this change does not add a Jiji scraper or inbox integration: https://jiji.ng/rules.html
- YouTube provides documented comment retrieval. Retrievability alone does not establish a license for every downstream use or permission to contact commenters: https://developers.google.com/youtube/data/reference/rest/v3/comments/list
- Reddit commercial data access requires applicable approval. No Reddit integration was added: https://redditinc.com/policies/data-api-terms

Reviewed official sources on 22 October 2026. Research availability is not a claim of an approved production integration.

## Local validation

`npm run check` passed. `npm test` passed all 416 tests, including 29 product-led research tests and 19 journal/security/recovery checks. The journal checks execute actual PostgreSQL SQL in PGlite, including an authenticated HTTP-to-database research/retry flow. They do not establish multi-connection concurrency or staging Supabase behavior. The existing 10 ms discovery deadline test was made deterministic with a controlled test clock; production deadline behavior was not weakened. No live provider, model-planning accuracy, buyer response or conversion result is claimed.


## Durable recovery option

`PULL_RESEARCH_DURABLE_ENABLED` defaults false. When enabled after schema/secret provisioning, the browser retry button reuses the same research ID and original brief. The server persists the validated plan, reserves each source step atomically, saves normalized receipts and checkpoints results. Completed receipts replay without provider calls; uncertain requests are not automatically repeated. Worker leases, revision checks and owner/capability checks prevent stale or unauthorized writes. A recovered checkpoint returns saved evidence with partial coverage and no further automatic spending. See the architecture document for exact semantics, provisioning and release gates. New questions and browser reloads are outside the current client retry guarantee.
