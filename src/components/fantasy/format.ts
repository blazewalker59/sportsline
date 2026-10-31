/**
 * How Fantasy Lineups read: scores and figures, short names, headshots,
 * injuries, and the colors for slots and positions. Pure.
 */

import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { CategoryResult } from '@/lib/fantasy/categories'
import type { LineupPlayer, MatchupView } from '@/lib/fantasy/matchup'
import type { NextGame } from '@/lib/fantasy/proSchedule'
import { tally } from '@/lib/fantasy/categories'
import { shiftSportsDay, sportsDayOf } from '@/lib/model/sportsDay'
import {
  clockTime,
  dayOf,
  formatInstant,
  shiftDay,
  weekdayDay,
} from '@/lib/time/format'
import { timeAgo } from '@/components/timeline/format'

export const pts = (n: number | null) => (n === null ? '—' : n.toFixed(1))

/**
 * A Player's next Game as their row shows it: when ("Now", "Today 7:30
 * PM", "Tmrw 1:00 PM", "Sat 7:00 PM", "Oct 14"), against whom ("vs LAL",
 * "@ LAL"), and how soon, for its color. Null until the zone is known.
 */
export function nextGameLabel(
  g: NextGame,
  timeZone: string | null,
  now: number = Date.now(),
): {
  when: string
  /** `when` for a narrow screen: "7:30p" today (its color says so), "Tue 7p". */
  short: string
  versus: string
  soon: 'now' | 'today' | 'later'
} | null {
  if (timeZone === null) return null
  const versus = g.opponent ? `${g.home ? 'vs' : '@'} ${g.opponent}` : ''
  if (g.startsAt <= now)
    return { when: 'Now', short: 'Now', versus, soon: 'now' }
  const today = dayOf(now, timeZone)
  const day = dayOf(g.startsAt, timeZone)
  const clock = g.tbd ? '' : clockTime(g.startsAt, timeZone)
  const time = clock ? ` ${clock}` : ''
  // "7:30 PM" → "7:30p", "1:00 PM" → "1p".
  const brief = clock
    .replace(':00', '')
    .replace(/ ([AP])M$/, (_, m: string) => m.toLowerCase())
  const join = (a: string, b: string) => (b ? `${a} ${b}` : a)
  if (day === today)
    return {
      when: `Today${time}`,
      short: brief || 'Today',
      versus,
      soon: 'today',
    }
  if (day === shiftDay(today, 1))
    return {
      when: `Tmrw${time}`,
      short: join('Tmrw', brief),
      versus,
      soon: 'later',
    }
  if (day <= shiftDay(today, 6)) {
    const weekday = formatInstant(g.startsAt, timeZone, { weekday: 'short' })
    return {
      when: `${weekday}${time}`,
      short: join(weekday, brief),
      versus,
      soon: 'later',
    }
  }
  const date = formatInstant(g.startsAt, timeZone, {
    month: 'short',
    day: 'numeric',
  })
  return { when: date, short: date, versus, soon: 'later' }
}

/** A Matchup side's score: points, or categories led (a whole number). */
export const scoreText = (m: MatchupView, n: number | null) =>
  m.categories ? (n === null ? '—' : String(n)) : pts(n)

/**
 * A side's categories won, lost and tied, from that side: "6–3", or
 * "0–0–9" once any category is tied.
 */
export function sideRecord(m: MatchupView, side: 'mine' | 'opponent'): string {
  const mine = m.mine.score
  const theirs = m.opponent?.score ?? 0
  const [won, lost] = side === 'mine' ? [mine, theirs] : [theirs, mine]
  return `${won}–${lost}${m.ties ? `–${m.ties}` : ''}`
}

/** Past this, a Matchup's scores are behind even its slowest sync. */
export const STALE_MS = 3 * 60_000

/**
 * How old a Matchup's scores are ("now", "4m"), and whether that's older
 * than its syncing explains. Null before it's been stamped or there's a
 * client clock.
 */
export function matchupAge(
  m: Pick<MatchupView, 'asOf'>,
  now: number | null,
): { label: string; stale: boolean } | null {
  if (!m.asOf || now === null) return null
  return {
    label: timeAgo(m.asOf, now),
    stale: now - Date.parse(m.asOf) > STALE_MS,
  }
}

/** "6–3–1": categories won, lost and tied (from the Viewer's side). */
export const categoryRecord = (m: MatchupView) =>
  `${m.mine.score}–${m.opponent?.score ?? 0}${m.ties ? `–${m.ties}` : ''}`

/** "5–4" or "5–3–1": one day's categories won, lost and tied. */
export function dayRecord(categories: ReadonlyArray<CategoryResult>): string {
  const t = tally(categories)
  return `${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}`
}

/**
 * A Matchup day's Sports Day: each scoring period is a day, counted from
 * the Matchup's current one (today).
 */
