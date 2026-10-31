import { describe, expect, it } from 'vitest'
import type { NextGame } from '@/lib/fantasy/proSchedule'
import {
  STALE_MS,
  matchupAge,
  nextGameLabel,
} from '@/components/fantasy/format'

const asOf = '2026-10-19T20:00:00.000Z'
const at = (ms: number) => Date.parse(asOf) + ms

describe('matchupAge', () => {
  it('reads fresh scores as fresh', () => {
    expect(matchupAge({ asOf }, at(20_000))).toEqual({
      label: 'now',
      stale: false,
    })
    expect(matchupAge({ asOf }, at(STALE_MS))).toEqual({
      label: '3m',
      stale: false,
    })
  })

  it('flags scores older than their slowest sync', () => {
    expect(matchupAge({ asOf }, at(STALE_MS + 1))).toEqual({
      label: '3m',
      stale: true,
    })
  })

  it('says nothing before a stamp or a client clock', () => {
    expect(matchupAge({}, at(0))).toBeNull()
    expect(matchupAge({ asOf }, null)).toBeNull()
  })
})

describe('nextGameLabel', () => {
  const tz = 'America/New_York'
  // Sat Oct 31, 2026, noon in New York.
  const now = Date.parse('2026-10-31T16:00:00Z')
  const game = (iso: string, extra: Partial<NextGame> = {}): NextGame => ({
    startsAt: Date.parse(iso),
    opponent: 'LAL',
    home: true,
    tbd: false,
    ...extra,
  })

  it('waits for the zone', () => {
    expect(nextGameLabel(game('2026-10-31T23:30:00Z'), null, now)).toBeNull()
  })

  it('reads a started Game as on now', () => {
    expect(
      nextGameLabel(game('2026-10-31T15:00:00Z', { home: false }), tz, now),
    ).toEqual({ when: 'Now', versus: '@ LAL', soon: 'now' })
  })

  it('names today and tomorrow, with the time unless it’s unset', () => {
    expect(nextGameLabel(game('2026-10-31T23:30:00Z'), tz, now)).toEqual({
      when: 'Today 7:30 PM',
      versus: 'vs LAL',
      soon: 'today',
    })
    expect(
      nextGameLabel(game('2026-11-01T17:00:00Z', { tbd: true }), tz, now)?.when,
    ).toBe('Tmrw')
  })

  it('names the weekday this week, else the date', () => {
    expect(nextGameLabel(game('2026-11-04T00:00:00Z'), tz, now)?.when).toBe(
      'Tue 7:00 PM',
    )
    expect(
      nextGameLabel(game('2026-11-12T00:00:00Z', { opponent: null }), tz, now),
    ).toEqual({ when: 'Nov 11', versus: '', soon: 'later' })
  })
})
