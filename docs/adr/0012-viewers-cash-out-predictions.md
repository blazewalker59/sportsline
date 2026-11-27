# Viewers cash out Predictions from Sportsline, with their trade key

A Viewer watching a Prediction in Sportsline had to switch to Kalshi to act on it. Cash out sells it back from the Prediction's sheet; Open in Kalshi beside it links to the market there.

**The trade key, widened by one use.** ADR 0008 gave the trade key one use: placing orders the Viewer approved for an Agent. Cash out adds a second: selling what the Viewer already holds, when they ask. The read-only connection (ADR 0003) is untouched: background syncs still never hold a key that can trade. A Viewer without a trade key sees how to connect one, and Open in Kalshi still works.

**A single sells into its market's book**, through the same V2 order path as an approved proposal:
- a limit order, immediate-or-cancel: whatever fills at once, the rest cancelled, nothing left resting;
- **reduce-only**, so it can never buy, open or flip a position, whatever count is sent;
- the price is the market's best bid for the side held; the order's worst price is 2¢ under it (`ALLOWANCE_CENTS`), shown to the Viewer, and the server refuses a request more than 5¢ under the price it reads at that moment;
- the cash out's id is the client order id, so it's sent at most once, and it's never retried.

**A Combo sells through a quote.** A Combo's market has no book (Kalshi shows an empty $0/$1 book), so there's nothing to sell into. Kalshi prices Combos by request for quote: Sportsline creates an RFQ for the contracts held (`rest_remainder: false`, the creator's id obscured), shows the best quote for the side held as makers answer, and accepts it when the Viewer holds to confirm. Kalshi's maker then confirms (3 seconds for a Combo) and it executes (1 second); Sportsline waits up to 8 seconds for that before saying it's still checking.
- A quote's `yes_bid` is a maker buying YES. Selling YES means accepting the quote's `no` side (buying NO nets against the YES held), and selling NO means accepting `yes`.
- **A quote has no reduce-only guard**: accepting more contracts than are held would open the opposite position. So the Viewer's position is read from Kalshi when the request is made and again just before accepting, and the count must be no more than it.
- The quote accepted must still be open at no worse a price than the one the Viewer saw.
- A request left open is closed when the Viewer leaves the sheet, after 5 minutes in any case, and an older open request of ours on the same market is closed to make room (Kalshi allows one per market).
- `write::trade`, the only write scope a trade key may have, covers RFQs and quotes as well as orders.

**Spending limits.** A cash out spends nothing but Kalshi's fee, shown before it's confirmed, so it isn't counted against the daily and per-order limits ADR 0008 set for Agents' buys, and those limits never stop a Viewer selling.

**Confirmation.** Cash out is held to confirm (a key with a ring that fills over about a second), so a stray tap can't sell. Assistive tech's click asks once more instead.

**Record.** Every cash out is kept (`cash_outs`) with its outcome: filled, partial, unfilled, failed (Kalshi refused it: nothing was sold), expired (a request no one accepted), or unknown (sent, the reply lost). The Viewer's ViewerSync settles one left placing, accepted or unknown a few minutes later: an order by its client order id, a quote from the quote's own record and the fills of the order it made.

**Open in Kalshi** links to `kalshi.com/markets/<series>/<event>`, which Kalshi sends on to the market's page. The series is read from Kalshi's event once and remembered (`kalshi_events.series_ticker`), never parsed from a ticker, which Kalshi warns against. A Combo has no page of its own, so it links to the Viewer's portfolio, and each Leg to its own event.

## Considered Options

- **Cash out a Combo at its estimated value with an order.** The estimate (its Legs' odds multiplied) is what the sheet shows, but there's no book to fill it; an order would sit unfilled or need a price Kalshi's book doesn't have.
- **Accept the best quote automatically after a request.** One step fewer, but the Viewer would sell at a price they hadn't seen. The quote is shown and held to confirm.
- **Use the read-only key with trade scope added.** As in ADR 0008, every background sync would hold a key able to trade.
- **Count cash outs against the spending limits.** They spend only a fee, and a limit that kept a Viewer from getting out of a position would work against them.

## Consequences

- A Viewer can sell from Sportsline without opening Kalshi; a stolen trade key could also sell a Viewer's positions, never withdraw (as before, it already could place orders).
- A Combo's cash out depends on market makers answering; with none, the Viewer is told, and can try again or sell in Kalshi.
- Selling part of a position is possible; the rest stays theirs, and their Prediction updates on the next sync (it's asked for right after a sale).
