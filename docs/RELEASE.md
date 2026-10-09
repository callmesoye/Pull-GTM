# Combined release status

Updated 9 October 2026.

## Source

The consolidated release belongs in the single private repository [callmesoye/Pull-GTM](https://github.com/callmesoye/Pull-GTM). It combines the light grouped workspace and AI mode with Settings, profile editing, Google sign-in support, Automations, improved CSV import, Connect your AI, and Support.

The current local suite passes all 129 tests. Connection tests cover late responses after navigation, account changes, duplicate key creation, unavailable metadata, and failed access checks. These tests use controlled fixtures and do not certify the production configuration.

## Existing targets

| Service | Target |
| --- | --- |
| GitHub | Private `callmesoye/Pull-GTM` |
| Vercel | Existing `pull-gtm` project at [pull-gtm.vercel.app](https://pull-gtm.vercel.app) |
| Supabase | Existing project `cyakphnpljeesotbjerz` |
| MCP | [pull-mcp endpoint](https://cyakphnpljeesotbjerz.supabase.co/functions/v1/pull-mcp) |

A successful deployment of this combined source has not yet been recorded here. Earlier database/function checks do not verify the newly combined release. Before marking it live, record its source commit, Vercel deployment URL, deployed database/function revisions, and the remote checks in [DEPLOYMENT.md](DEPLOYMENT.md).

## Availability

Claude Code, Cursor, and Codex have bearer-header setup paths. Claude web is conditional on access to its Request headers beta. ChatGPT setup remains pending a compatible MCP OAuth implementation. Google sign-in to Pull is separate from MCP OAuth and does not resolve that gap. See [MCP-SETUP.md](MCP-SETUP.md).

Cloud sign-in/save/restore, Google sign-in, model responses, workflow execution, and an external MCP client still require verification on the intended deployment before they are described as remotely tested. Sending, reply sync, and live discovery remain unavailable.

Support links use [gbosheabisoye.ag@gmail.com](mailto:gbosheabisoye.ag@gmail.com) and the owner’s [booking calendar](https://calendar.app.google/rhwGJ6n3zaRy5tdr8).
