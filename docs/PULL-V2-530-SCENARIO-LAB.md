# Pull GTM V2: 530-case research and engineering lab

Research checked: **23 October 2026**. Scope: **520 distinct seller offers and problems across 52 sectors, plus 10 adversarial stress cases**. There are 20 reusable purchase mechanisms, 51 published background/technical sources and 38 overlapping mechanism requirements to investigate. The cases are original, research-grounded hypothetical examples, **not 520 observed live sellers, 530 completed searches, a populated buyer database or verified transactions**.

## What the research changes

Pull should investigate an executable buying situation: a particular buyer job, a credible purchase trigger, acceptable product and commercial terms, an authorized decision maker, and a feasible receiving window. A relevant business name is only a route to investigate. An expensive lifestyle, a product like, a map listing or an old tender is insufficient evidence.

This changes the unit of research from “who resembles someone who might buy?” to “what specific requirement could this exact offer satisfy, and what evidence would establish that?” Several products can use the same commercial mechanism while failing for completely different reasons. The 520 offers have distinct product/problem pairs; they intentionally reuse 20 mechanisms rather than pretend there are 530 unrelated algorithms.

The lab is usable now as a filterable workbook, canonical research seeds, reproducible JSON/CSV compilation, bounded research-plan generation and a local regression suite. It is not a claim that every missing execution layer has been implemented.

## Three concrete paths

### S001: a yam seller in Ojuelegba

The problem is a harvest batch losing usable quality while walk-in sales remain slow. The proposed buyer role is a pounded-yam restaurant purchasing manager, conditional on a real meal forecast exceeding available stock. This is a hypothesis, not a named restaurant or a confirmed requirement.

1. Ask the seller for variety, inspected condition, usable weight, available quantity, minimum order, price basis, collection deadline and actual delivery area.
2. Investigate original current yam requirements, then the proposed restaurant purchasing role. A targeted restaurant Maps handoff is a secondary way to investigate businesses in the seller's confirmed location.
3. Establish the actual meal-preparation window, accepted yam quality, requested kilograms and receiving capacity with an authorized buyer.
4. Compare compatible quantities and a scoped quote before a seller-approved introduction. Keep the result unresolved if freshness or the delivered total is missing.

Illustrative arithmetic: 100 kg available, 20 kg minimum, NGN 500/kg, and a buyer requesting 10 kg with NGN 6,000 total budget. The goods subtotal is NGN 5,000, but the order is below the stated minimum. Pull should flag that conflict rather than call the buyer a workable match. If the order is 30 kg with NGN 14,000 budget, the NGN 15,000 goods subtotal already exceeds budget. Passing that check still does not prove transport, quality or buyer commitment.

### S061: corporate shirts in Ojuelegba

The problem is mismatched enquiries without a usable corporate purchasing brief. The proposed buyer is a private-company uniform coordinator with an actual onboarding requirement. Verify a size roster, fabric specification, branding requirement, quantities, authorized budget and delivery date. A nearby office is not automatically buying uniforms. S081 separately addresses office shoes through hospitality staffing needs and footwear-specific fit rather than treating all clothing as one generic audience.

A buyer-approved sample and a documented quote can reduce fit uncertainty. A public hiring announcement can suggest a question to investigate; it does not prove that the company buys uniforms, that it is buying now, or that a particular employee can authorize an order.

### S101: a 2026 Mercedes-Benz C300 in Lagos, including a Jiji-origin offer

The seller confirms the actual model/year, VIN or supporting documentation, condition, title/transfer basis, inspection arrangements, asking price and selling area. The planner investigates explicit opted-in requirements and relevant authorized dealer or inspection routes. It does not infer personal wealth from appearance, social comments or luxury interests.

