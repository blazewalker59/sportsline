/**
 * Where a stat prop stands: a Leg like "Miami (FL): 300+ receiving yards"
 * read against our live box score (212 of 300). Kalshi's series name says
 * which stat (…RECYDS, …PTS, …KS), the market's strike says the line, and
 * the box score (or the score itself, for totals) says where it's at. Pure.
 */

import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox, League, Side } from '@/lib/model/types'

export interface Progress {
  current: number
  /** The value that wins: "300" for 300+. */
  target: number
  /** What's counted: "rec yds", "pts". */
  label: string
}

interface Stat {
  /** Box table (by title suffix) and columns summed for the value. */
  table?: string
  columns?: ReadonlyArray<string>
  /** Read the score instead: one team's, or both. */
  score?: 'team' | 'total'
  label: string
}

const FOOTBALL: Array<[RegExp, Stat]> = [
  [/RECYDS$/, { table: 'Receiving', columns: ['YDS'], label: 'rec yds' }],
  [/(RSH|RUSH)YDS$/, { table: 'Rushing', columns: ['YDS'], label: 'rush yds' }],
  [/PASSYDS$/, { table: 'Passing', columns: ['YDS'], label: 'pass yds' }],
  [/PASSTDS?$/, { table: 'Passing', columns: ['TD'], label: 'pass TD' }],
  [/(RSH|RUSH)TDS?$/, { table: 'Rushing', columns: ['TD'], label: 'rush TD' }],
  [/RECTDS?$/, { table: 'Receiving', columns: ['TD'], label: 'rec TD' }],
  [/REC(S|EPTIONS)?$/, { table: 'Receiving', columns: ['REC'], label: 'rec' }],
  [/TEAMTOTAL$/, { score: 'team', label: 'pts' }],
  [/^TOTAL$/, { score: 'total', label: 'pts' }],
]

const STATS: Record<League, Array<[RegExp, Stat]>> = {
  nfl: FOOTBALL,
  cfb: FOOTBALL,
  nba: [
    [/^PTS$/, { table: 'Players', columns: ['PTS'], label: 'pts' }],
    [/^REB$/, { table: 'Players', columns: ['REB'], label: 'reb' }],
    [/^AST$/, { table: 'Players', columns: ['AST'], label: 'ast' }],
    [/^3PT$/, { table: 'Players', columns: ['3PT'], label: '3PM' }],
    [/^BLK$/, { table: 'Players', columns: ['BLK'], label: 'blk' }],
    [/^STL$/, { table: 'Players', columns: ['STL'], label: 'stl' }],
    [/TEAMTOTAL$/, { score: 'team', label: 'pts' }],
    [/^TOTAL$/, { score: 'total', label: 'pts' }],
  ],
  mlb: [
    [/^HITS?$/, { table: 'Batting', columns: ['H'], label: 'hits' }],
    [
      /^HRR$/,
      { table: 'Batting', columns: ['H', 'R', 'RBI'], label: 'H+R+RBI' },
    ],
    [/^KS$/, { table: 'Pitching', columns: ['K'], label: 'K' }],
    [/TEAMTOTAL$/, { score: 'team', label: 'runs' }],
    [/^TOTAL$/, { score: 'total', label: 'runs' }],
  ],
  nhl: [
    [/^GOALS?$/, { table: 'Skaters', columns: ['G'], label: 'goals' }],
    [/^PTS$/, { table: 'Skaters', columns: ['P'], label: 'pts' }],
    [/^AST$/, { table: 'Skaters', columns: ['A'], label: 'ast' }],
    [/^SAVES?$/, { table: 'Goalies', columns: ['SV-SA'], label: 'saves' }],
    [/TEAMTOTAL$/, { score: 'team', label: 'goals' }],
    [/^TOTAL$/, { score: 'total', label: 'goals' }],
  ],
}

const SERIES_PREFIX: Record<League, RegExp> = {
  nfl: /^KXNFL/,
  cfb: /^KXNCAAF/,
  nba: /^KXNBA/,
  mlb: /^KXMLB/,
  nhl: /^KXNHL/,
}

/** The stat a Kalshi series counts, if it's one we can follow. */
export function statOf(
  league: League,
  eventTicker: string,
): (Stat & { team: boolean }) | null {
  const series = eventTicker.split('-')[0]
  if (!SERIES_PREFIX[league].test(series)) return null
  const rest = series.replace(SERIES_PREFIX[league], '')
  // Partial-game markets (first half, quarters, periods) aren't followed.
  if (/^\d[HQP]/.test(rest)) return null
  const hit = STATS[league].find(([pattern]) => pattern.test(rest))
  return hit ? { ...hit[1], team: rest.includes('TEAM') } : null
}

/** The value that wins a "greater than" line: 299.5 → 300. */
export function targetOf(
  floorStrike: number | null,
  title: string,
): number | null {
  if (floorStrike !== null) return Math.floor(floorStrike) + 1
  const plus = title.match(/(\d+(?:\.\d+)?)\+/)
  return plus ? Number(plus[1]) : null
}

/** A box cell as a number: "141" → 141, "3-8" (made-attempted) → 3. */
function cell(value: string | number | undefined): number {
  if (typeof value === 'number') return value
  if (!value) return 0
  const n = Number(value.split(/[-/]/)[0])
  return Number.isFinite(n) ? n : 0
}

export function progressOf(input: {
  league: League
  eventTicker: string
  title: string
  floorStrike: number | null
  game: {
    score: GameSummary['score']
    awayTeam: { id: string }
    homeTeam: { id: string }
  }
  box: GameBox | null
  teamId: string | null
  playerId: string | null
}): Progress | null {
  const stat = statOf(input.league, input.eventTicker)
  const target = targetOf(input.floorStrike, input.title)
  if (!stat || target === null) return null
  const side: Side | null =
    input.teamId === input.game.homeTeam.id
      ? 'home'
      : input.teamId === input.game.awayTeam.id
        ? 'away'
        : null
  if (stat.score) {
    const current =
      stat.score === 'total'
        ? input.game.score.away + input.game.score.home
        : side
          ? input.game.score[side]
          : null
    return current === null ? null : { current, target, label: stat.label }
  }
  if (!input.box) return { current: 0, target, label: stat.label }
  const tables = input.box.tables.filter((t) =>
    t.title.endsWith(` ${stat.table}`),
  )
  const sum = (
    rows: GameBox['tables'][number]['rows'],
    columns: Array<number>,
  ) =>
    rows.reduce(
      (n, r) => n + columns.reduce((m, c) => m + cell(r.values[c]), 0),
      0,
    )
  let current = 0
  for (const t of tables) {
    const columns = (stat.columns ?? [])
      .map((c) => t.columns.indexOf(c))
      .filter((i) => i >= 0)
    if (columns.length === 0) continue
    if (stat.team || !input.playerId) {
      if (side && t.side === side) current += sum(t.rows, columns)
    } else {
      current += sum(
        t.rows.filter((r) => r.player.id === input.playerId),
        columns,
      )
    }
  }
  return { current, target, label: stat.label }
}
