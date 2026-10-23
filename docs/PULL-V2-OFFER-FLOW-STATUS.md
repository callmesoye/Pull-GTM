# V2 implementation checkpoint — saved offers and original-page observations

Newer checkpoint: read `PULL-V2-BUYER-REVIEW-STATUS.md` for the implemented seller review/reporting layer.

23 October 2026. Implemented and locally tested; not deployed to a live V2 database or real source provider.

## What runs now

The Find buyers page can show a product confirmation form when the V2 offer feature is enabled. A seller submits product, selling location and optional price, condition, quantity and delivery details. Longer descriptions can supply a short exact model/product term in the extra-details section. The server validates the fields and saves an immutable offer version under the verified account. Successful request retries return the same version, stale updates fail, and previous versions are retained.

The seller chooses **Look for buyers** on a saved offer. Pull passes only its ID and version to the authenticated AI endpoint. The server retrieves that account's latest record, rejects a stale selection before spending AI credits, supplies seller-confirmed facts to the planning model, and binds product, location and exact terms server-side. Model arguments cannot replace them. The selected product is visible in the conversation and can be cleared. Account changes clear products, selection and pending responses. Existing chat and named-prospect workflows remain supported.

Optional original-page checks can open at most two approved sources across an investigation and its refinement. They record timestamp, content hash, whether exact terms occur, and whether the search excerpt is present in visible text. These checks do **not** independently establish authorship, current need, specification/price compatibility or contact permission and cannot promote a source to a qualified buyer. Sources whose product terms are absent get an explicit review warning.

## Files and setup

- `api/offers.js`, `server/offers.js` and `database/offer-versions.sql`: authenticated API, immutable versions, retry/version rules, ownership and daily save limit.
- `server/backend.js`, `server/ai.js`, `server/intelligence.js`: saved-offer resolution, model context, bound research and journaled source observations.
- `server/source-check.js`: exact host approval, pinned public IPv4 DNS, per-redirect approval, HTTPS only, timeout, response/content/byte limits; no credentials, cookies or platform bypass.
- `dist/offers-ui.js`, `dist/app.js`, `dist/agent-ai.js`, `dist/intelligence-ui.js`: seller form, saved list, selected product and observation display.

The candidate SQL follows the repository's existing additive SQL preparation convention. The Supabase CLI is not installed in this workspace; this file is not a recorded Supabase migration. It was applied twice and exercised in local PGlite PostgreSQL tests. Before live enablement, review/register the migration using the target V2 project's migration workflow, inspect grants and RLS in the production-equivalent environment, and exercise two real test accounts there.

1. Use the dedicated V2 infrastructure described in `PULL-V2-ISOLATION.md`.
2. Provision `database/offer-versions.sql` only in the V2 database, then enable `PULL_OFFERS_ENABLED=true`.
3. Configure an actual search provider and enable `PULL_BUYER_RESEARCH_ENABLED=true` for the pilot. Source usage still follows existing quotas.
4. Keep `PULL_SOURCE_CHECK_ENABLED=false` until direct-access rights for specific sources have been reviewed. List approved **exact hosts** in `PULL_SOURCE_CHECK_HOSTS` and only then enable the checker. No wildcard or social/Jiji/government/institutional host is accepted. An allowed host is an operator assertion of access rights, not evidence that permission was obtained. Support is deliberately limited to public IPv4 sites returning bounded, uncompressed HTML/plain text.
5. For durable research, provision the existing journal schema/capability and enable its flag. Original-page observations are included in checkpoints; without durable mode they are response-only.

## Verification and limitations

The full local suite passes **447 tests**, including isolated PostgreSQL ownership/anonymous-role checks, immutable versions, stale/retry behavior, real HTTP handler → model tool → bound search with controlled fixtures, cross-account UI response races, source DNS/redirect protections and two-page cap. Application/server syntax checks also pass. Provider/model responses in these tests are synthetic; there was no live buyer search, real AI inference, message sending or campaign spend.

A local synthetic UI preview was prepared. The available cloud browser could not reach the workspace's localhost server, so visual browser verification was blocked. Controller/renderer tests passed; desktop/mobile visual checks remain a staging gate.

## Next concrete work

Build source-specific semantic verification and buyer qualification with independent annotations: original request author/role, request date/closure, hard product/price/fulfillment terms, reachability and engagement permission. Add persistent reviewer decisions and observed outcomes rather than trusting browser-supplied verification booleans. Then run real consented seller offers through isolated V2 staging and measure buyer finding and cost. Private photo/vision intake, buyer request acquisition, campaigns and outcome learning remain later slices.
