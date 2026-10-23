# Pull V2: 75 buyer-relevance systems

Product design, 23 October 2026. **Status: proposed, not implemented.** This is one coordinated buyer engine with fifty small mechanisms, not fifty separately trained LLMs or fifty automatic contact bots. It extends the existing product-led research path, source cards, quota/journal, named-prospect discovery, owner approval, and the proposed opportunity-to-action loop. V1 remains separate.

## The result Pull should deliver

A seller supplies the actual offer: category, exact specification, condition, price or terms, location, delivery capacity, proof and preferred buyer types. Pull works backwards to buying jobs, verifies permitted sources, ranks *opportunities* by fit and next-step cost, then helps the seller present a truthful, relevant offer through a permitted route. A buyer who decides to enquire can supply their own budget, timing and constraints. Pull records actual conversations and outcomes. Psychological relevance means addressing a real purchase problem, trust concern and decision stage; it never means inventing scarcity, exploiting vulnerability or predicting a stranger's wealth from lifestyle.

**Buyer caliber** is an offer-relative commercial match, not a class label. For a ₦40m car it may mean a buyer with an explicitly compatible budget, purchase timeline and inspection/payment path, or an authorized dealer willing to acquire stock. For a ₦250k service it may mean a company with the right problem, owner and scope. Unknown budget stays unknown. The most efficient buyer is the route with the strongest verified match and lowest expected time/cost to a qualified conversation or sale, not the person with the highest inferred income.

The decision object is `{offer_version, category, route, subject_type, decision_job, observed_signal, evidence_urls, source_status, geography, budget_status, authority_status, urgency_status, contact_eligibility, uncertainty, next_action, outcome}`. `subject_type` distinguishes business, opt-in person, public request, intermediary and market context. The engine must never silently convert a source page into a named buyer.

## Fifty systems

Each row names the new mechanism, the existing Pull component it changes, and the seller-visible result. **Core** can be built with offer input, current search/journal and seller review. **Adapter** needs an authorized source or seller-connected account. **Learning** requires genuine outcome data. All proposed signals are hypotheses until their source and buyer are checked.

### 1–10: understand the exact product and buying decision

| # | System | Mechanism and buyer psychology | Pull anchor; output | Gate |
| --- | --- | --- | --- | --- |
| 1 | Offer DNA | Parse model, variant, use, condition, price, warranty, seller proof and geography into typed fields; ask for consequential missing facts. A precise offer reduces uncertainty. | Chat intake → versioned offer brief. | Core |
| 2 | Specification contradiction check | Detect incompatible model/year/capacity/condition claims and ask the seller to correct them before research. Avoid selling a different thing. | Input validator → correction prompt. | Core |
| 3 | Category decision map | Choose which evidence matters for automotive, B2B service, property, machinery, consumer goods or wholesale; allow unknown category. | Research plan → category-specific checklist. | Core |
| 4 | Buyer job decomposition | Translate the product into the buyer's task: replacement, expansion, resale, convenience, compliance, savings or status where the buyer has *stated* it. | Plan hypotheses → multiple distinct jobs. | Core |
| 5 | Use-case incompatibility filter | Exclude buyers whose required spec, quantity, intended use or service level conflicts with the offer. | Relevance policy → explicit mismatch reason. | Core |
| 6 | Substitute and alternative map | Compare the actual offer with realistic substitutes, including doing nothing, using seller-supplied or checked facts. This surfaces reasons to switch. | Market-context research → comparison brief. | Core |
| 7 | Total-cost worksheet | Calculate transparent price, delivery, maintenance and operating costs only from sourced or seller-entered numbers. Buyer sees real trade-offs. | Create workspace → editable cost sheet. | Core |
| 8 | Offer constraint solver | Match minimum order, inspection, delivery area, service date, financing availability and return terms against explicit buyer requirements. | Offer brief + review → eligible route. | Core |
| 9 | Trust-evidence inventory | Ask for receipts, ownership proof, case studies, warranty or references appropriate to the category; mark missing documents. | Offer brief → proof checklist. | Core |
| 10 | Purchase-window planner | Distinguish an explicit deadline from seasonal market context; schedule a useful follow-up without invented urgency. | Research plan → timing hypothesis. | Core |

