import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '@/lib/model/timeline'
import {
  followsFromParam,
  followsToParam,
  matchesFilter,
} from '@/lib/model/timeline'

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'i1',
    gameId: 'g1',
    league: 'mlb',
    sportsDay: '2026-10-01',
    kind: 'play',
    side: 'away',
    sequence: 1,
    occurredAt: '2026-10-01T23:00:00Z',
    segmentLabel: 'Top 1st',
    score: { away: 0, home: 0 },
    awayTeam: { id: 'tm_phi', abbreviation: 'PHI', logoUrl: null },
    homeTeam: { id: 'tm_atl', abbreviation: 'ATL', logoUrl: null },
    description: 'Groundout',
    playType: 'field_out',
    significance: 'routine',
    milestone: null,
    status: 'active',
    revisedAt: null,
    overturnOf: null,
    players: [{ id: 'pl_judge', name: 'Aaron Judge', role: 'batter' }],
    detail: null,
    ...overrides,
  }
}

describe('matchesFilter', () => {
  it('Team Follow covers every item in that Team’s Games, both sides', () => {
    const follows = [{ kind: 'team' as const, teamId: 'tm_atl' }]
    expect(matchesFilter(item(), { follows })).toBe(true)
    expect(
      matchesFilter(item({ kind: 'milestone', significance: null }), {
        follows,
      }),
    ).toBe(true)
    expect(
      matchesFilter(
        item({
          homeTeam: { id: 'tm_nyy', abbreviation: 'NYY', logoUrl: null },
        }),
        {
          follows,
        },
      ),
    ).toBe(false)
  })

  it('Player Follow covers only Plays naming that player', () => {
    const follows = [{ kind: 'player' as const, playerId: 'pl_judge' }]
    expect(matchesFilter(item(), { follows })).toBe(true)
    expect(matchesFilter(item({ players: [] }), { follows })).toBe(false)
    expect(matchesFilter(item({ kind: 'milestone' }), { follows })).toBe(false)
  })

  it('League Follow hides Routine Plays unless asked', () => {
    const follows = [{ kind: 'league' as const, league: 'mlb' as const }]
    expect(matchesFilter(item(), { follows })).toBe(false)
    expect(matchesFilter(item(), { follows, includeRoutine: true })).toBe(true)
    expect(matchesFilter(item({ significance: 'scoring' }), { follows })).toBe(
      true,
    )
    expect(
      matchesFilter(item({ kind: 'milestone', significance: null }), {
        follows,
      }),
    ).toBe(true)
    expect(
      matchesFilter(item({ league: 'nhl', significance: 'scoring' }), {
        follows,
      }),
    ).toBe(false)
  })

  it('is the union of Follows', () => {
    const follows = [
      { kind: 'league' as const, league: 'nhl' as const },
      { kind: 'player' as const, playerId: 'pl_judge' },
    ]
    expect(matchesFilter(item(), { follows })).toBe(true)
  })
})

describe('follows param', () => {
  it('round-trips and drops anything malformed', () => {
    const param = 'league:mlb,team:tm_abc,player:pl_def'
    expect(followsToParam(followsFromParam(param))).toBe(param)
    expect(followsFromParam('league:xfl,team:nope,player:,junk')).toEqual([])
  })
})

describe('Game filter', () => {
  it('covers every item in that Game regardless of Follows or Significance', () => {
    expect(matchesFilter(item(), { follows: [], gameId: 'g1' })).toBe(true)
    expect(
      matchesFilter(item({ gameId: 'g2' }), {
        follows: [{ kind: 'league', league: 'mlb' }],
        gameId: 'g1',
      }),
    ).toBe(false)
  })
})

describe('Top 25 coverage', () => {
  const ranked = item({
    league: 'cfb',
    significance: 'scoring',
    awayTeam: { id: 'tm_a', abbreviation: 'TEX', logoUrl: null, rank: 1 },
  })
  const unranked = item({ league: 'cfb', significance: 'scoring' })

  it('covers college games with a ranked team, Routine only when asked', () => {
    const filter = { follows: [{ kind: 'top25' as const }] }
    expect(matchesFilter(ranked, filter)).toBe(true)
    expect(matchesFilter(unranked, filter)).toBe(false)
    expect(matchesFilter({ ...ranked, significance: 'routine' }, filter)).toBe(
      false,
    )
    expect(
      matchesFilter(
        { ...ranked, significance: 'routine' },
        { ...filter, includeRoutine: true },
      ),
    ).toBe(true)
  })

  it('round-trips through the URL form', () => {
    expect(followsToParam([{ kind: 'top25' }])).toBe('top25:cfb')
    expect(followsFromParam('league:nfl,top25:cfb')).toEqual([
      { kind: 'league', league: 'nfl' },
      { kind: 'top25' },
    ])
  })
})
