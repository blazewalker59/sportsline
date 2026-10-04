/**
 * Head-to-head category leagues (CONTEXT.md, "Category"): which stats a
 * league plays, how each is computed and shown, and who leads each one.
 * Pure.
 *
 * Following dreamteam's reading of ESPN: a matchup's `scoreByStat` holds
 * totals through yesterday (components included: AB, H, outs, FGA…), and
 * today comes from the Starters' lines this scoring period. Ratios (AVG,
 * ERA, FG%) are recomputed from the summed components, never added. ESPN's
 * own per-category `result` lags, so leaders are decided here.
 */

import type { FantasySport } from './sports'

export type Stats = Readonly<Record<string, number>>

interface CategoryDef {
  label: string
  /** Lower wins (ERA, WHIP, turnovers). */
  reverse?: boolean
  /** Computed from components; null without enough to compute. */
  compute?: (s: Stats) => number | null
  format: (v: number) => string
  /** A pitching rate held to the league's innings minimum. */
  innings?: boolean
}

const v = (s: Stats, id: number) => s[id] ?? 0
const has = (s: Stats, id: number) => id in s
const ratio = (num: number, den: number) => (den > 0 ? num / den : null)

const whole = (n: number) => String(Math.round(n))
/** .342, as averages are written. */
const avg = (n: number) => n.toFixed(3).replace(/^0(?=\.)/, '')
const two = (n: number) => n.toFixed(2)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
/** Innings from outs: 16 outs → "5.1". */
export const innings = (outs: number) =>
  `${Math.floor(outs / 3)}.${Math.round(outs % 3)}`

const BASEBALL: Record<number, CategoryDef> = {
  0: { label: 'AB', format: whole },
  1: { label: 'H', format: whole },
  2: {
    label: 'AVG',
    compute: (s) => (has(s, 0) ? ratio(v(s, 1), v(s, 0)) : null),
    format: avg,
  },
  3: { label: '2B', format: whole },
  4: { label: '3B', format: whole },
  5: { label: 'HR', format: whole },
  8: { label: 'TB', format: whole },
  9: {
    label: 'SLG',
    compute: (s) => (has(s, 0) ? ratio(v(s, 8), v(s, 0)) : null),
    format: avg,
  },
  10: { label: 'BB', format: whole },
  17: { label: 'OBP', compute: obp, format: avg },
  18: {
    label: 'OPS',
    compute: (s) => {
      const o = obp(s)
      const slg = has(s, 0) ? ratio(v(s, 8), v(s, 0)) : null
      return o === null || slg === null ? null : o + slg
    },
    format: avg,
  },
  20: { label: 'R', format: whole },
  21: { label: 'RBI', format: whole },
  23: { label: 'SB', format: whole },
  24: { label: 'CS', reverse: true, format: whole },
  25: {
    label: 'SBN',
    compute: (s) => (has(s, 23) ? v(s, 23) - v(s, 24) : null),
    format: whole,
  },
  // Batters' strikeouts: "SO", so a 7x7 league's two Ks read apart.
  27: { label: 'SO', reverse: true, format: whole },
  34: { label: 'IP', format: innings },
  37: { label: 'H', reverse: true, format: whole },
  39: { label: 'BB', reverse: true, format: whole },
  41: {
    label: 'WHIP',
    reverse: true,
    innings: true,
    compute: (s) => ratio(3 * (v(s, 37) + v(s, 39)), v(s, 34)),
    format: two,
  },
  45: { label: 'ER', reverse: true, format: whole },
  47: {
    label: 'ERA',
    reverse: true,
    innings: true,
    compute: (s) => ratio(27 * v(s, 45), v(s, 34)),
    format: two,
  },
  48: { label: 'K', format: whole },
  49: {
    label: 'K/9',
    innings: true,
    compute: (s) => ratio(27 * v(s, 48), v(s, 34)),
    format: two,
  },
  53: { label: 'W', format: whole },
  54: { label: 'L', reverse: true, format: whole },
  57: { label: 'SV', format: whole },
  60: { label: 'HD', format: whole },
  63: { label: 'QS', format: whole },
  83: {
    label: 'SVHD',
    compute: (s) =>
      v(s, 83) > 0 ? v(s, 83) : has(s, 57) ? v(s, 57) + v(s, 60) : null,
    format: whole,
  },
}