export function daySportsDay(
  m: Pick<MatchupView, 'scoringPeriod'>,
  scoringPeriod: number,
  now: Date = new Date(),
): string {
  return shiftSportsDay(sportsDayOf(now), scoringPeriod - m.scoringPeriod)
}

/** A Matchup day's name: "Today", "Yesterday", "Tomorrow", else "Sat, Oct 11". */
export function dayLabel(
  m: Pick<MatchupView, 'scoringPeriod'>,
  scoringPeriod: number,
  now: Date = new Date(),
): string {
  const ahead = scoringPeriod - m.scoringPeriod
  if (ahead === 0) return 'Today'
  if (ahead === -1) return 'Yesterday'
  if (ahead === 1) return 'Tomorrow'
  const day = daySportsDay(m, scoringPeriod, now)
  return weekdayDay(day)
}

/**
 * A Player's figure beside their name: points, or in a category league
 * their day's headline (2-4 at the plate, 6.0 IP, 24 PTS).
 */
export function playerFigure(p: LineupPlayer): string {
  if (p.dayLine == null) return pts(p.points)
  const lead =
    p.dayLine.find((l) => l.label === 'PTS') ??
    p.dayLine.find((l) => l.label === 'H/AB' || l.label === 'IP')
  return lead?.value ?? '—'
}

/** "Jaxon Smith-Njigba" → "J. Smith-Njigba"; team defenses as they are. */
export function shortName(p: Pick<LineupPlayer, 'name' | 'espnId'>): string {
  if (p.espnId < 0 || /D\/ST$/.test(p.name)) return p.name
  const [first, ...rest] = p.name.trim().split(/\s+/)
  return rest.length > 0 ? `${first[0]}. ${rest.join(' ')}` : p.name
}

const HEADSHOT_LEAGUE: Record<FantasyLeagueView['sport'], string> = {
  football: 'nfl',
  basketball: 'nba',
  baseball: 'mlb',
}

export function headshotOf(
  sport: FantasyLeagueView['sport'],
  p: Pick<LineupPlayer, 'espnId' | 'sourcePlayerId' | 'headshot' | 'teamLogo'>,
): string | null {
  if (p.espnId < 0) return p.teamLogo ?? null
  // Another provider's Player: the headshot we matched them to, if any.
  if (p.sourcePlayerId !== undefined) return p.headshot ?? null
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/${HEADSHOT_LEAGUE[sport]}/players/full/${p.espnId}.png&w=96&h=70`
}

/** Red for out (or close to it), yellow for maybe. */
export function injuryTone(status: string | null): 'red' | 'yellow' | null {
  if (!status) return null
  if (/QUESTIONABLE|DAY_TO_DAY|PROBABLE/.test(status)) return 'yellow'
  return 'red'
}

export function injuryLabel(status: string): string {
  return status
    .replace('INJURY_RESERVE', 'IR')
    .replace('DAY_TO_DAY', 'Day-to-day')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** Position groups, colored (Sleeper-style). */
export const SLOT_TONES: Record<string, string> = {
  QB: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  RB: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  WR: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  TE: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  FLEX: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  'RB/WR': 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  'WR/TE': 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  OP: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  'D/ST': 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  K: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  // Baseball: catchers, infield, outfield, utility, pitching.
  C: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  '1B': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  '2B': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  '3B': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  SS: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  MI: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  CI: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  IF: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  OF: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  DH: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  UTIL: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  SP: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  RP: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  P: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  // Basketball: guards, forwards, bigs.
  PG: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  SG: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  G: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  SF: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  PF: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  F: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'SG/SF': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'G/F': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'PF/C': 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  'F/C': 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
}

/** ESPN's default position ids, per sport. */
export const POSITIONS: Record<
  FantasyLeagueView['sport'],
  Readonly<Record<number, string>>
> = {
  football: { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' },
  basketball: { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' },
  baseball: {
    1: 'SP',
    2: 'C',
    3: '1B',
    4: '2B',
    5: '3B',
    6: 'SS',
    7: 'OF',
    8: 'OF',
    9: 'OF',
    10: 'DH',
    11: 'RP',
  },
}

/** Sleeper's position colors, so a position reads without reading it. */
export const POSITION_COLOR: Record<string, string> = {
  QB: 'text-[#e0245e] dark:text-[#ff2a6d]',
  RB: 'text-[#00a594] dark:text-[#00ceb8]',
  WR: 'text-[#2f86e8] dark:text-[#58a7ff]',
  TE: 'text-[#e08a1e] dark:text-[#ffae58]',
  K: 'text-[#9b4ae0] dark:text-[#bd66ff]',
  'D/ST': 'text-[#a65f48] dark:text-[#bf755d]',
}

/** Injury statuses as the letters Sleeper shows: Q, D, O, IR. */
export const INJURY_ABBREV: Record<string, string> = {
  QUESTIONABLE: 'Q',
  DOUBTFUL: 'D',
  OUT: 'O',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'SUSP',
  DAY_TO_DAY: 'DTD',
  PROBABLE: 'P',
}
