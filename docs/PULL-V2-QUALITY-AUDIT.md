# Pull GTM V2 engineering and product quality audit

23 October 2026. Repository-based assessment and implemented fixes. This is not an Apple assessment, certification or a measured buyer finding claim.

## Verdict

V2 is a tested development alpha. Several important backend controls exist and have meaningful local tests. The complete buyer acquisition proposition is not yet proven with live users, independently qualified buyers or production operations. It is premature to call the product production ready or award an overall quality percentage.

The standard for this work is a simple seller experience backed by inspectable evidence, predictable behavior, recoverable failures and measured outcomes. Apple's public [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [progress indicator](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) guidance informs the interaction criteria. The engineering gates below are our own; they do not describe Apple's internal development process.

## Measured and inspectable gates

| Area | Current evidence | Assessment and remaining acceptance gate |
| --- | --- | --- |
| Core seller journey | Saved offer → bounded research → page observations → persistent seller assessment and reported outcomes exists; controller and database tests exercise it | Partial. Research still moves into the AI workspace. Validate a continuous offer-centered journey with sellers, including clear empty, partial, interrupted and completed states. Photo intake remains unimplemented. |
| Evidence attribution | New 28-case synthetic corpus spans cars, services and wholesale, including unrelated paragraphs, multiple requests, selling posts, closure, ambiguous currency and unsupported language | Improved locally. Original text is not author identity or confirmed need. Require attributable, dated request records and independently checked buyer responses before promotion to verified demand. |
| Account and write integrity | Owner/anonymous isolation, immutable offer/review revisions, canonical source lookup, stale-write rejection, retry keys and actual SQL execution have tests | Locally verified. Run the same boundaries with two authenticated users in isolated, production-equivalent V2 staging. No production database result is claimed. |
| Cost and recovery | Search reservations, per-run caps, durable journal, replay and uncertain-request handling are tested with fixtures | Partial. Inject live provider timeouts and worker interruption in staging; verify spend reservations and recovery without duplicate billable work. Measure costs per investigated offer and independently qualified buyer. |
| Interaction and accessibility | Busy offer fields now lock together; outcome drafts survive an assessment refresh; named groups, labels and note requirements are rendered and tested | Partial. Browser, keyboard, screen reader, zoom and narrow-screen verification remain unperformed for this batch. The available cloud browser could not reach workspace localhost. |
| Maintainability | Shared boundary modules and separate assessment/page/review renderers exist; full local regression runner exists | Partial. The large application controller still mixes routes, state and features. Extract feature controllers incrementally with behavior tests, rather than undertaking an unbounded rewrite. |
| Performance | Source/time/request limits exist; verification report records test execution duration and runtime | Live latency and capacity unmeasured. Establish p50/p95 latency, error rate, concurrent research capacity and per-offer cost under a declared staging workload before publishing SLOs. Test-run duration is not product latency. |
| Operations | V1 deployment guards and opt-in V2 flags exist | Incomplete. Dedicated V2 infrastructure, reviewed migrations, cleanup scheduling, redacted monitoring, incident ownership and a demonstrated backup/restore/rollback procedure are still required. |
| Business result | Evaluation code distinguishes opportunity precision, offer-level buyer finding, unknowns and confidence bounds | Unmeasured. Run a predeclared, independently adjudicated pilot across product categories and geographies; preserve all submitted offers and unknowns in reporting. Seller reports alone are not ground truth. |

## Changes implemented in this audit

1. Preserve HTML block boundaries and plain-text line boundaries during original-page extraction. A request in one card can no longer borrow a product or budget from a neighboring block through whitespace flattening.
2. Add version 2 source observations with explicit unverified attribution and an ambiguous-page state. Multiple relevant requests, or separate relevant request/seller/closure statements, withhold a single request quote and budget comparison. Positive seller answers cannot override this ambiguity.
3. Leave bare dollar currencies and malformed monetary values unresolved. Treat minimum/range/flexible budgets conservatively. Extend basic English negation observations. These are bounded observations, not semantic understanding of arbitrary web pages.
4. Show attribution uncertainty in findings and review screens. Keep uncertain answers available and explain the positive-assessment note requirement before submission.
5. Lock the complete offer form while saving and preserve a pending outcome note and selection across assessment refreshes. Account changes still discard private in-memory drafts.
6. Add `npm run quality`, which records syntax, full-suite and tracked whitespace results, timestamps, Node version, revision, dirty state and test totals. Missing/incomplete summaries, failures, skips, cancellations and todo tests prevent a local pass. Provider, buyer, visual and production evidence remain explicitly unassessed. GitHub Actions now requests Node 22 and 24 runs and prints the JSON report into its logs; a configured workflow is not evidence of a successful remote run.

## Reproduce

In a clean checkout:

```sh
npm ci --ignore-scripts
npm run quality
```

Local evidence is written to `artifacts/quality/report.json` with individual logs alongside it. The directory is ignored by git. A report from a dirty working tree describes uncommitted work and must not be treated as verification of only the recorded HEAD. Run again after committing for a clean revision record. The report never reads or includes application credentials. It performs no live provider call, migration, outreach or deployment.

This audit's completed local run passed **495 tests**, with zero failures, skips, cancellations or todo tests, plus syntax and whitespace checks on Node 24.19.0. All new source cases are synthetic. The number of regression cases is not an accuracy percentage or evidence that a buyer exists.

## Release decision

Continue V2 development and isolated staging preparation. Keep V1 separate. Public reliability, security and buyer performance claims require the outstanding staging, accessibility, operational and independent-outcome evidence above. The next core capability remains a consented buyer-response or attributable partner-request adapter; it must preserve actor identity, freshness, product terms and engagement permission through qualification and evaluation.

## Later checkpoint: 530-case scenario lab

On 23 October 2026 the expanded local suite passed **527 tests**, with zero failures, skips, cancellations or todos, plus syntax and whitespace checks on Node 24.19.0. This checkpoint adds scenario-plan validation across 520 authored hypothetical offers, unit/quantity/price-basis adversarial cases, minimum-order persistence through the authenticated API and actual isolated PostgreSQL, bounded hypothetical AI guidance, runtime-asset configuration coverage, and distinct statistical review helpers for precision and offer-level buyer finding.

The workbook's six sheets were rendered and inspected, its five data tables and row counts checked, and its summary formulas recalculated without detected spreadsheet errors. Spreadsheet QA is not application browser QA. The ten stress cases remain challenge specifications; the suite does not claim all ten underlying capabilities are implemented end to end.

See `docs/PULL-V2-530-SCENARIO-LAB.md` and `research/scenario-lab/README.md` for sources, implementation limits and reproduction. No real buyer outcomes, provider calls, migration, deployment or outreach were used in this checkpoint. Cloud bundling, live provider behavior, independent pilot evidence and the broader production gaps above remain unassessed.
