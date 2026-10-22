# PULL GTM: Evidence-to-outcome engineering plan
Updated 22 October 2026. Status: research conclusion and reviewed feature candidate, not a certified or production release.

## Decision
PULL should be a domain-specific GTM acquisition system that completes evidence-backed opportunity → approved action → real qualified conversation, not an unbounded chatbot or social browser bot. Professional and Commerce GTM share identity, evidence, consent, execution and outcome contracts, but use separate source and intent logic.

## Measured problem
The 18 October 2026 benchmark (docs/RELEVANCE-BASELINE.md) retrieved 80 search results in eight requests and only 2 distinct qualified profiles for a request of 30, a shortfall of 28. Free-tier source-restricted queries sometimes failed. More requests alone do not prove better qualified yield. Existing retrieval already uses adaptive queries, deduplication, corroboration and budgets.

## This branch: implemented increment
- Added server/research-triage.js, a deterministic post-search evidence-gap evaluator. It neither sends messages nor approves prospects.
- Fully qualified people remain unchanged in people. A separate reviewQueue contains at most 12 named, source-backed people whose audience role matches but whose location or industry evidence is incomplete. Each explicitly says needs_research, source-asserted, and eligible_for_outreach:false.
- Unsupported/unsafe links, source mismatches, wrong roles, missing company and already-qualified identities never enter that queue. The queue never becomes Buyers, shortlist, outreach draft or delivery permission by itself.
- researchQuality measures requests, source observations, qualified count, unresolved count and observed diagnostic bottlenecks. Observations overlap. Yield-per-request and yield-per-100-source-results are descriptive, NOT statistical precision, verified contact quality or purchase probability.
- Research tools retain the typed contract; UI separates incomplete entries without an add/send action.
- This change requires no new API calls, database writes, paid provider, secret, or migration. It has NOT increased verified prospect count without a future controlled benchmark.

## Release plan and acceptance evidence
**A. Measure the real research funnel.** Benchmark 30+ stratified authorized research tasks by sector, geography, and source. Human-review random samples for role, current employer, personal location, private ownership and contact evidence. Record Precision@10, duplicate rate, verified evidence coverage, unresolved-to-confirmed conversion, spend/qualified result, P50/P95 latency and cases of shortfall. Compare providers using authorized free allowances and identical criteria, never their advertising claims.

**B. Fill missing fields with permissioned evidence.** Only fetch user-provided documents, permissioned APIs or explicitly allowed original business pages. Enforce URL, DNS/SSRF, redirects, robots/terms, body/time budgets and prompt-injection boundaries. Re-evaluate all original hard criteria before graduation from needs_research. Never silently broaden geography or qualifications.

**C. Define an actual CRM lifecycle.** Owner-scoped person, organization, opportunity, field evidence, contact path, consent, activity and outcome records. Stages: research candidate → evidence review → qualified for review → action approved → provider submitted → delivered (where proven) → conversation → opportunity → customer; also disqualified/nurture. Keep evidence and action approvals distinct. Use additive database migrations, RLS, versioned schemas and safe backfills from existing workspace JSON.

**D. Complete one compliant channel.** Existing Gmail/X adapters need real provider onboarding and verified tests. For a first pilot, favor an authorized inbound or opted-in conversation. Use provider-specific capability checks, exact owner approval, deduplication/idempotency, webhook validation, opt-out, safe retries, bounded costs, and traceable receipts. Do not bypass LinkedIn/Meta restrictions.

**E. Complete the product learning loop.** The separate feat/product-learning-loop branch includes categorical event and feedback backend code, but production lacks feedback/admin tables and no complete frontend/admin integration is confirmed. Keep that work separate until reviewed. Avoid capturing full message or prospect content in analytics.

## Economics and scalability
Reuse current Supabase RLS, scheduler and MCP, Vercel routes and the server-side discovery provider interface. Prefer inexpensive deterministic evidence checks before calling an LLM. Cap search requests, model calls, retries, storage and provider spending per workspace. Cache only when permitted by the source. Invest in heavier infrastructure after paid pilots prove qualified-conversation value.

## Security and quality gates
- ISO/IEC 25010:2023 principles: user-task correctness, performance, reliability, security, interaction quality, maintainability and measurable acceptance.
- ISO/IEC 27001:2022 principles: least privilege, threats and risks, secrets, incident handling, retention, access governance and audits.
- ISO/IEC 42001:2023 and NIST AI RMF: model provenance, monitoring, human oversight, uncertainty, evaluation and failure controls.
- OWASP API Security Top 10: object-level authorization and bounded resource use.
Standards-informed practices are NOT certifications. Privacy, marketing and platform rules still require legal/provider verification.

## Before merge or deployment
1. Green syntax and automated tests on the exact branch commit.
2. Preview UI manually checks no unresolved source becomes a qualified record or sendable message.
3. Test auth, account isolation, unsafe source inputs and privacy-sensitive log exposure.
4. Rerun the original live 30-person benchmark within the approved search budget, and report actual new yield and human-rated quality.
5. Owner reviews preview and approves merge; verify production separately and retain rollback.

## North-star metric
Owner-confirmed qualified conversations per active workspace per month, expanding to credible opportunities and attributable revenue. Guardrails: time to verified first opportunity, relevance precision, false positives, permission/consent violations (zero target), cost/qualified lead and reliability.

## References
- https://www.iso.org/standard/78176.html
- https://www.iso.org/standard/27001
- https://www.iso.org/standard/81230.html
- https://airc.nist.gov/airmf-resources/airmf/
- https://api-security.owasp.org/editions/2023/en/0x00-header/
- https://knowledge.hubspot.com/records/use-lifecycle-stages
- https://whatsappbusiness.com/policy/
- https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software
