import { describe, expect, it } from 'vitest'
import type { GameBox } from '@/lib/model/types'
import { boxSides, categoryName } from '@/lib/games/boxSides'

const game = {
  awayTeam: { id: 'kc', abbreviation: 'KC', logoUrl: null },
  homeTeam: { id: 'lv', abbreviation: 'LV', logoUrl: null },
}

const table = (
  side: 'away' | 'home',
  title: string,
): GameBox['tables'][number] => ({ side, title, columns: [], rows: [] })

describe('categoryName', () => {
  it('drops either team’s abbreviation', () => {
    expect(categoryName('KC Passing', game)).toBe('Passing')
    expect(categoryName('LV Kick Returns', game)).toBe('Kick Returns')
    expect(categoryName('kc Batting', game)).toBe('Batting')
  })

  it('keeps a title that doesn’t start with a team', () => {
    expect(categoryName('Passing', game)).toBe('Passing')
    expect(categoryName('DEN Passing', game)).toBe('DEN Passing')
    // Never empties a title that is only an abbreviation.
    expect(categoryName('KC', game)).toBe('KC')
  })
})

describe('boxSides', () => {
  it('groups the tables by team, in the box’s order', () => {
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
        table('away', 'KC Passing'),
        table('home', 'LV Passing'),
        table('away', 'KC Rushing'),
        table('home', 'LV Rushing'),
      ],
    }
    const sides = boxSides(box, game)
    expect(sides.away.map((c) => c.name)).toEqual(['Passing', 'Rushing'])
    expect(sides.home.map((c) => c.name)).toEqual(['Passing', 'Rushing'])
    expect(sides.home[1].table.title).toBe('LV Rushing')
  })
})
