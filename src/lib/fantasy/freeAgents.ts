/**
 * A Fantasy league's Available players (CONTEXT.md, "Available players"):
 * the Players no team in it rosters, read from its provider while the
 * Viewer looks and never stored. ESPN's come most rostered first, each
 * a free agent or on waivers; Sleeper's by this week's projection. Pure.
 */

import { toStats } from './categories'
import type { ActivityPlayer } from './activity'
import type { LeagueCategory, Stats } from './categories'
import type { FantasySport } from './sports'
import type { NextGame } from './proSchedule'

/** How many Players a read lists: enough for any league's real options. */
export const AVAILABLE_LIMIT = 300

export type AvailablePlayer = ActivityPlayer & {
  injury: string | null
  /** ESPN: the share of its leagues that roster the Player (0–100). */
  owned: number | null
  /** ESPN: how that share moved over the last week, in points. */
  ownedChange: number | null
  /** ESPN: on waivers (a claim), not a free agent (an add). */
  waivers: boolean
  /** Sleeper: Fantasy points projected this week, under the league's scoring. */
  projected: number | null
  /** What they've done: this season, and lately (ESPN: the last 15 days). */
  stats?: { season: SpanStats | null; recent: SpanStats | null }
  /** Their Team's next Game (ESPN's pro schedule), when it's known. */
  nextGame?: NextGame | null
}

/** A Player's figures over a span, for the table's columns. */
export interface SpanStats {
  /**
   * Their line by ESPN stat id, as the league's Categories need it: per
   * game in basketball, totals in baseball. Null in a points league.
   */
  stats: Stats | null
  /** Fantasy points over the span, and per game (points leagues). */
  points: number | null
  average: number | null
}

export interface AvailablePlayers {
  players: Array<AvailablePlayer>
  /** How they're ordered, as the list says. */
  order: 'owned' | 'projected'
  /** What `recent` stats cover ("Last 15"), when any Player has them. */
  recentLabel?: string
  /** A category league's Categories: the stat table's columns. */
  categories?: Array<LeagueCategory>
  /** The stats are per game (basketball), not totals. */
  perGame?: boolean
}

/** One of ESPN's `kona_player_info` entries. */
export interface WireAvailable {
  id?: number
  /** The team that has them; 0 for none. */
  onTeamId?: number
  /** FREEAGENT, WAIVERS or ONTEAM. */
  status?: string
  player?: {
    id?: number
    fullName?: string
    proTeamId?: number
    defaultPositionId?: number
    injuryStatus?: string
    ownership?: { percentOwned?: number; percentChange?: number }
    /** Season lines, as `statIds` asks for them. */
    stats?: Array<WireSeasonStat>
  }
}

/**
 * One of a Player's season lines. `id` reads source, split and season:
 * "002026" this season's stats, "022026" its last 15 days', "102026" its
 * projection.
 */
export interface WireSeasonStat {
  id?: string
  seasonId?: number
  statSourceId?: number
  statSplitTypeId?: number
  appliedTotal?: number
  appliedAverage?: number
  stats?: Record<string, number | string>
  averageStats?: Record<string, number | string>
}

/** ESPN's split for a Player's last 15 days. */
const LAST_15 = 2

/** The season lines a read asks ESPN for: this season's, and lately's. */
export const statIds = (season: number) => [
  `00${season}`,
  `0${LAST_15}${season}`,
]

/** Baseball's pitchers (SP, RP): their pitching Categories, not batting. */
const PITCHERS = new Set([1, 11])
/** Baseball's pitching stat ids start here (innings are 34). */
const FIRST_PITCHING_STAT = 32

export const isPitcher = (sport: FantasySport, positionId: number | null) =>
  sport === 'baseball' && positionId !== null && PITCHERS.has(positionId)

/** A baseball Category a pitcher plays (K, ERA), not a batter (HR, AVG). */
export const isPitching = (statId: number) => statId >= FIRST_PITCHING_STAT

/**
 * The stats a rate's columns are made from (attempts, at-bats, innings),
 * kept beside the Categories themselves; the rest of a line isn't sent.
 */
