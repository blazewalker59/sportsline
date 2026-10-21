/**
 * The Viewer's Fantasy queries (connections, leagues, a Matchup's race,
 * Games and past days): each key with its fetch and timing.
 */

import { queryOptions } from '@tanstack/react-query'
import {
  getEspnConnection,
  getFantasy,
  getLeagueActivity,
  getLeagueMatchup,
  getMatchupDay,
  getMatchupRace,
  getSleeperConnection,
  getWhoHas,
} from './server'
import { getMatchupGames } from './schedule'
import type { League } from '@/lib/model/types'

/**
 * Matchups refresh on the server every thirty seconds while a Game is
 * live (two minutes otherwise); reading what's stored is cheap.
 */
const REFRESH_MS = 20_000

export function espnConnectionQuery() {
  return queryOptions({
    queryKey: ['espn-connection'] as const,
    queryFn: () => getEspnConnection(),
    staleTime: 60_000,
  })
}

export function sleeperConnectionQuery() {
  return queryOptions({
    queryKey: ['sleeper-connection'] as const,
    queryFn: () => getSleeperConnection(),
    staleTime: 60_000,
  })
}

export function fantasyQuery() {
  return queryOptions({
    queryKey: ['fantasy'] as const,
    queryFn: () => getFantasy(),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}

/** Both sides' points over a matchup period (points leagues). */
export function matchupRaceQuery(leagueId: string, matchupPeriod: number) {
  return queryOptions({
    queryKey: ['matchup-race', leagueId, matchupPeriod] as const,
    queryFn: () => getMatchupRace({ data: { leagueId } }),
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  })
}

/** Every Lineup Team's Game this matchup. */
export function matchupGamesQuery(
  leagueId: string,
  league: League,
  teamIds: ReadonlyArray<string>,
  abbrevs: ReadonlyArray<string>,
) {
  return queryOptions({
    queryKey: [
      'matchup-games',
      leagueId,
      [...teamIds].sort().join(),
      [...abbrevs].sort().join(),
    ] as const,
    queryFn: () =>
      getMatchupGames({
        data: { league, teamIds: [...teamIds], abbrevs: [...abbrevs] },
      }),
    staleTime: 5 * 60_000,
  })
}

/**
 * One day of a category Matchup. An earlier day is final, so it's read
 * once; a later one's Lineups can still change.
 */
export function matchupDayQuery(
  leagueId: string,
  scoringPeriod: number,
  currentPeriod: number,
  /** Another Matchup in the league (its left team), not the Viewer's. */
  teamId?: number,
) {
  return queryOptions({
    queryKey: ['matchup-day', leagueId, scoringPeriod, teamId ?? null] as const,
    queryFn: () => getMatchupDay({ data: { leagueId, scoringPeriod, teamId } }),
    staleTime: scoringPeriod < currentPeriod ? Infinity : 5 * 60_000,
  })
}

/**
 * Another Matchup in the Viewer's league, read from its provider while
 * its sheet is open, as often as the Viewer's own Matchup refreshes.
 */
export function leagueMatchupQuery(leagueId: string, teamId: number) {
  return queryOptions({
    queryKey: ['league-matchup', leagueId, teamId] as const,
    queryFn: () => getLeagueMatchup({ data: { leagueId, teamId } }),
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  })
}

/**
 * A Who Has? encounter to offer, asked once each time the app opens:
 * never refetched, so it can't pop up again mid-visit.
 */
export function whoHasQuery() {
  return queryOptions({
    queryKey: ['who-has'] as const,
    queryFn: () => getWhoHas(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** A league's Activity, read from its provider while its tab is open. */
export function leagueActivityQuery(leagueId: string) {
  return queryOptions({
    queryKey: ['league-activity', leagueId] as const,
    queryFn: () => getLeagueActivity({ data: { leagueId } }),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  })
}
