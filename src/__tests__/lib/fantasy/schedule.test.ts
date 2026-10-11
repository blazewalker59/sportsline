import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/lib/model/timeline'
import {
  countsInMatchupWindow,
  matchupWindow,
  pickGame,
  sourceDays,
} from '@/lib/fantasy/schedule'

describe('a Matchup’s window', () => {
  it('is the NFL week, Tuesday to Monday, for football', () => {
    // Sunday 4 October 2026: Thursday's Final and Monday night are in it.
    expect(matchupWindow('nfl', '2026-10-04')).toEqual({
      from: '2026-09-29',
      to: '2026-10-05',
    })
    // Tuesday starts the next week.
    expect(matchupWindow('nfl', '2026-10-06').from).toBe('2026-10-06')
    expect(matchupWindow('nfl', '2026-10-05').from).toBe('2026-09-29')
    // Sunday 11 October 2026, the week in progress: through Monday the 12th.
    expect(matchupWindow('nfl', '2026-10-11')).toEqual({
      from: '2026-10-06',
      to: '2026-10-12',
    })
  })

  it('is today and the next few days for daily scoring', () => {
    expect(matchupWindow('nba', '2026-10-04')).toEqual({
      from: '2026-10-04',
      to: '2026-10-08',
    })
  })
})

describe('Monday night in the football window', () => {
  // Week of Sunday 11 October 2026. Bills at Rams kicks off 8:15pm Eastern
  // Monday, which is 00:15 UTC Tuesday.
  const week = { from: '2026-10-06', to: '2026-10-12' }

  it('counts a Monday night kickoff stored on its UTC date', () => {
    expect(
      countsInMatchupWindow(
        { sportsDay: '2026-10-13', startsAt: '2026-10-13T00:15:00Z' },
        week,
      ),
    ).toBe(true)
    expect(
      countsInMatchupWindow(
        { sportsDay: '2026-10-12', startsAt: '2026-10-13T00:15:00Z' },
        week,
      ),
    ).toBe(true)
  })

  it('counts Thursday and Saturday, and not next Thursday', () => {
    expect(
      countsInMatchupWindow(
        { sportsDay: '2026-10-08', startsAt: '2026-10-09T00:15:00Z' },
        week,
      ),
    ).toBe(true)
    expect(
      countsInMatchupWindow(
        { sportsDay: '2026-10-10', startsAt: '2026-10-10T17:00:00Z' },
        week,
      ),
    ).toBe(true)
    expect(
      countsInMatchupWindow(
        { sportsDay: '2026-10-15', startsAt: '2026-10-16T00:15:00Z' },
        week,
      ),
    ).toBe(false)
  })

  it('rejects a Tuesday afternoon game on the extra calendar day', () => {
    expect(
      countsInMatchupWindow(
        { sportsDay: '2026-10-13', startsAt: '2026-10-13T20:00:00Z' },
        week,
      ),
    ).toBe(false)
  })

  it('reads the whole week from the Source, plus the UTC date after Monday', () => {
    const days = sourceDays(week)
    expect(days[0]).toBe('2026-10-06')
    expect(days).toContain('2026-10-08')
    expect(days).toContain('2026-10-10')
    expect(days).toContain('2026-10-12')
    expect(days.at(-1)).toBe('2026-10-13')
  })
})

describe('picking a Team’s Game', () => {
  const game = (id: string, status: string, startsAt: string) =>
    ({ id, status, startsAt }) as GameSummary

  it('prefers one live now, else the earliest', () => {
    expect(
      pickGame([
        game('thu', 'final', '2026-10-01T00:15:00Z'),
        game('sun', 'live', '2026-10-04T17:00:00Z'),
      ])?.id,
    ).toBe('sun')
    expect(
      pickGame([
        game('mon', 'scheduled', '2026-10-06T00:15:00Z'),
        game('thu', 'final', '2026-10-01T00:15:00Z'),
      ])?.id,
    ).toBe('thu')
    expect(pickGame([])).toBeUndefined()
  })
})
