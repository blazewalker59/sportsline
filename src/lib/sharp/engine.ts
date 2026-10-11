/**
 * Sharp picks (CONTEXT.md, "Sharp pick"; docs/adr/0006): the day's Kalshi
 * prices measured against a fair price from sharper markets. Pure: the
 * sources and Kalshi are read elsewhere; this decides what's fair, what
 * an edge is worth after Kalshi's fee, and which five (and which combo)
 * make the slate.
 *
 * Every price is a probability (0–1). A Line is one proposition about one
 * of our Games, in a canonical form every source maps onto:
 * - moneyline: `teamId` wins;
 * - spread: `teamId` wins by more than `line` (Kalshi's "wins by over");
 * - total: more than `line` scored.
 */

import type { PickForm } from './form'
import type { League } from '@/lib/model/types'

export type MarketKind = 'moneyline' | 'spread' | 'total'

export interface LineKey {
  gameId: string
  kind: MarketKind
  /** The team the proposition is about (moneyline, spread). */
  teamId: string | null
  /** Spread margin or total (spread: positive, "by more than"). */
  line: number | null
}

export const lineId = (k: LineKey) =>
  `${k.gameId}|${k.kind}|${k.teamId ?? ''}|${k.line ?? ''}`

export type FairSource =
  'pinnacle' | 'novig' | 'polymarket' | 'betonline' | 'draftkings'

/** How much each source's price counts toward the fair price. */
const SOURCE_WEIGHT: Record<FairSource, number> = {
  pinnacle: 3,
  novig: 2,
  polymarket: 2,
  betonline: 1.5,
  draftkings: 1,
}

/** A source this far (probability) from the sharp consensus is left out. */
const MAX_DISAGREEMENT = 0.08

/** The sharp sources: a fair price needs at least one of these. */
const SHARP: ReadonlySet<FairSource> = new Set([
  'pinnacle',
  'novig',
  'polymarket',
])

export interface Quote {
  key: LineKey
  source: FairSource
  /** The proposition's no-vig probability at this source. */
  prob: number
}

// ─── Prices ─────────────────────────────────────────────────────────────────

/** American odds (−150, +130) as the implied probability, vig included. */
export function impliedFromAmerican(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100)
}

/**
 * Two outcomes' implied probabilities with the book's margin taken out,
 * proportionally (the multiplicative method): they sum to 1.
 */
export function devig(a: number, b: number): [number, number] {
  const total = a + b
  if (!(total > 0)) return [Number.NaN, Number.NaN]
  return [a / total, b / total]
}

/**
 * Kalshi's taker fee per contract at price `p`: 7% of p × (1 − p),
 * rounded up to the cent (Kalshi rounds per order; per contract is the
 * conservative reading).
 */
export function kalshiFee(p: number): number {
  return Math.ceil(0.07 * p * (1 - p) * 100 - 1e-9) / 100
}

export interface Fair {
  prob: number
  sources: Array<{ source: FairSource; prob: number }>
}

/** Each Line's fair price: its sources' no-vig prices, weighted. */
export function fairPrices(quotes: ReadonlyArray<Quote>): Map<string, Fair> {
  const byLine = new Map<string, Array<Quote>>()
  for (const q of quotes) {
    if (!Number.isFinite(q.prob) || q.prob <= 0 || q.prob >= 1) continue
    const id = lineId(q.key)
    // One price per source per Line (the latest read wins).
    const list = (byLine.get(id) ?? []).filter((x) => x.source !== q.source)
    list.push(q)
    byLine.set(id, list)
  }
  const out = new Map<string, Fair>()
  for (const [id, all] of byLine) {
    // A source far from the sharp consensus is stale or in-play: drop it.
    const sharp = all.filter((q) => SHARP.has(q.source))
    const reference = sharp.length
      ? sharp.reduce((n, q) => n + q.prob * SOURCE_WEIGHT[q.source], 0) /
        sharp.reduce((n, q) => n + SOURCE_WEIGHT[q.source], 0)
      : null
    const list =
      reference === null
        ? all
        : all.filter((q) => Math.abs(q.prob - reference) <= MAX_DISAGREEMENT)
    if (list.length === 0) continue
    const weight = list.reduce((n, q) => n + SOURCE_WEIGHT[q.source], 0)
    out.set(id, {
      prob:
        list.reduce((n, q) => n + q.prob * SOURCE_WEIGHT[q.source], 0) / weight,
      sources: list.map((q) => ({ source: q.source, prob: q.prob })),
    })
  }
  return out
}

