import { useCallback } from 'react'
import { notifyDeviceValue, useDeviceValue } from './useDeviceValue'

/** Where storage refuses (private mode): remembered for this visit only. */
const memory = new Map<string, string | null>()

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * A string remembered on this device under `key` (a dismissed banner, a
 * chosen range), and its setter. Hydration-safe like useDeviceValue: the
 * first render sees `null`, the stored value straight after. Every reader
 * of the key, in this tab or another, follows a write.
 */
export function useStoredValue(
  key: string,
): [string | null, (value: string | null) => void] {
  const value = useDeviceValue(() => read(key), null)
  const set = useCallback(
    (next: string | null) => {
      try {
        if (next === null) localStorage.removeItem(key)
        else localStorage.setItem(key, next)
        memory.delete(key)
      } catch {
        memory.set(key, next)
      }
      notifyDeviceValue()
    },
    [key],
  )
  return [value, set]
}
