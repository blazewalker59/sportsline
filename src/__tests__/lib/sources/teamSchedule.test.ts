import { describe, expect, it } from 'vitest'
import { parseTeamSchedule } from '@/lib/sources/espn/common'
import { parseClubSchedule } from '@/lib/sources/nhl/parse'

describe('ESPN team schedules', () => {
  it('read object scores and the competition status', () => {
    const [game] = parseTeamSchedule(
      {
        events: [
          {
            id: '401872922',
            date: '2026-09-13T17:00Z',
            competitions: [
              {
                status: { type: { name: 'STATUS_FINAL', state: 'post' } },
                competitors: [
                  {
                    id: '30',
                    homeAway: 'home',
                    score: { value: 34, displayValue: '34' },
                    team: { id: '30', abbreviation: 'JAX' },
                  },
                  {
                    id: '5',
                    homeAway: 'away',
                    score: { value: 10, displayValue: '10' },
                    team: { id: '5', abbreviation: 'CLE' },
                  },
                ],
              },
            ],
          },
        ],
      },
      'nfl',
    )
    expect(game.status).toBe('final')
    expect(game.score).toEqual({ away: 10, home: 34 })
    expect(game.home.abbreviation).toBe('JAX')
  })
})

describe('NHL club schedules', () => {
  const team = (id: number, abbrev: string, score?: number) => ({
    id,
    abbrev,
    placeName: { default: abbrev },
    commonName: { default: 'Club' },
    score,
  })
  it('keep the regular season and playoffs, flagging overtime results', () => {
    const games = parseClubSchedule({
      games: [
        {
          id: 1,
          gameType: 1,
          gameDate: '2026-09-20',
          startTimeUTC: '2026-09-20T23:00:00Z',
          gameState: 'OFF',
          awayTeam: team(2, 'NYI', 3),
          homeTeam: team(10, 'TOR', 1),
        },
        {
          id: 2,
          gameType: 2,
          gameDate: '2026-10-08',
          startTimeUTC: '2026-10-08T23:00:00Z',
          gameState: 'OFF',
          awayTeam: team(2, 'NYI', 2),
          homeTeam: team(10, 'TOR', 3),
          gameOutcome: { lastPeriodType: 'SO' },
        },
      ],
    })
    expect(games.map((g) => g.sourceGameId)).toEqual(['2'])
    expect(games[0].overtime).toBe(true)
    expect(games[0].sportsDay).toBe('2026-10-08')
  })
})
