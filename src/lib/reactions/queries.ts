/** Reactions' queries: each key with its fetch and timing. */

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { getMyReactions, getReactions } from './server'

/** Friends' Reactions arrive by polling: they are a nicety, not live data. */
const REFRESH_MS = 30_000

/** A Sports Day's tallies. */
export function reactionsQuery(sportsDay: string) {
  return queryOptions({
    queryKey: ['reactions', sportsDay] as const,
    queryFn: () => getReactions({ data: { sportsDay } }),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}

/** The Viewer's own Reactions, newest first, a page at a time. */
export function myReactionsQuery() {
  return infiniteQueryOptions({
    queryKey: ['my-reactions'] as const,
    queryFn: ({ pageParam }) => getMyReactions({ data: { before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  })
}
