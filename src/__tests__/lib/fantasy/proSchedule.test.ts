import { describe, expect, it } from 'vitest'
import type { WireProSchedule } from '@/lib/fantasy/proSchedule'
import { IN_PROGRESS_MS, nextGames } from '@/lib/fantasy/proSchedule'

const NOW = Date.parse('2026-10-31T16:00:00Z')
const HOUR = 60 * 60_000

const wire: WireProSchedule = {
  settings: {
    proTeams: [
      { id: 0, abbrev: 'FA' },
      {
        id: 12,
        abbrev: 'LAC',
        proGamesByScoringPeriod: {
          '1': [
            { date: NOW - 2 * 24 * HOUR, homeProTeamId: 12, awayProTeamId: 13 },
          ],
          '4': [
            { date: NOW + 30 * HOUR, homeProTeamId: 13, awayProTeamId: 12 },
          ],
          '3': [
            {
              date: NOW + 3 * HOUR,
              homeProTeamId: 12,
              awayProTeamId: 13,
              startTimeTBD: true,
            },
          ],
        },
      },
      {
        id: 13,
        abbrev: 'LAL',
        proGamesByScoringPeriod: {
          '2': [
            {
              date: NOW - IN_PROGRESS_MS + 1,
              homeProTeamId: 99,
              awayProTeamId: 13,
            },
          ],
        },
      },
      {
        id: 14,
        abbrev: 'OFF',
        proGamesByScoringPeriod: {
          '1': [
            {
              date: NOW - IN_PROGRESS_MS - 1,
              homeProTeamId: 14,
              awayProTeamId: 12,
            },
          ],
        },
      },
    ],
  },
}

describe('nextGames', () => {
  const next = nextGames(wire, NOW)

  it('finds each Team’s soonest Game from now, whatever its period', () => {
    expect(next.get(12)).toEqual({
      startsAt: NOW + 3 * HOUR,
      opponent: 'LAL',
      home: true,
      tbd: true,
    })
  })

  it('still counts a Game that may be on, and names a road opponent it can', () => {
    expect(next.get(13)).toEqual({
      startsAt: NOW - IN_PROGRESS_MS + 1,
      opponent: null,
      home: false,
      tbd: false,
    })
  })

  it('leaves out free agency and Teams with nothing left', () => {
    expect(next.has(0)).toBe(false)
    expect(next.has(14)).toBe(false)
  })
})
