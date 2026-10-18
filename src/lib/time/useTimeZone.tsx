import { createContext, use, useEffect, useSyncExternalStore } from 'react'
import { runtimeTimeZone } from './format'

/** The cookie the browser leaves its time zone in, for the server. */
export const TZ_COOKIE = 'tz'

/**
 * The zone the server rendered in: the Viewer's from their `tz` cookie, or
 * null on a first visit (it can't know yet).
 */
const RenderedTimeZone = createContext<string | null>(null)

const subscribe = () => () => undefined

/**
 * Provides the zone the server rendered in, and leaves the browser's own in
 * the `tz` cookie so the next server render can use it.
 */
export function TimeZoneProvider({
  zone,
  children,
}: {
  zone: string | null
  children: React.ReactNode
}) {
  useEffect(() => rememberTimeZone(), [])
  return <RenderedTimeZone value={zone}>{children}</RenderedTimeZone>
}

/**
 * The Viewer's time zone, for the formatters in ./format. While server
 * rendering and hydrating it's the zone the server rendered in (null when
 * that wasn't known, so times stay blank and the HTML matches); after
 * that, and on client navigations, the browser's.
 */
export function useTimeZone(): string | null {
  const rendered = use(RenderedTimeZone)
  return useSyncExternalStore(subscribe, runtimeTimeZone, () => rendered)
}

function rememberTimeZone(): void {
  const zone = runtimeTimeZone()
  const current = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${TZ_COOKIE}=`))
  if (current === `${TZ_COOKIE}=${encodeURIComponent(zone)}`) return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
}
