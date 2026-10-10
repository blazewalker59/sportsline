import { describe, expect, it } from 'vitest'
import type { GameRef } from '@/lib/sharp/sources'
import { gamesFor, leagueFrom, slateOf, teamMatches } from '@/lib/sharp/lookup'

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
    expect(leagueFrom('football')).toBe('nfl')
    for (const ask of ['college football', 'football college', 'CFB', 'NCAAF'])
      expect(leagueFrom(ask)).toBe('cfb')
  })

  it("knows a college team by its school, mascot or fans' shorthand", () => {
    const bama = team('Alabama Crimson Tide', 'ALA')
    expect(teamMatches(bama, 'Bama')).toBe(true)
    expect(teamMatches(bama, 'Alabama')).toBe(true)
    expect(teamMatches(team('Ohio State Buckeyes', 'OSU'), 'Ohio State')).toBe(
      true,
    )
  })

  it('places a kickoff in its Eastern slate', () => {
    // October: Eastern is UTC−4.
    expect(slateOf('2026-10-10T14:00:00Z')).toBe('early')
    expect(slateOf('2026-10-10T16:00:00Z')).toBe('noon')
    expect(slateOf('2026-10-10T16:45:00Z')).toBe('noon')
    expect(slateOf('2026-10-10T19:30:00Z')).toBe('afternoon')
    expect(slateOf('2026-10-10T23:30:00Z')).toBe('evening')
    expect(slateOf('2026-10-11T02:30:00Z')).toBe('late')
    expect(slateOf('2026-10-11T04:15:00Z')).toBe('late')
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
    // Both kick off at 8pm Eastern.
    expect(gamesFor(games, { slate: 'evening' })).toHaveLength(2)
    expect(gamesFor(games, { slate: 'noon' })).toHaveLength(0)
  })
})
