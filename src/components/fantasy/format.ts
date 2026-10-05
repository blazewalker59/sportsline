/**
 * How Fantasy Lineups read: scores and figures, short names, headshots,
 * injuries, and the colors for slots and positions. Pure.
 */

import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer, MatchupView } from '@/lib/fantasy/matchup'

export const pts = (n: number | null) => (n === null ? '—' : n.toFixed(1))

/** A Matchup side's score: points, or categories led (a whole number). */
export const scoreText = (m: MatchupView, n: number | null) =>
  m.categories ? (n === null ? '—' : String(n)) : pts(n)

/** "6–3–1": categories won, lost and tied (from the Viewer's side). */
export const categoryRecord = (m: MatchupView) =>
  `${m.mine.score}–${m.opponent?.score ?? 0}${m.ties ? `–${m.ties}` : ''}`

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
  p: LineupPlayer,
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
