/**
 * A Game's team totals side by side: the box score's Teams view. Each
 * Source names its own (ESPN's team statistics, MLB's teamStats, NHL's
 * players summed); a box stored before then gets totals summed from its
 * tables. Each total leans toward the team ahead in it, the way a Fantasy
 * category does (categoryLean). Pure.
 */

import type { GameBox, TeamStat } from '@/lib/model/types'
import { categoryLean } from '@/lib/fantasy/categories'
import { categoryName } from '@/lib/games/boxSides'

/** One ESPN team statistic to show: its `name`, our label, how it compares. */
export type EspnPick = [name: string, label: string, extra?: Partial<TeamStat>]

/** ESPN football's team statistics (NFL and college) worth comparing. */
export const FOOTBALL_TEAM_STATS: ReadonlyArray<EspnPick> = [
  ['totalYards', 'Total yards'],
  ['netPassingYards', 'Passing yards'],
  ['rushingYards', 'Rushing yards'],
  ['yardsPerPlay', 'Yards per play'],
  ['firstDowns', '1st downs'],
  ['thirdDownEff', '3rd down', { compare: 'rate' }],
  ['fourthDownEff', '4th down', { compare: 'rate' }],
  ['redZoneAttempts', 'Red zone', { compare: 'rate' }],
  ['turnovers', 'Turnovers', { lower: true }],
  ['sacksYardsLost', 'Sacked', { compare: 'first', lower: true }],
  ['totalPenaltiesYards', 'Penalties', { compare: 'first', lower: true }],
  ['possessionTime', 'Possession', { compare: 'clock' }],
]

/** ESPN basketball's team statistics (NBA and college). */
export const BASKETBALL_TEAM_STATS: ReadonlyArray<EspnPick> = [
  ['fieldGoalsMade-fieldGoalsAttempted', 'Field goals', { compare: 'rate' }],
  [
    'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
    '3-pointers',
    { compare: 'rate' },
  ],
  ['freeThrowsMade-freeThrowsAttempted', 'Free throws', { compare: 'rate' }],
  ['totalRebounds', 'Rebounds'],
  ['offensiveRebounds', 'Offensive rebounds'],
  ['assists', 'Assists'],
  ['steals', 'Steals'],
  ['blocks', 'Blocks'],
  ['totalTurnovers', 'Turnovers', { lower: true }],
  ['pointsInPaint', 'Points in the paint'],
  ['fastBreakPoints', 'Fast break points'],
  ['fouls', 'Fouls', { lower: true }],
  ['largestLead', 'Largest lead'],
]

interface EspnTeamStatistics {
  team: { id: string }
  statistics?: Array<{ name: string; displayValue?: string }>
}

/** The picked statistics both teams have, in the picks' order. */
export function espnTeamStats(
  teams: ReadonlyArray<EspnTeamStatistics> | undefined,
  awayId: string,
  homeId: string,
  picks: ReadonlyArray<EspnPick>,
): Array<TeamStat> | undefined {
  const of = (id: string) => teams?.find((t) => t.team.id === id)?.statistics
  const away = of(awayId)
  const home = of(homeId)
  if (!away?.length || !home?.length) return undefined
  const stats: Array<TeamStat> = []
  for (const [name, label, extra] of picks) {
    const a = away.find((s) => s.name === name)?.displayValue
    const h = home.find((s) => s.name === name)?.displayValue
    if (a == null || h == null || a === '' || h === '') continue
    stats.push({ label, away: a, home: h, ...extra })
  }
  return stats.length > 0 ? stats : undefined
}

