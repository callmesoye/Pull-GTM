# PULL Product Learning: feedback release gates
Status: candidate code on feat/product-feedback-admin-review, based on feat/product-learning-loop.
Updated 22 October 2026. No production migration, telemetry collection, or release is authorized by this document.

## Included
- POST /api/product-feedback: signed-in, origin-checked, category/message validated; up to five submissions per user per UTC day. Database uniqueness on (user_id, feedback_day, slot) handles concurrent/direct PostgREST writes. Id, day and timestamps are server assigned. Races are reported as retryable conflicts, never as success.
- Support view: signed-in feedback form, preserves retryable drafts, clears when accounts change.
- GET /api/product-admin: verified staff (owner/analyst) only, latest 40 feedback records and counts over that bounded sample, not all-time totals. No user email or API tokens.
- Product-insights UI at #admin. Direct URL access is not permission; the backend and RLS enforce roles. Ordinary navigation does not advertise the staff page.
- Existing categorical PostHog event adapter remains unconnected to frontend; no hidden analytics was added.

## Deployment requirements
1. Inspect and apply database/product-feedback.sql only to the intended PULL Supabase project with owner approval. It adds two tables and RLS/grants; GitHub commits alone do not modify production.
2. Provision the staff role only from the verified owner's actual auth.users UUID through a database administrator. Never infer privileges from email or editable user metadata.
3. Execute two-account + anonymous + staff database tests in an isolated/rollback environment. Check select/insert/update/delete denial and allowance, fifth/sixth submissions, concurrent duplicate slots and read isolation. The current unit tests and static SQL checks do not certify RLS.
4. Confirm exposed schemas and column grants, inspect Supabase security advisors and relevant indexes, and verify failure handling.
5. Establish a privacy/retention/deletion process before launch; no retention duration is yet implemented or promised. Do not automatically upload prospect records to feedback analytics.
6. Run npm run check and npm test, then test the preview Support form, failure recovery, account switching, staff authorization and denial.
7. Keep event capture disabled until privacy/analytics consent decisions are approved. Do not claim PostHog data is already present.
8. Reconcile this child branch with feat/product-learning-loop and main plus active research PR before promoting a reviewed production build. Apply database migration first, then API/UI, and verify in production.
9. Record verified dates, deployed commit and rollback evidence after acceptance.

## Product metrics
Staff category counts are over a maximum 40 recent feedback entries only; they are not total feedback volume, user adoption or automatic-learning metrics. Prefer trends in reported product friction, documented resolutions and eventually successful acquisition outcomes.

## References
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://api-security.owasp.org/editions/2023/en/0x00-header/
- https://www.iso.org/standard/27001
