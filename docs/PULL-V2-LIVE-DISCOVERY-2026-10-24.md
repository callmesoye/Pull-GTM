# PULL V2: live buyer-discovery research, 24 October 2026

## What was actually investigated

The 520 distinct authored seller cases now each have an individually attributed public-web search. A second pass executed 136 buyer-job queries generated from PULL's new feedback: cases with no accepted observation plus one representative per sector. The ten existing adversarial cases remain separate engineering challenge specifications, bringing the scenario library to 530; they are not ten verified transactions or ten end-to-end feature passes.

The seller inputs and their proposed buying triggers are hypothetical. The searches and recorded source retrievals are actual research operations. This work is an external public-web investigation assessed through PULL's source policy and observation code. It is **not** an end-to-end run of the configured PULL production provider or a live model/CRM/buyer-contact pilot.

The research record is `research/scenario-lab/live-2026-10-24/`:

- `manifest.json`: method, limits and counts.
- `cases.jsonl`: every actual query, time, retained source reference, machine observation, adaptive pass where executed, unresolved outcome and next investigation.
- `sources.jsonl`: deduplicated policy-admissible URLs with short captured excerpts, provenance and unknown current need. The index is a research source pool, not a list of qualified buyers.
- `reviews.json`: nine selected original-page content checks, including failures, plus three conditional commercial-bridge hypotheses.

| Research activity | Recorded result | What it does not mean |
| --- | ---: | --- |
| Initial case searches | 520 | 520 real sellers or successful buyer matches |
| Adaptive buyer-job searches | 136 | A randomized test of an intelligence improvement |
| Total attributed case searches | 656 | 656 buyers |
| Retained source occurrences | 3,270 | Every returned source was reviewed or relevant |
| Unique policy-admissible URLs | 2,794 | Verified ownership, private status, demand or contact permission |
| Excluded retained occurrences | 369 | 369 distinct websites; the count includes repeated occurrences |
| Cases with a first-pass machine observation | 428 | Independently established relevance or a current requirement |
| Zero-observation cases gaining an observation after refinement | 58 | 58 buyers, sales or causal performance gains |
| Independently confirmed buyers | 0 | Evidence that no buyers exist in those markets |
| Independent relevance precision and buyer-finding rate | Unmeasured | 98% performance |

At most the first five parsed source results per query were retained. Source snippets may be cached, stale, incomplete, geographically wrong or supplier advertising. Retrieval on 24 October does not establish publication on that date or an active buying requirement. Request publication dates were not established in this pass. Remaining misses and unknowns stay visible.

## What the real results exposed

### Yam: a buyer's required input can differ from the seller's product

