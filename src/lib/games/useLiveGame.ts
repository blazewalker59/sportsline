/**
 * One Game, live: its Plays and Situation from the LiveHub (filtered to the
 * Game), its box score refetched while it is live. On today's Timeline the
 * Timeline's own socket already carries every Game's events into the cache
 * (useLiveTimeline), so the Game reads those instead of opening a second.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { applyGameEvents, gameDetailQuery, gameKey } from './queries'
import type { GameDetail } from './server'
import { useHubSocket } from '@/lib/timeline/useHubSocket'

export { applyGameEvents }

/** One Game live, or nothing while `gameId` is null. */
export function useLiveGame(
  gameId: string | null,
  {
    shared = false,
  }: {
    /** The Timeline's live socket covers this Game: don't open another. */
    shared?: boolean
  } = {},
) {
  const queryClient = useQueryClient()
  const key = gameKey(gameId ?? '')
  const detail = useQuery({
    ...gameDetailQuery(gameId ?? ''),
    enabled: gameId !== null,
  })
  const connection = useHubSocket(
    gameId && !shared ? new URLSearchParams({ game: gameId }).toString() : null,
    (events) =>
      queryClient.setQueryData<GameDetail | null>(key, (old) =>
        old ? applyGameEvents(old, events) : old,
      ),
    () => void queryClient.invalidateQueries({ queryKey: key }),
  )
  return { ...detail, connection }
}
