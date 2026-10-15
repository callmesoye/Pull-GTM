# Native delivery: owner setup and verification

Implemented adapters: Gmail email and X direct messages. Neither is a verified live connection until an owner configures its developer app, a user authorizes it, and a controlled provider submission succeeds. No social password, raw token or app secret is returned to browser code.

## Application configuration

Use the existing HTTPS `PULL_APP_URL`. Store credentials only in Vercel environment settings:

- Gmail: `PULL_GMAIL_CLIENT_ID`, `PULL_GMAIL_CLIENT_SECRET`. Enable Gmail API and register the exact callback `https://pull-gtm.vercel.app/api/channels?callback=gmail`. Requested scopes: OpenID identity/email and `https://www.googleapis.com/auth/gmail.send`. This is mailbox authorization, separate from Supabase Google sign-in. Google's consent configuration, testing-user restrictions and any required verification must be completed by the app owner.
- X: `PULL_X_CLIENT_ID`, `PULL_X_CLIENT_SECRET`. Use a confidential OAuth 2.0 web application, exact callback `https://pull-gtm.vercel.app/api/channels?callback=x`, and `users.read tweet.read dm.write offline.access`. Provider API access/entitlements must permit recipient lookup and direct messaging.
- Encryption: optional dedicated `PULL_CHANNEL_SECRET` of at least 32 random characters; otherwise the existing private `PULL_OAUTH_COOKIE_SECRET` is used with a distinct key-derivation context. Keep the key stable. A key rotation requires reconnection unless an explicit old-key migration is added. Keep keys out of chat and source control.

Apply `database/channels.sql`, then execute `database/verify-channels-rollback.sql`. It checks reservations, duplicate and overlap protection, revoked accounts, cross-owner isolation, uncertain outcomes and controlled explicit retries; fixtures roll back.

## User flow

Connections → connect Gmail or X → provider consent → verified account metadata appears in Pull. Save a real reviewed prospect and prepared draft. In Engage choose **Review & send**, inspect the exact recipient/message, record how permission was obtained, and choose **Approve and send once**.

Delivery rechecks the saved revision, current eligibility, suppression and connection immediately before submitting. X accepts only a checked profile username resolved through the official API. Gmail sends from the verified connected email identity. Owner-provided consent evidence is a declaration, not independently verified proof of legal permission.

A unique reservation binds the account, recipient and exact content. Submitted and uncertain jobs are not retried automatically. A definite failed submission can be explicitly retried after one minute, up to three attempts, without overlapping another send. Abandoned sends become uncertain; inspect the provider before taking further action. A provider receipt means submitted/accepted, never proof of inbox delivery, a read or a reply. Disconnecting prevents Pull from using stored credentials; also revoke the app in the provider's own settings if desired.

## Remaining execution gates

Real provider OAuth/token refresh/submission must still be tested after owner app setup. Facebook/Instagram require their separate Meta app, eligible assets, permissions and inbound-conversation rules. LinkedIn personal automated DMs are not implemented; publishing and company APIs require their own approved integration. Jiji remains a manual handoff. Background schedules, inbound reply synchronization, recipient-managed unsubscribe webhooks, and delegated sending from agent chat are not implemented. The chat workflow approval currently runs review/drafting only and does not silently gain sending permission.

Primary references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending), [X OAuth PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [X DM endpoint](https://docs.x.com/x-api/direct-messages/create-dm-message-by-participant-id), [X automation rules](https://help.x.com/en/rules-and-policies/x-automation).
