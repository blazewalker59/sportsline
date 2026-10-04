import { describe, expect, it } from 'vitest'
import { discoverLeagues, leagueFromUrl } from '@/lib/fantasy/discovery'

describe('discovering Fantasy leagues', () => {
  it('reads preference entries (league, team, sport by game id)', () => {
    const leagues = discoverLeagues({
      preferences: [
        {
          metaData: {
            entry: {
              entryId: 4,
              entryLocation: 'Team',
              entryNickname: 'Blaze',
              gameId: 1,
              seasonId: 2026,
              groups: [{ groupId: 123456, groupName: 'Sunday Funday' }],
            },
          },
        },
        {
          metaData: {
            entry: {
              entryId: 2,
              gameId: 3,
              seasonId: 2027,
              groups: [{ groupId: 777, groupName: 'Hoops' }],
            },
          },
        },
        { metaData: { team: { id: 8 } } },
      ],
    })
    expect(leagues).toEqual([
      {
        sport: 'football',
        leagueId: '123456',
        season: 2026,
        teamId: 4,
        name: 'Sunday Funday',
        teamName: 'Team Blaze',
      },
      {
        sport: 'basketball',
        leagueId: '777',
        season: 2027,
        teamId: 2,
        name: 'Hoops',
        teamName: null,
      },
    ])
  })

  it('reads flat league rows grouped by sport', () => {
    expect(
      discoverLeagues({
        preferences: {
          fantasyBasketball: [
            { leagueId: '123456', leagueName: 'Dynasty', seasonId: 2025 },
          ],
        },
      }),
    ).toEqual([
      {
        sport: 'basketball',
        leagueId: '123456',
        season: 2025,
        teamId: null,
        name: 'Dynasty',
        teamName: null,
      },
    ])
  })

  it('reads a pasted league URL', () => {
    expect(
      leagueFromUrl(
        'https://fantasy.espn.com/football/league?leagueId=24680&seasonId=2026',
      ),
    ).toEqual({ sport: 'football', leagueId: '24680', teamId: null })
    expect(
      leagueFromUrl(
        'https://fantasy.espn.com/basketball/team?leagueId=99&teamId=3',
      ),
    ).toEqual({ sport: 'basketball', leagueId: '99', teamId: 3 })
    expect(leagueFromUrl('https://espn.com')).toBeNull()
  })
})
