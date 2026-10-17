# Prospect relevance baseline — 18 October 2026

## Actual provider observation

One bounded live search requested 30 CEOs in software, New York, with LinkedIn as the selected source. The supplied Serper key returned 120 organic search rows over 12 requests, with 23 duplicate URLs. The initial pipeline emitted five records; later inspection found employer-parsing errors. After tightening extraction, three distinct cached records satisfy the implemented source-excerpt checks. This is a replay of the same live evidence, not independent verification of those people or a new live yield measurement.

A separate single source-restricted query returned HTTP 400: “Query pattern not allowed for free accounts.” The current key therefore cannot support that precise query. We must not claim that increasing request counts alone resolves relevance, or that a different provider is better before testing it.

A final fresh run after extraction fixes requested 30 using the free-compatible plain query mode. Eight requests returned 80 organic rows and only **2 qualifying unique prospects**, with a shortfall of 28. This confirms the requested-count issue is still open with this key/source combination; the controller reports the shortfall rather than filling it.

Exa Search is implemented as an optional adapter using finite free credits, no account purchase, no enrichment endpoints and no automatic provider fallback. It has not been live-tested or shown to improve yield. An owner-supplied free key and a benchmark are required.

## Local candidate changes

- Adaptive queries and pagination, same-profile evidence checks, exact employer corroboration, explicit shortfall reasons, bounded time and request limits.
- Shared government/public-sector exclusions at source and extracted-person stages.
- Award labels, guest quotations and role labels cannot masquerade as current employers.
- Source requests are claimed one at a time. Completed results survive later provider or budget failure.
- Chat calls the same discovery backend and returns actual research cards independently of generated prose. Results require a user action before joining Buyers.

## Acceptance gate

Evaluate real searches across professional and commerce use cases with permission and suitable provider access. Record: requested count, named unique matches returned, sampled role/industry/location correctness, private-sector eligibility, attributable source coverage, duplicates, current-role uncertainty, latency and provider spend. Measure buyer intent separately from audience fit. A requested count is a target, never permission to fabricate or silently broaden criteria.

Unit tests include synthetic 30-result completion and source failure cases. They establish controller behavior, not real-world precision, recall or market-leading performance. Until real evaluations pass, the prospect-count problem remains partially resolved.
