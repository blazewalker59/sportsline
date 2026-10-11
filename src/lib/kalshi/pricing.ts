/**
 * What a Prediction's market is worth now (CONTEXT.md, "Odds"). Pure.
 *
 * A single market trades on a book: its chance is the bid/ask midpoint.
 * A Combo's market has no book (Kalshi shows a $0 bid and $1 ask), so its
 * chance is its Legs' chances multiplied, a won Leg counting 1 and a lost
 * one 0: the way Kalshi prices a Combo's cash-out. Without priced Legs, a
 * market's last trade stands in.
 */

export interface Book {
  yesBid: number | null
  yesAsk: number | null
  lastPrice: number | null
}

/** No resting orders on either side: Kalshi's $0 bid / $1 ask. */
const isEmptyBook = (b: Book) => (b.yesBid ?? 0) <= 0 && (b.yesAsk ?? 1) >= 1

/** A market's YES chance (0–1) from its book, else its last trade. */
export function bookChance(b: Book): number | null {
  if (!isEmptyBook(b) && b.yesBid !== null && b.yesAsk !== null && b.yesAsk > 0)
    return (b.yesBid + b.yesAsk) / 2
  return b.lastPrice
}

export interface PricedLeg {
  side: 'yes' | 'no'
  /** The Leg market's YES chance now; null if unpriced. */
  yesChance: number | null
  /** 'yes' or 'no' once the Leg market settles. */
  result?: string | null
}

/** A Combo's YES chance: every Leg going its way, multiplied. */
export function comboChance(legs: ReadonlyArray<PricedLeg>): number | null {
  if (legs.length === 0) return null
  let chance = 1
  for (const l of legs) {
    if (l.result === 'yes' || l.result === 'no') {
      if (l.result !== l.side) return 0
      continue
    }
    if (l.yesChance === null) return null
    chance *= l.side === 'yes' ? l.yesChance : 1 - l.yesChance
  }
  return chance
}

/**
 * A Prediction's YES chance: a Combo's from its Legs (its own book is
 * empty), a single's from its book; the last trade when neither prices.
 */
export function predictionYesChance(
  kind: 'single' | 'combo',
  own: Book | undefined,
  legs: ReadonlyArray<PricedLeg>,
): number | null {
  if (kind === 'combo') {
    const fromLegs = comboChance(legs)
    if (fromLegs !== null) return fromLegs
  }
  return own ? bookChance(own) : null
}

/**
 * What the position would sell for now (dollars): at the bid on a book,
 * else (a Combo) at its fair value from the chance.
 */
export function positionValue(
  side: 'yes' | 'no',
  contracts: number,
  own: Book | undefined,
  yesChance: number | null,
): number | null {
  if (own && !isEmptyBook(own)) {
    const sell =
      side === 'yes' ? own.yesBid : own.yesAsk !== null ? 1 - own.yesAsk : null
    if (sell !== null) return contracts * sell
  }
  if (yesChance === null) return null
  return contracts * (side === 'yes' ? yesChance : 1 - yesChance)
}