[Cars45's seller pathway](https://www.cars45.com/sell) and [dealer programme](https://www.cars45.com/dealer) are published examples of vehicle intermediary routes, not proof of a current C300 buyer or a guaranteed sale. Pull must distinguish a dealer buying stock, a consignment intermediary and an end buyer. A 2026 label in a seller description is a seller assertion until checked. Jiji ingestion remains subject to its permitted access route; no new scraper, private-dashboard access or Jiji partnership was activated by this work.

## The 20 mechanisms

The Mechanisms workbook tab supplies each workflow, proof requirement, outcome measure and uncovered gaps. The mechanisms cover perishable stock recovery, replenishment, application/specification fit, dated projects/events, installed-asset replacement, private project procurement, capacity booking, reseller/offtake, controlled professional purchasing, workflow migration, confirmed expansion, consented pooled demand, seasonal windows, asset licensing, circular feedstock, consented local access, cross-border trade, specialist introductions, approved pilots and viable-lot economics.

These are commercial hypotheses and workflows. Their effectiveness must be measured with real eligible offers. They are not a custom-trained foundation model, a benchmark showing buyer-finding gains, or an autonomous authority to contact people.

## What was implemented in this increment

| Addition | Actual behavior | Deliberate limit |
| --- | --- | --- |
| Scenario-backed guidance | The product-led AI path receives at most two phrase-matched case guides with buyer role, conditional trigger, checks and mechanism steps. | The current seller-confirmed product and location remain authoritative. No matching phrase produces no invented case. |
| Bounded scenario research plans | All 520 cases compile into the existing validated research contract with three hypotheses and four planned queries. | Compilation executes no search, incurs no provider requests, and confirms no buyer. |
| Explicit quantity comparison | Compatible mass, volume, count, pair and hour quantities can expose insufficient supply. | Bags, cartons, density conversions, mixed packs and ambiguous quantities remain unknown. Time quantity alone does not establish calendar availability. |
| Minimum order | Optional seller-confirmed minimum order passes through form, API validation and prepared immutable SQL storage; matching detects a comparable order below the minimum. | The isolated V2 schema must be prepared before enabling the field. No live migration was run. |
| Commercial subtotal checks | Explicit unit price multiplied by requested compatible quantity can expose a total-budget conflict. | No guessed currency, FX, bag size, pro-rating or delivered quote. A within-budget goods subtotal remains unconfirmed overall. |
| Targeted Maps handoff | A case plan may construct an encoded role-plus-location search link for manual investigation. | It does not execute a Maps search, extract listings, build a Maps-derived lead database or demonstrate demand. The handoff is in compiled plans, not a newly deployed seller UI. |
| Separate 98% pilot reviews | Offline review helpers assess opportunity precision and offer-level buyer finding independently, including lower confidence bounds and sample/unknown gates. | They do not verify supplied evidence, authorize release, or turn fixtures into pilot data. |
| Runtime asset preparation | Node API configuration explicitly includes the scenario assets used by the shared backend. | No cloud bundle or live deployment has been validated. |

The planner adds structured guidance to the existing model. It does not add a chain of unbounded model calls. Model-generated hypotheses still pass through existing source budgets, seller-offer binding, source controls and evidence checks. New case guidance is context, never independent evidence.

## The largest exposed gaps

Counts below describe how many designed cases use a mechanism carrying that requirement. They overlap and are not market prevalence, defect rates or independent observations.

| Requirement | Cases | What is still needed |
| --- | ---: | --- |
| Buyer job | 156 | An authenticated response confirming the actual use and full offer fit. The new guides only propose that use. |
| Authorization | 102 | Purpose- and action-specific authority; login and public business presence do not establish purchasing mandate. |
| Quantity units | 97 | Current checks handle explicit compatible units; packaging, tolerances and accepted measured lots need additional structure. |
| Procurement authority | 97 | Authorized decision unit, approval stage and procurement rules, distinct from a supplier-registration page. |
| Regulated eligibility | 83 | Category-specific verified requirements and review by appropriately authorized parties. |
| Compatibility | 77 | Exact parts, grades, mounts, materials and applications, with independent contrast-case evaluation. |
| Capacity | 71 | Real seller and receiving capacity for the actual date, load and duration. |
| Document provenance | 70 | Issuer/origin checks and uncertainty preserved across extraction, vision and model handoffs. |
| Project stage | 65 | Evidence that a project is at an authorized purchasing stage rather than simply announced. |

The Gaps tab covers all 38 requirements with explicit partial/unimplemented states and proposed work. None is labelled completely solved by this lab. Entity resolution is additionally challenged by T529–T530: several branches are not several independent buyers, and similarly named public/private organizations cannot inherit each other's permission or evidence.

## Source selection and access

The Sources tab records exact URL, retrieval reference, publication date where established, review date, scope and review depth. Research used retrieved search content; it was not a full audit of every report. Sector-level sources are attached as background. They do not validate every scenario's geography, local event, product demand or purchasing role.

The [Nigeria agriculture guide](https://www.trade.gov/country-commercial-guides/nigeria-agriculture-sector) supplies sector context. [IFC's Nigeria diagnostic](https://www.ifc.org/en/insights-reports/2025/nigeria-private-sector-diagnostic) is further background. [ITC's Africa Fashion and Textile Network](https://www.intracen.org/our-work/projects/africa-fashion-and-textile-network-africa-fan) and ILO apparel material inform the need to investigate actual sourcing and production relationships rather than a generic fashion audience. These are research inputs, not runtime government/public-institution prospect sources; the application's existing source/prospect exclusions remain in place.

[Google's Maps URL documentation](https://developers.google.com/maps/architecture/maps-url) supports keyless navigation links. It does not grant unrestricted listing extraction or reuse. Any future Places integration needs its own permitted use, attribution, retention, budget and implementation review under the [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) and applicable service terms. The [public Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) is not a basis for an unbounded bulk business-search service. No new paid provider or bulk map crawler was configured.

## What 98% would have to mean

**Opportunity precision:** independently adjudicated qualified opportunities divided by all returned qualified-opportunity predictions. Unknown labels remain visible. A precision score is not the probability that a seller gets a buyer.

**Offer-level buyer finding:** eligible matured seller offers receiving at least one independently adjudicated relevant, reachable, contact-permitted buyer within the predeclared window, divided by all eligible matured offers. The default existing evaluation window is 14 days. Unknown outcomes stay in the denominator; ineligible offers, pending offers and the all-submitted rate remain visible.

**Sales conversion:** separately observed completed purchases. It cannot be inferred from a relevant card, reply, introduction or inspected product.

The new review aids use an initial minimum of 200 labelled positive predictions or 200 matured eligible offers and require the corresponding 95% Wilson lower bound to reach the target. These are proposed pilot-review settings, not an industry guarantee. Even an observed 196/200 (98%) does not establish a lower bound of 98%. An all-successful synthetic fixture tests the formula only. Source rights, independent adjudication, registered eligibility and segment coverage still require human review; no review helper authorizes release.

**Current live precision and buyer-finding rates are unmeasured.** The lab provides no evidence of a move from 70% to 98%, a first-try buyer guarantee or a difference from V1's live rate.

## The next product slice

Build the specific-offer buyer response and introduction loop on top of the existing first-party request intake. An authorized buyer should accept or reject a particular saved offer revision, confirm use/specifications, quantity, budget basis, time and contact permission. Keep inspection, quotation, purchase and payment as distinct attributable outcomes. That creates evidence the current public-web system cannot reliably infer.

Where public demand is scarce, use a seller-approved demand form, authorized marketplace partner or consented market association as an additional demand route. Pooling small orders is useful only when members actually opt in and specifications, allocation, payment and cancellation rules match. None of these partners or buyer pools is assumed to exist today.

Start with registered pilots covering perishables, corporate apparel, inspected vehicles, specialized parts, services and wholesale. Freeze inclusion rules and thresholds before collecting outcomes; retain misses, abstentions, cost and time per offer, and report by category/geography. Use learning only after attributable outcomes and source/training rights are established. Re-ranking by clicks or seller optimism alone would teach the wrong target.

## Reproduce and continue

```sh
node scripts/build-scenario-lab.mjs
npm run quality
```

The compiler writes `artifacts/scenario-lab/scenario-lab.json` and `seller-cases.csv`. Canonical authored inputs live in `research/scenario-lab/`. The optional workbook exporter, `scripts/export-scenario-workbook.mjs`, requires the Codex primary artifact runtime and an output directory; it is not a production runtime dependency. Its workbook has Overview, Seller cases, Stress cases, Mechanisms, Gaps and Sources tabs.

Preserve V1 isolation. This work prepares V2 development only: no deployment, live migration, campaign, introduction, message, ad spend or purchase was executed.
