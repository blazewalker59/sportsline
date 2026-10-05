/**
 * Sleeper reads (docs/adr/0004 covers ESPN; Sleeper needs no credentials:
 * its API is public and read-only). Server only.
 */

import { fetchWithRetry } from '@/lib/sources/pool'

const API = 'https://api.sleeper.app/v1'
/** Weekly stats and projections (Sleeper's app API). */
const APP = 'https://api.sleeper.com'

export class SleeperError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new SleeperError(res.status, `Sleeper ${res.status}`)
  return (await res.json()) as T
}

export interface SleeperUser {
  user_id: string
  username?: string
  display_name?: string
  avatar?: string | null
  metadata?: { team_name?: string; avatar?: string } | null
}

export interface SleeperLeague {
  league_id: string
  name?: string
  season?: string
  status?: string
  sport?: string
  roster_positions?: Array<string>
  scoring_settings?: Record<string, number>
}

export interface SleeperRoster {
  roster_id: number
  owner_id?: string | null
  co_owners?: Array<string> | null
  players?: Array<string> | null
  starters?: Array<string> | null
  reserve?: Array<string> | null
  taxi?: Array<string> | null
  settings?: { wins?: number; losses?: number; ties?: number } | null
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points?: number | null
  custom_points?: number | null
  starters?: Array<string> | null
  players?: Array<string> | null
  players_points?: Record<string, number> | null
}

export interface SleeperState {
  week: number
  season: string
  season_type: string
  league_season?: string
}

/** A player as the weekly feeds carry them. */
export interface SleeperPlayerInfo {
  first_name?: string
  last_name?: string
  position?: string
  team?: string | null
  injury_status?: string | null
}

export interface SleeperWeekEntry {
  player_id: string
  stats?: Record<string, number>
  team?: string | null
  player?: SleeperPlayerInfo
}

export const sleeperUser = (username: string) =>
  get<SleeperUser | null>(`${API}/user/${encodeURIComponent(username)}`)
export const sleeperState = () => get<SleeperState>(`${API}/state/nfl`)
export const userLeagues = (userId: string, season: string) =>
  get<Array<SleeperLeague>>(
    `${API}/user/${encodeURIComponent(userId)}/leagues/nfl/${season}`,
  )
export const league = (id: string) =>
  get<SleeperLeague>(`${API}/league/${encodeURIComponent(id)}`)
export const rosters = (id: string) =>
  get<Array<SleeperRoster>>(`${API}/league/${encodeURIComponent(id)}/rosters`)
export const leagueUsers = (id: string) =>
  get<Array<SleeperUser>>(`${API}/league/${encodeURIComponent(id)}/users`)
export const matchups = (id: string, week: number) =>
  get<Array<SleeperMatchup>>(
    `${API}/league/${encodeURIComponent(id)}/matchups/${week}`,
  )

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  .map((p) => `position%5B%5D=${p}`)
  .join('&')

/** Every fantasy-relevant player's stats this week (with who they are). */
export const weekStats = (season: string, week: number) =>
  get<Array<SleeperWeekEntry>>(
    `${APP}/stats/nfl/${season}/${week}?season_type=regular&${POSITIONS}`,
  )
/** …and their projections (pts_ppr, pts_half_ppr, pts_std). */
export const weekProjections = (season: string, week: number) =>
  get<Array<SleeperWeekEntry>>(
    `${APP}/projections/nfl/${season}/${week}?season_type=regular&${POSITIONS}`,
  )
/** One player, for one the weekly feeds don't carry. */
export const sleeperPlayer = (id: string) =>
  get<SleeperPlayerInfo | null>(`${APP}/players/nfl/${encodeURIComponent(id)}`)