### 11–20: find plausible buyers through distinct routes

| # | System | Mechanism and buyer psychology | Pull anchor; output | Gate |
| --- | --- | --- | --- | --- |
| 11 | Explicit-request finder | Search for recent, attributable requests for the exact product or use case; classify request versus admiration or sales listing. | `expressed_demand` → possible request card. | Core |
| 12 | Buyer-language expansion | Generate local product names, model aliases, quantities and problem phrases; test relevance against original offer. Buyers may describe a need differently. | Bounded refinement → new queries. | Core |
| 13 | Intermediary acquisition routes | Find dealers, brokers, installers or distributors that publicly say they buy, source or accept stock; check margin implications. | `intermediary` → route card. | Core |
| 14 | Business directory locator | Search licensed/allowed establishment data by category and geography, retaining attribution and use restrictions. A place is only a possible account. | Source adapter → business card. | Adapter |
| 15 | Adjacent-service partners | Identify complementary businesses that can introduce demand, such as auto inspectors or solar installers, from their published services. | Research hypotheses → partner path. | Core |
| 16 | Seller-provided referral graph | Use seller-entered introductions and relationship strength; never scrape private contact books. Warm trust can shorten the route. | Workspace import → introduction task. | Adapter |
| 17 | First-party enquiry collector | Ingest enquiries from the seller's own connected form or store and bind them to the offer version. | Approved integration → enquiry card. | Adapter |
| 18 | First-party conversation reactivation | Find previous opted-in or otherwise eligible enquiries about matching goods, with suppression and consent rechecked. | Connected inbox/CRM → review queue. | Adapter |
| 19 | Company-change watcher | Observe public business events, such as a new location or product line, as *context* for a business-use hypothesis. Never call the event proof of budget or purchase intent. | Source journal → account-context card. | Adapter |
| 20 | Sparse-market route planner | When indexed sources are poor, suggest seller-supplied associations, published local business channels, partner introductions or in-person verification tasks; report coverage honestly. | Low-yield research → manual route plan. | Core |

### 21–30: authenticate and rank an opportunity

| # | System | Mechanism and buyer psychology | Pull anchor; output | Gate |
| --- | --- | --- | --- | --- |
| 21 | Original-page recheck | Fetch an authorized original source where allowed, compare it with the search excerpt and store checked time and canonical URL. | Source card → source status. | Adapter |
| 22 | Claim-to-source ledger | Bind each asserted need, product, date and location to the exact excerpt or seller answer; unsourced claims remain unknown. | Research journal → evidence ledger. | Core |
| 23 | Request-state classifier | Separate buying request, seller listing, fulfilled request, review, generic comment and ambiguous discussion. | Possible request card → review state. | Core |
| 24 | Freshness and availability check | Downgrade stale requests and broken pages, then ask for confirmation before outreach; no false urgency. | Source card → expiration/recheck task. | Core |
| 25 | Business identity check | Cross-check company name, published domain and relevant buyer function with permitted sources; never identify anonymous commenters from clues. | Verification panel → entity confidence. | Core |
| 26 | Decision-role map | For a verified business, distinguish user, evaluator, budget holder, approver and purchasing desk when the role is evidenced. | Named-prospect discovery → role gap. | Core |
| 27 | Declared-budget gate | Use only a buyer's own budget, published procurement range or explicit seller-entered requirement; never infer an individual's affordability. | Fit assessment → compatible/unknown/incompatible. | Core |
| 28 | Location and fulfillment gate | Check actual pickup, shipping, installation or service area against the buyer's stated location and offer terms. | Geography evidence → delivery fit. | Core |
| 29 | Contradiction adjudicator | Show conflicts between sources, such as two model years or inconsistent deadlines; require seller review rather than averaging them. | Journal + review → unresolved conflict. | Core |
| 30 | Opportunity efficiency ranker | Compare eligible routes using source credibility, exact match, timing, reachability, expected seller margin and estimated effort; preserve unknowns and reasons. | Verified cards → prioritized next steps. | Learning |

### 31–40: help the *right* buyer decide without manipulation

