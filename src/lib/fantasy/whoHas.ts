/**
 * League rosters and Who Has? (CONTEXT.md, "Who Has?"): every team's
 * Players, kept about once an hour from the league data each sync reads,
 * and the Injury Events found between one roster and the next. An Injury
 * Event is a notable Player on another team in the league turning
 * doubtful, out or injured; it becomes a guessing game the next time the
 * Viewer opens the app: which of four teams has them? Pure.
 */

import type { LineupPlayer, MatchupSide } from './matchup'

export interface RosterPlayer {
  espnId: number
  name: string
  injury: string | null
  starter: boolean
  /** ESPN: the share of its leagues that roster the Player. */
  owned: number | null
}

export interface RosterTeam {
  teamId: number
  name: string
  abbrev: string
  players: Array<RosterPlayer>
}

export interface LeagueRosters {
  /** When they were kept. */
  at: string
  teams: Array<RosterTeam>
}

/** Rosters are kept this often, not with every sync. */
export const ROSTERS_EVERY_MS = 60 * 60_000

/** ESPN's Players this widely rostered are notable. */
export const NOTABLE_OWNED = 80

/** A Who Has? encounter is offered this long after its Injury Event. */
export const WHO_HAS_FOR_MS = 48 * 3_600_000

export function rostersOf(
  sides: ReadonlyArray<MatchupSide>,
  at: Date,
): LeagueRosters {
  return {
    at: at.toISOString(),
    teams: sides.map((s) => ({
      teamId: s.teamId,
      name: s.name,
      abbrev: s.abbrev,
      players: s.lineup.map((p) => ({
        espnId: p.espnId,
        name: p.name,
        injury: p.injury,
        starter: p.starter,
        owned: p.owned ?? null,
      })),
    })),
  }
}

/** Whether the rosters kept are due to be kept again. */
export function rostersDue(
  kept: LeagueRosters | null | undefined,
  now: Date,
): boolean {
  return !kept || now.getTime() - Date.parse(kept.at) >= ROSTERS_EVERY_MS
}

/**
 * How serious a status is: 0 playing (or maybe), 1 doubtful, 2 out, 3 on
 * injured reserve or the injured list. A suspension isn't an injury.
 */
export function severity(status: string | null): number {
  if (!status) return 0
  if (/INJURY_RESERVE|_DL$|_IL$/.test(status)) return 3
  if (status === 'OUT') return 2
  if (status === 'DOUBTFUL') return 1
  return 0
}

/** A widely rostered Player (ESPN), else a Starter (no ownership known). */
export function isNotable(p: Pick<LineupPlayer, 'owned' | 'starter'>): boolean {
  return p.owned !== undefined ? p.owned >= NOTABLE_OWNED : p.starter
}

export interface InjuryEvent {
  player: LineupPlayer
  status: string
  ownerTeamId: number
}

/**
 * Injury Events between the rosters kept and the sides now: a notable
 * Player, on a team that isn't the Viewer's, whose status got more
 * serious (doubtful or worse). A Player new to the team, or rosters never
 * kept before, isn't an event: only a change seen between two is.
 */
export function injuryEvents(
  before: LeagueRosters | null | undefined,
  sides: ReadonlyArray<MatchupSide>,
  mine: number | null,
): Array<InjuryEvent> {
  if (!before) return []
  const was = new Map<string, RosterPlayer>()
  for (const t of before.teams)
    for (const p of t.players) was.set(`${t.teamId}:${p.espnId}`, p)
  return sides.flatMap((side) => {
    if (side.teamId === mine) return []
    return side.lineup.flatMap((p) => {
      const prior = was.get(`${side.teamId}:${p.espnId}`)
      if (!prior || !p.injury || !isNotable(p)) return []
      const now = severity(p.injury)
      return now >= 1 && now > severity(prior.injury)
        ? [{ player: p, status: p.injury, ownerTeamId: side.teamId }]
        : []
    })
  })
}

/** The Player in an encounter, enough for their name and headshot. */
export type WhoHasPlayer = Pick<
  LineupPlayer,
  | 'espnId'
  | 'sourcePlayerId'
  | 'headshot'
  | 'playerId'
  | 'name'
  | 'positionId'
  | 'proTeamId'
  | 'teamId'
  | 'teamAbbrev'
  | 'teamLogo'
>

export interface WhoHasOption {
  teamId: number
  name: string
}

/** A 32-bit hash of a Player id, to seed their options. */
function hashSeed(n: number): number {
  let h = n >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: ReadonlyArray<T>, rng: () => number): Array<T> {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The owner and up to three other teams, in an order seeded by the
 * Player's id: the same Player's options always read the same.
 */
export function whoHasOptions(
  espnId: number,
  ownerTeamId: number,
  teams: ReadonlyArray<WhoHasOption>,
): Array<WhoHasOption> {
  const rng = mulberry32(hashSeed(Math.abs(espnId)))
  const owner = teams.find((t) => t.teamId === ownerTeamId) ?? {
    teamId: ownerTeamId,
    name: `Team ${ownerTeamId}`,
  }
  const decoys = shuffled(
    teams.filter((t) => t.teamId !== ownerTeamId),
    rng,
  ).slice(0, 3)
  return shuffled([owner, ...decoys], rng)
}

/** "Ruled out", "Doubtful", "On injured reserve". */
export function injuryNews(status: string): string {
  const n = severity(status)
  if (n >= 3)
    return /_DL$|_IL$/.test(status)
      ? 'Placed on the injured list'
      : 'Placed on injured reserve'
  return n === 2 ? 'Ruled out' : 'Doubtful'
}
