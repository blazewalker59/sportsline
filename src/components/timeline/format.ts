import { useEffect, useState, useSyncExternalStore } from 'react'

/** Re-render periodically so relative times stay fresh. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// One shared clock for every relative time on screen: a single interval
// while anything shows one, and only those text nodes re-render on a tick.
const CLOCK_MS = 30_000
let clockNow = Date.now()
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setInterval> | null = null

function subscribeClock(onTick: () => void): () => void {
  clockListeners.add(onTick)
  if (!clockTimer) {
    clockNow = Date.now()
    clockTimer = setInterval(() => {
      clockNow = Date.now()
      clockListeners.forEach((l) => l())
    }, CLOCK_MS)
  }
  return () => {
    clockListeners.delete(onTick)
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }
}

const readClock = () => clockNow

/**
 * "now", "4m", "2h" or a clock time, kept fresh by the shared clock. Its
 * own component, so a row showing one needn't re-render every tick.
 */
export function TimeAgo({ iso }: { iso: string }): string {
  const now = useSyncExternalStore(subscribeClock, readClock, readClock)
  return timeAgo(iso, now)
}

export function timeAgo(iso: string, now: number): string {
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