| # | System | Mechanism and buyer psychology | Pull anchor; output | Gate |
| --- | --- | --- | --- | --- |
| 31 | Buyer-question map | Group real enquiries into questions about fit, trust, delivery, price and support; seller sees unanswered objections. | Enquiry/feedback → question list. | Adapter |
| 32 | Proof-to-question matcher | Attach actual documents, demonstrations or consenting customer cases to the specific question they answer. | Proof inventory → evidence packet. | Core |
| 33 | Honest comparison builder | Build an editable category-specific comparison of the offer and verified alternatives, including downsides. | Create workspace → buyer comparison. | Core |
| 34 | Risk-reduction designer | Suggest a legitimate inspection, trial, milestone, warranty or escrow path supported by the seller's actual terms. | Offer constraints → trust option. | Core |
| 35 | Buyer-specific demonstration | Produce a demo or walkthrough for the buyer's stated use case; never fake metrics or product capabilities. | Create workspace → demonstration brief. | Core |
| 36 | Fit-first recommendation | Tell the seller when the offer is a poor match and what buyer type would fit better. Clear disqualification saves both sides time. | Fit policy → avoid-contact decision. | Core |
| 37 | Choice simplifier | Present a small, factual set of available configurations and explain trade-offs; avoid decoy prices. | Offer variants → comparison card. | Core |
| 38 | Local language adaptation | Rephrase offer explanation in the buyer's chosen language and locally meaningful units without changing specifications or claims. | Editable draft → translated version. | Adapter |
| 39 | Decision packet generator | Package the right specs, proof, timeline, costs and unresolved questions for a buyer or procurement team. | Evidence ledger → shareable packet. | Core |
| 40 | Adaptive offer page | Show category-appropriate facts and seller-approved proof to visitors who choose a use case; measure consented actions. No covert individual profiling. | Create workspace → offer page. | Adapter |

### 41–50: act, observe, and learn what actually converts

| # | System | Mechanism and buyer psychology | Pull anchor; output | Gate |
| --- | --- | --- | --- | --- |
| 41 | Contact-path eligibility | Decide whether a route permits an enquiry, public reply, connected message, referral request or only research. | Action plan + channel policy → allowed action. | Core |
| 42 | Evidence-bound message composer | Draft one concise, editable message citing a checked need and relevant offer benefit; seller approves it. | Hosted AI + approval → draft. | Core |
| 43 | Buyer self-qualification | Invite an interested buyer to voluntarily state use, budget band, timeline and preferred route through a consented form. | Offer page/form → declared fit. | Adapter |
| 44 | Appointment and inspection coordinator | Offer actual available times and prerequisites after the buyer opts in; prevent duplicate booking. | Approved workflow → scheduled step. | Adapter |
| 45 | Reply-aware follow-up | Stop on reply, objection, opt-out or purchase; suggest a relevant answer or one permitted reminder. | Connected inbox → next action. | Adapter |
| 46 | Objection-resolution loop | Categorize real objections, identify missing proof or bad positioning, and propose a truthful change for seller review. | Outcomes → improvement task. | Learning |
| 47 | Route experiment allocator | Compare small cohorts by category and area; shift *future* research spend toward routes that yield verified conversations, not clicks. | Journal quotas → bounded allocation. | Learning |
| 48 | Revenue and margin attribution | Connect a reported or observed sale to offer, route and action; keep seller-reported revenue distinct from payment-verified revenue. | Outcome events → commercial report. | Learning |
| 49 | Coverage and bias audit | Report categories, neighborhoods and buyer types with low source coverage or unusually high false positives; do not equate absence online with absence of demand. | Search diagnostics → gap report. | Learning |
| 50 | Cost-aware research controller | Choose another query, a new route, a manual task or stop based on marginal verified yield, latency and quota; never spend simply to fill a list. | Existing bounded research + journal → next investigation decision. | Learning |

## How they work together

`offer → category/job map → bounded buyer-route search → source checks → fit and uncertainty → seller-reviewed action → buyer's voluntary response → measured outcome → route updates`.

