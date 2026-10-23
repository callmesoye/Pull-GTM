# Pull opportunity-to-action loop

Product proposal, 23 October 2026. This is a design for the next feature, not a claim that it has been implemented or validated with customers. It builds on the local product-led buyer research branch at commit `52a989e`.

## What lemlist evidence actually suggests

GetApp's September 2026 summary of 387 verified reviews says email marketing is cited by 82% of reviewers as a use case. G2 describes multichannel email and LinkedIn outreach as lemlist's most common use case and shows high reviewer scores for sending outbound email, personalizing email, and managing deliverability. These are review-based proxies, not lemlist's private feature telemetry or a representative census of all accounts. lemlist's own product describes prospect discovery, enrichment, intent signals, sequences, a unified inbox and deliverability. It already has AI agents and signals, so merely adding those labels does not distinguish Pull.

- https://www.getapp.com/marketing-software/a/lemlist/
- https://www.g2.com/products/lemlist/reviews
- https://www.lemlist.com/
- https://help.lemlist.com/en/articles/4452793-how-to-add-follow-up-emails-to-a-sequence

Our design inference: give sellers the useful routine of finding an opportunity, preparing a relevant message, following up and learning what worked. The differentiated part is the upstream work from an unusual seller product or geography to a checked buyer route, with visible evidence and measured outcome. This is a hypothesis to test, not an established competitive advantage.

## Customer task

A seller says: “I have this specific item or service, in this area, with these conditions. Help me discover plausible routes to buyers and get to a genuine conversation.” Pull should finish with an action the seller can take and a clear record of what is known. A source page is never silently converted into a person or a buying commitment.

For a C300 advertised in Lagos, possible routes include a public request naming the model and private-sector dealers accepting stock. A source discussing luxury vehicles is market context. The seller should see why each was returned, inspect the original, reject a bad match, and decide whether a permitted contact path exists. Pull should not infer anyone's wealth from lifestyle or identify a commenter based on social engagement.

## Five screens, one continuous job

| Step | Seller sees | System records | Release condition |
| --- | --- | --- | --- |
| Offer brief | Exact item or service, location, price range if supplied, condition, delivery constraints, acceptable buyer types | Versioned offer and research permission | Terms and geography validated; no invented specifications |
| Investigate | Distinct route hypotheses, source cards, cost/coverage and gaps | Run, query provenance, source date and excerpt | Current bounded research backend; original-page verification remains pending |
| Verify | Original URL, claim checklist, identity/role, need, location, recency, contact path | Seller verdict with timestamp, checked URL, evidence and unresolved fields | A seller click alone changes no source-asserted field to independently verified |
| Take action | Suggested channel and concise editable message grounded in the checked evidence; optional follow-up task | Approved draft, channel eligibility, scheduling and stop conditions | Existing sending adapter must recheck identity, suppression, consent and latest workspace revision |
| Learn | Reply category, meeting, transaction, rejected reason or no response; route and research cost | Outcome events with source and offer IDs | Genuine response comes from connected channel or seller attestation, separately labelled |

Keep **source**, **verified opportunity**, **named contact**, **message eligibility** and **sale** as different states. A dealer site can be a useful route without establishing a person. A current request can remain unverified. A real reply can be interested yet unable to meet price or delivery terms.

## Pull's useful difference

1. **Start with the seller's offer.** A merchant can describe a rare product and exact location. Pull generates different plausible buying routes before it demands an ideal-customer profile.
2. **Explain why a result exists.** Each opportunity shows its hypothesis, the observed source, supporting phrase, unknowns, requested geography and whether the original page was actually checked.
3. **Change route when evidence is weak.** A poor yield triggers a bounded alternative hypothesis, not invented buyers or silently broadened geography. Show cost and shortfall.
4. **Carry evidence into action.** Drafts may refer only to checked facts. Route-specific playbooks can ask for a dealer's stock-acquisition terms, respond to a genuine public request, or help the seller validate demand without unsolicited outreach.
5. **Learn from fit and responses.** Seller corrections and observed replies adjust route priority by product, locality and source type. Do not train from email opens alone or treat “no reply” as proof of disinterest.

For markets with sparse online records, add licensed local directories, published business contact paths and seller-supplied referrals as separately labelled adapters only after source permission and quality evaluation. Surface “research coverage low” when no such route exists. Avoid scraping gated groups, extracting private phone numbers or claiming a social comment proves affordability.

## First build slice

Build an **Opportunity Review** panel on the existing research cards. It should work even before automatic sending exists. For each source, let the seller mark `unreviewed`, `relevant route`, `not relevant`, `source unavailable` or `possible current request—needs checks`; capture a reason and last-checked date. Require opening the original link before marking it checked, but label the resulting verdict as **seller checked**, not system verified. Store feedback per authenticated owner, offer version, run and canonical source key. Keep an append-only event history so later route scoring can distinguish stale sources from wrong product matches. Never promote the source directly to Buyers or expose undisplayed URLs in the model payload.

The next slice can create an editable **Action Plan** from checked routes. The server should type the plan as `research task`, `manual enquiry`, `eligible connected message`, or `wait for information`. Generate personalized content from approved fields and checked evidence only. Before any connected send, reuse the current consent/suppression, account ownership, draft approval and duplicate-delivery guards. A follow-up requires a verified permitted channel and a stop-on-reply rule. Without those, offer a reminder or manual task. A unified inbox becomes valuable once channels genuinely synchronize inbound replies; do not show an empty imitation of one as a core feature.

## Data and service boundaries for implementation

- `offers`: owner, product/service, terms, location, version and declared constraints. Editing the offer creates a new version and invalidates mismatched research goal bindings.
- `opportunity_reviews`: owner, offer version, run ID, canonical source key, verdict, reason, checked URL, review time, reviewer; each change writes an audit event.
- `action_plans`: owner, source or verified opportunity, evidence references, channel, editable draft, next review time and eligibility. Creation never sends.
- `outcomes`: owner, source/opportunity/offer/action IDs, type (`unreachable`, `not_fit`, `reply`, `qualified_conversation`, `meeting`, `sale`), provenance (`channel_observed` or `seller_reported`), time and optional amount with currency. Sales cannot be inferred from a click or an AI answer.

Use tenant RLS and explicit write authorization; do not let source snippets control tool invocation or SQL. Retain original provenance and distinguish source assertions from user attestations. Bound comments and audit payloads, restrict the data exported to models, support deletion and define retention. Continue the repository's modular backend and existing workspace rather than creating a second outreach system.

## Product acceptance and measurement

Acceptance for the first slice: source feedback stays with its owner, duplicate/retried source cards do not create duplicate reviews, switching accounts does not display the old owner's verdict, and nothing is sent or added to a named buyer list. A stale or broken URL cannot be represented as independently checked. Meaningful tests should cover these state transitions and the existing security boundary.

In a staged pilot, compare matched real seller offers across several product types and Lagos/Abuja locations with the existing named-audience path and a manual researcher baseline. Label a sample of original pages independently. Measure useful route yield per offer, false positive rate of “possible request,” time to first seller-verified route, cost per qualified conversation and actual responses. Break metrics down by product type, location and evidence source. Treat conversion claims as unproven until this pilot has real outcomes. A later comparison with lemlist requires access and a matched cohort; review scores do not establish Pull's relative performance.

Suggested priority: opportunity review and explicit gaps first; evidence-bound draft and manual/connected next action second; observed replies and route-learning third. Deliverability infrastructure and a large contact database come only if the target customers' real workflow requires them and licensed, economical data is available.
