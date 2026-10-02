# One Durable Object per live Game, pushing Plays over WebSocket

The Timeline should feel live (target: ~5–10s behind the Source), but every Source is pull-only and Cloudflare cron triggers fire at most once per minute. We run one Durable Object per live Game that polls its Source every ~5s via alarms, diffs the result against the Plays it has already seen, persists new and corrected Plays, and pushes them over hibernatable WebSockets to connected Viewers. A once-a-minute cron only wakes Games as they go live.

## Considered Options

- **Cron → D1 → browser polling (~1 min).** Simplest, but feels like refreshing a box score, not a livestream.
- **Polling every 1–2s.** Source latency dominates anyway; faster polling only adds load on unofficial Sources.

## Consequences

- Plays are mutable: Sources revise them (scoring changes, reversed calls), so the pipeline carries updates and removals, not just appends.

## Fan-out

Game Durable Objects push new Plays, Revisions, Removals and Game Milestones to a single Live Hub Durable Object. Each browser holds one hibernatable WebSocket to the Hub, which filters by that Viewer's Follows. The Timeline backlog (today's Sports Day from the Read Marker) loads from D1 over HTTP; the Hub carries only what happens after connect and is a relay, never a store, so a restart loses nothing and clients refetch the gap. Per-Viewer DOs and direct browser-to-Game sockets were rejected as overkill and client-fragile respectively at friends scale; the Hub can later be sharded by League without changing clients.
