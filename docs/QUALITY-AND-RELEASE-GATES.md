# PULL quality baseline and release hold

Updated 15 October 2026. Engineering plan and evidence record, not a certification or declaration of conformity.

## Release authorization

On 15 October 2026, the owner authorized publishing the reviewed backend updates to the existing GitHub, Vercel and Supabase targets. Preserve existing files and saved data. Release authorization does not establish that every planned integration is implemented or verified.

## Standards used to organize the work

Verified against ISO's public catalogue descriptions:

- [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html): software/ICT product quality model, applicable to specifying, measuring and evaluating quality.
- [ISO/IEC 27001:2022](https://www.iso.org/standard/27001): requirements for an organizational information security management system; ISO lists an amendment with this edition.
- [ISO/IEC 42001:2023](https://www.iso.org/standard/81230.html): requirements for an organizational AI management system.

The engineering gates below are PULL-specific acceptance criteria informed by those scopes. They are not a clause-by-clause interpretation of the full licensed standards. Organizational responsibilities, risk management, operational evidence, internal review and any independent certification assessment remain separate work.

## Current discovery/import batch

| Gate | Required behavior | Evidence and limit |
| --- | --- | --- |
| Functional consistency | Native records, imports, automations and agent access share eligibility and suppression rules | Shared engine/policy/lifecycle modules, regression tests, identical edge copies |
| Relevant output | Preserve mandatory audience/location/source criteria; never fill a requested count with unrelated or invented records | Count-driven retrieval tests with noisy, paginated, duplicate and incomplete provider fixtures; real-user relevance benchmark still pending |
| Count transparency | Retrieve toward the requested count, stop further requests once met, explain any genuine shortfall | Structured target/progress fields and browser rendering tests; provider credit/request ceilings remain enforced |
| Identity integrity | Distinct people sharing a name or business contact must not silently merge | Profile, email, company, URL query/case, stable-ID and conflict regressions |
| Evidence integrity | Preserve original source details; imports cannot award their own private-sector approval | Import sanitization, common review editor, field conflict evidence and provenance tests |
| Contact safety | Explicit do-not-contact survives replacement/clear/rediscovery; a shared-inbox match cannot spread to unrelated person identifiers | Local browser replacement test, backend tests, isolated database migration and rollback tests |
| Review validity | Material edits invalidate old approval and prepared state while keeping draft text | Lifecycle/backend tests plus actual local-browser edit/shortlist test |
| Account isolation | One owner's identity, saved data and contact history cannot leak into another account | Backend/MCP fixtures, account-switch tests and two-account RLS checks in an isolated database |
| Recovery/concurrency | Stale saves cannot overwrite newer data; failed migrations and verification fixtures roll back | Revision-CAS tests, repeated migration equality test, SQL rollback assertions |
| Failure handling | Preserve partial results and distinguish provider failure, quota, missing setup and insufficient evidence | Discovery/backend fixtures; production provider verification remains pending for this batch |
| Maintainability | Shared engines remain synchronized; all modified application/server JavaScript parses | Automated equality and syntax checks; no runtime package dependencies added |

## Verified local UI sequence

On `http://127.0.0.1:4174/#prospects`, using a clearly synthetic CSV fixture with `.test` evidence/contact domains:

1. Imported a named record through alternate column headers without requiring an employer size, signal or signal date.
2. Set audience rules and opened the imported record's identity/contact repair form.
3. Saved an owner's private-sector review and added the eligible record to the shortlist.
4. Changed the employer and saved; the old shortlist approval was removed and a fresh decision was required.
5. Applied do-not-contact, replaced the entire CSV, and confirmed that the newly imported row remained excluded and had no outreach controls.

This validates interface behavior using fixtures. It does not establish the fixture's business facts or prove a live prospect search.

## Database verification boundary

`database/contact-safety.sql` and `database/verify-contact-safety-rollback.sql` were executed in an isolated PGlite 0.5.10 database with representative Supabase auth roles/functions. The migration, repeated-application idempotence, two-account isolation, shared-inbox provenance, contact-change handling and rollback assertions passed. PGlite was installed only in a temporary verification directory, with an exact version and installation scripts disabled; it is not a PULL application dependency.

The migration has not been applied to production. Isolated execution does not certify production configuration, privileges, backups or the exact deployed database version. The SQL URL-key derivation deliberately handles a conservative subset; the shared application layer handles Unicode normalization and identity-bearing generic URL queries.

## Open gates before a complete discovery release

- Real-source evaluation against manually reviewed target scenarios, including regional and naming variation.
- Goal/type-aware business and opportunity retrieval beyond the current named-person discovery path.
- Authorized missing-field enrichment and verified per-source capabilities/retention rules.
- More flexible CSV mapping, delimiter/error repair and explicit append/merge choices.
- Persisted resumable research runs, idempotent provider requests and source-permitted caching.
- Production-equivalent preview verification with configured authentication and provider access, including mobile/accessibility checks.
- Review of secrets, operational monitoring, backup/restore, incident procedures and release rollback appropriate to the final deployment.

No feature is described as a verified live integration merely because code, a source recommendation, or a configuration field exists.