The existing model may propose categories, buyer jobs, queries and explanations. Typed server code validates the offer, source permission, category gates, budgets and state transitions. A source adapter reads only a permitted channel. PostgreSQL stores owner-scoped offer versions, evidence, reviews and outcomes. The model never gets authority to certify identity, decide consent or send a message. One source cannot prove all of need, role, budget, channel eligibility and conversion.

### Example: a Lagos C300 advertised on Jiji

Pull reads the seller-supplied exact vehicle, price, condition, documents and inspection area. It tests an explicit-request route and a dealer stock-acquisition route. It treats a social comment about liking the car as context only. It checks the original available source where access permits, notes whether an apparent request is current, and asks the seller to confirm ownership documents and inspection terms. If a buyer voluntarily states budget and timeline, those facts can raise fit; a high-income-looking profile cannot. A dealer may win the efficiency ranking if its actual acquisition terms yield a better expected net outcome and faster sale. Pull can prepare a proof packet and approved enquiry; it cannot automatically harvest Jiji users or send unsolicited messages through Jiji.

### Other category paths

| Offer | Buying job and likely route | Trust or fit question | Useful seller action |
| --- | --- | --- | --- |
| Abuja solar installation | Facility with a documented reliability need; installer partner or first-party enquiry. | Load survey, site access, warranty, service area. | Offer a scoped assessment, not an invented savings claim. |
| Lagos brand/web service | Verified company project or seller-provided introduction. | Decision maker, scope, budget and proof of similar work. | Send a tailored diagnosis after the need is checked. |
| Wholesale building materials | Business with a documented purchase requirement or licensed distributor route. | Grade, quantity, delivery window and payment terms. | Quote the exact grade and fulfillment conditions. |

## Build order and measurable gates

1. **First useful slice:** 1–5, 8–9, 11–12, 21–24, 28–29 and 36. Extend source cards into seller-reviewed opportunities. Keep all outbound disabled. Target: seller-reviewed relevant routes per offer, false request rate, time and cost per reviewed route.
2. **First conversion slice:** 30–34, 39, 41–43. Produce an evidence-bound, editable decision packet and approved action. Target: qualified enquiries and conversations, not message count.
3. **Live-data adapters:** 14, 17–19, 31, 38, 40, 44–45 only after terms, access, consent, privacy review and actual credentials exist. No simulated integration counts as live coverage.
4. **Learning:** 46–50 after enough observed outcomes. Compare matched offers against a manual researcher and current product-led baseline across several categories and Lagos/Abuja areas. Publish precision, coverage gaps, cost, response and sale outcomes separately.

For each mechanism, test category correctness, source provenance, false positive cost, owner isolation and counterexamples. Never promise 100% buyer accuracy or guaranteed sales. A strong system can return **“no credible buyer found yet”** and a better next research route.

## Current technology and access basis

- Existing Pull modules: `server/buyer-research.js`, `server/intelligence.js`, `server/research-journal.js`, `server/discovery.js` and `docs/PULL-OPPORTUNITY-ACTION-LOOP.md`. They do not implement the fifty systems above.
- Google Places Text Search can locate establishments using location and type filters; requested fields affect cost and data use remains subject to Google's policies. It is not an individual buyer or intent database: https://developers.google.com/maps/documentation/places/web-service/text-search
- YouTube's documented API can return public comment threads. Access alone does not prove intent, identity, affordability or permission for outreach: https://developers.google.com/youtube/data/reference/rest/v3/commentThreads/list
- Google's Trends API was an application-only alpha at the time of review. Do not make it a launch dependency: https://developers.google.com/search/apis/trends
- Reddit commercial Data API use requires a separate agreement: https://redditinc.com/policies/data-api-terms
- Jiji prohibits harvesting user data and unsolicited commercial messages; a seller's Jiji listing is seller-supplied offer context, not a license to scrape buyers: https://jiji.ng/rules.html
- Nigeria's Data Protection Act gives people rights including objection to direct-marketing profiling; review applicable rules before deploying any personal-data workflow: https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf

External access and policy statements were checked on 23 October 2026. Provider approval, coverage in a particular Nigerian area, conversion uplift and any sales result have **not** been established.

## Further research: 25 additions (51–75)