function obp(s: Stats): number | null {
  if (!has(s, 0)) return null
  return ratio(
    v(s, 1) + v(s, 10) + v(s, 12),
    v(s, 0) + v(s, 10) + v(s, 12) + v(s, 13),
  )
}

const BASKETBALL: Record<number, CategoryDef> = {
  0: { label: 'PTS', format: whole },
  1: { label: 'BLK', format: whole },
  2: { label: 'STL', format: whole },
  3: { label: 'AST', format: whole },
  4: { label: 'OREB', format: whole },
  5: { label: 'DREB', format: whole },
  6: { label: 'REB', format: whole },
  9: { label: 'PF', reverse: true, format: whole },
  11: { label: 'TO', reverse: true, format: whole },
  13: { label: 'FGM', format: whole },
  14: { label: 'FGA', format: whole },
  15: { label: 'FTM', format: whole },
  16: { label: 'FTA', format: whole },
  17: { label: '3PM', format: whole },
  18: { label: '3PA', format: whole },
  19: {
    label: 'FG%',
    compute: (s) => (has(s, 14) ? ratio(v(s, 13), v(s, 14)) : null),
    format: pct,
  },
  20: {
    label: 'FT%',
    compute: (s) => (has(s, 16) ? ratio(v(s, 15), v(s, 16)) : null),
    format: pct,
  },
  21: {
    label: '3P%',
    compute: (s) => (has(s, 18) ? ratio(v(s, 17), v(s, 18)) : null),
    format: pct,
  },
  36: {
    label: 'A/TO',
    compute: (s) => (has(s, 3) ? ratio(v(s, 3), v(s, 11)) : null),
    format: two,
  },
  37: { label: 'DD', format: whole },
  38: { label: 'TD', format: whole },
  40: { label: 'MIN', format: whole },
}

const DEFS: Record<FantasySport, Record<number, CategoryDef>> = {
  football: {},
  basketball: BASKETBALL,
  baseball: BASEBALL,
}

/** When a league's settings don't list its categories: the usual sets. */
const DEFAULT_CATEGORIES: Record<FantasySport, ReadonlyArray<number>> = {
  football: [],
  basketball: [19, 20, 17, 6, 3, 2, 1, 11, 0],
  baseball: [20, 5, 21, 23, 2, 53, 57, 48, 47, 41],
}

export const isCategoryScoring = (scoringType: string | undefined) =>
  scoringType !== undefined &&
  /CATEGOR/.test(scoringType) &&
  !/ROTO/.test(scoringType)

export interface LeagueCategory {
  statId: number
  label: string
  reverse: boolean
}

/** A league's categories, in its order, from its scoring settings. */
export function leagueCategories(
  sport: FantasySport,
  items: ReadonlyArray<{ statId?: number; isReverseItem?: boolean }>,
): Array<LeagueCategory> {
  const defs = DEFS[sport]
  const listed = items.flatMap((i) =>
    i.statId === undefined ? [] : [{ id: i.statId, rev: i.isReverseItem }],
  )
  const ids = listed.length
    ? listed
    : DEFAULT_CATEGORIES[sport].map((id) => ({ id, rev: undefined }))
  return ids.map(({ id, rev }) => ({
    statId: id,
    label: defs[id]?.label ?? `Stat ${id}`,
    // The league's own setting wins; else what the stat usually is.
    reverse: rev ?? defs[id]?.reverse ?? false,
  }))
}

/** ESPN numbers may arrive as "Infinity" (an ERA with no innings). */
export function toStats(raw: Record<string, unknown> | undefined): Stats {
  const out: Record<string, number> = {}
  for (const [k, value] of Object.entries(raw ?? {})) {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : typeof value === 'object' && value !== null && 'score' in value
            ? Number((value as { score: unknown }).score)
            : NaN
    if (!Number.isNaN(n)) out[k] = n
  }
  return out
}

/** Counting stats added; ratios recomputed afterwards from components. */
export function addStats(...all: ReadonlyArray<Stats>): Stats {
  const out: Record<string, number> = {}
  for (const s of all)
    for (const [k, n] of Object.entries(s))
      if (Number.isFinite(n)) out[k] = (out[k] ?? 0) + n
  return out
}

