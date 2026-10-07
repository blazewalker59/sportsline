# Agents propose Kalshi trades; the Viewer approves each one

Viewers want their Agents (docs/adr/0007) to trade on Kalshi for them, typically acting on Sharp picks. An Agent acting on its own with real money is one bad tool call from a costly mistake, so an Agent can only **propose** a trade, and nothing reaches Kalshi until the Viewer approves it in Sportsline.

**A separate trade key.** ADR 0003's connection stays read-only. To trade, a Viewer connects a second Kalshi key, stored the same way (sealed under `KALSHI_ENCRYPTION_KEY`). When it's connected, Kalshi must list its scopes as exactly `write::trade` plus reads. Kalshi's broad `write` scope also grants transfers, so it's refused, as is `write::transfer` and an unscoped key. A leaked trade key can trade but never withdraw or move money. Its only use is placing approved orders.

**Tokens opt in.** An API token gets the `trade` scope only if the Viewer ticks it when making the token. Without it, the Agent isn't even offered the trading tools.

**Proposals.** An Agent calls `propose_trade` with a market, side (YES or NO), buy or sell, a whole number of contracts, a limit price in cents and a note. Sportsline then:
- checks the market is open;
- checks the most the order could cost, contracts at the limit plus Kalshi's fee rounded up per contract, against the Viewer's limits;
- stores the proposal and pushes the Viewer an Alert.

A proposal lapses after 10 minutes, since prices move. A Viewer has at most five waiting. The Agent can follow its proposals with `get_trades` and withdraw one with `cancel_trade`, and can read prices with `get_market`.

**Approval.** On the Agents page the Viewer approves or rejects, and confirms the order once more before it's sent. Approving claims the proposal in one conditional update (pending and not lapsed), so it can only ever be placed once. The limits are checked again at that moment. Then the order goes out on Kalshi's V2 endpoint (`POST /portfolio/events/orders`):
- a limit order, immediate-or-cancel: it fills what it can at the limit or better and cancels the rest, so nothing is left resting;
- sells are reduce-only, so they can't open the opposite position;
- the proposal's id is the client order id, so Kalshi refuses a duplicate;
- the request is never retried automatically, since a lost reply might mean the order went through.

Kalshi's V2 book is quoted from the YES side (`bid` buys YES, `ask` sells it). Buying NO at 40¢ is sent as selling YES at 60¢, and selling NO as buying YES.

**Limits.** Each Viewer sets a most-per-order and a most-per-day amount: $25 and $100 to start, at most $1,000 and $5,000. They count fees. A day is a Sports Day, and it counts what approved orders actually cost (and the full possible cost of any still being placed).

**Record.** Every proposal is kept with its outcome:
- decided: rejected, cancelled or expired;
- placed: filled, partial, or unfilled at that price;
- failed, with Kalshi's reason.

Each records who proposed it and its fills. The Agents page shows them, and Agents read them with `get_trades`. Filled contracts appear as Predictions through the read-only sync, as any trade does.

## Considered Options

- **Let Agents trade directly within limits.** Faster, and what "on my behalf" literally means. But an Agent's mistakes (a misread market, the wrong side, a loop) would land as real trades before anyone saw them. Approval costs a tap. Auto-approval under a small limit could come later.
- **Reuse the read-only key with trade scope added.** One key instead of two, but every background sync would then hold a key able to trade, and ADR 0003's guarantee would be gone.
- **Resting (good-till-cancelled) orders.** More fills at the limit, but they'd need cancelling, amending and watching, by the Agent or the Viewer. Immediate-or-cancel orders are finished when placed.

## Consequences

- Trading needs the Viewer at hand: a proposal not approved in 10 minutes lapses.
- A stolen trade token can only propose. A stolen trade key, together with the database and the Worker secret, can trade within whatever the Viewer's Kalshi balance allows, but can't withdraw.
- An approval whose reply from Kalshi is lost is recorded as failed. Kalshi still holds the order if it went through, and the read-only sync will show the position.
