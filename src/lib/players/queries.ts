/**
 * A Player's queries: their Plays page by page (their page), the first page
 * alone (their sheet), and their season detail. Each key comes with its
 * fetch and timing.
 */

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { getPlayerPage } from './server'
import { getPlayerDetail } from './detail'

/** Every Play naming the Player, newest first, a page at a time. */
export function playerPagesQuery(playerId: string) {
  return infiniteQueryOptions({
    queryKey: ['player', playerId, 'pages'] as const,
    queryFn: ({ pageParam }) =>
      getPlayerPage({ data: { playerId, before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.nextBefore ?? undefined,
  })
}

/** The Player and their latest Plays: what the sheet shows. */
export function playerFirstPageQuery(playerId: string) {
  return queryOptions({
    queryKey: ['player', playerId, 'first'] as const,
    queryFn: () => getPlayerPage({ data: { playerId } }),
  })
}

export function playerDetailQuery(playerId: string) {
  return queryOptions({
    queryKey: ['player-detail', playerId] as const,
    queryFn: () => getPlayerDetail({ data: { playerId } }),
    staleTime: 60_000,
    // A live Game's line keeps moving.
    refetchInterval: (q) =>
      q.state.data?.game?.status === 'live' ? 30_000 : false,
  })
}
