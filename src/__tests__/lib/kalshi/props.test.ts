import { describe, expect, it } from 'vitest'
import type { GameBox } from '@/lib/model/types'
import { progressOf, statOf, targetOf } from '@/lib/kalshi/props'

const game = {
  score: { away: 17, home: 6 },
  awayTeam: { id: 'tm_mia', abbreviation: 'MIA', logoUrl: null },
  homeTeam: { id: 'tm_clem', abbreviation: 'CLEM', logoUrl: null },
}
const row = (id: string, values: Array<string>) => ({
  player: { id, name: id },
  note: null,
  sub: false,
  values,
})
const box: GameBox = {
  linescore: {
    segments: [],
    away: [],
    home: [],
    totalColumns: [],
    awayTotals: [],
    homeTotals: [],
  },
  tables: [
    {
      side: 'away',
      title: 'MIA Receiving',
      columns: ['REC', 'YDS', 'AVG', 'TD', 'LONG'],
      rows: [
        row('pl_barkate', ['2', '72', '36.0', '1', '61']),
        row('pl_other', ['5', '140', '28.0', '0', '40']),
      ],
    },
    {
      side: 'home',
      title: 'CLEM Receiving',
      columns: ['REC', 'YDS', 'AVG', 'TD', 'LONG'],
      rows: [row('pl_wesco', ['6', '69', '11.5', '0', '21'])],
    },
  ],
}

describe('stat props', () => {
  it('know which stat a series counts, and skip partial games', () => {
    expect(statOf('cfb', 'KXNCAAFTEAMRECYDS-26OCT03MIACLEM')).toMatchObject({
      table: 'Receiving',
      team: true,
      label: 'rec yds',
    })
    expect(statOf('nfl', 'KXNFLRECYDS-26OCT04INDWAS')?.team).toBe(false)
    expect(statOf('nfl', 'KXNFL1HTOTAL-26OCT04INDWAS')).toBeNull()
    expect(statOf('nfl', 'KXNFLGAME-26OCT04INDWAS')).toBeNull()
    expect(statOf('mlb', 'KXMLBKS-26OCT03NYYTB')?.label).toBe('K')
  })

  it('read the line from the strike, else the title', () => {
    expect(targetOf(299.5, '')).toBe(300)
    expect(targetOf(null, 'Jonathan Taylor: 70+ receiving yards')).toBe(70)
  })

  it("sum a team's column for a team prop", () => {
    expect(
      progressOf({
        league: 'cfb',
        eventTicker: 'KXNCAAFTEAMRECYDS-26OCT03MIACLEM',
        title: 'Miami (FL): 300+ receiving yards',
        floorStrike: 299.5,
        game,
        box,
        teamId: 'tm_mia',
        playerId: null,
      }),
    ).toEqual({ current: 212, target: 300, label: 'rec yds' })
  })

  it("read one player's row for a player prop", () => {
    expect(
      progressOf({
        league: 'cfb',
        eventTicker: 'KXNCAAFRECYDS-26OCT03MIACLEM',
        title: 'Cooper Barkate: 100+ receiving yards',
        floorStrike: 99.5,
        game,
        box,
        teamId: 'tm_mia',
        playerId: 'pl_barkate',
      })?.current,
    ).toBe(72)
  })

  it('use the score for totals', () => {
    expect(
      progressOf({
        league: 'cfb',
        eventTicker: 'KXNCAAFTOTAL-26OCT03MIACLEM',
        title: 'Over 45.5 points scored',
        floorStrike: 45.5,
        game,
        box,
        teamId: null,
        playerId: null,
      }),
    ).toEqual({ current: 23, target: 46, label: 'pts' })
  })
})