/** A total as the number it compares by (null when it has none). */
export function teamStatValue(
  shown: string,
  compare: TeamStat['compare'],
): number | null {
  const s = shown.trim()
  if (compare === 'clock') {
    const m = /^(\d+):(\d{2})$/.exec(s)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  if (compare === 'rate' || compare === 'first') {
    const m = /^(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)$/.exec(s)
    if (!m) return null
    if (compare === 'first') return Number(m[1])
    const attempts = Number(m[2])
    return attempts === 0 ? null : Number(m[1]) / attempts
  }
  const n = Number(s.replace(/%$/, ''))
  return s === '' || !Number.isFinite(n) ? null : n
}

export type TeamStatLeader = 'away' | 'home' | 'tie' | null

/** Who's ahead in a total: more, or fewer where fewer is better. */
export function teamStatLeader(stat: TeamStat): TeamStatLeader {
  const a = teamStatValue(stat.away, stat.compare)
  const h = teamStatValue(stat.home, stat.compare)
  if (a == null || h == null) return null
  if (a === h) return 'tie'
  return a > h !== Boolean(stat.lower) ? 'away' : 'home'
}

/**
 * How far a total leans and which way, from 1 (the away team's, all the
 * way) to −1 (the home team's): a Fantasy category's lean, with the away
 * team where the Viewer's side is, on the left.
 */
export function teamStatLean(stat: TeamStat): number {
  const leader = teamStatLeader(stat)
  return categoryLean({
    leader:
      leader === 'away' ? 'mine' : leader === 'home' ? 'opponent' : leader,
    reverse: Boolean(stat.lower),
    mineValue: teamStatValue(stat.away, stat.compare),
    opponentValue: teamStatValue(stat.home, stat.compare),
  })
}

/** Columns that don't add up across players (a long, an average, a time). */
const UNSUMMED = new Set([
  'LONG',
  'AVG',
  'RTG',
  'QBR',
  '+/-',
  'TOI',
  'MIN',
  'SV%',
  'IP',
  'NP',
])
/** Made of attempted, as one player's figure ("24/33", "7-15"). */
const MADE_OF = /^(\d+)([-/])(\d+)$/
/** Columns where fewer is better for the team that has them. */
const FEWER = new Set(['INT', 'TO', 'PIM', 'FUM', 'LOST'])
/**
 * Tables left out: ones that count the other team (a pitcher's hits are
 * theirs), and Receiving, which repeats Passing.
 */
const AGAINST = /pitching|goalies|goaltending|receiving/i

/**
 * Totals summed from the box's tables, for a box stored before its Source
 * gave team totals: each counting column of each table both teams have
 * ("Passing YDS"), made-of-attempted columns summed both ways ("C/ATT").
 */
export function tableTeamStats(
  box: GameBox,
  game: {
    awayTeam: { abbreviation: string }
    homeTeam: { abbreviation: string }
  },
): Array<TeamStat> {
  const stats: Array<TeamStat> = []
  for (const away of box.tables.filter((t) => t.side === 'away')) {
    const name = categoryName(away.title, game)
    if (AGAINST.test(name)) continue
    const home = box.tables.find(
      (t) =>
        t.side === 'home' &&
        categoryName(t.title, game) === name &&
        t.columns.join() === away.columns.join(),
    )
    if (!home) continue
    away.columns.forEach((column, i) => {
      if (UNSUMMED.has(column.toUpperCase())) return
      const sum = (table: typeof away) => {
        const values = table.rows.map((r) => String(r.values[i] ?? '').trim())
        if (values.every((v) => /^\d+$/.test(v)))
          return { shown: String(values.reduce((n, v) => n + Number(v), 0)) }
        const parts = values.map((v) => MADE_OF.exec(v))
        if (parts.length > 0 && parts.every(Boolean)) {
          const made = parts.reduce((n, m) => n + Number(m![1]), 0)
          const of = parts.reduce((n, m) => n + Number(m![3]), 0)
          return { shown: `${made}${parts[0]![2]}${of}`, made: true }
        }
        return null
      }
      const a = sum(away)
      const h = sum(home)
      if (!a || !h) return
      const label = name === 'Players' ? column : `${name} ${column}`
      const upper = column.toUpperCase()
      stats.push({
        label,
        away: a.shown,
        home: h.shown,
        // Sacks are "sacks-yards lost", not made of attempted.
        ...(a.made && upper !== 'SACKS' ? { compare: 'rate' as const } : {}),
        ...(a.made && upper === 'SACKS' ? { compare: 'first' as const } : {}),
        // A passer's sacks are taken; a defense's, made.
        ...(FEWER.has(upper) || (upper === 'SACKS' && name === 'Passing')
          ? { lower: true }
          : {}),
      })
    })
  }
  return stats
}

/** The totals the Teams view shows: the Source's, else summed from tables. */
export function teamStatsOf(
  box: GameBox,
  game: Parameters<typeof tableTeamStats>[1],
): Array<TeamStat> {
  return box.teamStats?.length ? box.teamStats : tableTeamStats(box, game)
}
