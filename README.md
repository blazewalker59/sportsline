# Sportsline

A live, livestream-style Timeline of play-by-play across MLB, NBA, NFL and NHL,
filtered to the Teams, Players and Leagues you follow. Domain language lives in
[CONTEXT.md](./CONTEXT.md); decisions in [docs/adr](./docs/adr).

Deployed as a single Cloudflare Worker (TanStack Start + D1 + Durable Objects),
the same setup as dreamteam.

## Develop

```sh
bun install
bun run db:migrate:local
bun run dev                     # http://localhost:3000
```

Any request starts the Scheduler, which syncs schedules every minute and
wakes a LiveGame per live Game.

`bun run ci` runs format, lint, typecheck, tests and the build.
`bun run fixtures:mlb <gamePk>` records a real StatsAPI feed as a test fixture.

## Deploy

Production is **https://sportsline.dev** (a Cloudflare Custom Domain declared in
`wrangler.jsonc`; `sportsline.blazewalker59.workers.dev` also serves it). Merges
to `main` deploy to production via GitHub Actions (no staging).
By hand: `bun run ship`. Migrations are applied by hand:
`bun run db:migrate:remote -- --env production`.

Worker secrets (`wrangler secret put <NAME> --env production`):
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