const PARTS: Record<FantasySport, ReadonlyArray<number>> = {
  football: [],
  basketball: [3, 11, 13, 14, 15, 16, 17, 18],
  baseball: [0, 1, 8, 10, 12, 13, 23, 24, 34, 37, 39, 45, 48, 57, 60],
}

const two = (n: number) => Math.round(n * 100) / 100

/** A season line as the table shows it: the stats it needs, and its points. */
export function spanStats(
  sport: FantasySport,
  line: WireSeasonStat | undefined,
  categories: ReadonlyArray<LeagueCategory> | null,
): SpanStats | null {
  if (!line) return null
  if (!categories)
    return line.appliedTotal
      ? {
          stats: null,
          points: two(line.appliedTotal),
          average:
            line.appliedAverage === undefined ? null : two(line.appliedAverage),
        }
      : null
  // Basketball's per game; baseball's totals, as each sport reads them.
  const raw = toStats(sport === 'basketball' ? line.averageStats : line.stats)
  const keep = new Set([...categories.map((c) => c.statId), ...PARTS[sport]])
  const stats: Record<string, number> = {}
  for (const [id, n] of Object.entries(raw))
    if (keep.has(Number(id)) && Number.isFinite(n)) stats[id] = two(n)
  return Object.keys(stats).length > 0
    ? { stats, points: null, average: null }
    : null
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * ESPN's free agents and waiver Players as they came (most rostered
 * first). Anyone ESPN still places on a team is left out, should it
 * ignore the filter.
 */
export function readEspnAvailable(
  entries: ReadonlyArray<WireAvailable>,
  league: {
    sport: FantasySport
    season: number
    /** A category league's Categories; null in a points league. */
    categories: ReadonlyArray<LeagueCategory> | null
  },
): AvailablePlayers {
  const { sport, season, categories } = league
  const lineOf = (e: WireAvailable, split: number) =>
    e.player?.stats?.find(
      (l) =>
        (l.statSourceId ?? 0) === 0 &&
        l.statSplitTypeId === split &&
        (l.seasonId === undefined || l.seasonId === season),
    )
  const players = entries.flatMap((e): Array<AvailablePlayer> => {
    const p = e.player
    const espnId = p?.id ?? e.id
    if (espnId === undefined || (e.onTeamId ?? 0) > 0 || e.status === 'ONTEAM')
      return []
    const owned = p?.ownership?.percentOwned
    const change = p?.ownership?.percentChange
    const position = p?.defaultPositionId ?? null
    return [
      {
        espnId,
        name: p?.fullName ?? `#${espnId}`,
        positionId: position,
        proTeamId: p?.proTeamId ?? null,
        injury:
          p?.injuryStatus && p.injuryStatus !== 'ACTIVE'
            ? p.injuryStatus
            : null,
        owned: owned === undefined ? null : round(owned),
        ownedChange: change === undefined ? null : round(change),
        waivers: e.status === 'WAIVERS',
        projected: null,
        stats: {
          season: spanStats(sport, lineOf(e, 0), categories),
          recent: spanStats(sport, lineOf(e, LAST_15), categories),
        },
      },
    ]
  })
  return {
    players: players.slice(0, AVAILABLE_LIMIT),
    order: 'owned',
    ...(players.some((p) => p.stats?.recent) ? { recentLabel: 'Last 15' } : {}),
    ...(categories
      ? {
          categories: categories.map((c) => ({
            statId: c.statId,
            label: c.label,
            reverse: c.reverse,
          })),
          perGame: sport === 'basketball',
        }
      : {}),
  }
}

/** A name as a search matches it: lower case, accents and dots gone. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’-]/g, '')
    .toLowerCase()

/**
 * The Players a search finds: every word of it starting a word of their
 * name or Team ("luka don", "lal"), at a position when one's picked.
 */
export function searchAvailable(
  players: ReadonlyArray<AvailablePlayer>,
  query: string,
  positionIds: ReadonlyArray<number> | null = null,
): Array<AvailablePlayer> {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return players.filter((p) => {
    if (
      positionIds &&
      (p.positionId === null || !positionIds.includes(p.positionId))
    )
      return false
    if (words.length === 0) return true
    const name = fold(`${p.name} ${p.teamAbbrev ?? ''}`).split(/\s+/)
    return words.every((w) => name.some((n) => n.startsWith(w)))
  })
}