The initial fifty emphasize finding and qualifying buyers. These additions address a deeper limitation: some of the best buying signals are created when buyers interact directly with a seller's offer, while many local businesses have incomplete public records. The new paths should invite buyers to state needs voluntarily, make the offer easier to discover, and verify what happens after interest. These are **additional design proposals**, not live integrations.

| # | New mechanism | Concrete workflow and psychological role | Necessary evidence or access |
| --- | --- | --- | --- |
| 51 | Buyer-led request board | A buyer posts a specific wanted item or business problem, price band if they choose, location and deadline. Pull matches seller offers to that request. The buyer initiates the interaction. | Opt-in request, moderation, anti-spam and expiry; own Pull product. |
| 52 | Reverse-match alert | When a new seller offer matches an existing buyer's saved request, Pull asks the buyer whether to reveal or contact; it does not expose the buyer's identity to every seller. | Own request board, per-request consent and match reasons. |
| 53 | Search-query gap detector | With seller authorization, read Search Console queries for the seller's own site. Compare searches that brought visitors with the seller's actual offer to find unanswered demand language. | Read-only Search Console access; aggregate site traffic, never identifiable buyers. |
| 54 | Offer discoverability publisher | Generate seller-approved product pages with accurate availability, price, shipping and variant structured data where relevant. The buyer finds a comprehensible offer while searching. | Seller site control, current inventory and Google's applicable markup requirements. |
| 55 | QR-to-request bridge | A seller or partner puts a QR code on a physical display, quote or event card. The buyer voluntarily requests details or a callback through a short mobile form. | First-party form, consent, event/source code; no scan equals a buyer. |
| 56 | Low-bandwidth offer summary | Provide a light, readable page and compact downloadable spec for buyers with slow or costly connections; the decisive facts appear first. | Seller-approved content and performance testing on real devices/networks. |
| 57 | Buyer choice-state capture | Let an interested visitor select “compare options,” “need proof,” “ready to inspect,” or “ask a question.” This directs help based on declared stage. | First-party interaction, privacy controls; choice is a stated preference, not guaranteed intent. |
| 58 | Decision-uncertainty diagnosis | Ask which fact blocks progress: spec fit, authenticity, delivery, price, authority or timing. Answer that exact question with verified proof or report that it is unavailable. | Buyer answer plus claim-to-source ledger; avoid generic pressure tactics. |
| 59 | Buyer-led alternative request | A buyer who rejects an offer can optionally say what must change (size, condition, warranty, quantity, location). Pull looks for another approved seller offer or informs the original seller in aggregate. | Voluntary response, marketplace permission and suppression. |
| 60 | Restock match queue | A buyer may opt to wait for a particular model, quantity or condition; notify only when a genuinely matching, available offer arrives. | Expiring saved request, current stock and notification consent. |
| 61 | Local business-map candidate finder | Use appropriately licensed geographic business data to propose potentially relevant local businesses for *manual verification*. A mapped establishment is not a qualified buyer. | OSM attribution/license or paid map adapter; business use case and fresh verification. |
| 62 | Source-rights-aware local cache | Store only fields each data provider permits; for Places, keep the stable place ID and fetch restricted details on demand. Prevent the buyer graph from becoming an unauthorized copied directory. | Provider-specific retention/attribution rules in adapter metadata. |
| 63 | Human route validation assignment | When the web is sparse, create a bounded task for a seller or approved local partner to confirm a business exists, accepts this product, and has a published enquiry route. | Timestamped human attestation with reviewer identity; no claim of independent verification. |
| 64 | Partner demand bulletin | An installer, reseller or association can opt in to submit anonymized categories/quantities requested by its own customers. Pull offers matching sellers a partnership conversation, without sharing customer details. | Contracted partner, aggregate data permission and seller-approved enquiry. |
| 65 | Multi-site delivery feasibility | Compare buyer's chosen delivery point with seller capacity, installation radius and inspection options; propose a realistic handoff before a quote. | Stated location and seller logistics, with no need to profile a neighborhood. |
| 66 | Verified stock reservation | Once buyer and seller agree, hold an available unit for a stated, genuine period; release it automatically. Avoid showing false scarcity. | Seller inventory lock, clock and clear reservation rules. |
| 67 | Currency and quote validity | For imported or volatile-cost goods, show the quote currency, date, seller-approved validity period and known delivery exclusions. Reduces surprise at decision time. | Actual seller terms and rate source if any; no fabricated discount countdown. |
| 68 | Shared buyer decision room | A buyer can invite colleagues or family members to the same evidence packet, questions and inspection plan without leaking unrelated seller/customer data. | Buyer invitation, access roles and expiry. |
| 69 | Decision-authority request | If a company user needs approval, Pull can generate a factual one-page justification that the user chooses to forward. No guessing who controls a budget. | Declared approval path and checked costs/benefits. |
| 70 | Seller reliability history | Surface seller-owned, verified fulfillment facts such as completed paid orders, response time or honored inspection bookings, with provenance and sample size. | Connected first-party records; dispute and deletion process. |
| 71 | Offer anomaly warning | Flag inconsistent seller documents, duplicate item photos, conflicting dates or implausible terms for manual review. A warning is not a fraud accusation. | Authorized uploads and comparison rules; human adjudication. |
| 72 | Payment-confirmed outcome | If the seller connects a payment provider, verify a transaction server-side or through a signed webhook before marking “paid.” Handle refund/reversal separately. | Seller's own account, signed event, reference and idempotent reconciliation. |
| 73 | Fulfillment-confirmed outcome | Keep “paid,” “delivered,” “accepted” and “repeat order” separate. Learn whether Pull sourced profitable customers, not just deposits. | Seller/partner delivery records and clearly labelled attestation. |
| 74 | Decision-path experiment | On the seller's own page, test factual proof order or inspection CTA for matched traffic. Use qualified enquiries and verified sales, with holdouts where volume allows. | Consent-compliant first-party analytics and sufficient sample; no uplift claim before experiment. |
| 75 | Buyer-caliber calibration | By category and price band, compare Pull's predicted commercial fit with voluntarily declared constraints and later outcomes. Recalibrate or abstain when sparse. | Outcome labels, confidence intervals, bias/coverage checks; no wealth inference. |

