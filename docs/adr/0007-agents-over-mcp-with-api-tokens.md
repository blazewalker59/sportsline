# Agents read Sportsline over MCP, with a Viewer's API token

Viewers want their AI agents (Grok, Claude, their own bots) to use Sportsline: first to fetch Sharp picks, later perhaps to trade on Kalshi for them. Agents speak the Model Context Protocol, so Sportsline serves an MCP server at `/mcp` in the Worker, beside `/live` and `/api/auth`.

An agent signs in with an **API token** the Viewer makes on the Agents page (`sl_` and 32 random bytes). It's shown once; only its SHA-256 is stored, with a name, its first characters for telling tokens apart, scopes, and when it was last used. Revoking one stops it at once. Each request sends it as `Authorization: Bearer sl_…`, and the tools act as that Viewer. A Viewer can hold ten working tokens.

The server is deliberately small: one JSON-RPC message per POST, answered with JSON (MCP's Streamable HTTP without the optional event stream, so no sessions to keep in a Worker), offering tools only. Notifications get 202; GET gets 405; a browser Origin other than ours gets 403. Tool failures and bad arguments come back as tool results the model can read; protocol mistakes as JSON-RPC errors. Prices are reported in cents and chances in percentage points, as the app shows them.

The tools today: `get_sharp_picks` (a day's slate, default today's) and `get_sharp_record`. Every token's scope is `read`.

## Considered Options

- **OAuth (Better Auth's OAuth provider, MCP's authorization spec).** What claude.ai's connectors need, with no secret to copy. But it's more moving parts (client registration, consent, refresh), and a Viewer's own bot wants a fixed credential in its config. Tokens first; OAuth can sit beside them later for apps that need it.
- **A plain REST API.** Simple, but every agent would need a custom tool written for it; MCP is what agents already speak.
- **The MCP TypeScript SDK.** Complete, but its HTTP transport assumes long-lived sessions and Node; three methods by hand fit a Worker better and are easy to test.

## Trading

Decided in docs/adr/0008: a `trade` scope on the token, a separate trade-capable Kalshi key, and the Viewer's approval of every order.

## Consequences

- A leaked read token reads that Viewer's Sharp picks until revoked; a leaked trade token can also propose orders, which still need the Viewer's approval. The database alone never reveals a token.
- Tokens are long-lived: a Viewer should revoke ones they stop using. `last_used_at` shows which.
- Clients that only do OAuth (claude.ai connectors) can't connect yet.
