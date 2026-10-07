# Agents read Sportsline over MCP, with a Viewer's API token

Viewers want their AI agents (Grok, Claude, their own bots) to use Sportsline: first to fetch Sharp picks, later perhaps to trade on Kalshi for them. Agents speak the Model Context Protocol, so Sportsline serves an MCP server at `/mcp` in the Worker, beside `/live` and `/api/auth`.

An agent signs in with an **API token** the Viewer makes on the Agents page (`sl_` and 32 random bytes). It's shown once; only its SHA-256 is stored, with a name, its first characters for telling tokens apart, scopes, and when it was last used. Revoking one stops it at once. Each request sends it as `Authorization: Bearer sl_…`, and the tools act as that Viewer. A Viewer can hold ten working tokens.

The server is deliberately small: one JSON-RPC message per POST, answered with JSON (MCP's Streamable HTTP without the optional event stream, so no sessions to keep in a Worker), offering tools only. Notifications get 202; GET gets 405; a browser Origin other than ours gets 403. Tool failures and bad arguments come back as tool results the model can read; protocol mistakes as JSON-RPC errors. Prices are reported in cents and chances in percentage points, as the app shows them.

The tools today: `get_sharp_picks` (a day's slate, default today's) and `get_sharp_record`. Every token's scope is `read`.

## Considered Options

- **OAuth (Better Auth's OAuth provider, MCP's authorization spec).** What claude.ai's connectors need, with no secret to copy. But it's more moving parts (client registration, consent, refresh), and a Viewer's own bot wants a fixed credential in its config. Tokens first; OAuth can sit beside them later for apps that need it.
- **A plain REST API.** Simple, but every agent would need a custom tool written for it; MCP is what agents already speak.
- **The MCP TypeScript SDK.** Complete, but its HTTP transport assumes long-lived sessions and Node; three methods by hand fit a Worker better and are easy to test.

## Trading, later

ADR 0003 refuses Kalshi keys that can trade, and nothing here changes that. If agents are to trade, a new ADR should decide it, along these lines:
- a separate `trade` scope a Viewer grants a token explicitly, and a separate trade-capable Kalshi key, kept apart from the read-only one;
- an agent's order is only a proposal: nothing reaches Kalshi until the Viewer approves it in the app (or from an Alert), with limit orders only and per-order and daily dollar caps;
- every proposal, approval and fill kept in an audit log the Viewer can see.

## Consequences

- A leaked token reads that Viewer's Sharp picks until revoked; it can't trade, and the database alone never reveals one.
- Tokens are long-lived: a Viewer should revoke ones they stop using. `last_used_at` shows which.
- Clients that only do OAuth (claude.ai connectors) can't connect yet.
