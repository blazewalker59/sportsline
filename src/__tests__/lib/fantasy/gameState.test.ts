import { describe, expect, it } from 'vitest'
import type { LineupPlayer } from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'
import { gameState } from '@/components/fantasy/gameState'

/**
 * Sleeper stores ESPN's pro team id, and the card still knows the
 * abbreviation when that id has not been mapped to our Team yet.
 * Buffalo at the Rams, Monday 12 October 2026, 8:15pm Eastern.
 */
function allen(over: Partial<LineupPlayer> = {}): LineupPlayer {
  return {
    espnId: 4984,
    name: 'Josh Allen',
    slot: 'QB',
    slotId: 0,
    positionId: 1,
    starter: true,
    points: null,
    projected: 22,
    proTeamId: 2,
    injury: null,
    breakdown: [],
    teamId: null,
    teamAbbrev: 'BUF',
    ...over,
  }
}

function billsAtRams(): GameSummary {
  return {
    id: 'src:401772810',
    league: 'nfl',
    sportsDay: '2026-10-12',
    status: 'scheduled',
    startsAt: '2026-10-13T00:15:00Z',
    awayTeam: {
      id: 'src:2',
      abbreviation: 'BUF',
      logoUrl: null,
      name: 'Buffalo Bills',
    },
    homeTeam: {
      id: 'src:14',
      abbreviation: 'LAR',
      logoUrl: null,
      name: 'Los Angeles Rams',
    },
    score: { away: 0, home: 0 },
    situation: null,
  }
}

describe('a Sleeper player card’s Monday night game', () => {
  it('matches Buffalo by abbreviation when the team id did not resolve', () => {
    const state = gameState(allen(), [billsAtRams()], 'America/New_York')
    expect(state?.game.id).toBe('src:401772810')
    expect(state?.home).toBe(false)
    expect(state?.upcoming).toBe(true)
    expect(state?.status).toBe('Mon 8:15 PM')
  })

  it('tells the start in the Viewer’s zone, blank until it is known', () => {
    const at = (zone: string | null) =>
      gameState(allen(), [billsAtRams()], zone)?.status
    expect(at('America/Los_Angeles')).toBe('Mon 5:15 PM')
    expect(at('UTC')).toBe('Tue 12:15 AM')
    expect(at(null)).toBe('')
  })

  it('still matches by team id, including the home side', () => {
    const game = billsAtRams()
    game.homeTeam = { ...game.homeTeam, id: 'tm_lar' }
    const state = gameState(
      allen({ teamId: 'tm_lar', teamAbbrev: 'LAR', name: 'Davante Adams' }),
      [game],
      'America/New_York',
    )
    expect(state?.game.id).toBe('src:401772810')
    expect(state?.home).toBe(true)
  })
})
