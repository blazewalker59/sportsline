/**
 * The Viewer's queries: each key with its fetch and timing, so a screen,
 * a route loader and a mutation all name the same cache entry.
 */

import { queryOptions } from '@tanstack/react-query'
import { getViewerState, leagueFollowables, searchFollowables } from './server'
import type { QueryClient } from '@tanstack/react-query'
import type { ViewerState } from './server'
import type { League } from '@/lib/model/types'

export const VIEWER_KEY = ['viewer'] as const

export function viewerQuery() {
  return queryOptions({
    queryKey: VIEWER_KEY,
    queryFn: () => getViewerState(),
    staleTime: 60_000,
  })
}

/**
 * The session, for a route to wait on: cached after the first load. A
 * failed check isn't fatal here; the Gate's own query retries it.
 */
export async function ensureViewer(
  queryClient: QueryClient,
): Promise<ViewerState | null> {
  try {
    return await queryClient.ensureQueryData(viewerQuery())
  } catch {
    return null
  }
}

/** Teams and Players matching a search, for the Follows search box. */
export function followablesQuery(q: string) {
  return queryOptions({
    queryKey: ['followables', q] as const,
    queryFn: () => searchFollowables({ data: { q } }),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
  })
}

/** Every Team in these Leagues, for the first-run Follow picker. */
export function leagueFollowablesQuery(leagues: ReadonlyArray<League>) {
  const sorted = [...leagues].sort()
  return queryOptions({
    queryKey: ['followables', 'leagues', sorted] as const,
    queryFn: () => leagueFollowables({ data: { leagues: sorted } }),
    enabled: sorted.length > 0,
    staleTime: 60 * 60_000,
  })
}
