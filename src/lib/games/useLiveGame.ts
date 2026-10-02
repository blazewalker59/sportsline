/**
 * One Game, live: its Plays and Situation from the LiveHub (filtered to the
 * Game), its box score refetched while it is live.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getGameDetail } from './server'
import type { GameDetail } from './server'
import type { TimelineEvent } from '@/lib/model/timeline'
import { useHubSocket } from '@/lib/timeline/useHubSocket'

const BOX_REFRESH_MS = 20_000

export function gameKey(gameId: string) {
  return ['game', gameId] as const
}

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

/** One Game live, or nothing while `gameId` is null. */
export function useLiveGame(gameId: string | null) {
  const queryClient = useQueryClient()
  const key = gameKey(gameId ?? '')
  const detail = useQuery({
    queryKey: key,
    queryFn: () => getGameDetail({ data: { gameId: gameId! } }),
    enabled: gameId !== null,
    refetchInterval: (q) => {
      const status = q.state.data?.game.status
      return status === 'live' || status === 'delayed' ? BOX_REFRESH_MS : false
    },
  })
  const connection = useHubSocket(
    gameId ? new URLSearchParams({ game: gameId }).toString() : null,
    (events) =>
      queryClient.setQueryData<GameDetail | null>(key, (old) =>
        old ? applyGameEvents(old, events) : old,
      ),
    () => void queryClient.invalidateQueries({ queryKey: key }),
  )
  return { ...detail, connection }
}
