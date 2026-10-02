import { useEffect, useState } from 'react'

/** Scroll this far in one direction before the chrome hides or returns. */
const TRAVEL_PX = 28

/**
 * Whether secondary chrome should be tucked away: true after a deliberate
 * scroll down through content, false again after a deliberate scroll up or
 * near the top (the iOS toolbar behaviour). Requiring sustained travel in
 * one direction keeps small jitters from toggling it.
 */
export function useHideOnScroll(threshold = 120): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let travel = 0
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - last
        last = y
        if (y < threshold) {
          travel = 0
          setHidden(false)
          return
        }
        // Reset the run when direction flips, then require TRAVEL_PX of it.
        travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta
        if (travel > TRAVEL_PX) setHidden(true)
        else if (travel < -TRAVEL_PX) setHidden(false)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [threshold])
  return hidden
}
