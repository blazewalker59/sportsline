import { describe, expect, it } from 'vitest'
import {
  clockTime,
  dateLabel,
  dateTime,
  dayOf,
  formatDay,
  formatNumber,
  shiftDay,
  shortDate,
  shortDay,
  startOfDay,
  timeZoneOrNull,
  weekdayDay,
  weekdayTime,
  zonedParts,
} from '@/lib/time/format'

// 8:05 PM in UTC: 4:05 PM in New York, 1:05 PM in Los Angeles.
const PITCH = '2026-10-18T20:05:00Z'

describe('formatting an instant', () => {
  it('reads in the zone it is given, whatever the runtime’s', () => {
    expect(clockTime(PITCH, 'UTC')).toBe('8:05 PM')
    expect(clockTime(PITCH, 'America/New_York')).toBe('4:05 PM')
    expect(clockTime(PITCH, 'America/Los_Angeles')).toBe('1:05 PM')
    expect(weekdayTime(PITCH, 'Europe/Berlin')).toBe('Sun 10:05 PM')
    expect(dateTime(PITCH, 'America/New_York')).toBe('10/18/2026, 4:05:00 PM')
  })

  it('uses plain spaces, whichever ICU the runtime has', () => {
    expect(clockTime(PITCH, 'UTC')).not.toMatch(/[\u202f\u00a0]/)
  })

  it('is blank until the zone is known', () => {
    expect(clockTime(PITCH, null)).toBe('')
    expect(weekdayTime(Date.parse(PITCH), null)).toBe('')
  })

  it('crosses midnight with the zone', () => {
    const late = '2026-10-19T02:30:00Z'
    expect(dateLabel(late, 'UTC')).toBe('Mon, Oct 19')
    expect(dateLabel(late, 'America/Los_Angeles')).toBe('Sun, Oct 18')
    expect(shortDate(late, 'America/New_York')).toBe('Oct 18')
  })
})

describe('formatting a calendar day', () => {
  it('is the same day in every zone, and needs none', () => {
    expect(weekdayDay('2026-10-04')).toBe('Sun, Oct 4')
    expect(shortDay('2026-10-04')).toBe('Oct 4')
    expect(formatDay('2026-10-04', { weekday: 'long' })).toBe('Sunday')
    expect(shortDate('2026-10-04', null)).toBe('Oct 4')
    expect(dateLabel('2026-10-04', 'Pacific/Kiritimati')).toBe('Sun, Oct 4')
  })
})

describe('calendar math in a zone', () => {
  it('finds the day an instant falls on', () => {
    expect(dayOf('2026-10-19T02:30:00Z', 'UTC')).toBe('2026-10-19')
    expect(dayOf('2026-10-19T02:30:00Z', 'America/New_York')).toBe('2026-10-18')
    expect(dayOf('2026-10-18T22:30:00Z', 'Asia/Tokyo')).toBe('2026-10-19')
  })

  it('reads wall-clock fields on a 24-hour clock', () => {
    expect(zonedParts('2026-10-18T04:05:06Z', 'America/New_York')).toEqual({
      year: 2026,
      month: 10,
      day: 18,
      hour: 0,
      minute: 5,
      second: 6,
    })
  })

  it('finds a day’s midnight, either side of a DST change', () => {
    expect(startOfDay('2026-10-18', 'UTC').toISOString()).toBe(
      '2026-10-18T00:00:00.000Z',
    )
    // EDT, then EST from 1 November.
    expect(startOfDay('2026-10-18', 'America/New_York').toISOString()).toBe(
      '2026-10-18T04:00:00.000Z',
    )
    expect(startOfDay('2026-11-01', 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    )
    expect(startOfDay('2026-11-02', 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    )
    expect(startOfDay('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    )
    expect(startOfDay('2026-10-18', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-17T18:30:00.000Z',
    )
  })

  it('shifts days across months', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('time zones from outside', () => {
  it('takes real IANA zones and nothing else', () => {
    expect(timeZoneOrNull('America/New_York')).toBe('America/New_York')
    expect(timeZoneOrNull('UTC')).toBe('UTC')
    expect(timeZoneOrNull('Mars/Olympus_Mons')).toBeNull()
    expect(timeZoneOrNull('')).toBeNull()
    expect(timeZoneOrNull(undefined)).toBeNull()
    expect(timeZoneOrNull('x'.repeat(100))).toBeNull()
  })
})

describe('numbers', () => {
  it('group and point the same way everywhere', () => {
    expect(formatNumber(1234.5, { minimumFractionDigits: 2 })).toBe('1,234.50')
  })
})
