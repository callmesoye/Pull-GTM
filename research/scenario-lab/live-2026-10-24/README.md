# Live discovery record: 24 October 2026

520 actual individually attributed public-web searches against hypothetical seller cases, followed by 136 feedback-generated buyer-job searches. See `manifest.json` for method and counts, `cases.jsonl` for every investigated offer, `sources.jsonl` for short source records, and `reviews.json` for selected original-content checks and conditional commercial hypotheses.

This is an external research-tool retrieval exercise assessed by PULL's real source policy and observation functions. It is not an end-to-end production-provider/model test or a verified buyer dataset. No independent relevance labels or buyer outcomes exist in these records. Search results, source-policy admission and lexical observations cannot be used as truth labels or train automatic buyer qualification.

Source IDs join observations to deduplicated URLs. Backend IDs and fingerprints preserve the observed-assessment linkage. At most 24 captured words per canonical source record are published, including its shortened title; full raw pages are not redistributed. Publication dates and present need remain unknown. Separate original-page checks may identify an established business activity, a mismatch or a fetch failure without proving a current order.

The exact recorded S428 first query used the earlier erroneous cold-storage wording. Its offer label is corrected to off-season gear storage. The first query is not silently rewritten or claimed to have been rerun.

While captured receipts are available, reassess them using:

```sh
node scripts/compile-live-discovery.mjs FIRST_RECEIPT_DIRECTORY research/scenario-lab/live-2026-10-24 ADAPTIVE_RECEIPT_DIRECTORY
```

The receipt directories contain actual tool captures, not generated fake responses. The published snapshot can be inspected and schema-checked independently; live search rankings and exact old raw excerpts are not guaranteed reproducible later. `scripts/live-discovery-protocol.mjs` reconstructs the initial query design; it performs no network requests. The optional workbook exporter requires the Codex primary artifact runtime.

See `docs/PULL-V2-LIVE-DISCOVERY-2026-10-24.md` for findings, implemented changes, limits and validation.
