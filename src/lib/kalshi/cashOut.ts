/**
 * Cashing out a Prediction (CONTEXT.md, "Cash out"; docs/adr/0012): what
 * it would bring, and the shapes of the two ways Kalshi takes it back. A
 * single sells into its market's book with a reduce-only order; a Combo,
 * whose market has no book, through a quote from market makers (an RFQ).
 * Pure.
 */

/**
 * How far under the price shown a single's cash out may fill, in cents: a
 * fast market still fills, and never worse than this.
 */
export const ALLOWANCE_CENTS = 2
/** The most a request may allow under the market's price (a guard). */
export const MAX_ALLOWANCE_CENTS = 5

/**
 * What one contract of the side held sells for now, from the market's book:
 * the best bid for that side, in whole cents (null when no one's buying).
 */
export function sellCents(
  side: 'yes' | 'no',
  book: { yesBid: number | null; noBid: number | null },
): number | null {
  const bid = side === 'yes' ? book.yesBid : book.noBid
  if (bid === null || !Number.isFinite(bid) || bid <= 0) return null
  return Math.round(bid * 100)
}

/** The order's worst price: the price shown, less the allowance (≥ 1¢). */
export function limitFor(cents: number, allowance = ALLOWANCE_CENTS): number {
  return Math.max(1, cents - allowance)
}

/**
 * Fees and what's left, for `count` contracts sold at `price` (dollars).
 * Kalshi's taker fee is 7% of count × price × (1 − price), rounded up to
 * the cent once for the whole trade (not per contract, as the Agents'
 * spending caps count it, conservatively). An estimate: a series can
 * carry its own fee multiplier.
 */
export function proceeds(
  count: number,
  price: number,
): { gross: number; fees: number; net: number } {
  const gross = round2(count * price)
  const fees = Math.ceil(0.07 * count * price * (1 - price) * 100 - 1e-9) / 100
  return { gross, fees, net: round2(gross - fees) }
}

/**
 * A quote's price for selling the side held. A quote's `yes_bid` is a
 * maker buying YES, so it's what YES sells for; `no_bid`, NO.
 */
export function quotePrice(
  side: 'yes' | 'no',
  q: { yes_bid_dollars?: string; no_bid_dollars?: string },
): number | null {
  const v = Number(side === 'yes' ? q.yes_bid_dollars : q.no_bid_dollars)
  return Number.isFinite(v) && v > 0 ? v : null
}

/**
 * The side to accept to sell what's held. Accepting a quote takes the
 * opposite side to the maker's bid: selling YES (into a maker's YES bid)
 * is accepting "no", buying NO, which nets against the YES held; selling
 * NO is accepting "yes".
 */
export function acceptSide(held: 'yes' | 'no'): 'yes' | 'no' {
  return held === 'yes' ? 'no' : 'yes'
}

export interface KalshiQuote {
  id: string
  rfq_id?: string
  market_ticker?: string
  contracts_fp?: string
  yes_bid_dollars?: string
  no_bid_dollars?: string
  status?: 'open' | 'accepted' | 'confirmed' | 'executed' | 'cancelled'
  executed_ts?: string
  cancelled_ts?: string
  cancellation_reason?: string
  rfq_creator_order_id?: string
}

/** The best open quote for selling the side held, or null for none yet. */
export function bestQuote(
  side: 'yes' | 'no',
  quotes: ReadonlyArray<KalshiQuote>,
): { quote: KalshiQuote; price: number } | null {
  let best: { quote: KalshiQuote; price: number } | null = null
  for (const q of quotes) {
    if (q.status && q.status !== 'open') continue
    const price = quotePrice(side, q)
    if (price !== null && (!best || price > best.price))
      best = { quote: q, price }
  }
  return best
}

/**
 * Contracts the Viewer holds on their side, from Kalshi's signed position
 * (positive YES, negative NO). A Combo's quote has no reduce-only guard,
 * so it never sells more than this.
 */
export function heldOn(side: 'yes' | 'no', position: number): number {
  const held = side === 'yes' ? position : -position
  return held > 0 ? held : 0
}

/** A count Kalshi takes: positive, in hundredths, no more than held. */
export function validCount(count: number, held: number): boolean {
  return (
    Number.isFinite(count) &&
    count > 0 &&
    Math.abs(count * 100 - Math.round(count * 100)) < 1e-6 &&
    count <= held + 1e-9
  )
}

// ─── Kalshi's pages ────────────────────────────────────────────────────────

/**
 * An event's page on Kalshi: kalshi.com/markets/<series>/<event>, which
 * Kalshi sends on to the page with its title in the path.
 */
export function eventUrl(seriesTicker: string, eventTicker: string): string {
  return `https://kalshi.com/markets/${encodeURIComponent(seriesTicker.toLowerCase())}/${encodeURIComponent(eventTicker.toLowerCase())}`
}

/** The Viewer's portfolio: where a Combo lives on Kalshi. */
export const PORTFOLIO_URL = 'https://kalshi.com/portfolio'

const round2 = (n: number) => Math.round(n * 100) / 100
