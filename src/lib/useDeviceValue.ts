import { useSyncExternalStore } from 'react'

/** This tab changed something a device value reads. */
const CHANGED = 'sportsline:device-value'

/**
 * Tell this tab's useDeviceValue readers to read again, after writing what
 * they read (`storage` events only reach other tabs).
 */
export function notifyDeviceValue(): void {
  window.dispatchEvent(new Event(CHANGED))
}

/** Storage changes in another tab of the app, or a write in this one. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGED, onChange)
  }
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
