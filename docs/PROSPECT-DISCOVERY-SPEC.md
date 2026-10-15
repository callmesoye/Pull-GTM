# PULL prospect discovery: implementation specification

Status: design and local source audit, 15 October 2026. This document does not certify production configuration or a live connector. No application code, credentials, database migrations, or deployments were changed for this specification.

## Product outcome

A person describes a commercial goal or supplies a file. PULL returns relevant private-sector people, businesses, or evidenced opportunities, explains their fit, preserves their sources, and offers contact paths actually supported by the evidence. The maximum requested count is a ceiling, never a promise to manufacture that many records.

The current approved interface remains the starting point. Advanced requirements should appear progressively, with terminology suited to the user's task.

## Observed foundation and gaps

- `server/discovery.js` implements Serper and Brave adapters, bounded provider calls, basic private-sector screening, relevance assessment, deduplication, and partial-result handling. Results are derived from search titles, subtitles, and snippets; there is no general permitted-page enrichment stage.
- `discoveryInput` accepts only audience, industry, location, source, and limit. It cannot represent target kind, excluded companies, named employer/branch, a geographic radius, mandatory versus optional criteria, or evidence requirements.
- Final prospect selection requires a parsed person and every requested relevance dimension in an excerpt. Useful business-only records and people whose excerpt omits a field cannot graduate through a separate evidence-resolution stage.
- The parser uses role/name patterns. Its name rules require two to five space-separated tokens, which cannot represent every valid naming convention.
- Source matching uses URL substring matching. It needs parsed hostname and path checks before being used as an enforced source boundary.
- Commercial industry language is used as one private-sector signal. Commercial language or a company suffix alone cannot prove private ownership. Ambiguous entities need separate verification or exclusion.
- Native search and imported data have different eligibility checks. `qualify` requires a private-sector review only for discovery records. Both ingestion paths need the same policy.
- Local in-memory audit probes confirmed that an imported public-institution fixture can currently receive `fit`; the same profile may survive twice when only one row has an email; and distinct names sharing one email can merge without an identity conflict. These are regression targets, not live prospect records.
- The UI drops the returned private-sector basis when normalizing a discovery. Imported records lack the complete repair editor, and export/reimport does not preserve the complete evidence/review contract.
- Current shortlist/draft state can survive material prospect changes. Replacing a list can also discard do-not-contact decisions that were not present in the new file. Approval validity and suppression need independent, durable handling.
- Search relevance and workspace qualification use different matching rules. A search match can become a review/exclusion downstream for inconsistent reasons.
- CSV supports aliases, partial contacts, search-target rows, deduplication, and spreadsheet-formula protection on export. It does not provide a general column-mapping and row-repair workflow.
- The database currently stores a workspace JSON payload per owner. Search runs, field evidence, import batches, and entity relationships need explicit persistence if they must support resumable research and reliable audit history.
- The API reserves the configured maximum provider-request allowance before searching. Local SQL currently allows 100 provider requests per owner and 500 per project per UTC day. Some deployment documentation still describes older limits; live state must be read before a release.

## 1. Define the target and success criteria

Represent at least three target kinds: person, business, and opportunity. A named contact can belong to a business; an opportunity can be a public demand statement or a private-sector vacancy, with a source and date when stated. These are related objects, not interchangeable identities.

Capture what the user offers, who would benefit, desired role/business type, industry, geography, named company or branch where relevant, exclusions, preferred channels, desired maximum count, and hard versus preferred criteria. Collect only the fields needed for the chosen task. A person buying produce does not need an employer-size filter.

Acceptance: the user can inspect the interpreted goal before research. Search does not silently change the target, required region, or source restriction. A profession, demographic, or job title is not labelled buying intent.

## 2. Establish a source capability registry

For every implemented source, record the approved access mechanism, source/entity scope, supported searches, returned fields, freshness, contact capabilities, storage restrictions, provider limits, and connection state. Distinguish research candidate, implemented adapter, and verified live connection.

Only use private-sector targets and sources. Exclude government websites, public institutions, regulatory/statutory registries, and uncertain ownership. A private platform with mixed entities still requires entity-level checks. Account linking does not establish unrestricted access to a platform's users or a buyer database.

