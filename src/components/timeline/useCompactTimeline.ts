import { useSyncExternalStore } from 'react'

/**
 * Where the navigation stops being the floating tab bar and becomes the
 * rail: Tailwind's `md` (48rem). Below it the Timeline is a phone's: what
 * the Scope covers is picked from the bar over the tab bar (ScopePager),
 * not from cards at the top. Keep this in step with the `md:` classes that
 * hide one or the other.
 */
export const RAIL = '(min-width: 48rem)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !('matchMedia' in window)) {
    return () => {}
  }
  const query = window.matchMedia(RAIL)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return false
  return !window.matchMedia(RAIL).matches
}

/**
 * Whether the phone-sized Timeline is showing: true below `md`, false from
 * it, and null on the server and through hydration, when the width isn't
 * known. Null renders both the cards and the bar and lets CSS hide the one
 * that doesn't apply (so the first paint is right at any width); after
 * hydration only the one that applies renders.
 */
export function useCompactTimeline(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribe,
    getSnapshot,
    () => null,
  )
}