The Ojuelegba search returned restaurant listings, including a [Chowdeck listing](https://chowdeck.com/store/surulere/restaurants/my-village-kitchen-yaba). Retrieved original-page content identified the restaurant but supplied no menu items. That is insufficient to establish fresh-yam use or an ingredient shortage.

A deeper search found [Ayoola's own yam-flour page](https://ayoolafoodsng.com/yam-flour/). It describes production involving yam cake obtained from local suppliers. This is a commercially meaningful sourcing route to investigate, while also exposing a mismatch: fresh tubers are not automatically the intermediate material the manufacturer accepts.

A possible path is seller-approved preparation or aggregation through a qualified partner, conditional on current buyer specifications, supplier intake, measured yield, minimum lot, capacity, food handling and viable delivered economics. No partner, open order, acceptance of this seller or profitable quote has been established. The system must keep that proposed bridge separate from the confirmed offer.

### Corporate shirts: a supplier search can keep finding competitors

The corporate-shirt case returned clothing suppliers and directories. Neither the first nor its executed buyer-job follow-up produced an accepted lexical observation under the recorded contract. This failed route is retained as a gap, not replaced with invented corporate buyers.

An authorized uniform brief could make existing shirts relevant, possibly with approved branding or alteration services. A shop directory such as the [Tejuosho site](https://tejuoshoshoppingcomplex.com/) supplies a reseller investigation route, not proof that listed traders currently need shirts. Size roster, fabric, colour, branding, quantity, budget, deadline, buyer authority and the seller's actual finishing capability still matter.

### C300: vehicle businesses are not automatically acquisition buyers

The exact-model case retrieved the [official Mercedes-Benz network page](https://www.mercedes-benz.com.ng/locate-us/). Published sales/service locations do not establish acquisition of a particular seller's vehicle, a relevant trade-in mandate, or an end buyer. The attempted Cars45 original-page check failed with a 405 response; no successful verification is claimed.

The automated exact-offer/role search remained weak for this case. The generated role phrase is cumbersome and exact model/year terms can miss legitimate intermediary language. That is an open semantic-routing problem. The controlled production flow can use seller-confirmed short exact terms and model-proposed specific dealer vocabulary, but this experiment does not prove those choices will find a buyer.

### A false request cue was a seller advertisement

The blackout-curtain case initially produced one apparent request-language cue. The captured text used a rhetorical product question alongside stock and ordering language. The original page could not be retrieved in the subsequent check (403). This is unverified supply advertising, not a demonstrated cinema buying request.

The observation code now recognizes additional retail supply phrases. Replaying the retained material after the change produced no possible-request cues in either recorded pass. That finding is restricted to these retained observations; it is not a claim that no current demand exists online.

## Implemented engineering changes

1. **A discovery feedback contract.** The existing reasoning/refinement path now receives the observed gap, specific buyer-job hypotheses, source references, suggested next queries and a provenance chain: seller offer → buyer job → business route → current need → commercial fit/contact. Unknowns are explicit. A hypothetical research offer is never marked seller-confirmed.
2. **Downstream route refinement.** Empty or supply-heavy results suggest investigating the product's downstream use or an authorized buying route. The recorded adaptive searches executed the first feedback-generated buyer-job query. Unexecuted suggestions remain labelled unexecuted. Product, location and overall research allowance remain fixed.
3. **More specific keyword support.** Generic words such as buyer, company, request or procurement manager cannot alone establish a useful product/role observation. This remains lexical screening, not semantic compatibility verification.
4. **Supply-copy detection.** Additional stock, ordering and shopping-cart language prevents rhetorical sales copy from being proposed as buying demand. The live S140 wording has a regression case.
5. **Better ordering within an evidence tier.** Unexcluded routes and sources explicitly stating the requested geography precede excluded supply/context material. These ordering rules are not probability scores.
6. **Original-check budget allocation.** When the first pass has no request cues and refinement remains available, one of the existing two original-page checks is preserved for refined findings. Initial request cues may still use both. The total cap stays two.
7. **Reasoning about conditional commercial bridges.** Model instructions require approval, actual partner capability and delivered economics before proposing input preparation, installation or pooled quantities. No saved-offer rewrite or execution is authorized by such a proposal. The three documented bridge examples are hypotheses, not deployed partner operations.
8. **Recorded research and a user-readable workbook.** The new exporter produces the 520 investigations, ten stress cases, selected original checks and source index. It separates research coverage from independent buyer outcomes.

`server/buyer-discovery-feedback.js` is wired into the actual initial/refinement tool results and model context. Saved journal replay and persistence failures refresh feedback so an exhausted allowance is not presented as available. No additional model round, source allowance, campaign sender, provider account or live deployment was activated.

## Validation and its practical limits

The full local suite passes **535 tests**, with no failures, skips, cancellations or todos, plus syntax and whitespace checks on Node 24.19.0. New tests exercise the actual production research-tool continuation from supply advertising to a downstream business source, quota preservation, ranking, generic-word rejection, rhetorical advertising and reserving an original check for refinement. The 520 research records have matching source references and explicit unknown outcomes.

The HTTP/model fixtures are synthetic tests informed by retrieved material. They do not establish live buyer performance. Public-web retrieval, original content review, schema correctness and source-policy admission are different layers; passing one does not silently satisfy the others.

Adaptive selection is nonrandom. The recovered-observation count cannot establish a causal gain or a 98% accuracy score. A single literal keyword can still be weak, especially for services, aliases, ambiguous geography, procurement authority and intermediary roles. Full semantic use-fit, request freshness, actual purchasing mandate and source rights need stronger verification. Maps remains a targeted optional navigation route; no Maps scrape or automated listing database was added.

Full raw pages are not redistributed. The published data retains short excerpts, citations, query provenance, machine observations and evidence fingerprints. Exact re-creation of old search rankings is not guaranteed; repeating a query later can return different results. The compiler can reassess actual captured receipts while they remain available, and the committed snapshot and tests preserve the documented findings.

## What would establish the product's goal

The next evidence-producing capability is an authorized response to a specific saved-offer revision: actual use/specification, quantity, budget basis, time, receiving ability and contact permission. Permissioned partner buying requests and seller-approved demand capture are additional routes when public requests are scarce. Existing first-party request intake is a foundation, not an already populated demand pool.

Measure independent recommendation relevance separately from the fraction of eligible offers receiving a reachable, permitted, qualified buyer within the registered window, and measure completed purchases separately again. Keep misses, unknowns, cost and time in the report. The 98% goal remains a target until those observations exist.

V2 development remains isolated from V1. No outreach, introduction, campaign, transaction, live migration or deployment was executed in this work.
