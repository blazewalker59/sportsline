/**
 * The Viewer's Timeline: loads the backlog over HTTP, then keeps it live from
 * the LiveHub socket. On every (re)connect the first page is refetched, which
 * fills any gap the socket missed (the Hub never replays).
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  applyEvents,
  emptyState,
  orderedGames,
  orderedItems,
  withGames,
  withItems,
} from './merge'
import { getGames, getTimeline } from './server'
import type { TimelineState } from './merge'
import type { Follow, TimelineEvent, TimelineItem } from '@/lib/model/timeline'
import { followsToParam } from '@/lib/model/timeline'

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

export type Connection = 'connecting' | 'live' | 'offline'

const PING_MS = 25_000
const MAX_BACKOFF_MS = 30_000

export function useLiveTimeline(
  follows: ReadonlyArray<Follow>,
  includeRoutine: boolean,
  initialSportsDay: string,
) {
  const followParam = followsToParam(follows)
  const [state, dispatch] = useReducer(reducer, initialSportsDay, emptyState)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const sportsDay = state.sportsDay
  const generation = useRef(0)

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
    const gen = ++generation.current
    dispatch({ type: 'reset', sportsDay })
    let socket: WebSocket | null = null
    let ping: ReturnType<typeof setInterval> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let closed = false

    void loadFirstPage().then((cursor) => {
      if (gen === generation.current) setNextBefore(cursor)
    })

    const connect = () => {
      setConnection('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const params = new URLSearchParams({ follows: followParam })
      if (includeRoutine) params.set('routine', '1')
      socket = new WebSocket(`${proto}://${location.host}/live?${params}`)
      socket.onopen = () => {
        if (attempts > 0) void loadFirstPage()
        attempts = 0
        setConnection('live')
        ping = setInterval(() => socket?.send('ping'), PING_MS)
      }
      socket.onmessage = (message) => {
        if (message.data === 'pong') return
        try {
          dispatch({
            type: 'events',
            events: JSON.parse(String(message.data)) as Array<TimelineEvent>,
          })
        } catch {
          // Ignore malformed frames.
        }
      }
      socket.onclose = () => {
        clearInterval(ping)
        if (closed) return
        setConnection('offline')
        attempts++
        retry = setTimeout(
          connect,
          Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts),
        )
      }
    }
    connect()

    return () => {
      closed = true
      clearInterval(ping)
      clearTimeout(retry)
      socket?.close()
    }
  }, [sportsDay, followParam, includeRoutine, loadFirstPage])

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
  }
}
