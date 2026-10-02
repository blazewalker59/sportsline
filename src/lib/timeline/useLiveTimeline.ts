/**
 * The Viewer's Timeline: loads the backlog over HTTP, then keeps it live from
 * the LiveHub socket, refetching the first page after every reconnect.
 */

import { useCallback, useEffect, useReducer, useState } from 'react'
import {
  applyEvents,
  emptyState,
  orderedGames,
  orderedItems,
  withGames,
  withItems,
} from './merge'
import { getGames, getTimeline } from './server'
import { useHubSocket } from './useHubSocket'
import type { TimelineState } from './merge'
import type { Follow, TimelineEvent, TimelineItem } from '@/lib/model/timeline'
import { followsToParam } from '@/lib/model/timeline'

export type { Connection } from './useHubSocket'

type Action =
  | { type: 'reset'; sportsDay: string }
  | { type: 'items'; items: Array<TimelineItem> }
  | { type: 'games'; games: Parameters<typeof withGames>[1] }
  | { type: 'events'; events: Array<TimelineEvent> }

function reducer(state: TimelineState, action: Action): TimelineState {
  switch (action.type) {
    case 'reset':
      return emptyState(action.sportsDay)
    case 'items':
      return withItems(state, action.items)
    case 'games':
      return withGames(state, action.games)
    case 'events':
      return applyEvents(state, action.events)
  }
}

export function useLiveTimeline(
  follows: ReadonlyArray<Follow>,
  includeRoutine: boolean,
  initialSportsDay: string,
) {
  const followParam = followsToParam(follows)
  const [state, dispatch] = useReducer(reducer, initialSportsDay, emptyState)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const sportsDay = state.sportsDay

  const loadFirstPage = useCallback(async () => {
    const [page, games] = await Promise.all([
      getTimeline({
        data: { sportsDay, follows: followParam, includeRoutine },
      }),
      getGames({ data: { sportsDay } }),
    ])
    dispatch({ type: 'items', items: page.items })
    dispatch({ type: 'games', games })
    return page.nextBefore
  }, [sportsDay, followParam, includeRoutine])

  useEffect(() => {
    let current = true
    dispatch({ type: 'reset', sportsDay })
    void loadFirstPage().then((cursor) => {
      if (current) setNextBefore(cursor)
    })
    return () => {
      current = false
    }
  }, [sportsDay, loadFirstPage])

  const query = new URLSearchParams({
    follows: followParam,
    ...(includeRoutine ? { routine: '1' } : {}),
  }).toString()
  const connection = useHubSocket(
    query,
    (events) => dispatch({ type: 'events', events }),
    () => void loadFirstPage(),
  )

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getTimeline({
        data: {
          sportsDay,
          follows: followParam,
          includeRoutine,
          before: nextBefore,
        },
      })
      dispatch({ type: 'items', items: page.items })
      setNextBefore(page.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }, [nextBefore, loadingMore, sportsDay, followParam, includeRoutine])

  return {
    items: orderedItems(state),
    games: orderedGames(state),
    connection,
    hasMore: nextBefore !== null,
    loadingMore,
    loadMore,
    /** Refetch the newest page (e.g. while a past day is being backfilled). */
    reload: loadFirstPage,
  }
}
