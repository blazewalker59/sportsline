import { useEffect, useState } from 'react'
import { ensureSportsDay } from '@/lib/timeline/server'

/**
 * A past Sports Day that was never loaded is fetched on first open; its
 * finished Games then backfill in the background, so refetch a few times.
 */
export function usePastDay(
  sportsDay: string,
  isToday: boolean,
  reload: () => Promise<unknown>,
): 'idle' | 'loading' | 'done' {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  useEffect(() => {
    if (isToday) return
    let cancelled = false
    const timers: Array<ReturnType<typeof setTimeout>> = []
    void ensureSportsDay({ data: { sportsDay } }).then((r) => {
      if (cancelled || !r.loading) return
      setState('loading')
      for (const ms of [3_000, 8_000, 15_000, 30_000]) {
        timers.push(setTimeout(() => void reload(), ms))
      }
      timers.push(setTimeout(() => setState('done'), 30_000))
    })
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [sportsDay, isToday, reload])
  return state
}