// ─── Candidates ─────────────────────────────────────────────────────────────

/** One side of a Kalshi market on one of our Lines, as it can be bought. */
export interface KalshiOffer {
  ticker: string
  key: LineKey
  league: League
  startsAt: string
  /** Buying YES backs the Line; NO bets against it. */
  side: 'yes' | 'no'
  /** What one contract of that side costs now (the ask). */
  price: number
  /** The other side of the book: (ask − this) is the spread. */
  bid: number | null
  volume: number
  /** "Packers win", "Over 47.5": what the pick says. */
  title: string
  gameLabel: string
  /** Kalshi's own title for the Game ("Indiana vs Nebraska"), for its link. */
  gameTitle?: string | null
}

/**
 * How much edge a pick really has, after the fee: strong (3+ points),
 * edge (1–3), or thin (under 1, or the best of a fairly priced day). The
 * slate always has five; the grade says how sharp each is.
 */
type Grade = 'strong' | 'edge' | 'thin'

function gradeOf(edge: number): Grade {
  return edge >= 0.03 ? 'strong' : edge >= 0.01 ? 'edge' : 'thin'
}

export interface Candidate extends KalshiOffer {
  fair: number
  fee: number
  /** Fair minus what it costs (price and fee): the edge, in probability. */
  edge: number
  /** Expected profit per dollar staked. */
  evPerDollar: number
  grade: Grade
  sources: Fair['sources']
  /** What the Teams' recent form says about it (null: too few Games). */
  form: PickForm | null
}

export interface Rules {
  now: number
  /** Least edge worth showing, after the fee (probability points). */
  minEdge: number
  /** Widest bid/ask spread trusted as a real price. */
  maxSpread: number
  minPrice: number
  maxPrice: number
  /** A pick must start at least this long from now. */
  minLeadMs: number
  /**
   * Trust a fair price only with a sharp source in it (default). Off for
   * trend picks, whose fair price is our own (src/lib/sharp/trends.ts).
   */
  requireSharp?: boolean
}

export const DEFAULT_RULES: Omit<Rules, 'now'> = {
  // Low enough that a fairly priced day still fills five (graded thin).
  minEdge: -0.03,
  maxSpread: 0.06,
  // Nothing near a lock: an 85¢ "sure thing" risks a lot to win a little.
  minPrice: 0.2,
  maxPrice: 0.8,
  minLeadMs: 20 * 60_000,
}

/** Form this far against a pick (lean) leaves it out. */
const MAX_FORM_AGAINST = 0.15
/** What full form backing is worth in the ranking (per dollar). */
const FORM_WEIGHT = 0.03

/** How a candidate ranks: its value, nudged by the Teams' form. */
export const scoreOf = (c: Candidate) =>
  c.evPerDollar + FORM_WEIGHT * (c.form?.lean ?? 0)

/**
 * Each Game's main spread and total: of the lines both Kalshi and the fair
 * price have, the one nearest even money. Alt lines up and down the ladder
 * are priced thinly (often by one source), so their edges are mostly noise.
 */
function mainLines(
  offers: ReadonlyArray<KalshiOffer>,
  fair: ReadonlyMap<string, Fair>,
): Map<string, number> {
  const best = new Map<string, { line: number; off: number }>()
  for (const o of offers) {
    if (o.key.kind === 'moneyline' || o.key.line === null) continue
    const f = fair.get(lineId(o.key))
    if (!f) continue
    const id = `${o.key.gameId}|${o.key.kind}`
    const off = Math.abs(f.prob - 0.5)
    const was = best.get(id)
    if (!was || off < was.off) best.set(id, { line: o.key.line, off })
  }
  return new Map([...best].map(([id, b]) => [id, b.line]))
}

/**
 * Price every offer against its fair price; keep the trustworthy edges on
 * main lines that the Teams' form doesn't argue against.
 */
