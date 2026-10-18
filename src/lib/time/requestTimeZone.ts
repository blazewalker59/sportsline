import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { runtimeTimeZone, timeZoneOrNull } from './format'
import { TZ_COOKIE } from './useTimeZone'

/**
 * The Viewer's time zone for this render: on the server, the one their
 * browser left in the `tz` cookie (null on a first visit, or if it isn't a
 * real zone); in the browser, its own.
 */
export const requestTimeZone = createIsomorphicFn()
  .server((): string | null => timeZoneOrNull(getCookie(TZ_COOKIE)))
  .client((): string | null => runtimeTimeZone())
