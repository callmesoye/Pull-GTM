# Pull V2: buyer finding engine — research and execution prompt

23 October 2026. This is a build brief for the isolated V2 checkout, not a claim that the engine, a buyer pool, or a 98% result already exists. It extends [the demand discovery design](PULL-V2-DEMAND-DISCOVERY-ENGINE.md) and [the implementation brief](PULL-V2-CODEX-IMPLEMENTATION-BRIEF.md). The search-only V2 research pass currently has up to four hypotheses and eight source reservations per investigation. There is no measured V1 or V2 buyer finding rate.

The initial offer-level measurement function is now implemented in `server/v2-evaluation.js` with synthetic tests. It does not represent production outcomes. The later slices below remain implementation work.

## The result we are trying to improve

**Buyer finding rate at 14 days** = number of submitted eligible offers with at least one **distinct, verified, reachable, currently interested and product-compatible buyer** by the end of the observation window / number of all submitted eligible offers whose 14-day window has matured. Include zero-result, failed, expensive, hard-to-source and withdrawn-after-search offers in the denominator. Record eligibility before starting work using published operational criteria; also report a separate all-submitted rate and the reason for every exclusion. Count an offer once even if it has 100 buyers. Do not count an invented persona, category match, seller listing, web visit, dealer without expressed interest, unconfirmed post, ad impression, lead form opened, or undelivered contact.

The qualified buyer must have evidence of the matching need and a legitimate route for seller engagement. For a buyer who replies after distribution, record their explicit product/spec fit, geography, timeframe, budget or terms where relevant, contact permission, and reply or seller confirmation. For a public buyer request, verify the original request and actor, then count it as a **verified request** until the buyer's current intent and reachability are confirmed. Buyer finding is distinct from a completed sale. Report conversion to seller contact, conversations, inspections/proposals, transactions, refunds, and disputes separately.

**98% is an aspiration requiring validation**, not a performance prediction. For arbitrary offers, a buyer may not exist at the asking price or within the time/budget window. The system should maximize genuine buyer discovery while revealing the offer and demand constraints that block it. Precision of the results shown and percentage of offers served are separate metrics. A system that hides all candidates can score perfect precision but has zero buyer finding.

## Current research findings, interpreted for Pull

| Route | Buildable today? | What it actually proves | Constraint |
| --- | --- | --- | --- |
| Current web search providers in the V2 backend | Yes; bounded discovery exists | Candidate pages and hypotheses | Snippets do not establish buyers; open original source via permitted adapter |
| Seller-connected CRM and prior inquiries | After a consented integration | A seller's own historical demand | A stale inquiry needs renewed consent and current intent |
| Pull buyer request form and referral intake | Buildable as a new first-party feature | A buyer's stated request, contact permission and date | Need fraud checks and a real acquisition channel; empty on day one |
| Seller-approved ads with lead forms | Feasible with an advertiser account, spending authority and integration | A submitted inquiry; qualification still needed | Channel fees, spam, country/category availability and per-seller approval |
| Google Places Text Search | Technically available as an organization/route discovery source | A place or business exists | It is not a buyer-intent feed; field masks, pricing, display, attribution and storage rules apply |
| Jiji seller listing supplied by seller | Offer context or manual import where permitted | Seller's own offer attributes | No entitlement to collect other users' contacts, messages or content |
| Regional partners and field agents | Operationally possible after signed arrangements | A local introduction or observation | Human confirmation and buyer permission before a qualified match |
| Public Nominatim server | Unsuitable as a bulk enrichment backbone | Geographic lookup only | Official usage policy limits heavy and systematic querying |

Primary documentation checked on 23 October 2026:

