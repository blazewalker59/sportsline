import { useSyncExternalStore } from 'react'

/**
 * Where the Timeline shows a selected Game beside the feed instead of in
 * place of it: Tailwind's `lg` (1024px). Beside the 224px rail that leaves
 * two columns of about 370px, each as wide as a phone's feed. Keep this in
 * step with the `lg:` classes that lay the two panes out.
 */
export const WIDE_TIMELINE = '(min-width: 64rem)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !('matchMedia' in window)) {
    return () => {}
  }
  const query = window.matchMedia(WIDE_TIMELINE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return false
  return window.matchMedia(WIDE_TIMELINE).matches
}

/**
 * Whether the two-pane Timeline is showing. CSS places the panes (so the
 * server render and first paint are right at any width); this only says
 * which panes are worth rendering at all, and which feed names its
 * messages for View Transitions.
 *
 * The server, and hydration, answer "wide": both panes render and CSS
 * hides the one a phone doesn't show. After hydration a phone drops the
 * hidden pane, which changes nothing on screen.
 */
export function useWideTimeline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
