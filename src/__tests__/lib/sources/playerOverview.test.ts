import { describe, expect, it } from 'vitest'
import { espnAthleteOverview } from '@/lib/sources/espn/athlete'
import { parsePlayerOverview } from '@/lib/sources/mlb/parse'
import { parsePlayerLanding } from '@/lib/sources/nhl/parse'

describe('Player overviews', () => {
  it('reads a pitcher’s pitching line, newest game first (MLB)', () => {
    const o = parsePlayerOverview({
      people: [
        {
          primaryPosition: { abbreviation: 'P' },
          stats: [
            {
              type: { displayName: 'season' },
              group: { displayName: 'pitching' },
              splits: [{ stat: { wins: 12, losses: 5, era: '3.10' } }],
            },
            {
              type: { displayName: 'gameLog' },
              group: { displayName: 'pitching' },
              splits: [
                { date: '2026-09-01', opponent: { name: 'Old' } },
                {
                  date: '2026-09-07',
                  isWin: true,
                  opponent: { name: 'New York Mets' },
                  stat: { inningsPitched: '6.0', strikeOuts: 8, earnedRuns: 1 },
                },
              ],
            },
          ],
        },
      ],
    })
    expect(o?.season?.stats.slice(0, 3)).toEqual([
      { label: 'W', value: '12' },
      { label: 'L', value: '5' },
      { label: 'ERA', value: '3.10' },
    ])
    expect(o?.recent[0]).toMatchObject({
      opponent: 'New York Mets',
      result: 'W',
      line: '6.0 IP · 8 K · 1 ER',
    })
  })

  it('reads a skater’s season and last games (NHL)', () => {
    const o = parsePlayerLanding({
      position: 'C',
      featuredStats: {
        season: 20262027,
        regularSeason: { subSeason: { gamesPlayed: 3, goals: 2, points: 9 } },
      },
      last5Games: [
        {
          gameDate: '2026-10-03',
          opponentAbbrev: 'SEA',
          homeRoadFlag: 'H',
          goals: 1,
          assists: 1,
          shots: 4,
          toi: '20:00',
        },
      ],
    })
    expect(o.season?.title).toBe('2026-27 Season')
    expect(o.season?.stats.find((s) => s.label === 'G')?.value).toBe('2')
    expect(o.recent[0]).toMatchObject({ opponent: 'SEA', home: true })
  })

  it('groups ESPN’s mixed stat lines by category', async () => {
    const o = await espnAthleteOverview('football/nfl', '1', null, <T>() =>
      Promise.resolve({
        statistics: {
          displayName: '2026 Passing',
          categories: [
            { displayName: 'Passing', count: 2 },
            { displayName: 'Rushing', count: 1 },
          ],
          labels: ['CMP', 'YDS', 'YDS'],
          splits: [
            { displayName: 'Regular Season', stats: ['56', '786', '114'] },
          ],
        },
      } as T),
    )
    expect(o?.season).toEqual({
      title: '2026 Season',
      stats: [
        { label: 'CMP', value: '56', group: 'Passing' },
        { label: 'YDS', value: '786', group: 'Passing' },
        { label: 'YDS', value: '114', group: 'Rushing' },
      ],
    })
  })
})
