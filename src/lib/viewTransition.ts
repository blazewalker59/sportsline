import { flushSync } from 'react-dom'

/**
 * Run a state change as a View Transition (messages fade and glide instead
 * of jumping), the same way router navigations with `viewTransition` do.
 * Falls back to a plain update where unsupported.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === 'undefined' || !('startViewTransition' in document)) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
