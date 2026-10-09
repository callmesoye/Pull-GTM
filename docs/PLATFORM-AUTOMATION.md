# Platform workflows and availability

Pull currently automates audience review and editable draft suggestions on an owned, imported prospect list. A workflow can run on demand or after an import while Pull is open. Choosing a destination records the handoff; it does not connect an account, send a message, post a listing, scrape a site, or promise a buyer.

| Destination | First workflow | Requirement for direct action |
| --- | --- | --- |
| LinkedIn personal | Review fit and prepare a draft | Member consent and approved permissions; no unsolicited automated DMs |
| LinkedIn company page | Prepare page content or an inbound reply | Page admin role and approved organization permissions |
| Instagram | Prepare content or an inbound reply | Professional account, linked Meta assets, app permissions and messaging rules |
| Facebook | Prepare page content or an inbound reply | Page access and Meta permissions |
| X | Prepare a post or response | User authorization, X API access and current rules |
| Jiji | Review owner-provided listing or enquiry data; prepare a reply | Owner completes action in Jiji unless an official authorized interface exists |
| Shopify | Review authorized store events | Merchant-installed app with minimum scopes and marketing consent |
| WhatsApp Business | Prepare a permitted customer response | Connected Business account, consent and approved templates where required |
| Email | Prepare a personalized draft | Verified sender, lawful basis, unsubscribe and suppression controls |

## Current local social workflow

For X, LinkedIn, Facebook and Instagram, a Pull automation can review saved prospects and create an editable draft after an import or when the owner runs it. The draft records the selected destination. A reviewed prospect's supplied social link can be opened from prospect review for a human handoff. Pull does not log in to those sites, scrape their logged-in pages, or send messages through a browser bot. The source must remain private-sector and the user's evidence and exclusions still apply.

The next level of automation is channel-specific, not a generic timer. For X, an official API integration must verify account authorization and that a recipient requested or opted in to an automated DM, with opt-out and duplicate checks before each reply. For LinkedIn personal messaging, the handoff remains manual unless Pull receives an approved integration for the exact action; LinkedIn disallows software that automates its website. For Facebook Pages and Instagram professional accounts, future inbound replies or publishing require the relevant approved Meta permissions, eligible conversation or asset, and verified Page/account role. No such social OAuth connection, webhook, or sending worker is installed today. Rate spacing alone does not make unsolicited outreach permitted.

Social accounts should eventually connect only through the platform's official OAuth flow, requesting the minimum permissions for each feature. Server-side storage must encrypt tokens, prevent their exposure in browser responses or logs, bind each token to one verified Pull owner and platform account, support revocation, and record provider delivery or failure events. Do not show a platform as connected until an authorized API call verifies it. Pull's Google sign-in authenticates the Pull account; it does not authorize any social account.

Primary rules: [X automation](https://help.x.com/en/rules-and-policies/x-automation), [LinkedIn automated activity](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en), [Meta Page instant replies](https://www.facebook.com/help/1698046970464236/).

For a car dealer, the honest five-minute path is to choose Sell or trade, import enquiries or buyer details they own, set automotive fit rules, review evidence, and choose Jiji as the handoff. Pull cannot produce a real list of Jiji buyers without an authorized data source. Business and career workspaces adapt their next step but retain the same evidence and privacy rules.

No integration bypasses platform rules. Future direct actions need explicit connection, limited scopes, review, rate limits, audit history and a provider delivery receipt. Prepared, approved, submitted, delivered and failed must be distinct states.

## Billing and owner operations

Stripe billing is not active. Do not collect card details or show a paid plan as purchased until a Stripe account, product and price IDs, Checkout, Customer Portal, signed webhook and subscription-state persistence have been configured and tested. Secret keys belong on the server, never in the browser or repository. A separate owner console needs explicit owner authentication and server-side role checks; hiding a button is insufficient. Until then, manage the private Supabase project and Vercel settings directly rather than presenting simulated admin controls.
