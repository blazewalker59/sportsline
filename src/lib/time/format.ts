/**
 * Every date, time and number the app shows, formatted here and nowhere
 * else (eslint enforces it). The Worker renders in UTC with its own
 * default locale and the browser in the Viewer's, so anything left to the
 * runtime's defaults renders one way on the server and another on the
 * client, and hydration fails. Here every format names its time zone and
 * the one locale. Pure.
 */

/** The app's copy is English; its dates and numbers read the same way. */
export const LOCALE = 'en-US'

type Instant = string | number | Date

const formats = new Map<string, Intl.DateTimeFormat>()

function format(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`
  let f = formats.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone })
    formats.set(key, f)
  }
  return f
}

// Newer ICU puts a narrow no-break space before "PM"; engines that patch
// it back to a plain space would otherwise disagree with the server.
const tidy = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ')

/** A valid IANA zone as this runtime names it, else null. */
export function timeZoneOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '' || raw.length > 64) return null
  try {
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: raw,
    }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

let runtimeZone: string | null = null

/** The zone this runtime is in: the Viewer's, in a browser. */
export function runtimeTimeZone(): string {
  return (runtimeZone ??=
    timeZoneOrNull(new Intl.DateTimeFormat().resolvedOptions().timeZone) ??
    'UTC')
}

/**
 * An instant in `timeZone`; blank while the zone isn't known yet (see
 * useTimeZone), so the server and the hydrating client agree.
 */
export function formatInstant(
  value: Instant,
  timeZone: string | null,
  options: Intl.DateTimeFormatOptions,
): string {
  if (timeZone === null) return ''
  return tidy(format(timeZone, options).format(new Date(value)))
}

/** "7:42 PM". */
export const clockTime = (value: Instant, timeZone: string | null) =>
  formatInstant(value, timeZone, { hour: 'numeric', minute: '2-digit' })

/** "Sun 4:25 PM". */
export const weekdayTime = (value: Instant, timeZone: string | null) =>
  formatInstant(value, timeZone, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

/** "10/4/2026, 7:42:05 PM". */
export const dateTime = (value: Instant, timeZone: string | null) =>
  formatInstant(value, timeZone, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Is this a calendar day ("2026-10-04") rather than an instant? */
export const isDay = (value: Instant): value is string =>
  typeof value === 'string' && DAY.test(value)

/**
 * A calendar day ("2026-10-04"), which is the same day in every zone: noon
 * UTC formatted in UTC.
 */
export function formatDay(
  day: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return tidy(format('UTC', options).format(new Date(`${day}T12:00:00Z`)))
}

/**
 * A calendar day or an instant, by `options`: a day needs no zone, an
 * instant is blank until there is one.
 */
export function formatDate(
  value: Instant,
  timeZone: string | null,
  options: Intl.DateTimeFormatOptions,
): string {
  return isDay(value)
    ? formatDay(value, options)
    : formatInstant(value, timeZone, options)
}

/** "Sun, Oct 4", from a calendar day or an instant. */
export const dateLabel = (value: Instant, timeZone: string | null) =>
  formatDate(value, timeZone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

/** "Sun, Oct 4", a calendar day. */
export const weekdayDay = (day: string) =>
  formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' })

/** "Oct 4", a calendar day. */
export const shortDay = (day: string) =>
  formatDay(day, { month: 'short', day: 'numeric' })

/** "Oct 4", from a calendar day or an instant. */
export const shortDate = (value: Instant, timeZone: string | null) =>
  formatDate(value, timeZone, { month: 'short', day: 'numeric' })

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** An instant's wall-clock fields in `timeZone` (hour 0–23). */
export function zonedParts(value: Instant, timeZone: string): ZonedParts {
  const parts = format(timeZone, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The calendar day ("2026-10-04") an instant falls on in `timeZone`. */
export function dayOf(value: Instant, timeZone: string): string {
  const p = zonedParts(value, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** The calendar day `days` before or after `day`. */
export function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** How far `timeZone`'s wall clock runs ahead of UTC at an instant, in ms. */
function offsetAt(t: number, timeZone: string): number {
  const p = zonedParts(t, timeZone)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wall - Math.floor(t / 1000) * 1000
}

/** The instant `day` starts (its midnight) in `timeZone`. */
export function startOfDay(day: string, timeZone: string): Date {
  const midnight = Date.parse(`${day}T00:00:00Z`)
  // The offset at a first guess, then at the answer, in case a DST change
  // falls between them.
  const guess = midnight - offsetAt(midnight, timeZone)
  return new Date(midnight - offsetAt(guess, timeZone))
}

/** A number in the app's locale: "1,234.50". */
export function formatNumber(
  n: number,
  options?: Intl.NumberFormatOptions,
): string {
  return n.toLocaleString(LOCALE, options)
}
