/**
 * A Fantasy league's Available players (CONTEXT.md, "Available players"):
 * the Players no team in it rosters, read from its provider while the
 * Viewer looks and never stored. ESPN's come most rostered first, each
 * a free agent or on waivers; Sleeper's by this week's projection. Pure.
 */

import type { ActivityPlayer } from './activity'

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
}

export interface AvailablePlayers {
  players: Array<AvailablePlayer>
  /** How they're ordered, as the list says. */
  order: 'owned' | 'projected'
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
  }
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * ESPN's free agents and waiver Players as they came (most rostered
 * first). Anyone ESPN still places on a team is left out, should it
 * ignore the filter.
 */
export function readEspnAvailable(
  entries: ReadonlyArray<WireAvailable>,
): AvailablePlayers {
  const players = entries.flatMap((e): Array<AvailablePlayer> => {
    const p = e.player
    const espnId = p?.id ?? e.id
    if (espnId === undefined || (e.onTeamId ?? 0) > 0 || e.status === 'ONTEAM')
      return []
    const owned = p?.ownership?.percentOwned
    const change = p?.ownership?.percentChange
    return [
      {
        espnId,
        name: p?.fullName ?? `#${espnId}`,
        positionId: p?.defaultPositionId ?? null,
        proTeamId: p?.proTeamId ?? null,
        injury:
          p?.injuryStatus && p.injuryStatus !== 'ACTIVE'
            ? p.injuryStatus
            : null,
        owned: owned === undefined ? null : round(owned),
        ownedChange: change === undefined ? null : round(change),
        waivers: e.status === 'WAIVERS',
        projected: null,
      },
    ]
  })
  return { players: players.slice(0, AVAILABLE_LIMIT), order: 'owned' }
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