### What the extra research changes in the build order

**Highest-leverage next prototype:** 51 + 52 + 57 + 58 can make Pull a place where a buyer states a need and the seller answers it, rather than relying on uncertain social signals. Start with a seller-owned enquiry form and matched offers before attempting a public marketplace. Pair it with 21–24 (source review) and 41–42 (permitted action). This is an inference from the system design, not a measured conversion claim.

**Useful low-cost distribution:** 53–56 make real offers findable and understandable through a seller's site and physical touchpoints. Search Console returns aggregate query performance for an authorized property and does not identify individual searchers. Product markup can make price/availability/shipping visible in eligible search experiences, but Google chooses whether to show them. See https://developers.google.com/webmaster-tools/v1/searchanalytics/query and https://developers.google.com/search/docs/appearance/structured-data/product.

**Local-data caution:** 61 is a location candidate path, not proof of demand. OpenStreetMap data is commercially usable under ODbL with attribution; public Overpass instances are shared infrastructure and unsuitable as an unbounded production backend. Google's Places policies restrict caching content but exempt place IDs, which changes how an adapter should store results. See https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ, https://wiki.openstreetmap.org/wiki/Overpass_API and https://developers.google.com/maps/documentation/places/web-service/policies.

**Real outcome measurement:** 72 can distinguish a successful payment from a browser redirect or a seller's assertion. A Paystack integration would require the seller's account, verified webhook signature, server-side transaction status and careful reconciliation, then 73 records actual fulfillment. See https://paystack.com/docs/payments/webhooks/ and https://paystack.com/docs/payments/verify-payments/.

Research literature finds online purchase decisions involve sequences of actions and uncertainty, but findings vary by setting; Pull should test buyer-declared stages and real conversions in its own categories rather than treat clicks or generic psychological labels as buyers. See https://arxiv.org/html/2410.05763v2 and https://academic.oup.com/jcr/advance-article/doi/10.1093/jcr/ucag037/8798934. The latter study's experimental contexts are not direct evidence that a Lagos car or Abuja solar buyer will behave the same way.
