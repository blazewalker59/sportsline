/**
 * One Fantasy league's page query, on its own: the route's loader warms
 * it, and loaders ship in the app's entry, so it carries only its fetch.
 */

import { queryOptions } from '@tanstack/react-query'
import { getFantasyLeague } from './server'

/** Matchups refresh on the server every thirty seconds while live. */
const REFRESH_MS = 20_000

/** One league's page: the league, its Standings and Scoring leaders. */
export function fantasyLeagueQuery(leagueId: string) {
  return queryOptions({
    queryKey: ['fantasy-league', leagueId] as const,
    queryFn: () => getFantasyLeague({ data: { leagueId } }),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}
