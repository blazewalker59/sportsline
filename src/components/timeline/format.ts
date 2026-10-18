import { useSyncExternalStore } from 'react'

// Shared clocks, one per tick interval: a single timer per interval while
// anything reads it, and only the components reading it re-render.
const CLOCK_MS = 30_000

interface Clock {
  now: number
  listeners: Set<() => void>
  timer: ReturnType<typeof setInterval> | null
  subscribe: (onTick: () => void) => () => void
  read: () => number
}

const clocks = new Map<number, Clock>()

function clockFor(intervalMs: number): Clock {
  const existing = clocks.get(intervalMs)
  if (existing) return existing
  const clock: Clock = {
    now: Date.now(),
    listeners: new Set(),
    timer: null,
    subscribe: (onTick) => {
      clock.listeners.add(onTick)
      if (!clock.timer) {
        clock.now = Date.now()
        clock.timer = setInterval(() => {
          clock.now = Date.now()
          clock.listeners.forEach((l) => l())
        }, intervalMs)
      }
      return () => {
        clock.listeners.delete(onTick)
        if (clock.listeners.size === 0 && clock.timer) {
          clearInterval(clock.timer)
          clock.timer = null
        }
      }
    },
    read: () => clock.now,
  }
  clocks.set(intervalMs, clock)
  return clock
}

// The server and the hydrating client never agree on "now", so neither
// shows a time relative to it until the client has taken over.
const hydrating = () => null

/**
 * "now", ticking every `intervalMs`; null while server rendering and
 * hydrating, so the HTML matches. Client navigations get a time at once.
 */
export function useNow(intervalMs = CLOCK_MS): number | null {
  const clock = clockFor(intervalMs)
  return useSyncExternalStore(clock.subscribe, clock.read, hydrating)
}

/**
 * "now", "4m", "2h" or a clock time, kept fresh by the shared clock. Its
 * own component, so a row showing one needn't re-render every tick.
 */
export function TimeAgo({ iso }: { iso: string }): string {
  return timeAgo(iso, useNow())
}

/** Blank until there's a client clock (useNow). */
export function timeAgo(iso: string, now: number | null): string {
  if (now === null) return ''
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (seconds < 45) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  // Past about half a day, "117h" means nothing: show the clock time.
  if (hours < 12) return `${hours}h`
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function startTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}
