# Combined release status

Updated 9 October 2026.

## Source

The consolidated release belongs in the single private repository [callmesoye/Pull-GTM](https://github.com/callmesoye/Pull-GTM). It combines the light grouped workspace and AI mode with Settings, profile editing, Google sign-in support, Automations, improved CSV import, Connect your AI, and Support.

The current local suite passes all 137 tests and the syntax checks. AI Mode now queues questions for the owner's running agent, displays the actual agent answer, and lets the owner decide whether that question may use saved Pull data. Without an agent, it provides local guidance and a prompt handoff. Pull-hosted model calls are disabled by default. These local tests use controlled fixtures and do not certify an external agent session or the production app.

## Existing targets

| Service | Target |
| --- | --- |
| GitHub | Private `callmesoye/Pull-GTM` |
| Vercel | Existing `pull-gtm` project at [pull-gtm.vercel.app](https://pull-gtm.vercel.app) |
| Supabase | Existing project `cyakphnpljeesotbjerz` |
| MCP | [pull-mcp endpoint](https://cyakphnpljeesotbjerz.supabase.co/functions/v1/pull-mcp) |

The agent-chat SQL migration and `pull-mcp` version 3 were applied to the existing Supabase project, and the transactional chat verification passed. GitHub commit [`7eb3ac9`](https://github.com/callmesoye/Pull-GTM/commit/7eb3ac909e7466a9244caceefaf9e7eb7c741b02) was deployed by the existing Vercel project as production deployment `RMC1VU8efZcGszbqkGqSSDh8Woza`, which showed **Ready**. The live [production site](https://pull-gtm.vercel.app) displayed the new own-agent AI Mode, the automation-planning prompt, and the Connect page reported that the signed-in account was ready to create an agent connection. The unconnected AI Mode prompt handoff was exercised in that browser. A real third-party agent relay was not exercised; it requires a running user agent and owner-issued access key.

## Availability

Claude Code, Cursor, and Codex have bearer-header setup paths. Claude web is conditional on access to its Request headers beta. ChatGPT setup remains pending a compatible MCP OAuth implementation. Google sign-in to Pull is separate from MCP OAuth and does not resolve that gap. See [MCP-SETUP.md](MCP-SETUP.md).

Cloud sign-in/save/restore, Google sign-in, actual agent relay answers, workflow execution, and an external MCP client still require verification on the intended deployment before they are described as remotely tested. A connected MCP key alone cannot make a third-party agent poll in the background. AI Mode can help plan workflows; execution remains an owner-approved action in Pull. Sending, reply sync, and live discovery remain unavailable.

The business, trade and career workspace and platform handoff choices are included in the source. Platform selection does not connect or send. Stripe billing and an owner admin console are not yet implemented. See [PLATFORM-AUTOMATION.md](PLATFORM-AUTOMATION.md).

Support links use [gbosheabisoye.ag@gmail.com](mailto:gbosheabisoye.ag@gmail.com) and the owner’s [booking calendar](https://calendar.app.google/rhwGJ6n3zaRy5tdr8).
# Budgeted source search — 9 October 2026

Serper and Brave adapters share the same existing discovery form. Search keys stay server-side. Default maximum is two provider requests per search; daily database reservations allow 20 per owner and 200 for the project. No paid fallback or result cache is used. Government/public pages and uncertain private-sector pages are excluded. Results remain source-page candidates, not invented people, buyer intent, or verified contacts.

Validation: 144 local tests and syntax checks passed. Supabase migration `pull_search_request_budget` was applied to the existing Pull project. The transaction test passed for owner/project limits, invalid reservations, anonymous denial, and counter permissions; fixtures rolled back. A live Serper/Brave search is not verified until a provider key is configured.

Google setup: dedicated OAuth project `booming-quasar-511111-p6` created without linking billing. Supabase Site URL is `https://pull-gtm.vercel.app` and the exact callback return URL `/api/auth` is allowlisted. Google Cloud requires the owner's 2-Step Verification before OAuth client setup can continue. Google login is not yet enabled or tested end to end.
