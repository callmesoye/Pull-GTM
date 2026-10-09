# Pull GTM

Pull helps people review prospects, build a shortlist, and prepare outreach with context. The combined release keeps Pull’s light interface, grouped navigation, and global search, with account settings, AI conversations, repeatable workflows, and guided agent setup.

## One source and deployment

- Private repository: [callmesoye/Pull-GTM](https://github.com/callmesoye/Pull-GTM).
- Existing Vercel project and production address: [pull-gtm.vercel.app](https://pull-gtm.vercel.app).
- Existing Supabase project: `cyakphnpljeesotbjerz`.

This checkout is the consolidated source. The new combined release is not yet recorded as deployed or fully verified against remote services. See [release status](docs/RELEASE.md) and [deployment steps](docs/DEPLOYMENT.md). Continue using these existing projects; a second repository or database is not needed.

## Included

- Today, Buyers, shortlist, Engage, conversations, Results, and Connections, plus global search and AI mode.
- CSV imports with optional company names, name aliases, duplicate enrichment, evidence checks, exclusions, and an All filter that includes incomplete records.
- Reviewed shortlists, editable drafts, do-not-contact handling, exports, backups, and activity history. Examples are clearly fictional.
- Continuous Settings for the workspace brief, profile, account, security, channels, and data. Email/password sign-in and optional Google sign-in use server-managed sessions.
- Private cloud saves with revision checks. Manual and after-import Automations review audience fit or suggest drafts; after-import workflows save the imported workspace while the app is open. They are not background schedules.
- Pull AI through Vercel AI Gateway, with selected context and authenticated request limits.
- Connect your AI: scoped, expiring access keys, illustrated client instructions, an actual server access check, and revocation controls. [Client compatibility and setup](docs/MCP-SETUP.md).
- Support by [email](mailto:gbosheabisoye.ag@gmail.com) or [booked walkthrough](https://calendar.app.google/rhwGJ6n3zaRy5tdr8).

Live prospect discovery, mailbox sending, and reply synchronization are not connected. A source link is a reference to review, not independent verification. Pull AI suggests; it cannot send messages or change the workspace from its conversation. Agent draft permissions can create or replace editable drafts and always require review.

Local data stays in the current tab unless browser saving is chosen. Cloud saves upload the workspace to its account. AI questions share only the context selected in the interface. See [global private-sector scope](docs/GLOBAL-PRIVATE-SECTOR.md) and [Jiji integration research](docs/JIJI-INTEGRATION.md) for research and future work, not connected discovery services.

## Run and check

Use Node.js 22.9 or newer. No package dependencies are required.

```sh
cp .env.example .env
npm run dev
```

Fill in the publishable Supabase key to enable local account services. Open [the local preview](http://127.0.0.1:4173); the app’s pages use URL fragments. Optional Google and AI configuration is documented in [deployment steps](docs/DEPLOYMENT.md).

```sh
npm test
npm run check
```

The current local suite has 129 passing tests. It covers authentication, account isolation, CSV handling, workspace revisions, workflows, AI/agent access, MCP behavior, and asynchronous connection setup. Local tests do not prove remote deployment configuration or an external client connection.
