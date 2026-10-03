import { describe, expect, it } from 'vitest'
import {
  moveLeague,
  normalizeLeagueSettings,
  visibleLeagues,
} from '@/lib/model/leagues'
import { scopeFollows } from '@/lib/model/scope'

describe('normalizeLeagueSettings', () => {
  it('keeps the stored order, appends new Leagues, drops unknowns', () => {
    expect(
      normalizeLeagueSettings({
        order: ['nhl', 'nfl', 'xfl', 'nhl'],
        hidden: ['mlb', 'xfl'],
      }),
    ).toEqual({ order: ['nhl', 'nfl', 'mlb', 'nba', 'cfb'], hidden: ['mlb'] })
  })

  it('defaults to every League in the standard order', () => {
    expect(normalizeLeagueSettings(null)).toEqual({
      order: ['mlb', 'nba', 'nfl', 'cfb', 'nhl'],
      hidden: [],
    })
  })
})

describe('arranging Leagues', () => {
  it('moves one League, clamped to the ends', () => {
    const order = ['mlb', 'nba', 'nfl', 'cfb', 'nhl'] as const
    expect(moveLeague(order, 'nhl', 0)).toEqual([
      'nhl',
      'mlb',
      'nba',
      'nfl',
      'cfb',
    ])
    expect(moveLeague(order, 'mlb', 99)).toEqual([
      'nba',
      'nfl',
      'cfb',
      'nhl',
      'mlb',
    ])
  })

  it('shows Leagues in order without the hidden ones, and All follows them', () => {
    const settings = normalizeLeagueSettings({
      order: ['nfl', 'cfb', 'nba', 'mlb', 'nhl'],
      hidden: ['mlb', 'nhl'],
    })
    const leagues = visibleLeagues(settings)
    expect(leagues).toEqual(['nfl', 'cfb', 'nba'])
    expect(scopeFollows('all', [], leagues)).toEqual([
      { kind: 'league', league: 'nfl' },
      { kind: 'league', league: 'cfb' },
      { kind: 'league', league: 'nba' },
    ])
  })
})
