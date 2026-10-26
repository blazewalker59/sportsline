/**
 * ESPN Fantasy reads (docs/adr/0004), always with the Viewer's own session
 * cookies and never cached across Viewers. Server only. ESPN rejects
 * requests without a browser User-Agent, which Workers don't send.
 */

import { SPORTS } from './sports'
import { ACTIVITY_LIMIT, ESPN_ACTIVITY_TYPES } from './activity'
import type { FantasySport } from './sports'
import type { WireTopic, WireWaiver } from './activity'
import type { WireLeague } from './matchup'
import type { WireAvailable } from './freeAgents'
import { BROWSER_USER_AGENT, fetchWithRetry } from '@/lib/sources/pool'

export interface EspnSession {
  swid: string
  espnS2: string
}

export class EspnError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** SWID as ESPN expects it: an upper-case GUID in braces. */
export function bracedSwid(swid: string): string {
  return `{${swid.trim().replace(/[{}]/g, '').toUpperCase()}}`
}

async function get<T>(
  url: string,
  session: EspnSession | null,
  /** ESPN's x-fantasy-filter: which of a view's records to send. */
  filter?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': BROWSER_USER_AGENT,
  }
  if (filter !== undefined) headers['x-fantasy-filter'] = JSON.stringify(filter)
  if (session) {
    headers.cookie = `espn_s2=${session.espnS2}; SWID=${bracedSwid(session.swid)}`
  }
  const res = await fetchWithRetry(url, { headers })
  if (!res.ok) {
    throw new EspnError(res.status, `ESPN ${res.status}`)
  }
  return (await res.json()) as T
}

/**
 * The Viewer's fan profile, which lists their Fantasy leagues; null when
 * ESPN has no profile under their SWID ("fan not found"). ESPN's own site
 * asks with the braced SWID, so that's tried first, then the bare GUID.
 */
export async function fanProfile(session: EspnSession): Promise<unknown> {
  const braced = bracedSwid(session.swid)
  for (const id of [encodeURIComponent(braced), braced.replace(/[{}]/g, '')]) {
    try {
      return await get(
        `https://fan.api.espn.com/apis/v2/fans/${id}?displayEvents=true&displayNow=true&context=fantasy&source=espn&lang=en&region=us`,
        session,
      )
    } catch (error) {
      if (!(error instanceof EspnError && error.status === 404)) throw error
    }
  }
  return null
}

function leagueUrl(
  sport: FantasySport,
  season: number,
  leagueId: string,
): string {
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${SPORTS[sport].code}/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}`
}

/** A league's recent adds, drops and trades, newest first. */
export async function leagueActivity(
  session: EspnSession | null,
  sport: FantasySport,
  season: number,
  leagueId: string,
): Promise<Array<WireTopic>> {
  const res = await get<{ topics?: Array<WireTopic> }>(
    `${leagueUrl(sport, season, leagueId)}/communication/?view=kona_league_communication`,
    session,
    {
      topics: {
        filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
        limit: ACTIVITY_LIMIT,
        limitPerMessageSet: { value: ACTIVITY_LIMIT },
        offset: 0,
        sortMessageDate: { sortPriority: 1, sortAsc: false },
        filterIncludeMessageTypeIds: { value: ESPN_ACTIVITY_TYPES },
      },
    },
  )
  return res.topics ?? []
}

/**
 * A league's waiver claims, losing ones too. ESPN has served them at two
 * paths; an empty list when neither does.
 */
export async function waiverClaims(
  session: EspnSession | null,
  sport: FantasySport,
  season: number,
  leagueId: string,
): Promise<Array<WireWaiver>> {
  const base = leagueUrl(sport, season, leagueId)
  const filter = { transactions: { filterType: { value: ['WAIVER'] } } }
  for (const url of [
    `${base}/transactions/?view=mTransactions2`,
    `${base}?view=mTransactions2`,
  ]) {
    const res = await get<{ transactions?: Array<WireWaiver> }>(
      url,
      session,
      filter,
    ).catch(() => null)
    if (res?.transactions?.length) return res.transactions
  }
  return []
}

/**
 * The league's most rostered Players at every slot, to name those a
 * lookup by id didn't: ESPN honours this where it may not `filterIds`.
 */
export async function playerPool(
  session: EspnSession | null,
  sport: FantasySport,
  season: number,
  leagueId: string,
): Promise<Array<PlayerCard>> {
  const res = await get<{
    players?: Array<{
      id?: number
      player?: Omit<PlayerCard, 'id'> & { id?: number }
    }>
  }>(`${leagueUrl(sport, season, leagueId)}?view=kona_player_info`, session, {
    players: {
      filterSlotIds: { value: Array.from({ length: 26 }, (_, i) => i) },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit: 2000,
      offset: 0,
    },
  })
  return cardsOf(res.players)
}

/**
 * The league's free agents and waiver Players, most rostered first: the
 * first `limit` of them.
 */
export async function availablePlayers(
  session: EspnSession | null,
  sport: FantasySport,
  season: number,
  leagueId: string,
  limit: number,
): Promise<Array<WireAvailable>> {
  const res = await get<{ players?: Array<WireAvailable> }>(
    `${leagueUrl(sport, season, leagueId)}?view=kona_player_info`,
    session,
    {
      players: {
        filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
        filterSlotIds: { value: Array.from({ length: 26 }, (_, i) => i) },
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        limit,
        offset: 0,
      },
    },
  )
  return res.players ?? []
}

export interface PlayerCard {
  id: number
  fullName?: string
  proTeamId?: number
  defaultPositionId?: number
}

function cardsOf(
  players:
    | Array<{ id?: number; player?: Omit<PlayerCard, 'id'> & { id?: number } }>
    | undefined,
): Array<PlayerCard> {
  return (players ?? []).flatMap((e) => {
    const id = e.player?.id ?? e.id
    return id === undefined ? [] : [{ ...e.player, id }]
  })
}

/** Who some Players are (name, pro team, position), by ESPN id. */
export async function playerCards(
  session: EspnSession | null,
  sport: FantasySport,
  season: number,
  leagueId: string,
  ids: ReadonlyArray<number>,
): Promise<Array<PlayerCard>> {
  if (ids.length === 0) return []
  const res = await get<{
    players?: Array<{
      id?: number
      player?: Omit<PlayerCard, 'id'> & { id?: number }
    }>
  }>(`${leagueUrl(sport, season, leagueId)}?view=kona_playercard`, session, {
    players: { filterIds: { value: ids }, limit: ids.length },
  })
  return cardsOf(res.players)
}

/**
 * A league's teams, Lineups, this period's Matchups and settings; with a
 * scoring period, the Lineups and stat lines are that day's.
 */
export function leagueViews(
  session: EspnSession | null,
  sport: FantasySport,
  season: number,
  leagueId: string,
  scoringPeriod?: number,
): Promise<WireLeague> {
  const views = ['mTeam', 'mRoster', 'mMatchup', 'mMatchupScore', 'mSettings']
  const query = [
    ...views.map((v) => `view=${v}`),
    ...(scoringPeriod === undefined
      ? []
      : [`scoringPeriodId=${scoringPeriod}`]),
  ].join('&')
  return get(`${leagueUrl(sport, season, leagueId)}?${query}`, session)
}
