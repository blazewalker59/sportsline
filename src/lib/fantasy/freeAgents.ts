/**
 * A Fantasy league's Available players (CONTEXT.md, "Available players"):
 * the Players no team in it rosters, read from its provider while the
 * Viewer looks and never stored. ESPN's come most rostered first, each
 * a free agent or on waivers; Sleeper's by this week's projection. Pure.
 */

import { categoryValue, formatCategory, isRate, toStats } from './categories'
import type { ActivityPlayer } from './activity'
import type { LeagueCategory } from './categories'
import type { FantasySport } from './sports'

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
  stats?: { season: StatLine | null; recent: StatLine | null }
}

/**
 * A Player's figures in a line: in a category league the league's
 * Categories (per game in basketball, totals in baseball); in a points
 * league their Fantasy points and per game.
 */
export type StatLine = Array<{ label: string; value: string }>

export interface AvailablePlayers {
  players: Array<AvailablePlayer>
  /** How they're ordered, as the list says. */
  order: 'owned' | 'projected'
  /** What `recent` stats cover ("Last 15"), when any Player has them. */
  recentLabel?: string
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

/** Baseball's pitchers: their pitching Categories, not their batting. */
const PITCHERS = new Set([1, 11])
/** Baseball's pitching stat ids start here (innings are 34). */
const FIRST_PITCHING_STAT = 32

/** A season line's figures, for the league's Categories or its points. */
export function statLine(
  sport: FantasySport,
  line: WireSeasonStat | undefined,
  categories: ReadonlyArray<LeagueCategory> | null,
  positionId: number | null,
): StatLine | null {
  if (!line) return null
  if (!categories) {
    if (!line.appliedTotal) return null
    return [
      { label: 'FPTS', value: line.appliedTotal.toFixed(1) },
      ...(line.appliedAverage === undefined
        ? []
        : [{ label: 'AVG', value: line.appliedAverage.toFixed(1) }]),
    ]
  }
  // Basketball's per game; baseball's totals, as each sport reads them.
  const perGame = sport === 'basketball' && line.averageStats !== undefined
  const stats = toStats(perGame ? line.averageStats : line.stats)
  if (Object.keys(stats).length === 0) return null
  const pitcher = positionId !== null && PITCHERS.has(positionId)
  const out = categories.flatMap((c) => {
    if (sport === 'baseball' && pitcher !== c.statId >= FIRST_PITCHING_STAT)
      return []
    const n = categoryValue(sport, c.statId, stats)
    if (n === null || !Number.isFinite(n)) return []
    const value =
      perGame && !isRate(sport, c.statId)
        ? n.toFixed(1)
        : formatCategory(sport, c.statId, n)
    return [{ label: c.label, value }]
  })
  return out.length > 0 ? out : null
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
          season: statLine(sport, lineOf(e, 0), categories, position),
          recent: statLine(sport, lineOf(e, LAST_15), categories, position),
        },
      },
    ]
  })
  return {
    players: players.slice(0, AVAILABLE_LIMIT),
    order: 'owned',
    ...(players.some((p) => p.stats?.recent) ? { recentLabel: 'Last 15' } : {}),
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
