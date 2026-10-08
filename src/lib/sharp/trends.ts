/**
 * Trend picks (docs/adr/0009): a fair price from our own finals instead of
 * the sharp books. Each Team's recent margin and totals, shrunk toward
 * average (a week of games is mostly noise), give an expected margin and
 * total; a normal spread around them gives each Line's chance. That chance
 * is then blended with Kalshi's own price, which knows far more than a
 * week of scores. Pure.
 */

import { lineId } from './engine'
import type { Fair, KalshiOffer, LineKey } from './engine'
import type { FormGame, TeamForm } from './form'
import type { League } from '@/lib/model/types'

/** How much of the fair price is the trend model; the rest is Kalshi's. */
export const TREND_WEIGHT = 0.35
/** A Team's form counts n / (n + this) of itself: 6 games count half. */
const SHRINK_GAMES = 6
/** Fewer Games than this and a Team's trend isn't read. */
export const MIN_TREND_GAMES = 3

/** How much one Game's final margin varies around what's expected. */
const MARGIN_SD: Record<League, number> = {
  nfl: 13.5,
  nba: 12.5,
  mlb: 4.2,
  nhl: 2.4,
  cfb: 16,
}
/** How much one Game's total varies around what's expected. */
const TOTAL_SD: Record<League, number> = {
  nfl: 13.5,
  nba: 18,
  mlb: 4.4,
  nhl: 2.3,
  cfb: 16,
}
/** What playing at home is worth on the scoreboard. */
const HOME_EDGE: Record<League, number> = {
  nfl: 1.5,
  nba: 2.3,
  mlb: 0.2,
  nhl: 0.15,
  cfb: 2.5,
}
/** A typical Game's total, when too few finals are stored to measure it. */
export const TYPICAL_TOTAL: Record<League, number> = {
  nfl: 45,
  nba: 228,
  mlb: 8.8,
  nhl: 6.1,
  cfb: 55,
}

export interface TrendGame extends FormGame {
  gameId: string
}

export interface Expectation {
  /** Home score minus away score. */
  margin: number
  total: number
}

const shrink = (n: number) => n / (n + SHRINK_GAMES)

/** What our trends expect of a Game, or null if a Team has too few Games. */
export function expectation(
  game: TrendGame,
  forms: ReadonlyMap<string, TeamForm>,
  leagueTotal: number = TYPICAL_TOTAL[game.league],
): Expectation | null {
  const home = forms.get(game.home.id)
  const away = forms.get(game.away.id)
  if (
    !home ||
    !away ||
    home.games < MIN_TREND_GAMES ||
    away.games < MIN_TREND_GAMES
  )
    return null
  const rating = (f: TeamForm) => shrink(f.games) * f.avgMargin
  const total = (f: TeamForm) =>
    leagueTotal + shrink(f.games) * (f.avgTotal - leagueTotal)
  return {
    margin: rating(home) - rating(away) + HOME_EDGE[game.league],
    total: (total(home) + total(away)) / 2,
  }
}

/** The standard normal CDF (Abramowitz and Stegun 7.1.26, error < 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** Our trends' chance that a Line's YES wins. */
export function trendChance(
  key: LineKey,
  game: TrendGame,
  e: Expectation,
): number {
  const sd = MARGIN_SD[game.league]
  if (key.kind === 'total') {
    const line = key.line ?? e.total
    return 1 - normalCdf((line - e.total) / TOTAL_SD[game.league])
  }
  // The backed Team's expected margin.
  const mine = key.teamId === game.away.id ? -e.margin : e.margin
  const line = key.kind === 'spread' ? (key.line ?? 0) : 0
  return 1 - normalCdf((line - mine) / sd)
}

export interface TrendFair {
  /** The blended fair price, keyed like the sharp fair price. */
  fair: Map<string, Fair>
  /** The trend model's own chance of each Line's YES. */
  model: Map<string, number>
}

/**
 * Fair prices for Kalshi's Lines from our trends, blended with Kalshi's
 * own price (the middle of its YES bid and ask).
 */
export function trendFair(
  offers: ReadonlyArray<KalshiOffer>,
  games: ReadonlyMap<string, TrendGame>,
  forms: ReadonlyMap<string, TeamForm>,
  totals: ReadonlyMap<League, number> = new Map(),
): TrendFair {
  const fair = new Map<string, Fair>()
  const model = new Map<string, number>()
  const expected = new Map<string, Expectation | null>()
  for (const o of offers) {
    if (o.side !== 'yes') continue
    const game = games.get(o.key.gameId)
    if (!game) continue
    if (!expected.has(game.gameId))
      expected.set(
        game.gameId,
        expectation(game, forms, totals.get(game.league)),
      )
    const e = expected.get(game.gameId)
    if (!e) continue
    const p = trendChance(o.key, game, e)
    const market = o.bid === null ? o.price : (o.price + o.bid) / 2
    const id = lineId(o.key)
    model.set(id, p)
    fair.set(id, {
      prob: TREND_WEIGHT * p + (1 - TREND_WEIGHT) * market,
      sources: [],
    })
  }
  return { fair, model }
}

/** Each League's average total in these finals, where there are enough. */
export function leagueTotals(
  finals: ReadonlyArray<{ league: League; total: number }>,
  minGames = 10,
): Map<League, number> {
  const sums = new Map<League, { n: number; sum: number }>()
  for (const f of finals) {
    const s = sums.get(f.league) ?? { n: 0, sum: 0 }
    sums.set(f.league, { n: s.n + 1, sum: s.sum + f.total })
  }
  return new Map(
    [...sums]
      .filter(([, s]) => s.n >= minGames)
      .map(([league, s]) => [league, s.sum / s.n]),
  )
}
