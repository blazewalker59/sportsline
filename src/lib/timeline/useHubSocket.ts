/**
 * One connection to the LiveHub (docs/adr/0001, "Fan-out"), reconnecting with
 * backoff. `onReconnect` fires after every reconnect so the caller can refetch
 * the gap over HTTP; the Hub never replays.
 */

import { useEffect, useRef, useState } from 'react'
import type { TimelineEvent } from '@/lib/model/timeline'

export type Connection = 'connecting' | 'live' | 'offline'

const PING_MS = 25_000
const MAX_BACKOFF_MS = 30_000

export function useHubSocket(
  /** LiveHub query string: `follows`, `routine`, `game`. */
  query: string,
  onEvents: (events: Array<TimelineEvent>) => void,
  onReconnect: () => void,
): Connection {
  const [connection, setConnection] = useState<Connection>('connecting')
  const handlers = useRef({ onEvents, onReconnect })
  handlers.current = { onEvents, onReconnect }

  useEffect(() => {
    let socket: WebSocket | null = null
    let ping: ReturnType<typeof setInterval> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let closed = false

    const connect = () => {
      setConnection('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${proto}://${location.host}/live?${query}`)
      socket.onopen = () => {
        if (attempts > 0) handlers.current.onReconnect()
        attempts = 0
        setConnection('live')
        ping = setInterval(() => socket?.send('ping'), PING_MS)
      }
      socket.onmessage = (message) => {
        if (message.data === 'pong') return
        try {
          handlers.current.onEvents(
            JSON.parse(String(message.data)) as Array<TimelineEvent>,
          )
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
  }, [query])

  return connection
}
