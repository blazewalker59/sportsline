/**
 * The Viewer's Fantasy queries (connections, leagues, a Matchup's race,
 * Games and past days): each key with its fetch and timing.
 */

import { queryOptions } from '@tanstack/react-query'
import {
  getEspnConnection,
  getFantasy,
  getMatchupDay,
  getMatchupRace,
  getSleeperConnection,
} from './server'
import { getMatchupGames } from './schedule'
import type { League } from '@/lib/model/types'

/** Matchups refresh on the server every two minutes. */
const REFRESH_MS = 60_000

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
) {
  return queryOptions({
    queryKey: ['matchup-day', leagueId, scoringPeriod] as const,
    queryFn: () => getMatchupDay({ data: { leagueId, scoringPeriod } }),
    staleTime: scoringPeriod < currentPeriod ? Infinity : 5 * 60_000,
  })
}
