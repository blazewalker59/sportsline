/**
 * The Viewer's queries: each key with its fetch and timing, so a screen,
 * a route loader and a mutation all name the same cache entry.
 */

import { queryOptions } from '@tanstack/react-query'
import { getViewerState, searchFollowables } from './server'
import type { QueryClient } from '@tanstack/react-query'
import type { ViewerState } from './server'

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
