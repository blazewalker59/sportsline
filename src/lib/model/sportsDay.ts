/**
 * The Sports Day (CONTEXT.md): the calendar day a Game belongs to for
 * display, rolling over at 6am Eastern so late West Coast Games count toward
 * the evening they started.
 */

import { dayOf, shiftDay } from '@/lib/time/format'

const ROLLOVER_HOURS = 6

/** YYYY-MM-DD Sports Day containing this instant. */
export function sportsDayOf(instant: Date): string {
  return dayOf(
    instant.getTime() - ROLLOVER_HOURS * 3_600_000,
    'America/New_York',
  )
}

/** The Sports Day `days` before or after `sportsDay`. */
export const shiftSportsDay = shiftDay
