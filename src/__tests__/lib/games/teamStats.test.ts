import { describe, expect, it } from 'vitest'
import type { GameBox } from '@/lib/model/types'
import {
  FOOTBALL_TEAM_STATS,
  espnTeamStats,
  tableTeamStats,
  teamStatLeader,
  teamStatLean,
  teamStatValue,
} from '@/lib/games/teamStats'

describe('teamStatValue', () => {
  it('reads a total the way it compares', () => {
    expect(teamStatValue('463', undefined)).toBe(463)
    expect(teamStatValue('5.5', undefined)).toBe(5.5)
    expect(teamStatValue('9-18', 'rate')).toBe(0.5)
    expect(teamStatValue('0-0', 'rate')).toBeNull()
    expect(teamStatValue('8-78', 'first')).toBe(8)
    expect(teamStatValue('31:20', 'clock')).toBe(1880)
    expect(teamStatValue('—', undefined)).toBeNull()
  })
})

describe('teamStatLeader and teamStatLean', () => {
  it('leans toward more, or fewer where fewer is better', () => {
    const yards = { label: 'Total yards', away: '463', home: '244' }
    expect(teamStatLeader(yards)).toBe('away')
    expect(teamStatLean(yards)).toBeGreaterThan(0)
    const turnovers = { label: 'Turnovers', away: '3', home: '1', lower: true }
    expect(teamStatLeader(turnovers)).toBe('home')
    expect(teamStatLean(turnovers)).toBeLessThan(0)
    expect(teamStatLean({ label: 'x', away: '7', home: '7' })).toBe(0)
  })

  it('compares made of attempted as a rate, not by attempts', () => {
    const third = {
      label: '3rd down',
      away: '9-18',
      home: '5-8',
      compare: 'rate' as const,
    }
    expect(teamStatLeader(third)).toBe('home')
  })
})

describe('espnTeamStats', () => {
  it('keeps the picked totals both teams have, in order, with our labels', () => {
    const team = (id: string, values: Record<string, string>) => ({
      team: { id },
      statistics: Object.entries(values).map(([name, displayValue]) => ({
        name,
        displayValue,
      })),
    })
    const stats = espnTeamStats(
      [
        team('9', {
          possessionTime: '19:20',
          totalYards: '244',
          turnovers: '3',
        }),
        team('12', {
          totalYards: '463',
          turnovers: '1',
          possessionTime: '40:40',
        }),
      ],
      '9',
      '12',
      FOOTBALL_TEAM_STATS,
    )
    expect(stats).toEqual([
      { label: 'Total yards', away: '244', home: '463' },
      { label: 'Turnovers', away: '3', home: '1', lower: true },
      { label: 'Possession', away: '19:20', home: '40:40', compare: 'clock' },
    ])
    expect(
      espnTeamStats(undefined, '9', '12', FOOTBALL_TEAM_STATS),
    ).toBeUndefined()
  })
})

describe('tableTeamStats', () => {
  const row = (values: Array<string | number>) => ({
    player: { id: null, name: 'P' },
    note: null,
    sub: false,
    values,
  })
  const table = (
    side: 'away' | 'home',
    title: string,
    columns: Array<string>,
    rows: Array<Array<string | number>>,
  ) => ({ side, title, columns, rows: rows.map(row) })
  const box = (tables: GameBox['tables']): GameBox => ({
    linescore: {
      segments: [],
      away: [],
      home: [],
      totalColumns: [],
      awayTotals: [],
      homeTotals: [],
    },
    tables,
  })
  const game = {
    awayTeam: { abbreviation: 'KC' },
    homeTeam: { abbreviation: 'BUF' },
  }

  it('sums counting columns, skipping longs, averages and the other side’s', () => {
    const stats = tableTeamStats(
      box([
        table(
          'away',
          'KC Passing',
          ['C/ATT', 'YDS', 'INT', 'SACKS', 'RTG'],
          [['24/33', 291, 1, '2-14', 101.2]],
        ),
        table(
          'home',
          'BUF Passing',
          ['C/ATT', 'YDS', 'INT', 'SACKS', 'RTG'],
          [['21/30', 244, 0, '1-9', 95.1]],
        ),
        table(
          'away',
          'KC Rushing',
          ['CAR', 'YDS', 'LONG'],
          [
            [18, 87, 22],
            [4, 11, 6],
          ],
        ),
        table('home', 'BUF Rushing', ['CAR', 'YDS', 'LONG'], [[20, 101, 30]]),
        table('away', 'KC Pitching', ['H'], [[5]]),
        table('home', 'BUF Pitching', ['H'], [[7]]),
      ]),
      game,
    )
    expect(stats).toEqual([
      { label: 'Passing C/ATT', away: '24/33', home: '21/30', compare: 'rate' },
      { label: 'Passing YDS', away: '291', home: '244' },
      { label: 'Passing INT', away: '1', home: '0', lower: true },
      {
        label: 'Passing SACKS',
        away: '2-14',
        home: '1-9',
        compare: 'first',
        lower: true,
      },
      { label: 'Rushing CAR', away: '22', home: '20' },
      { label: 'Rushing YDS', away: '98', home: '101' },
    ])
  })

  it('names a lone players table’s totals by column', () => {
    const stats = tableTeamStats(
      box([
        table(
          'away',
          'KC Players',
          ['PTS', 'FG', 'MIN'],
          [
            [20, '8-15', 30],
            [10, '4-9', 25],
          ],
        ),
        table('home', 'BUF Players', ['PTS', 'FG', 'MIN'], [[25, '9-20', 34]]),
      ]),
      game,
    )
    expect(stats.map((s) => [s.label, s.away, s.home])).toEqual([
      ['PTS', '30', '25'],
      ['FG', '12-24', '9-20'],
    ])
  })
})
