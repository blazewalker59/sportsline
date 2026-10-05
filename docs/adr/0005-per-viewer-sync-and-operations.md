# One sync Durable Object per Viewer; jobs report through one runner

The Scheduler Durable Object (docs/adr/0001, "Scheduling") ran everything on one once-a-minute alarm: League schedules, rosters, retention, and every Viewer's Kalshi prices, Kalshi positions, Prediction Alerts, ESPN Matchups and Sleeper Matchups, each Viewer in turn and capped per tick. That made one Viewer's slow Source everyone's delay, made the minute's work grow with every Viewer, and gave a failing account no backoff of its own. And failures only reached `console.error`: a fills lookup failed quietly for every Prediction and nobody saw it until the data was queried.

Each Viewer now has a **ViewerSync** Durable Object (named by their id) running their own work on their own alarm: Kalshi prices and Prediction Alerts each minute while they hold open Predictions, Kalshi positions every five minutes, ESPN and Sleeper Matchups every two. Each task has its own cadence and its own exponential backoff (to 30 minutes) when it fails; with no connected accounts the object stops scheduling itself. It is started when a Viewer connects an account or opens the app, and the Scheduler sweeps every ten minutes to restart any that should be running (after a deploy, or if an alarm is ever lost). The Scheduler keeps only global work: schedules each minute, rosters and retention daily, the sweep, and a staleness check.

Every background job, global or per Viewer, runs through one runner (`runJob`) that keeps its heartbeat in `job_runs` and reports failures through `reportError`, which logs, groups errors by kind in `error_events`, and pushes the admins (`ADMIN_EMAILS`) when a kind is new or returns after six hours. A job with no success in twice its interval is stale; the staleness check reports it. The health page (`/admin`) shows jobs, accounts and errors.

## Considered Options

- **Cloudflare Queues** (the Scheduler enqueues per-account jobs, consumers run them with retries and a dead-letter queue). Scales further and retries for free, but adds a binding and a second delivery path, and a per-account job would still need state for its cadence and backoff; per-Viewer Durable Objects hold that state where the work runs, the way LiveGame does per Game.
- **Keep one Scheduler, run Viewers concurrently.** Cheapest change, but the minute's budget still grows with Viewers and one stuck request still holds the alarm.
- **An error service (Sentry).** More features, but another account and SDK in the Worker; Workers Logs plus our own grouping and admin pushes cover a friends-scale app.

## Consequences

- Kalshi prices are fetched per Viewer, so a market two Viewers hold is fetched twice. Each Viewer's requests are signed with their own key anyway (docs/adr/0003).
- A new Durable Object class needs a migration tag in `wrangler.jsonc`.
- At larger scale the sweep's one query over accounts, and the single global LiveHub, are the next things to shard.
