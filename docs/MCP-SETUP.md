# Connect your AI to Pull

Open **Connect your AI** in Pull. Sign in, save your workspace to the cloud, and choose a client. Start with **Read my workspace**, create a named private key, and copy the generated setup into that client’s private configuration. The key is shown once, expires after 30 days, and can be revoked from Pull.

The public server address is:

```text
https://cyakphnpljeesotbjerz.supabase.co/functions/v1/pull-mcp
```

Authentication is the header `Authorization: Bearer YOUR_PULL_KEY`. Keep the actual key out of URLs, shared repositories, chat messages, and support requests.

## Client availability

| Client | This release |
| --- | --- |
| Claude Code | Remote HTTP server with an Authorization header. [Official instructions](https://code.claude.com/docs/en/mcp). |
| Cursor | Remote MCP configuration with an Authorization header; merge the generated Pull entry into personal MCP settings. [Official instructions](https://docs.cursor.com/context/model-context-protocol). |
| Codex | Remote MCP configuration with `http_headers.Authorization`. [Official instructions](https://developers.openai.com/codex/mcp/). |
| Claude web | Conditional: **Request headers** is a beta available to limited organizations. Follow the steps below only if that control exists. [Official instructions](https://claude.com/docs/connectors/custom/add-unlisted#authenticate-with-request-headers). |
| ChatGPT | Pending a compatible MCP OAuth implementation in Pull. The current private-key setup is not enabled for ChatGPT. [ChatGPT app setup](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt). |
| Other clients | Requires remote Streamable HTTP MCP with explicit bearer-header support. |

These are supported setup paths, not a claim that every external client has been tested against this deployment.

For Claude Code, the wizard generates a command using `claude mcp add --scope user --transport http` and `--header`. Run it locally, then check `/mcp`. Cursor receives a `mcpServers.pull` JSON entry for personal `~/.cursor/mcp.json`. Codex receives an `[mcp_servers.pull]` section for personal `~/.codex/config.toml`. Merge with existing entries instead of replacing the whole file.

For Claude web, first confirm **Request headers** is available in Add custom connector. Add the Pull address, select **No sign-in**, and provide an `Authorization` request header with the full `Bearer YOUR_PULL_KEY` value. Pull still requires and verifies the key. Use this only where sharing that connector does not unintentionally share your workspace access. If the header control is missing, choose another supported client. The beta availability and full-header requirement are described in [Claude’s documentation](https://claude.com/docs/connectors/custom/add-unlisted#authenticate-with-request-headers).

Google sign-in to the Pull website is separate from MCP OAuth. The existing Google login route does not make the MCP server a ChatGPT-compatible OAuth service. Do not make a private workspace anonymous to bypass authentication.

## Check your connection

Run **Test access** in Pull while the newly created key is displayed. This checks the real server and its tools. Then inspect the tools inside your client and try:

> Use Pull to summarize my saved workspace and show the prospects I’ve reviewed.

The read scope provides `get_workspace_summary` and `list_reviewed_prospects`. It uses the saved cloud workspace and excludes contact emails from prospect results. Optional draft permission adds `propose_draft`, which can create or replace a draft for an eligible reviewed prospect, requires the latest workspace revision, and leaves the draft unprepared for owner review. No tool discovers contacts or sends outreach.

Leaving the wizard or changing accounts clears the displayed key. If you lose it, revoke the old key and create another. A listed active key does not itself prove a client connection. If the list is empty after connecting, confirm that you saved the right account’s workspace and shortlisted eligible prospects.

For help, [email Abisoye](mailto:gbosheabisoye.ag@gmail.com) or [book a walkthrough](https://calendar.app.google/rhwGJ6n3zaRy5tdr8). Share the error and the step where it happened, without your key or prospect list.
