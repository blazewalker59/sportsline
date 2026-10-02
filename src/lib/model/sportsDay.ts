/**
 * The Sports Day (CONTEXT.md): the calendar day a Game belongs to for
 * display, rolling over at 6am Eastern so late West Coast Games count toward
 * the evening they started.
 */

const ROLLOVER_HOURS = 6

const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** YYYY-MM-DD Sports Day containing this instant. */
export function sportsDayOf(instant: Date): string {
  return easternDate.format(
    new Date(instant.getTime() - ROLLOVER_HOURS * 3_600_000),
  )
}

/** The Sports Day `days` before or after `sportsDay`. */
export function shiftSportsDay(sportsDay: string, days: number): string {
  const d = new Date(`${sportsDay}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
