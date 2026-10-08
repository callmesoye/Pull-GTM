# Pull GTM agent access

This is a stateless, JSON-only Streamable HTTP MCP endpoint. Deploy `index.ts`
with `handler.js`, `store.js`, and `engine.js` beside it, and set
`verify_jwt = false`. The endpoint authenticates every request using a custom
owner-issued `pull_agent_…` bearer token. Turning off the platform JWT check
does not remove the handler's token authentication.

Apply `database/setup.sql`, then `database/agents.sql`, before deploying. The
Edge runtime uses Supabase's injected `SUPABASE_SECRET_KEYS.default` or the
legacy `SUPABASE_SERVICE_ROLE_KEY`. Neither credential belongs in Vercel's
frontend, a customer agent configuration, or committed files.

Client requests use:

```text
POST https://<project>.supabase.co/functions/v1/pull-mcp
Authorization: Bearer <token shown once in Pull Connections>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-06-18
```

`initialize`, `ping`, `tools/list`, and `tools/call` return JSON. Notifications
return 202 with no body. GET returns 405; this endpoint does not expose an SSE
subscription or maintain sessions. Protocol versions 2025-06-18 and 2025-03-26
are supported. OAuth discovery is not advertised; clients must support
explicit bearer headers.

Read scope exposes a saved business summary and currently eligible reviewed
prospects, with supplied source labels and without contact emails. Draft scope
adds `propose_draft`. A proposal can replace an existing draft, always remains
unprepared, and never sends a message. The latest workspace revision is
required. The database locks the token and workspace and checks revocation,
expiry, scopes, owner, and revision before writing.

Limits are ten active tokens per owner, thirty days per token, and five hundred
requests per token per UTC day. Separate model usage is limited to twenty
requests per signed-in owner per UTC day and two hundred project-wide. These
are request limits, not a guarantee of any provider's monetary billing limit.

Browser requests are allowed from `https://pull-gtm.vercel.app`. For a custom
Pull domain, set `PULL_MCP_ALLOWED_ORIGINS` to a comma-separated list of exact
origins (scheme and hostname, no path). Native CLI/MCP clients can omit Origin;
browser requests with any other Origin fail before private storage access.

Run the application tests before deployment. Remote verification should prove
owner A cannot see owner B's token metadata or workspace, clients cannot read
token hashes or call service-only RPCs, read scope cannot save a draft, expired
or revoked access fails, newer revisions are preserved, and AI quota stops at
the configured limits. Use disposable fixtures and roll back database tests.

`database/verify-agents.sql` provides these integration assertions. Run the
entire file as the dedicated project's database administrator after deployment.
It creates two temporary account fixtures inside one transaction, impersonates
the relevant database roles with fixture JWT claims, and raises an exception on
any failed assertion. It also tests both the user and project AI quota caps.
The file ends with `ROLLBACK`, retaining no fixture accounts, tokens, drafts,
or usage-counter changes. If a statement fails in an interactive SQL session,
issue `ROLLBACK` before continuing. This does not replace testing a real browser
sign-in or a client connection to the deployed MCP endpoint.

`engine.js` is an exact copy of the frontend eligibility engine. The test suite
fails if they diverge; update both when audience qualification rules change.
