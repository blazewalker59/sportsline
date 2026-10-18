/**
 * One connection to the LiveHub (docs/adr/0001, "Fan-out"), reconnecting with
 * jittered backoff, and straight away when the device comes back online or
 * the tab comes back into view. `onReconnect` fires after every reconnect so
 * the caller can refetch the gap over HTTP; the Hub never replays.
 */

import { useEffect, useRef, useState } from 'react'
import type { TimelineEvent } from '@/lib/model/timeline'

export type Connection = 'connecting' | 'live' | 'offline'

const PING_MS = 25_000
const MAX_BACKOFF_MS = 30_000

/**
 * The wait before reconnect attempt `attempts`: doubling to a cap, then
 * somewhere in its upper half, so a deploy's dropped sockets don't all
 * come back in the same instant.
 */
export function backoffMs(attempts: number, random = Math.random()): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts)
  return Math.round(ceiling / 2 + (random * ceiling) / 2)
}

export function useHubSocket(
  /** LiveHub query string: `follows`, `routine`, `game`; null = no socket. */
  query: string | null,
  onEvents: (events: Array<TimelineEvent>) => void,
  onReconnect: () => void,
): Connection {
  const [connection, setConnection] = useState<Connection>('connecting')
  const handlers = useRef({ onEvents, onReconnect })
  handlers.current = { onEvents, onReconnect }

  useEffect(() => {
    if (query === null) return
    let socket: WebSocket | null = null
    let ping: ReturnType<typeof setInterval> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    // A connection was lost (or never made): the next open has a gap to fill.
    let missed = false
    let closed = false

    const connect = () => {
      retry = undefined
      setConnection('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const current = new WebSocket(`${proto}://${location.host}/live?${query}`)
      socket = current
      current.onopen = () => {
        if (missed) handlers.current.onReconnect()
        missed = false
        attempts = 0
        setConnection('live')
        ping = setInterval(() => current.send('ping'), PING_MS)
      }
      current.onmessage = (message) => {
        if (message.data === 'pong') return
        try {
          handlers.current.onEvents(
            JSON.parse(String(message.data)) as Array<TimelineEvent>,
          )
        } catch {
          // Ignore malformed frames.
        }
      }
      current.onclose = () => {
        clearInterval(ping)
        if (closed || socket !== current) return
        setConnection('offline')
        missed = true
        attempts++
        retry = setTimeout(connect, backoffMs(attempts))
      }
    }

    // Back online, or back in view: skip whatever's left of the backoff.
    const reconnectNow = () => {
      if (closed || retry === undefined) return
      clearTimeout(retry)
      attempts = 0
      connect()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reconnectNow()
    }
    window.addEventListener('online', reconnectNow)
    document.addEventListener('visibilitychange', onVisibility)
    connect()

    return () => {
      closed = true
      window.removeEventListener('online', reconnectNow)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(ping)
      clearTimeout(retry)
      socket?.close()
    }
  }, [query])

  return connection
}
