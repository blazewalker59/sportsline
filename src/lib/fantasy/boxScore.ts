/**
 * A category league's Lineup as a box score (as dreamteam shows it): one
 * row per Player, one column per category, shooting as makes/attempts,
 * and each column's leader on the team that day. Pure.
 */

import { addStats, categoryValue, formatCategory, isRate } from './categories'
import type { LeagueCategory, Stats } from './categories'
import type { FantasySport } from './sports'

export interface BoxColumn {
  statId: number
  label: string
  /** Lower wins (turnovers, ERA). */
  reverse: boolean
  /** A rate shown as makes/attempts ("9/17"): the two stat ids. */
  made?: number
  attempts?: number
}

/** Rates a box score shows as makes/attempts, by sport and stat id. */
const MADE_ATTEMPTED: Partial<
  Record<
    FantasySport,
    Record<number, { label: string; made: number; attempts: number }>
  >
> = {
  basketball: {
    19: { label: 'FG', made: 13, attempts: 14 },
    20: { label: 'FT', made: 15, attempts: 16 },
    21: { label: '3P', made: 17, attempts: 18 },
  },
  baseball: { 2: { label: 'H/AB', made: 1, attempts: 0 } },
}

/** The box score's columns: the league's categories, in their order. */
export function boxColumns(
  sport: FantasySport,
  categories: ReadonlyArray<LeagueCategory>,
): Array<BoxColumn> {
  return categories.map((c) => {
    const ma = MADE_ATTEMPTED[sport]?.[c.statId]
    return ma
      ? { statId: c.statId, reverse: c.reverse, ...ma }
      : { statId: c.statId, label: c.label, reverse: c.reverse }
  })
}

/** Whether a Player has a line that day (a game with anything in it). */
export function played(stats: Stats | null | undefined): stats is Stats {
  return stats != null && Object.values(stats).some((n) => n > 0)
}

/** A column's number for a line, to compare (null: nothing to compare). */
export function boxValue(
  sport: FantasySport,
  col: BoxColumn,
  stats: Stats,
): number | null {
  if (col.made !== undefined && col.attempts !== undefined) {
    const attempts = stats[col.attempts] ?? 0
    return attempts > 0 ? (stats[col.made] ?? 0) / attempts : null
  }
  // A missing count is none; a rate with nothing under it isn't a value.
  const value = categoryValue(sport, col.statId, stats)
  return value ?? (isRate(sport, col.statId) ? null : 0)
}

/** A cell: "9/17" for shooting, the category's own format otherwise. */
export function boxCell(
  sport: FantasySport,
  col: BoxColumn,
  stats: Stats | null | undefined,
): string {
  if (!played(stats)) return '–'
  if (col.made !== undefined && col.attempts !== undefined)
    return `${stats[col.made] ?? 0}/${stats[col.attempts] ?? 0}`
  const value = boxValue(sport, col, stats)
  return formatCategory(sport, col.statId, value)
}

/**
 * Who leads a column among the Players who played: the best value (the
 * lowest where lower wins), shared on a tie. Nobody leads when everyone
 * who played has the same, or nobody has anything to compare.
 */
export function boxLeaders<TKey>(
  sport: FantasySport,
  col: BoxColumn,
  rows: ReadonlyArray<{ key: TKey; stats: Stats | null | undefined }>,
): Set<TKey> {
  const values = rows.flatMap((r) => {
    if (!played(r.stats)) return []
    const n = boxValue(sport, col, r.stats)
    return n === null || !Number.isFinite(n) ? [] : [{ key: r.key, n }]
  })
  if (values.length < 2) return new Set()
  const best = col.reverse
    ? Math.min(...values.map((v) => v.n))
    : Math.max(...values.map((v) => v.n))
  const leaders = values.filter((v) => v.n === best)
  if (leaders.length === values.length) return new Set()
  return new Set(leaders.map((v) => v.key))
}

/** The Starters' line summed, for a totals row. */
export function boxTotals(
  lines: ReadonlyArray<Stats | null | undefined>,
): Stats {
  return addStats(...lines.filter(played))
}
