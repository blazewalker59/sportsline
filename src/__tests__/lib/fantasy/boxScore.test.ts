import { describe, expect, it } from 'vitest'
import type { Stats } from '@/lib/fantasy/categories'
import {
  boxCell,
  boxColumns,
  boxLeaders,
  boxTotals,
  played,
} from '@/lib/fantasy/boxScore'
import { leagueCategories } from '@/lib/fantasy/categories'

const cols = boxColumns('basketball', leagueCategories('basketball', []))
const col = (label: string) => cols.find((c) => c.label === label)!

describe('category box score', () => {
  it('lays out basketball’s categories with shooting as makes/attempts', () => {
    expect(cols.map((c) => c.label)).toEqual([
      'FG',
      'FT',
      '3PM',
      'REB',
      'AST',
      'STL',
      'BLK',
      'TO',
      'PTS',
    ])
    expect(col('FG')).toMatchObject({ made: 13, attempts: 14 })
    expect(col('TO').reverse).toBe(true)
  })

  it('writes a line’s cells, and a dash for a Player with no line', () => {
    const line = { 0: 24, 6: 8, 13: 9, 14: 17, 15: 0, 16: 0 }
    expect(boxCell('basketball', col('FG'), line)).toBe('9/17')
    expect(boxCell('basketball', col('FT'), line)).toBe('0/0')
    expect(boxCell('basketball', col('PTS'), line)).toBe('24')
    // Played, but nothing in this category.
    expect(boxCell('basketball', col('BLK'), line)).toBe('0')
    expect(boxCell('basketball', col('PTS'), {})).toBe('–')
    expect(boxCell('basketball', col('PTS'), null)).toBe('–')
    expect(boxCell('basketball', col('PTS'), { 0: 0, 40: 0 })).toBe('–')
  })

  it('picks each column’s leader among those who played', () => {
    const rows: Array<{ key: string; stats: Stats }> = [
      { key: 'a', stats: { 0: 30, 11: 4, 13: 10, 14: 25 } },
      { key: 'b', stats: { 0: 12, 11: 1, 13: 5, 14: 8 } },
      { key: 'c', stats: { 0: 30, 11: 2, 13: 0, 14: 0 } },
      { key: 'd', stats: {} },
    ]
    expect(boxLeaders('basketball', col('PTS'), rows)).toEqual(
      new Set(['a', 'c']),
    )
    // Lower wins, and no shots isn't a percentage.
    expect(boxLeaders('basketball', col('TO'), rows)).toEqual(new Set(['b']))
    expect(boxLeaders('basketball', col('FG'), rows)).toEqual(new Set(['b']))
    // Everyone even, or one Player alone: nobody stands out.
    expect(boxLeaders('basketball', col('BLK'), rows.slice(0, 3))).toEqual(
      new Set(),
    )
    expect(boxLeaders('basketball', col('PTS'), rows.slice(0, 1))).toEqual(
      new Set(),
    )
  })

  it('totals the Starters who played', () => {
    const totals = boxTotals([
      { 0: 10, 13: 4, 14: 9 },
      null,
      { 0: 5, 13: 2, 14: 3 },
    ])
    expect(boxCell('basketball', col('FG'), totals)).toBe('6/12')
    expect(boxCell('basketball', col('PTS'), totals)).toBe('15')
    expect(played(boxTotals([]))).toBe(false)
  })

  it('holds a baseball rate with nothing under it out of the lead', () => {
    const base = boxColumns('baseball', leagueCategories('baseball', []))
    const era = base.find((c) => c.label === 'ERA')!
    const avg = base.find((c) => c.label === 'H/AB')!
    const rows: Array<{ key: string; stats: Stats }> = [
      { key: 'p', stats: { 34: 18, 45: 1 } },
      { key: 'h', stats: { 0: 4, 1: 2 } },
      { key: 'q', stats: { 34: 9, 45: 3 } },
    ]
    expect(boxLeaders('baseball', era, rows)).toEqual(new Set(['p']))
    expect(boxCell('baseball', avg, rows[1].stats)).toBe('2/4')
    expect(boxCell('baseball', era, rows[1].stats)).toBe('—')
  })
})