Acceptance: the planner cannot select a source that lacks permission or the required capability. A marketplace seller result cannot satisfy a buyer-intent search merely because the product matches.

## 3. Build a structured search planner

Translate the goal into a versioned search plan. Expand equivalent roles while preserving intent; distinguish alternative roles from mandatory combinations; distinguish where someone works from places mentioned in education or past employment. Add source restrictions to outgoing queries where supported and enforce them again on returned URLs using parsed hosts and paths.

Choose source order, query variants, pagination, time budget, and credit budget from the task. Retrieve a bounded candidate pool larger than the desired final list when permitted and affordable. Stop when enough qualified matches are found or a declared budget is reached. Present optional expansion choices when supply is insufficient.

Acceptance: equivalent role wording improves recall without accepting the wrong role. A source restriction, named company, or mandatory city is never relaxed automatically. Repeated plans do not issue duplicate provider calls unnecessarily.

## 4. Retrieve and resolve missing evidence

Keep the existing provider adapters behind a common interface. Normalize successful replies, provider failures, pagination, request accounting, and cancellation. Preserve valid partial results.

When an excerpt is insufficient, resolve the specific missing field using authorized APIs or permitted original business pages. Before adding page retrieval, implement allowed-source checks, robots/terms review as applicable, private-network and redirect protection, time/body limits, and untrusted-content handling. Do not bypass logins or access restrictions. Model-assisted extraction may propose a field only with its supporting excerpt; application code validates the result.

Acceptance: missing evidence means unresolved, rather than guessed or immediately irrelevant. A blocked/unavailable page produces a visible limitation. Provider content never becomes executable instructions.

## 5. Introduce one canonical record and evidence contract

Proposed logical records:

- Search run: owner/workspace, goal and plan version, state, start/end times, provider requests, budget, counts, and failure codes.
- Entity: stable ID, person/business/opportunity kind, displayed identity, related employer/business, and reviewed state.
- Field evidence: entity, field, source URL/type, supporting excerpt, retrieved time, source-stated publication time where present, and verification method.
- Contact path: actual channel/address/URL, associated entity, evidence, availability, and suppression state.
- Import batch/row: original mapped values, transformation history, row errors, and matched entity.
- Search match: entity and run, criteria matched/missing/conflicting, explanation, and ranking version.

These are logical boundaries, not a requirement to create every table immediately. Add migrations incrementally without losing current saved workspaces. Keep retrieval timestamps distinct from the date a need or event was stated.

Acceptance: a supplied name, a search-asserted role, a verified employer, and an unknown location can coexist without falsely marking the whole record verified. Browser forms, AI mode, CSV, and MCP use the same validated backend contract.

## 6. Separate eligibility, fit, intent, and reachability

Eligibility enforces private-sector scope, sufficient identity, exclusions, and mandatory task criteria. Fit measures supported alignment with the user goal. Intent describes an evidenced need, not a role-based assumption. Reachability describes a supported contact path, not permission to send.

Use transparent criterion-level results: matched, unknown, conflicting, or failed. Rank eligible matches using evidence quality, fit, freshness, and contact usefulness. Do not turn keyword counts into a probability of purchasing. General prospecting does not require a buying signal unless the user explicitly requests intent-qualified results.

Acceptance: a well-matched business without a named employee remains useful for a business search. An old role, wrong country, unsupported buyer claim, or do-not-contact record cannot become a qualified outreach target. Unknown preference fields do not fail unrelated tasks.

## 7. Make imports an equivalent entry point

Detect supported encodings and delimiters, preview rows, suggest column mappings, and preserve unknown fields. Let users map business names, handles, profile links, phone fields, roles, and locations without requiring a fixed template. Separate contact records, research targets, and rows needing correction.

Allow partial acceptance with an explicit summary and downloadable row errors. Keep usable data if another row is malformed. Present append, merge, or replace choices; protect existing shortlists and drafts. Apply the same private-sector policy to imports before they enter prospect selection. Research or enrich missing facts only from allowed sources with evidence and budget controls.

Acceptance: company-only, email-only, and profile-only records can enter a review/enrichment state. Criteria-only rows become research targets. A row containing unrelated numbers or dates does not become an unnamed person. No unsupported identity is invented.