export function candidates(
  offers: ReadonlyArray<KalshiOffer>,
  fair: ReadonlyMap<string, Fair>,
  rules: Rules,
  formFor: (o: KalshiOffer) => PickForm | null = () => null,
): Array<Candidate> {
  const main = mainLines(offers, fair)
  return offers.flatMap((o) => {
    const f = fair.get(lineId(o.key))
    if (!f) return []
    // Trust a fair price only with a sharp source in it.
    if (
      rules.requireSharp !== false &&
      !f.sources.some((s) => SHARP.has(s.source))
    )
      return []
    if (
      o.key.kind !== 'moneyline' &&
      main.get(`${o.key.gameId}|${o.key.kind}`) !== o.key.line
    )
      return []
    if (Date.parse(o.startsAt) - rules.now < rules.minLeadMs) return []
    if (o.price < rules.minPrice || o.price > rules.maxPrice) return []
    if (o.bid !== null && o.price - o.bid > rules.maxSpread) return []
    const fairSide = o.side === 'yes' ? f.prob : 1 - f.prob
    const fee = kalshiFee(o.price)
    const edge = fairSide - o.price - fee
    if (edge < rules.minEdge) return []
    const form = formFor(o)
    if (form && form.lean < -MAX_FORM_AGAINST) return []
    return [
      {
        ...o,
        fair: fairSide,
        fee,
        edge,
        evPerDollar: edge / (o.price + fee),
        grade: gradeOf(edge),
        sources: f.sources,
        form,
      },
    ]
  })
}

/**
 * The day's five: the best expected value per dollar (nudged by form), no
 * two from one Game, at most two per League and two per kind of market, so
 * the slate mixes sports and market types. Relaxes the mix rules (never the
 * one-per-Game rule) when they'd leave it short.
 */
export function selectPicks(
  pool: ReadonlyArray<Candidate>,
  count = 5,
): Array<Candidate> {
  const ranked = [...pool].sort((a, b) => scoreOf(b) - scoreOf(a))
  const pick = (
    perLeague: number,
    perKind: number,
    start: Array<Candidate>,
  ) => {
    const out = [...start]
    for (const c of ranked) {
      if (out.length >= count) break
      if (out.includes(c)) continue
      if (out.some((p) => p.key.gameId === c.key.gameId)) continue
      if (out.filter((p) => p.league === c.league).length >= perLeague) continue
      if (out.filter((p) => p.key.kind === c.key.kind).length >= perKind)
        continue
      out.push(c)
    }
    return out
  }
  let picks = pick(2, 2, [])
  if (picks.length < count) picks = pick(2, count, picks)
  if (picks.length < count) picks = pick(count, count, picks)
  return picks
}

export interface ComboPick {
  legs: Array<Candidate>
  /** All legs going their way, by the fair prices (assumed independent). */
  fair: number
  /** The legs' Kalshi prices multiplied: roughly what a combo would cost. */
  impliedPrice: number
  /** The most worth paying: fair less the fee at that price. */
  worthItUnder: number
  edge: number
}

/**
 * The day's combo (always one): two or three legs from different Games,
 * likely each (≥ 45% fair) and each priced below fair, the biggest edges
 * (nudged by form) first, so the fair combined chance beats what the legs
 * cost together by the most.
 * Kalshi prices a combo on request, so `worthItUnder` is the line to
 * compare its quote with.
 */
export function selectCombo(
  pool: ReadonlyArray<Candidate>,
  legs = 3,
): ComboPick | null {
  const ranked = [...pool]
    .filter((c) => c.fair >= 0.45)
    .sort(
      (a, b) =>
        b.edge +
        FORM_WEIGHT * (b.form?.lean ?? 0) -
        (a.edge + FORM_WEIGHT * (a.form?.lean ?? 0)),
    )
  const chosen: Array<Candidate> = []
  for (const c of ranked) {
    if (chosen.length >= legs) break
    if (chosen.some((p) => p.key.gameId === c.key.gameId)) continue
    chosen.push(c)
  }
  if (chosen.length < 2) return null
  const fair = chosen.reduce((n, c) => n * c.fair, 1)
  const impliedPrice = chosen.reduce((n, c) => n * c.price, 1)
  return {
    legs: chosen,
    fair,
    impliedPrice,
    worthItUnder: Math.max(0, fair - kalshiFee(fair)),
    edge: fair - impliedPrice - kalshiFee(impliedPrice),
  }
}

// ─── Track record ───────────────────────────────────────────────────────────

/**
 * Closing line value: how much the price moved toward the pick by the
 * start (probability points). Beating the close is the sharpest sign a
 * pick was right before the result says anything.
 */
export function closingLineValue(price: number, closing: number): number {
  return closing - price
}

/** Profit per contract once settled: won pays $1; both pay price + fee. */
export function profitPerContract(
  price: number,
  result: 'won' | 'lost',
): number {
  const fee = kalshiFee(price)
  return result === 'won' ? 1 - price - fee : -(price + fee)
}
