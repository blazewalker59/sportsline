import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/lib/model/timeline'
import { matchupWindow, pickGame } from '@/lib/fantasy/schedule'

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
  })

  it('is today and the next few days for daily scoring', () => {
    expect(matchupWindow('nba', '2026-10-04')).toEqual({
      from: '2026-10-04',
      to: '2026-10-08',
    })
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
