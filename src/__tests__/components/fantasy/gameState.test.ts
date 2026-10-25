import { describe, expect, it } from 'vitest'
import type { LineupPlayer } from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'
import { gameState } from '@/components/fantasy/gameState'
import { storedSituation } from '@/lib/live/rows'

const game = (status: string, onCourt?: Array<string>): GameSummary =>
  ({
    id: 'gm_1',
    league: 'nba',
    sportsDay: '2026-10-24',
    status,
    startsAt: '2026-10-25T00:00:00Z',
    awayTeam: { id: 'tm_den', abbreviation: 'DEN', logoUrl: null },
    homeTeam: { id: 'tm_lal', abbreviation: 'LAL', logoUrl: null },
    score: { away: 50, home: 48 },
    situation:
      status === 'live'
        ? { segmentLabel: 'Q3 5:12', detail: onCourt ? { onCourt } : {} }
        : null,
  }) as GameSummary

const player = (playerId: string | null) =>
  ({ teamId: 'tm_den', teamAbbrev: 'DEN', playerId }) as LineupPlayer

describe('basketball on the court', () => {
  it('marks a Player among the five on the court', () => {
    const live = game('live', ['pl_jokic'])
    expect(gameState(player('pl_jokic'), [live], null)?.onField).toBe(true)
    expect(gameState(player('pl_bench'), [live], null)?.onField).toBe(false)
    expect(gameState(player(null), [live], null)?.onField).toBe(false)
  })

  it('marks no one once the Game is over', () => {
    expect(gameState(player('pl_jokic'), [game('final')], null)?.onField).toBe(
      false,
    )
  })

  it('stores who is on the court by our ids, dropping unknown ones', () => {
    const ids = new Map([['3112335', 'pl_jokic']])
    expect(
      storedSituation(
        { segmentLabel: 'Q3 5:12', detail: { onCourt: ['3112335', '999'] } },
        ids,
      ),
    ).toEqual({ segmentLabel: 'Q3 5:12', detail: { onCourt: ['pl_jokic'] } })
    const football = { segmentLabel: 'Q2', detail: { possession: 'KC' } }
    expect(storedSituation(football, ids)).toBe(football)
  })
})
