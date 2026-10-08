# Global private-sector architecture

Research date: 8 October 2026. Pull GTM should use one source-based workflow across Nigeria, the USA, UK, Canada, Australia and other regions, adapting to verified platform coverage and the owner's actual permissions. This plan targets private businesses, professionals, independent traders and careers. None of the sources below is claimed to be connected.

## Representative private sources

| Region / use | Primary example | Documented access evidence | Proposed owner benefit |
| --- | --- | --- | --- |
| USA / local-business research | [Yelp Places API](https://docs.developer.yelp.com/docs/places-intro) | Official API documentation; account, plan, permitted usage and geographic coverage must be checked | Source-backed local company context; a listed business is not automatically a buyer |
| UK / careers and hiring | [Reed Jobseeker APIs](https://www.reed.co.uk/developers/jobseeker) | Search and job-detail API documentation; an API key is required | A relevant vacancy digest with source and expiry; hiring need stays separate from general buying intent |
| Canada / private careers | [Workopolis](https://www.workopolis.com/) | Official private job-search site; no suitable third-party API verified in this research | Manual source links and employer-controlled career follow-ups |
| Canada and other merchant markets / commerce | [Shopify Admin API](https://shopify.dev/docs/api/admin-graphql/latest) | Official merchant API with access tokens and app scopes | Follow-up suggestions from the owner's authorized orders and fulfilment events; check country/product availability separately |
| Australia / recruiting | [SEEK Developer](https://developer.seek.com/) | Official APIs for hiring workflows; SEEK approval is explicitly required | Authorized employer job/application workflow; private candidate data stays inside its agreed recruitment purpose |
| Australia / independent service businesses | [Airtasker Australia](https://www.airtasker.com/au/) | Official task marketplace; no suitable third-party API verified here | Owner-led task and service handoffs; marketplace publication is not blanket outreach permission |
| Other African markets / careers | [BrighterMonday Kenya](https://www.brightermonday.co.ke/) | Official private Kenya job platform; no suitable third-party API verified here | Relevant private-employer vacancy research and manual handoff |
| Asia Pacific / careers | [SEEK Developer](https://developer.seek.com/) | Provider describes Asia Pacific marketplace integration; approved countries and hirer relationships still need verification | Extend the same authorized recruitment flow where the provider actually supports it |
| Cross-region / an owner's existing CRM | [HubSpot API reference](https://developers.hubspot.com/docs/api-reference/latest/overview) | Official CRM API reference; authorized account and appropriate scopes required | Prioritize the owner's genuine enquiries and deals instead of filling a workspace with random contacts |

These examples are a manageable starting set, not comprehensive country coverage. A worldwide country filter in Pull cannot create data coverage that its source providers do not have.

## One permissions and coverage contract

Every connector should record the authorized business account, permitted purpose, data types and scopes, source countries/languages, refresh or event method, freshness expectations, usage budget, and retention terms. Give each country/source a truthful status: manual handoff, approval needed, setup needed, connected, stale, or unavailable. API documentation alone must never produce a connected badge.

Keep credentials on the server and separate each user's authorized data. Collect only what the workflow needs. Support disconnection and revocation, preserve provenance, and handle duplicate events without duplicate tasks. Provider-approved access, user consent and actual data quality are separate checks.

Separate source evidence from model inference. Store an item's original URL or provider ID, publication date when available, observed date, reason for relevance and missing facts. Present confidence in understandable terms; do not invent percentages. A company profile, inventory ad or vacancy can support context, while a genuine enquiry can support a need.

Offer a passive owner experience: short first-run setup, a quiet daily or chosen-frequency brief, and one next best action. Use local time zones, currencies, languages, addresses and service radii. Pause when permissions fail, retain the last successful update as stale, and show coverage gaps clearly. Prepare messages for owner review; only a real provider-confirmed action can become a sent message or an outcome.

Career workflows use a distinct purpose. Employer vacancy research, a professional's own applications, and a recruiter's authorized candidates are different data contexts. Do not turn private CVs, pupil information, patient records or another business's customer transactions into GTM prospects.

Before enabling a connector, verify the whole authorized flow: sign-in → scoped source access → correctly attributed data → relevant suggestion → owner decision → actual event or outcome. Also test account isolation, stale/error states, duplicates, revocation and costs. This document is an architecture proposal; no new connector or background monitoring was activated.