/** A category's value from a stat line (null: nothing to show yet). */
export function categoryValue(
  sport: FantasySport,
  statId: number,
  s: Stats,
  /** ESPN's own value, for a ratio whose components are missing. */
  fallback?: Stats,
): number | null {
  const def = DEFS[sport][statId]
  if (def?.compute) {
    const computed = def.compute(s)
    if (computed !== null) return computed
    const given = fallback?.[statId]
    return given !== undefined && Number.isFinite(given) ? given : null
  }
  return statId in s ? s[statId] : null
}

export function formatCategory(
  sport: FantasySport,
  statId: number,
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return (DEFS[sport][statId]?.format ?? whole)(value)
}

export type Leader = 'mine' | 'opponent' | 'tie'

export interface CategoryResult extends LeagueCategory {
  mine: string
  opponent: string
  leader: Leader | null
}

/**
 * Each category's values and who leads it. A pitching rate (ERA, WHIP)
 * goes to the side that met the league's innings minimum when only one did
 * (a tie when neither did).
 */
export function scoreCategories(
  sport: FantasySport,
  categories: ReadonlyArray<LeagueCategory>,
  mine: { totals: Stats; given: Stats },
  opponent: { totals: Stats; given: Stats } | null,
  minimumOuts: number | null,
): Array<CategoryResult> {
  return categories.map((c) => {
    const a = categoryValue(sport, c.statId, mine.totals, mine.given)
    const b = opponent
      ? categoryValue(sport, c.statId, opponent.totals, opponent.given)
      : null
    let leader: Leader | null = null
    if (opponent) {
      const qualified = (t: Stats) =>
        minimumOuts === null || v(t, 34) >= minimumOuts
      const rate = DEFS[sport][c.statId]?.innings
      const qa = qualified(mine.totals)
      const qb = qualified(opponent.totals)
      if (rate && minimumOuts !== null && (!qa || !qb))
        leader = qa ? 'mine' : qb ? 'opponent' : 'tie'
      else if (a === null && b === null) leader = null
      else {
        // A missing rate (no innings, no attempts) loses to any value.
        const x = a ?? (c.reverse ? Infinity : -Infinity)
        const y = b ?? (c.reverse ? Infinity : -Infinity)
        leader = x === y ? 'tie' : x > y !== c.reverse ? 'mine' : 'opponent'
      }
    }
    return {
      ...c,
      mine: formatCategory(sport, c.statId, a),
      opponent: formatCategory(sport, c.statId, b),
      leader,
    }
  })
}

/** "6-3-1": categories won, lost and tied, from the Viewer's side. */
export function tally(results: ReadonlyArray<CategoryResult>): {
  wins: number
  losses: number
  ties: number
} {
  let wins = 0
  let losses = 0
  let ties = 0
  for (const r of results) {
    if (r.leader === 'mine') wins++
    else if (r.leader === 'opponent') losses++
    else if (r.leader === 'tie') ties++
  }
  return { wins, losses, ties }
}

/**
 * A Player's day in a category league, short: "2-4, HR, 2 RBI" or
 * "6.0 IP, 8 K, 1 ER" or "24 PTS, 8 REB". Only categories they moved, plus
 * the at-bats or innings that frame them.
 */
export function playerDayLine(
  sport: FantasySport,
  categories: ReadonlyArray<LeagueCategory>,
  s: Stats,
): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  if (sport === 'baseball') {
    if (v(s, 34) > 0) out.push({ label: 'IP', value: innings(v(s, 34)) })
    else if (v(s, 0) > 0 || v(s, 10) > 0)
      out.push({ label: 'H/AB', value: `${v(s, 1)}-${v(s, 0)}` })
  }
  if (sport === 'basketball' && v(s, 14) > 0)
    out.push({ label: 'FG', value: `${v(s, 13)}-${v(s, 14)}` })
  for (const c of categories) {
    const def = DEFS[sport][c.statId]
    if (def?.compute) continue
    // Pitching counts for a pitcher, batting counts for a batter.
    const n = s[c.statId]
    if (n === undefined || n === 0) continue
    out.push({ label: c.label, value: formatCategory(sport, c.statId, n) })
  }
  return out
}
