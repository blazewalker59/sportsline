import { describe, expect, it } from 'vitest'
import {
  findGame,
  kalshiTeamKey,
  leagueOf,
  normalizePlayerName,
  teamMatches,
} from '@/lib/kalshi/match'

describe('matching Kalshi to our data', () => {
  it('maps Kalshi league names to ours', () => {
    expect(leagueOf('NFL')).toBe('nfl')
    expect(leagueOf('NCAAFB')).toBe('cfb')
    expect(leagueOf('CFL')).toBeNull()
  })

  it('matches teams on location or nickname, not abbreviation', () => {
    const was = kalshiTeamKey('Washington', 'WAS Commanders')
    expect(teamMatches(was, 'Washington Commanders')).toBe(true)
    expect(teamMatches(was, 'Washington Nationals')).toBe(true)
    expect(
      teamMatches(kalshiTeamKey('Memphis', 'MEM Tigers'), 'Memphis Tigers'),
    ).toBe(true)
    expect(teamMatches(was, 'Indianapolis Colts')).toBe(false)
    // Parentheticals and abbreviated schools.
    expect(
      teamMatches(
        kalshiTeamKey('Miami (FL)', 'Miami (FL) Hurricanes'),
        'Miami Hurricanes',
      ),
    ).toBe(true)
    expect(
      teamMatches(
        kalshiTeamKey('Arizona St.', 'Arizona State Sun Devils'),
        'Arizona State Sun Devils',
      ),
    ).toBe(true)
    expect(
      teamMatches(
        kalshiTeamKey('Texas A&M', 'Texas A&M Aggies'),
        'Texas A&M Aggies',
      ),
    ).toBe(true)
  })

  it('finds the Game with both teams, nearest the start', () => {
    const games = [
      {
        id: 'g1',
        startsAt: '2026-10-04T17:00:00Z',
        homeName: 'Washington Commanders',
        awayName: 'Indianapolis Colts',
      },
      {
        id: 'g2',
        startsAt: '2026-10-04T17:00:00Z',
        homeName: 'Cleveland Browns',
        awayName: 'Pittsburgh Steelers',
      },
    ]
    expect(
      findGame(games, {
        homeKey: kalshiTeamKey('Washington', 'WAS Commanders'),
        awayKey: kalshiTeamKey('Indianapolis', 'IND Colts'),
        startsAt: '2026-10-04T13:30:00Z',
      }),
    ).toBe('g1')
    expect(
      findGame(games, {
        homeKey: kalshiTeamKey('Dallas', 'DAL Cowboys'),
        awayKey: kalshiTeamKey('Indianapolis', 'IND Colts'),
        startsAt: null,
      }),
    ).toBeNull()
  })

  it('compares player names without suffixes or accents', () => {
    expect(normalizePlayerName('Marvin Harrison Jr.')).toBe('marvin harrison')
    expect(normalizePlayerName('José Ramírez')).toBe('jose ramirez')
  })
})

describe('isReadOnly', () => {
  it('accepts only keys whose every scope reads', async () => {
    const { isReadOnly } = await import('@/lib/kalshi/scopes')
    expect(isReadOnly(['read'])).toBe(true)
    expect(isReadOnly(['read', 'read::portfolio_balance'])).toBe(true)
    expect(isReadOnly(['read', 'write'])).toBe(false)
    expect(isReadOnly(['write::trade'])).toBe(false)
    // No scopes listed: full access.
    expect(isReadOnly([])).toBe(false)
    expect(isReadOnly(undefined)).toBe(false)
  })
})
