# Jiji Nigeria integration decision

Researched 8 October 2026, using official Jiji pages. This is one marketplace example within Pull GTM's wider industry coverage; see the [100-category Nigeria opportunity map](NIGERIA-100-INDUSTRIES.md). This is a proposed integration plan, not a claim that Pull GTM is connected to Jiji.

## Verdict

Start with an honest, useful **Jiji handoff and owner-authorized import**. A documented public Jiji prospect-search API, listing feed, webhook, or third-party inbox API was not found in the public site and FAQ reviewed. This does not prove that private partner access is unavailable. Do not advertise real-time Jiji sync until Jiji confirms the access method, permitted purpose, scopes, and credentials.

Jiji's official documentation already supports passive discovery inside Jiji: a user can save a filtered search and receive push or in-app alerts when a matching ad appears. Pull can guide this setup and let the owner save a source link alongside their own notes or consented customer records. These are separate workflows; saving a link in Pull does not subscribe Pull to Jiji's alerts. [Saved search documentation](https://jiji.ng/faq/saved-searches).

## What is available now

| Need | Practical first version | Honest status |
| --- | --- | --- |
| Find relevant local listings | Open Jiji; guide the owner to category, region, and other relevant filters; save the search there | Notifications run in Jiji |
| Keep an opportunity in Pull | Save a Jiji URL with user-entered notes and source date; import records the owner has rights to use | User supplied; not independently verified |
| Use a business identity | Help the owner complete their actual Jiji company profile; Jiji supports business details and moderates certain fields | Profile managed in Jiji |
| Share the owner's new listings | Guide the owner to Jiji's native Meta account connection | Jiji feature; no Pull sync |
| Automatic listing, inbox, or analytics sync | Obtain an approved partner integration or a licensed provider with explicit Jiji authorization and suitable scopes | Not connected |

Jiji company profiles can display business name, description, working hours, delivery details, and moderated address/website fields. That is useful for the company-first experience, but it is not a prospect-search API. [Company profile documentation](https://jiji.ng/faq/setup-business-profile).

Jiji's native automatic sharing feature connects a seller's own Facebook and Instagram business pages, shares all new ads, and does not synchronize later edits. It currently permits one page on each network. Pull should link to this setup instead of duplicating it or promising bidirectional sync. [Automatic sharing documentation](https://jiji.ng/faq/fb_auto_sharing).

## Access constraints

Jiji's Terms §7.16 restrict copying other users' content without their consent; §7.17 restrict collecting user information, including contact details, without consent; §7.15 restrict unsolicited commercial messages. A publicly visible listing is not permission to harvest its seller's phone number or republish its content. Platform permission and the relevant data-use rights must both be resolved before automated ingestion. Jiji also disclaims the accuracy of user listings. [Terms of Use](https://jiji.ng/rules.html).

For future approved access, request documented scopes for listing metadata, seller-owned data, inbound messages, and permitted refresh intervals separately. Support is the official route to ask whether an integration or partnership is available; no contact has been made for this research. [Jiji Support](https://jiji.ng/faq).

## Proposed passive experience

1. Ask once what the business offers, whom it serves, service locations, and whether the goal is customers, suppliers, or partners. For a Nigerian business, use state/city and service radius rather than assuming Lagos only.
2. Show one clear next action: set up a Jiji saved search, add an existing customer record, or review an inbound enquiry. Explain which system is doing the work.
3. After authorized ingestion becomes available, offer a quiet daily digest of only new relevant records, with an adjustable frequency and a pause control. Deduplicate listings and expire unavailable records.
4. Every suggested opportunity shows source URL, observed date, last successful sync, reason it matches, missing evidence, and data coverage. Use separate labels for audience fit and evidence confidence; never invent percentages.
5. A seller advertising a product is a supplier or potential business account, not automatically a buyer. Require evidence of a need or a genuine inbound enquiry before calling it buyer intent.
6. Prepare a reply only from the owner's actual offer and observed facts. Keep contact handoff inside Jiji unless an approved messaging integration exists. Record success from real replies and outcomes, not generated drafts.

Suggested connection copy: **“Jiji: guided setup available. Automatic sync needs approved access.”** A broken or delayed connection should show the last successful update and retain prior records as stale rather than manufacture fresh results.

No application code was changed for this note. No Jiji account, seller, or support contact was accessed or contacted.