- Jiji terms, §§7.15–7.17: https://jiji.ng/rules.html
- Google Places Text Search and policy: https://developers.google.com/maps/documentation/places/web-service/text-search and https://developers.google.com/maps/documentation/places/web-service/policies
- Google Ads lead form webhook contract, including `lead_id` deduplication and a configured verification key: https://developers.google.com/google-ads/webhook/docs/implementation
- Google Ads LeadFormAsset, including required privacy policy URL: https://developers.google.com/google-ads/api/reference/rpc/v23/LeadFormAsset
- Meta Lead Ads guides and retrieval, subject to account access and permissions: https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads and https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/retrieving
- OpenStreetMap public Nominatim usage limits: https://operations.osmfoundation.org/policies/nominatim/
- Supabase Queues: https://supabase.com/docs/guides/queues

These sources support integration feasibility and restrictions, **not** a prediction of how many buyers an offer will produce. Validate provider availability, terms and category coverage again before production activation. The existing Pull policy in `server/discovery.js` and `server/ai.js` excludes government/public institutions as prospects and sources. Use private-sector RFQs only under that policy.

## Copy/paste execution prompt for an engineering agent

> You are the senior product engineer and research engineer building the **buyer finding engine** for Pull GTM V2. Your output is running, tested, inspectable code and honest measurement, not an impressive list of imagined buyers. Work on branch `v2/product-led-intelligence` in the Pull V2 checkout. In this environment the checkout is `/workspace/scratch/b02dcc8f71ad/pull-gtm-v2`; if this path is absent, locate the actual repository and inspect its git branch and status. Read all applicable AGENTS.md, `docs/PULL-V2-DEMAND-DISCOVERY-ENGINE.md`, `docs/PULL-V2-CODEX-IMPLEMENTATION-BRIEF.md`, `docs/PULL-V2-IMAGE-TO-BUYER-RESEARCH.md`, `docs/JIJI-INTEGRATION.md`, `server/v2-handoff.js`, `server/v2-evaluation.js`, `server/buyer-research.js`, `server/intelligence.js`, `server/discovery.js`, and `server/research-journal.js` before editing. Protect V1. Keep new tables, routes, flags and credentials isolated from V1. Do not deploy, buy ads, publish offers, contact people, or run live migrations without the applicable explicit authorization. Implement and verify everything locally that does not require such authorization.
>
> ### Mission and epistemic rules
>
> For each real seller offer, find as many **distinct, genuinely interested and relevant** buyers as the allowed time, source rights and budget support. It is acceptable to return zero and explain why. Do not generate names, phone numbers, budgets, purchase intent or wealth estimates from a model. A model can propose searches, extract claims, compare specifications, identify conflicts and draft seller-approved actions; independent records and observed buyer behavior determine whether a buyer exists. Do not classify an affluent lifestyle, a social follow, a business category, or a model's similarity score as current buying intent.
>
> Define the target metric before changing it: at least one qualified buyer for each mature eligible offer within 14 days and a fixed seller-approved monetary/research budget. Track all submitted offers too, with exclusions shown. Show the buyer finding rate alongside qualified-result precision, distinct verified requests per offer, duplicate rate, actual reachability, meaningful replies, qualified conversations, sales, spend and elapsed time. Publish sample size and Wilson confidence intervals. The 98% goal is aspirational. Never report it as achieved without a representative holdout and observed outcomes. Compare V2 with V1/manual research using the same offers, windows, budgets and adjudication rules.
>
> ### The compound strategy
>
> Run three complementary motions, each with its own evidence standard:
>
> 1. **Capture existing demand:** search permitted public buyer requests and private commercial RFQs; use seller-connected inbound inquiries, authorized partner feeds and opt-in Pull buyer briefs. Open the original request, verify date and product details, and establish a permitted response path. First pass uses current bounded research/journal. Spend a second, separately budgeted pass only on uncovered source classes or promising hypotheses.
> 2. **Activate new demand:** if existing demand is sparse, propose a seller-approved exposure test targeted to the product and geography. Examples: an improved first-party offer page with buyer response form; an approved listing or partner placement; a small Google/Meta lead campaign when a seller has an advertiser account and approved spend; a partner introduction through a contracted regional network. No ad, listing, introduction or message is sent without the requisite seller authority. Buyer-submitted responses become candidate demand, never instant qualified buyers.
> 3. **Qualify and compound:** ask each responding buyer only the minimum questions needed for that category: exact specification or acceptable substitute, location, purchase timeframe, quantity, price/terms where needed, ability to inspect or accept delivery, and preferred contact permission. Deduplicate, verify contact response and record buyer feedback. With buyer consent, retain a versioned request in a first-party matching pool with expiry and withdrawal; match it against future offers. Use outcomes to re-rank routes and revise offer packs only after held-out evaluation.
>
> Route selection should maximize expected verified buyers per research hour and unit of approved spend, conditional on offer category, geography and evidence freshness. Maintain diversity: exact-demand search, substitute-demand search, private commercial procurement, existing seller inquiries, opt-in requests and activation channel. Do not spray 1,000 equivalent queries. Persist which route was tried, its cost, findings, failure reason and incremental yield. A market directory or dealer remains a **buying route** until they express interest in this actual offer.
>
> ### Offer normalization and seller confirmation
>
> Accept seller description, image asset, product page or listing URL, site, and buyer-hypothesis hint. Make a versioned `offer` with `category`, `subtype`, `attributes`, `hard_requirements`, `acceptable_substitutes`, `condition`, `price_and_currency`, `stock`, `delivery`, `location`, `availability_window`, `proof`, `seller_limits`, and provenance for every field. Distinguish visual observation, page claim, seller assertion and seller confirmation. A photo cannot prove vehicle model year, documents, ownership, price, stock or condition. A site URL may describe the seller, not a buyer. Seller confirmation freezes the version used for research; an edit creates a new version and invalidates affected matches. A reasonable seller price or delivery change can be suggested as a possible improvement but never applied without approval.
>
> Determine eligibility with a versioned, auditable predicate before counting outcomes. Reject prohibited or unsupported offers with a stated reason, not a hidden omission. If a seller cannot provide price or negotiable price band, location, product specification and a way to transact, ask for the missing facts. Keep `submitted`, `eligible`, `research_started`, `activated`, `buyer_found`, `expired` and `withdrawn` events. Never change historical denominators after observing success.
>
> ### Category packs and locality
>
> Begin with `used_vehicle`, `wholesale_material`, `professional_service`, `commercial_equipment` and `generic`. Each pack must contain: required seller facts, exact and acceptable substitute rules, contradictory/negative terms, intent phrases in relevant local usage, allowed sources, freshness window, qualification questions, trust proof, disqualifiers, and expected outreach or activation route. Test Abuja, Lagos and at least one smaller Nigerian market in the pilot. Use local place aliases and languages when supported by ground truth; never assert neighborhood residence or affordability from someone's online behavior. Expand radius or adjacent market only if fulfillment is feasible and the seller accepts it. For markets with scarce online evidence, route to opt-in local partners and record their field evidence. Avoid pretending private WhatsApp conversations or offline markets have been searched.
>
> ### Typed contracts
>
> Define strict schema validation at every boundary. Minimum immutable/versioned records:
>
> ```text
> OfferVersion(id, seller_id, status, category_pack_version, fields, field_provenance, confirmed_at)
> ResearchRun(id, offer_version_id, policy_version, budget, window, status)
> RouteAttempt(id, run_id, route_type, adapter, query_or_channel, cost_reserved, started_at, result, receipt)
> SourceObservation(id, route_id, source_ref, allowed_use, observed_at, source_date, excerpt_digest, original_checked_at)
> Actor(id, kind, organization_ref, dedupe_keys, verification_state)
> DemandSignal(id, actor_id, offer_version_id, signal_kind, explicit_request, specs, location, deadline, source_observation_id, expires_at)
> ContactPermission(id, actor_id, purpose, method, source, acquired_at, expires_at, revoked_at)
> Opportunity(id, offer_version_id, actor_id, tier, hard_constraint_checks, evidence_refs, contradictions, updated_at)
> Activation(id, offer_version_id, channel, creative_version, seller_approval_id, spend_cap, status, attribution)
> BuyerResponse(id, offer_version_id, activation_id?, source_lead_id?, observed_at, response_fields, consent_ref, verification)
> Action(id, opportunity_id, seller_approval_id, channel, delivery_receipt, status)
> OutcomeEvent(id, offer_version_id, opportunity_id?, kind, actor, observed_at, evidence_ref, adjudication)
> ```
>
> Keep source-specific content and personal data separate from user-facing cards. Per-tenant RLS and owner checks are mandatory. Private photos have access controls, EXIF minimization and retention. External lead IDs are idempotency keys, not evidence of unique humans. Use migrations only in isolated V2 staging/local environments after review. Use a queue with leases, retry budgets, dead-letter handling, heartbeat and idempotency across each stage; external sends and charges need their own receipts. Preserve the existing journal's reservation semantics.
>
> ### Evidence states and transitions
>
> ```text
> snippet_candidate -> original_checked -> request_verified -> contact_permitted
> -> buyer_replied_or_opted_in -> qualified_buyer -> seller_reviewed
> -> contacted -> conversation -> transaction / declined / expired
> ```
>
> Each transition requires an event, timestamp, evidence reference and actor. A source snippet may only create `snippet_candidate`. A reply saying “interested” without matching terms stays `needs_qualification`. An opted-in form with complete terms and verified contact may become a qualified buyer after authenticity/duplicate checks. A partner claiming “I know a buyer” is a route until the real buyer explicitly engages or confirms permission and fit. Closed requests and withdrawn consent invalidate exposure, not historical audit records. Rank opportunities by hard match, recency, explicit intent, contactability and verification; use a calibrated model only for tie breaks or next-check prioritization.
>
> ### Source governance and constraints
>
> Register each source with category, geography, API/access method, use and retention rights, cost, rate limit, original check method, contact method and degradation behavior. The app's current government/public-institution exclusion applies to both sources and prospects. Private-sector commercial RFQs may be used only where access allows it. Jiji listings supplied by sellers can be intake context where permitted; do not scrape other users, private inboxes or contact details, and do not send unsolicited messages. Google Places can help identify a potentially relevant organization; obey field mask, billing, attribution and storage terms, and never mark it a buyer based on listing. Do not use the public Nominatim endpoint for systematic or bulk POI collection. When an adapter does not permit verification, keep the result at the lower evidence tier.
>
> For consented paid intake, begin with a first-party Pull offer page and buyer form. If adding Google Ads lead forms, verify configured key, ignore test leads, dedupe by `lead_id`, tolerate schema additions, secure the endpoint and ask for product-specific intent fields. Meta lead retrieval requires the necessary seller/page permissions and app approval as applicable; confirm the current documentation before coding. Draft campaigns are reviewable artifacts. No background agent may set or raise an ad budget or publish an ad. Provide immediate buyer consent withdrawal and seller deletion flows.
>
> ### Supervisor algorithm
>
> ```text
> for each confirmed offer:
>   record eligibility and immutable research budget
>   run diverse, bounded exact-demand hypotheses with the existing journal
>   verify the best original sources; discard wrong seller-side / old / incompatible posts
>   check consented seller and Pull demand sources where connected
>   calculate coverage by route, geography and product attributes
>   while authorized incremental budget remains:
>     select the next untried route with the best expected marginal qualified yield
>     record attempt and actual evidence; stop on saturation, repeated duplicates or low yield
>   if qualified buyer found: display proof, terms, permission and next action
>   if only routes or zero result: propose a seller-approved distribution experiment
>   collect opt-in responses; verify match and authenticity before upgrading tier
>   track time, cost, no-results and eventual outcome; update strategy only after evaluation
> ```
>
> The runtime LLMs are specialized services behind controlled contracts: first Pull intake extraction; research planning; source extraction and contradiction checks; Pull decision and plain-language explanation. Models cannot fetch arbitrary URLs, choose their own credential, write source truth, send a message, charge a card, or approve their own output. Codex writes and tests the software, not an invisible model running inside every live request. Version prompt, schema, category pack, source adapter and model configuration on each run.
>
> ### Concrete example: Lagos used Mercedes
>
> Seller supplies a photo and their own Jiji listing. Intake extracts observable body/style and page-stated details, then asks seller to confirm exact make/model/year/trim, mileage, documents, condition, price, Lagos pickup/inspection area, seller authorization and delivery radius. Search authorized buyer request channels for exact year/model, then acceptable adjacent years or trims only if seller and buyer constraints allow. Look for recent explicit private buyer requests and consented prior inquiries; check original text and date. Dealers who regularly purchase used Mercedes can be proposed as routes with clear unknown intent. If direct requests are absent, offer seller an improved page and a seller-approved, capped intent capture test with questions about model, budget, timeframe and inspection. A person who submits a matching form and confirms contact is a candidate buyer; once fit, authenticity and reachability are confirmed, the offer counts as buyer found. If a C300 offer is overpriced or lacks documents, show that demand blocker and seek seller correction; do not hallucinate a buyer who can afford it.
>
> ### Evaluation and operational experiments
>
> First label a blinded seed set of real historical or consented offers across at least three categories and multiple localities. Include hard negatives: sellers posing as buyers, duplicate requests, outdated posts, incompatible trim, wrong MOQ, inaccessible location, unreachable forms, synthetic/spam leads and unreachable partners. Two independent reviewers adjudicate buyer relevance and eligibility; unresolved cases remain unknown. Avoid selecting only offers V2 solved. Use identical budget and observation window in V1/manual/V2 comparison; randomize or use paired allocation where practicable. Report results for **all submitted**, **predeclared eligible**, every category/geography and source route. Present buyer finding numerator/denominator, confidence intervals, time-to-first-buyer distribution, cost per qualified buyer, zero-result rate, buyer-card precision/recall, seller contact rate and sale conversion with missing outcomes explicitly counted as unknown. Do not backfill a positive label from an LLM prediction.
>
> First prove a useful vertical, not a universal 98% promise: e.g. 30–50 consented vehicle offers in Lagos/Abuja, with a service and wholesale shadow cohort; then expand. Set actual thresholds with the founder before paid activation. A 98% point estimate from 49/50 offers is weak evidence and may not generalize; report interval and failure modes. Halt route expansion when incremental verified buyer yield falls below its real cost, not when the model runs out of creative query ideas.
>
> ### Build sequence and required output
>
> **Slice 1:** inspect repo; create typed offer and buyer evidence contracts; integrate and extend the existing offer-level buyer finding evaluator with persisted, human-adjudicated outcomes; expose no-result and low-evidence tiers; add tests for duplicate, missing, hard-negative and censored cases. Keep API compatibility and V1 untouched.
>
> **Slice 2:** implement guarded original-source verifier and actor/request dedup with permitted sources, timestamps, provenance and outcome events. Build a small labelled fixture set that exercises car, service and wholesale scenarios. Return actual verified request vs route states.
>
> **Slice 3:** implement first-party buyer request intake with explicit consent, spam control, expiry and withdrawal; connect to offers with hard constraints; do not imply a pre-existing buyer network.
>
> **Slice 4:** produce a draft seller-approved activation plan and attribution contracts; then integrate one authorized lead form provider behind a feature flag and test webhooks locally with fixtures. No live campaign or spend without seller approval.
>
> **Slice 5:** run the paired pilot, publish per-segment rates and intervals, identify blockers and improve one route at a time. Add a consented partner workflow for online-sparse locations only if field operations can support it.
>
> For every slice: show changed files, a small architecture map, migration details, tests and outputs, security/privacy checks, what actually runs, what remains a stub, cost per offer at the configured budget and a candid result. Never fabricate live buyer matches. Stop at reviewable artifacts if live accounts, source licenses, advertising money or direct outreach are required.

## Decision rule for the founder

The greatest realistic increase in buyer finding rate will probably come from combining **demand discovery** with **seller-approved demand capture**, especially where a buyer never published their need. This is an engineering hypothesis, not a measured effect. Before anyone can find actual buyers for a unique seller, collect their exact offer and commercial constraints, then run the authorized sources. A product with no reachable demand within the time and budget window must show a true no-result plus the next test.
