/**
 * A Game's and a Play's queries: each key with its fetch and timing, so the
 * Timeline, the flow chart, a Prediction's sheet and the old detail links
 * all share one cache entry per Game.
 */

import { queryOptions } from '@tanstack/react-query'
import { getGameDetail, getPlayDetail } from './server'
import type { QueryClient } from '@tanstack/react-query'
import type { GameDetail } from './server'
import type { TimelineEvent } from '@/lib/model/timeline'

/** A live Game's box score moves between Plays: read it again this often. */
const BOX_REFRESH_MS = 20_000

const isLive = (detail: GameDetail | null | undefined) =>
  detail?.game.status === 'live' || detail?.game.status === 'delayed'

export function gameKey(gameId: string) {
  return ['game', gameId] as const
}

export function gameDetailQuery(gameId: string) {
  return queryOptions({
    queryKey: gameKey(gameId),
    queryFn: () => getGameDetail({ data: { gameId } }),
    // A finished Game won't change; a live one is kept current by the
    // LiveHub and this refetch.
    staleTime: (q) => (isLive(q.state.data) ? 15_000 : 5 * 60_000),
    refetchInterval: (q) => (isLive(q.state.data) ? BOX_REFRESH_MS : false),
  })
}

export function playDetailQuery(playId: string) {
  return queryOptions({
    queryKey: ['play', playId] as const,
    queryFn: () => getPlayDetail({ data: { playId } }),
    staleTime: 60_000,
  })
}

/** A Game's detail with the LiveHub's events for it applied. */
export function applyGameEvents(
  detail: GameDetail,
  events: ReadonlyArray<TimelineEvent>,
): GameDetail {
  const items = new Map(detail.items.map((i) => [i.id, i]))
  let game = detail.game
  for (const e of events) {
    if (e.type === 'upsert') items.set(e.item.id, e.item)
    else if (e.type === 'remove') items.delete(e.id)
    else game = e.game
  }
  return {
    ...detail,
    game,
    items: [...items.values()].sort((a, b) => a.sequence - b.sequence),
  }
}

const eventGameId = (e: TimelineEvent) =>
  e.type === 'upsert'
    ? e.item.gameId
    : e.type === 'remove'
      ? e.gameId
      : e.game.id

/**
 * Hand a socket's events to every cached Game they belong to, so one
 * connection keeps both the Timeline and an open Game current.
 */
export function applyEventsToGames(
  queryClient: QueryClient,
  events: ReadonlyArray<TimelineEvent>,
): void {
  const byGame = new Map<string, Array<TimelineEvent>>()
  for (const e of events) {
    const id = eventGameId(e)
    byGame.set(id, [...(byGame.get(id) ?? []), e])
  }
  for (const [gameId, mine] of byGame) {
    queryClient.setQueryData<GameDetail | null>(gameKey(gameId), (old) =>
      old ? applyGameEvents(old, mine) : old,
    )
  }
}
