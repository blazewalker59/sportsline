# Sharp picks: Kalshi against a sharp-book fair price, judged by the close

Sharp picks are the day's five Kalshi sports offers most underpriced, plus one combo. "Underpriced" needs a fair price to measure against. We take it from the sharpest prices available rather than from a model of our own: Pinnacle, Novig, Polymarket, BetOnline and DraftKings, read through The Odds API's free tier (about 12 of its 500 monthly credits a day), plus Polymarket's own public API.

Each source's two-way price is de-vigged multiplicatively. Sources are weighted Pinnacle 3, Novig 2, Polymarket 2, BetOnline 1.5, DraftKings 1. A source more than 8 points from the sharp sources' consensus is dropped as stale or in-play. A line needs at least one sharp source (Pinnacle, Novig or Polymarket) to be priced.

Every Kalshi winner, spread ("wins by over") and total for the four Leagues is mapped onto one canonical line per proposition. YES is bought at the ask and NO at one minus the bid. Kalshi's taker fee, ceil(7% × p × (1 − p)) per contract, is subtracted. What's left is the edge.

Offers are filtered:
- price 20–80¢;
- spreads and totals on each Game's main line only: of the lines both Kalshi and the fair price have, the one nearest even money;
- spread no wider than 6¢;
- at least 20 minutes before the start.

Each is then read against the two Teams' Form (below), and ranked by expected value per dollar plus up to 3 points for Form that backs it. The slate takes one per Game and at most two per League and two per market type, relaxing the mix rules (never one per Game) when it would fall short.

The slate always has five picks, graded strong (3+ points), edge (1–3) or thin. Most days Kalshi tracks the sharp books within a few points, so "only show real edges" would usually mean an empty screen. The grade is the honest signal instead.

### Form (added 2026-10-06)

The first slates leaned on easy alt-spread lines. Kalshi lists a whole ladder of "wins by over" rungs, and Polymarket alone can price a rung the books don't quote, so those rungs showed edges against the book that were thin and said nothing about how the Teams are playing. Three changes make the slate more deliberate:

- Main lines only, and no price above 80¢ (below 20¢ was already out).
- Each Team's Form from our own finals: record, average margin and average total over the last 7 days, or its last 3 Games within 21 days when that's fewer. A Team with fewer than 2 Games has no Form, which counts as neutral.
- Form's lean on a pick runs from −1 to 1. For a winner or spread it's the backed Team's average margin minus the other's, over a typical swing for the League (NFL 13, NBA 12, MLB 3.5, NHL 2.2). For a total it's the recent games' average total minus the line (NFL 10, NBA 15, MLB 3, NHL 1.6). NO flips the sign. A pick leaning below −0.15 is left out. Otherwise lean × 0.03 is added to its value per dollar when ranking, for the combo's legs too.

Form is a filter and a tiebreak, not a price. The market already knows who's hot, and recent form alone overreacts, so it never makes an edge out of nothing. Each pick stores its Form note so the reason is on the screen, and closing line value will say whether Form-backed picks beat the close more than the others.

The combo takes two or three legs of at least 45% fair from different Games, assuming they're independent. Kalshi prices combos on request and our key is read-only, so we can't quote one. We show the fair price less the fee ("worth it under") to compare a quote with.

Picks publish once a day from 10am Eastern (Scheduler), using a service account: an admin's Kalshi connection, since Kalshi only answers signed requests from Cloudflare (docs/adr/0003). They're re-checked every 15 minutes for the price now, the edge left, the closing price at the start, and the result. The record leads with closing line value, because results over a few dozen picks are mostly noise.

## Considered Options

- **Our own model** (ratings, injuries, pace). Real work to build and calibrate, and it would rarely beat Pinnacle's closing number; the market already is that model.
- **Paid odds feeds** (The Odds API's paid tiers, OddsJam). They add player props and more books. Deferred until closing line value says the free version is worth paying to extend.
- **Show only positive-edge picks.** Truer, but usually empty; grading keeps the daily habit and says plainly when a day is thin.

## Consequences

- Picks depend on an admin keeping a working Kalshi connection; without one the slate job fails and reports.
- The free tier leaves little headroom; a low-credit warning goes through `reportError` under 60 remaining.
- No player props until a paid feed.
