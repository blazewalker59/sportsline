# Sportsline

A live, livestream-style Timeline of play-by-play across MLB, NBA, NFL, NHL,
and college football, filtered to the Teams, Players and Leagues you follow.
Predictions, Fantasy, and Agents sit on the same account. Domain language lives
in [CONTEXT.md](./CONTEXT.md); decisions in [docs/adr](./docs/adr).

Deployed as a single Cloudflare Worker (TanStack Start + D1 + Durable Objects),
the same setup as dreamteam.

## Develop

```sh
bun install
bun run db:migrate:local
bun run dev                     # http://localhost:3000
```

Copy [.env.example](./.env.example) to `.dev.vars` for local secrets. Wrangler
reads `.dev.vars` (not `.env`) when you run `bun run dev`.

Any request starts the Scheduler, which syncs schedules every minute and
wakes a LiveGame per live Game.

`bun run ci` is the one quality gate: format, lint (`--max-warnings 0`),
typecheck, `db:check`, tests, and the build. Tests run under `bun --bun` so
the SQLite-backed trading and agent suites are not skipped. GitHub Actions
runs that same script. `bun run fixtures:mlb <gamePk>` records a real StatsAPI
feed as a test fixture.

## Deploy

Production is **https://sportsline.dev** (a Cloudflare Custom Domain declared in
`wrangler.jsonc`; `sportsline.blazewalker59.workers.dev` also serves it). Merges
to `main` deploy to production via GitHub Actions (no staging). The workflow
runs `bun run ci`, then `bun run deploy`.

By hand: `bun run ship`. That is `bun run ci` followed by `bun run deploy`:
apply remote D1 migrations
(`wrangler d1 migrations apply sportsline-db --remote --env production`),
then `wrangler deploy`. Migrations are not a separate manual step.

Worker secrets (`wrangler secret put <NAME> --env production`). Every name
`CloudflareEnv` treats as a secret is listed in
[.env.example](./.env.example):

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `KALSHI_ENCRYPTION_KEY` (32 bytes, base64; seals Kalshi keys)
- `ESPN_ENCRYPTION_KEY` (32 bytes, base64; seals ESPN session cookies)
- `ODDS_API_KEY` (sharp-book prices)
- `VAPID_PRIVATE_JWK` (Web Push private key)

Public vars live in `wrangler.jsonc` under `env.production.vars`, not as
secrets: `CANONICAL_HOST`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `ADMIN_EMAILS`.
