import { useEffect, useState } from 'react'

/**
 * Whether secondary chrome should be tucked away: true while the Viewer
 * scrolls down through content, false again as soon as they scroll up or
 * are near the top (the iOS toolbar behaviour).
 */
export function useHideOnScroll(threshold = 120): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - last
        if (y < threshold) setHidden(false)
        else if (delta > 6) setHidden(true)
        else if (delta < -6) setHidden(false)
        last = y
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
