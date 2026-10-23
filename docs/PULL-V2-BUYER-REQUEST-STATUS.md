# V2 checkpoint: attributable buying requests and qualification

23 October 2026. Implemented in the separate V2 branch and verified locally. The schema is preparation for isolated staging; it has not been applied to a live database. No buyers were recruited, no provider/model was called and no outreach was performed.

## Working path

The saved-offer panel can expose **What I want to buy** when buying requests are enabled. A signed-in user can save a product, service or wholesale buying need, location, optional budget and buying requirements, and a validity period of 1–30 days. Discovery and contact consent default to false and are separate choices. Sharing makes the stated buying details visible to matching signed-in sellers; the interface explains this before the choice. Account email and account ID are not returned in matching results. Email confirmation is read from the authenticated account's database record, not user-editable metadata.

The buyer can edit, close or withdraw a request. Each change has a current-state row and an immutable revision. Stable retry keys prevent duplicate revisions; changed keys/data or stale edits are rejected. Replaying an accepted save after a later update returns the latest canonical state. A dedicated **Close request** operation derives its payload on the server, stops discovery, clears contact consent and remains available beyond the ordinary daily save threshold and after email confirmation changes. Repeated closure creates no additional revision when already withdrawn.

From a saved offer, **Check buying requests** opens a product-specific workspace without entering chat or calling an LLM. The seller must confirm whether the offer is a product, service or wholesale offer; existing offers without that field need an updated saved version. The database rechecks the current offer revision and returns only another account's open, unexpired, discoverable requests from currently confirmed-email accounts, with the same request type and literal product terms. Private, closed, expired, self-owned and differently typed requests stay out. Each pass returns at most 100 recent candidate requests and indicates when more exist. Ordinary web research remains available when the pool is empty; no substitute buyer cards are generated.

## Qualification boundary

`server/request-qualification.js` keeps conclusions inspectable:

- Required product words are distinguished from full product/service suitability. Full scope always remains unresolved in this slice.
- Buyer and seller offer type must agree. A repair service request cannot be returned as a goods purchase solely because both mention C300.
- Identical stated locations can match; different location text remains unresolved because fulfilment, geography and delivery compatibility are not established by string comparison.
- An explicit asking price over an explicit same-currency total budget is a conflict to review. Prices within a stated ceiling remain unresolved until quantity and quote basis are confirmed. Per-unit and cross-currency comparisons remain unknown; bare dollar prices are not assigned a currency.
- Matching stated attributes are retained; different stated model/year values are flagged for review. Other missing or differently worded requirements stay unresolved.
- Request provenance, revision, expiry, permission snapshot, conflicts and unknowns accompany the result. Every result remains `buyerConfirmed: false`.

The original-source research adapter now also attaches source qualification metadata after its bounded page-check pass. Original-page observations remain `source_asserted`; first-party requests remain `buyer_submitted`. Neither can promote itself to independently verified buyer demand. These labels never enter the independent evaluation dataset or raise the Results page's qualified conversation count.

Confirmed account email establishes control of that account email. It does not establish legal identity, buying authority, affordability, request truth, reachability or interest in this particular seller's offer. There is still no populated ready-buyer database. External discovery remains essential; this first-party intake is an additional path for attributable requests, not a claim that external partner feeds are connected.

## API and storage

`/api/buyer-requests` uses the existing verified session, account header, same-origin POST and no-store response protections:

| Method/action | Behavior |
| --- | --- |
| GET | Owner's 100 most recently updated requests |
| POST `save` | `requestId`, `expectedRevision`, `requestKey`, validated `payload` |
| POST `withdraw` | `requestId`, `expectedRevision`, `requestKey`; canonical closure without client-supplied source or payload |
| POST `match` | Current `offerId` and `offerVersion`; server resolves the offer and request records |

Public tables have owner-only SELECT under RLS and no browser-role INSERT/UPDATE/DELETE. Cross-account discovery is available only through a constrained function that checks consent, validity, offer ownership/type and limits, and omits buyer account identifiers. Private security-definer routines have empty search paths, explicit grants/revokes and auth/ownership checks. Public wrappers use security invoker. Normal saves use a 50-revision rolling-day threshold, with canonical withdrawal exempt; matching is limited to 200 passes per owner per UTC day. No paid search or AI quota is consumed by this first-party lookup.

## Isolated staging setup

1. Preserve V1 and use the separate V2 environment and database in `PULL-V2-ISOLATION.md`.
2. Review/register the updated `database/offer-versions.sql` function preparation (adds optional validated offer category) and new `database/buyer-requests.sql`. Register the changes through the target migration workflow, apply to V2 staging, run advisors and verify actual grants/RLS there. The Supabase CLI is absent here; no deployment migration history or live advisors result is claimed.
3. Enable `PULL_OFFERS_ENABLED=true` and `PULL_BUYER_REQUESTS_ENABLED=true` for authorized staging testers. No AI/search key is needed for buyer intake or first-party matching. Web research retains its own configuration and budgets.
4. Use separate buyer and seller accounts, confirm buyer email, create a request, explicitly share it, and match a current saved offer of the same type. Check private/expired/closed cases, withdrawals, retry behavior, stale versions and account switching.
5. Verify desktop/mobile rendering, keyboard and assistive technology behavior in a reachable staging browser before exposing to a pilot.

The backend compares current records on every match. Existing displayed results are snapshots; permissions and validity must be revalidated at the time of any future introduction. There is no messaging/intro action in this slice, so a stored contact flag is not an authorization to use external outreach integrations.

## Verification and remaining work

`npm run quality` passes **516 tests**, plus syntax and tracked whitespace checks, on local Node 24.19.0. New tests execute actual SQL twice in isolated PGlite PostgreSQL and exercise authenticated HTTP requests, JSON/null rejection, email confirmation, canonical attribution, RLS, ownership, stale versions, idempotency, consent withdrawal, quotas, 100-candidate truncation, categories, punctuation/Unicode, service/wholesale cases and the connected app flow. Controller/renderer tests cover private defaults, form values, stable retries, duplicate submission, preserved edits, account switching, late response suppression and empty results. These fixtures are synthetic; browser visual verification and production behavior remain unassessed.

Next extend this layer with seller-approved in-Pull introductions and authenticated responses to a specific offer, attributable permitted partner feeds, semantic product-scope qualification, normalized geography/units, operational retention cleanup and independent pilot adjudication. Do not equate the existence of a request registry with proven acquisition performance. No live buyer finding rate, conversion or sale was measured.
