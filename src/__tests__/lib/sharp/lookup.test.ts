import { describe, expect, it } from 'vitest'
import type { GameRef } from '@/lib/sharp/sources'
import { gamesFor, leagueFrom, teamMatches } from '@/lib/sharp/lookup'

const team = (name: string, abbreviation: string) => ({
  id: name,
  name,
  abbreviation,
})
const avs = team('Colorado Avalanche', 'COL')
const leafs = team('Toronto Maple Leafs', 'TOR')
const game = (
  league: GameRef['league'],
  home: GameRef['home'],
  away: GameRef['away'],
): GameRef => ({
  gameId: `${home.abbreviation}-${away.abbreviation}`,
  league,
  startsAt: '2026-10-09T00:00:00Z',
  status: 'scheduled',
  home,
  away,
})

describe('finding the team an ask means', () => {
  it('knows a team by city, nickname, abbreviation and shorthand', () => {
    for (const ask of [
      'Avs',
      'avalanche',
      'Colorado',
      'COL',
      'the Avs',
      'Colorado Avalanche',
    ])
      expect(teamMatches(avs, ask)).toBe(true)
    expect(teamMatches(leafs, 'Leafs')).toBe(true)
    expect(teamMatches(leafs, 'maple leafs')).toBe(true)
    expect(teamMatches(team('Montréal Canadiens', 'MTL'), 'Habs')).toBe(true)
  })

  it("doesn't match on fragments", () => {
    expect(teamMatches(avs, 'Av')).toBe(false)
    expect(teamMatches(avs, 'lanche')).toBe(false)
    expect(teamMatches(leafs, 'Avs')).toBe(false)
  })

  it('reads a league from its name or sport', () => {
    expect(leagueFrom('NBA')).toBe('nba')
    expect(leagueFrom('hockey')).toBe('nhl')
    expect(leagueFrom('Avs')).toBeNull()
  })

  it('narrows games by team and league', () => {
    const games = [
      game('nhl', leafs, avs),
      game('nba', team('Denver Nuggets', 'DEN'), team('Boston Celtics', 'BOS')),
    ]
    expect(gamesFor(games, { team: 'Avs' })).toHaveLength(1)
    expect(gamesFor(games, { league: 'nba' })).toHaveLength(1)
    expect(gamesFor(games, {})).toHaveLength(2)
    expect(gamesFor(games, { team: 'Avs', league: 'nba' })).toHaveLength(0)
  })
})