## 8. Resolve duplicates and conflicts safely

Match strong identifiers such as canonical profile paths, normalized email, and verified business domains. Use name-plus-company as supporting evidence, not a universal identifier. Account for all supported contact channels. Preserve field provenance and conflicts instead of overwriting them. Do-not-contact survives merges and reimports.

Keep suppression decisions outside replaceable import batches, linked to canonical identities with an audit record. A shared business inbox is a contact address, not proof that two named people are one person. Preserve and validate provenance through export/reimport; imported review flags are untrusted input and cannot certify themselves.

Acceptance: different people with the same name stay separate; one person found on two channels can be linked when evidence supports it; changing an employer or merging evidence invalidates affected approvals and prepared actions where necessary. Replacing a list or rediscovering a person does not erase a do-not-contact decision. Preparation and automation eligibility are checked against current evidence, not merely old shortlist membership.

## 9. Persist runs, manage cost, and explain outcomes

Store owner-scoped runs, progress, result references, and actionable error codes. Prevent duplicate submissions with idempotency keys. Add resumable jobs only where research exceeds the normal request window. Cache only where source terms permit, using goal/plan identity and freshness rules; isolate user-specific records and imports.

Distinguish PULL's quota, provider credit exhaustion, provider rate limiting, missing configuration, timeout, and zero qualifying matches. Show the reset time and permitted next actions. Track reserved versus attempted requests honestly: never refund a possibly billed request simply because the result was empty or a connection failed.

Acceptance: refreshing or retrying a request does not duplicate charges; a late failure preserves earlier results; a zero-result response explains the rejection counts. Logs contain no credentials or unnecessary personal data.

## 10. Connect the existing interface

Retain the approved navigation, typography direction, and workspace layout. Add only the controls necessary for the chosen target. Show real progress stages and a concise result summary. Results expose identity, fit explanation, evidence, freshness, and actual contact paths, with useful unknown states instead of repeated placeholder people.

Use the same research service from Buyers and later AI mode. UI state must distinguish research in progress, finished, partial, cancelled, setup required, and unsuccessful. A source link opens the relevant source; it does not imply that PULL has sent a message.

Acceptance: complete a search, inspect evidence, save a shortlist, open a supported contact path, and return to the saved results without losing context, including on mobile and keyboard navigation.

## 11. Establish relevance and security release gates

Create manually reviewed evaluation cases for local private-school customer discovery, agency decision-makers in real estate/agriculture, marketplace demand where an authorized source exists, and private-sector hiring opportunities. Include other regions and naming conventions; Nigeria is a starting example, not a product boundary.

Measure precision in the top results, criterion coverage, identity extraction errors, duplicates, contact-path correctness, evidence age, latency, empty-result causes, and provider cost per accepted prospect. Set quality thresholds against the reviewed evaluation set; do not claim recall where the true underlying population is unknown.

Test cross-account access, source-host spoofing, prompt injection, malformed provider data, concurrent quotas, imported spreadsheet formulas, ambiguous ownership, state changes, cancellation, and provider outages. Use deterministic fixtures for regression and small authorized live checks for service verification.

Acceptance: document the tested source/version, database revision, deployment, real scenario, observed results, and remaining limitations. Local passing tests and a configured API key are not proof of a working live user journey.

## Recommended implementation sequence

1. Define target types and canonical goal/evidence contracts; fix inconsistent eligibility across native results and imports.
2. Improve planning, identity parsing, source validation, and deduplication using focused regression cases.
3. Add bounded permitted enrichment and criterion-level ranking, with explicit partial/empty outcomes.
4. Add import mapping/repair and safe merge behavior through the shared contract.
5. Add run persistence, idempotency, source-permitted caching, and accurate usage/error visibility.
6. Adapt the existing UI, benchmark real tasks, audit isolation/security, and verify a preview before production release.

## Dependency boundary

Existing search access can support the first provider-based discovery milestone without social OAuth or a funded PULL model. Direct platform-specific discovery, private-account information, automatic outreach, and claimed buyer-demand data require their own verified permissions and connectors. They are separate release capabilities. No universal scraper or foundation model supplies those rights or facts automatically.
