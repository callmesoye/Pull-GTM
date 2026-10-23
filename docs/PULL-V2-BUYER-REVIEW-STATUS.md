# V2 checkpoint — source observations, seller assessments and reported outcomes

23 October 2026. Implemented locally and prepared for isolated V2 staging. No live migration, external buyer contact, real-model research or production activation was performed.

## The usable path

After saving an offer, a seller can investigate it through the existing bounded search. When durable research and buyer reviews are enabled and the investigation was saved successfully, source cards expose **Review this request**. The server loads the source from that owner's completed, unexpired research snapshot and checks the offer version. The browser supplies IDs, answers and notes; it cannot supply trusted source content, verification booleans, ownership or a qualified-buyer tier.

The review screen records actor role, whether a request is open, product and location compatibility, terms, permitted contact and reachability. Every answer can remain unknown. Positive answers need a note describing what the seller checked. Saving appends a revision. A retry with the same request key returns the existing record; stale saves or key reuse with different data fail. Reviews are labelled **seller reported** and never become independently verified buyers.

For a saved assessment, sellers can report contact, a reply, lack of interest or a sale. These record events; they do not execute contact or verify transactions. Corrections append a new event referencing an earlier event for that same source. Earlier events and earlier assessment revisions remain in history. A correction is not an automatic replacement with new verified truth. The saved product's **Your reviews** button reopens the latest assessments without relying on the chat remaining in memory.

## Original-page observations

The approved page checker now extracts bounded, English-language cues from original page text:

- Explicit request language in the same statement as all exact product terms.
- Selling language, request closure and certain negations, with the relevant text retained.
- An explicitly stated product year that conflicts with the offer's year.
- A stated budget below a parseable asking price, only when currency agrees; ranges, flexible terms, ambiguous prices and cross-currency comparisons stay unresolved.

These are versioned source-text observations, not proof of authorship or intent. Unsupported language, long unpunctuated text, multiple paragraphs, complex specifications and uncertain dates can yield unknowns. No statements from unrelated sentences are combined to manufacture a request or budget. Source conflicts remain visible when the seller answers positively. The resulting assessment can say **source needs review** instead of presenting the seller's positive answers as an established match. Identity, current need, request date, full specifications, engagement rights and actual reachability still require qualification.

## Persistent boundaries

`database/buyer-reviews.sql` is additive V2 schema preparation, following this repository's SQL-file workflow. It requires `offer-versions.sql` and `research-runs.sql`. The Supabase CLI remains absent here; this is not a recorded deployment migration. The preparation was applied twice and exercised with actual SQL in isolated PGlite PostgreSQL. Before live enablement, register/review it in the target V2 migration workflow and verify grants/RLS in production-equivalent staging.

Both review and outcome tables permit authenticated owner reads under RLS; browser roles cannot insert, update or delete rows directly. Private routines validate the verified identity, resolve canonical research evidence and append only allowed records. They have empty search paths and explicit execution grants. Reviews copy the trusted source snapshot and its hash, bind the precise offer version and record server timestamps. The offer lock is shared with offer updates so a product change cannot race through a review save.

Research must be complete and within retention. Product changes require fresh matching research before further review or outcome writes. Expired research hides its review/outcome history through row policies. Save ceilings are 200 review revisions and 500 outcome reports per owner per rolling 24 hours; retrying an already accepted request consumes no extra insertion allowance. Retention deletion itself still depends on the project’s operational cleanup workflow.

## Setup

1. Use the separate V2 database and app described in `PULL-V2-ISOLATION.md`.
2. Provision the offer, research journal and buyer-review schema preparations there, including the existing research capability setup.
3. Enable `PULL_OFFERS_ENABLED`, `PULL_RESEARCH_DURABLE_ENABLED`, `PULL_BUYER_RESEARCH_ENABLED` and `PULL_BUYER_REVIEWS_ENABLED` for authorized V2 testers.
4. Original page observations additionally need the previously documented direct-source approval flag and exact host list. Manual seller review can still record unknowns when a page was not opened.
5. Exercise two real staging accounts, replay and stale-save cases, source retention, and desktop/mobile review forms before the pilot.

## Verification

The full local suite passes **463 tests**, plus application/server syntax checks. New coverage includes actual PostgreSQL and authenticated HTTP review/outcome writes, owner and anonymous isolation, canonical source lookup, stale versions, retry/key conflicts, immutable history, linked corrections, expired-source visibility, budget/year negative cases, escaped UI content, stable UI retry IDs and late response suppression after closing a dialog or switching accounts. Tests use synthetic offers, pages and provider responses. The earlier cloud-browser localhost connectivity limitation remains; this checkpoint has controller and renderer validation but no live visual/browser certification.

## What comes next

This creates an auditable qualification workflow and a place to collect real seller feedback. It does not close independent buyer verification or establish a buyer finding rate. Next build a trusted, consented buyer-response/partner-request adapter with explicit request attributes, authorship, freshness and engagement permission; adjudicate a real pilot separately from seller self-reports. Connect only those independently supported outcomes to evaluation. Category-specific attribute matching, multilingual source extraction, request-date verification, production monitoring, private-photo intake and measured acquisition economics remain open.
