/**
 * Today's Sports Day, rolling over at its 6am Eastern boundary while the
 * app stays open: checked each minute, and as soon as the tab comes back
 * into view (a backgrounded tab's timers barely run).
 */

import { useEffect, useState } from 'react'
import { sportsDayOf } from '@/lib/model/sportsDay'

const CHECK_MS = 60_000

export function useToday(): string {
  const [today, setToday] = useState(() => sportsDayOf(new Date()))
  useEffect(() => {
    // Unchanged days are the same string, so React skips the render.
    const check = () => setToday(sportsDayOf(new Date()))
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    const id = setInterval(check, CHECK_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', check)
    }
  }, [])
  return today
}
