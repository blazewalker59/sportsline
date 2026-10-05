import { useSyncExternalStore } from 'react'

/** Storage changes in another tab of the app. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

/**
 * A value only the device knows (something remembered in storage, the
 * address's hash). The server can't know it, so the first render (and
 * hydration) uses `fallback` and the device's value follows straight
 * after, never a mismatch. `read` must return a primitive and never throw.
 */
export function useDeviceValue<
  T extends string | number | boolean | null | undefined,
>(read: () => T, fallback: T): T {
  return useSyncExternalStore(subscribe, read, () => fallback)
}
