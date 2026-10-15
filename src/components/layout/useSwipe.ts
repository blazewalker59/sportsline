/**
 * A quick sideways swipe on an element, for moving between views. Touch
 * only, and out of the way of what already uses sideways movement: a
 * swipe never starts in something that scrolls sideways (strips of cards,
 * the Scope chips), in a sheet or dialog, on a form control or slider, or
 * at the screen's edge (where iOS swipes back).
 */

import { useEffect, useRef } from 'react'

/** At least this far sideways… */
const MIN_DISTANCE_PX = 70
/** …at least this many times further than up or down… */
const MIN_SLOPE = 2
/** …and no slower than this. */
const MAX_DURATION_MS = 700
/** iOS's own back gesture starts this close to the edge. */
const EDGE_PX = 20

/**
 * Which way a finished touch swiped: 'left' (finger moved left) or
 * 'right'; null for anything else (a scroll, a tap, a slow drag).
 */
export function swipeDirection(
  dx: number,
  dy: number,
  ms: number,
): 'left' | 'right' | null {
  if (ms > MAX_DURATION_MS) return null
  if (Math.abs(dx) < MIN_DISTANCE_PX) return null
  if (Math.abs(dx) < MIN_SLOPE * Math.abs(dy)) return null
  return dx < 0 ? 'left' : 'right'
}

/** Whether a touch starting on `target` is something else's to handle. */
function claimedElsewhere(target: EventTarget | null, root: Element): boolean {
  for (
    let el = target instanceof Element ? target : null;
    el && el !== root;
    el = el.parentElement
  ) {
    if (
      el.matches(
        '[role="dialog"], [data-no-swipe], input, textarea, select, [role="slider"]',
      )
    )
      return true
    if (el.scrollWidth > el.clientWidth + 1) {
      const { overflowX } = getComputedStyle(el)
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
  }
  return false
}

/** Call `onSwipe` when the element is swiped left or right. */
export function useSwipe(
  ref: React.RefObject<HTMLElement | null>,
  onSwipe: (direction: 'left' | 'right') => void,
): void {
  // The latest handler, without re-binding the listeners each render.
  const handler = useRef(onSwipe)
  handler.current = onSwipe
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let start: { x: number; y: number; at: number } | null = null
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start =
        e.touches.length === 1 &&
        t.clientX > EDGE_PX &&
        t.clientX < window.innerWidth - EDGE_PX &&
        !claimedElsewhere(e.target, root)
          ? { x: t.clientX, y: t.clientY, at: e.timeStamp }
          : null
    }
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (!start || !t) return
      const direction = swipeDirection(
        t.clientX - start.x,
        t.clientY - start.y,
        e.timeStamp - start.at,
      )
      start = null
      if (direction) handler.current(direction)
    }
    const onCancel = () => {
      start = null
    }
    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchend', onEnd, { passive: true })
    root.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', onCancel)
    }
  }, [ref])
}
