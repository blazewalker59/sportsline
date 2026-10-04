import { describe, expect, it } from 'vitest'
import baseball from '../../fixtures/fantasy/baseball-category-matchup.json'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type { WireLeague } from '@/lib/fantasy/matchup'
import {
  addStats,
  categoryValue,
  formatCategory,
  innings,
  leagueCategories,
  scoreCategories,
  toStats,
} from '@/lib/fantasy/categories'
import { readMatchup } from '@/lib/fantasy/matchup'

const homeOf = (league: WireLeague) =>
  league.schedule!.find(
    (m) => m.matchupPeriodId === league.status!.currentMatchupPeriod,
  )!.home!.teamId!

describe('category Matchups (from ESPN payloads dreamteam reads)', () => {
  it('scores baseball: yesterday’s totals plus today’s Starters, rates recomputed', () => {
    const league = baseball as unknown as WireLeague
    const view = readMatchup('baseball', league, homeOf(league))!
    const cats = Object.fromEntries(view.categories!.map((c) => [c.label, c]))
    expect(cats.R).toMatchObject({ mine: '31', opponent: '25', leader: 'mine' })
    expect(cats.RBI.leader).toBe('tie')
    expect(cats.AVG).toMatchObject({ mine: '.283', leader: 'mine' })
    // Lower wins.
    expect(cats.ERA).toMatchObject({ mine: '2.49', reverse: true })
    expect(cats.ERA.leader).toBe('mine')
    // A side's score is the categories it leads; ties apart.
    expect([view.mine.score, view.opponent?.score, view.ties]).toEqual([
      7, 2, 1,
    ])
    expect(view.mine.projected).toBeNull()
    const judge = view.mine.lineup.find((p) => p.name === 'Aaron Judge')!
    expect(judge.dayLine).toEqual([
      { label: 'H/AB', value: '2-4' },
      { label: 'R', value: '1' },
      { label: 'HR', value: '1' },
      { label: 'RBI', value: '2' },
    ])
  })

  it('scores basketball, with turnovers lower-is-better and FG% from makes', () => {
    const league = basketball as unknown as WireLeague
    const view = readMatchup('basketball', league, homeOf(league))!
    const cats = Object.fromEntries(view.categories!.map((c) => [c.label, c]))
    expect(cats['FG%'].mine).toMatch(/%$/)
    expect(cats.TO).toMatchObject({ reverse: true, leader: 'mine' })
    expect(view.categories!.map((c) => c.label)).toEqual([
      'FG%',
      'FT%',
      '3PM',
      'REB',
      'AST',
      'STL',
      'BLK',
      'TO',
      'PTS',
    ])
  })

  it('reads a league’s own categories and reverse flags', () => {
    expect(
      leagueCategories('baseball', [
        { statId: 27, isReverseItem: true },
        { statId: 17 },
        { statId: 83 },
      ]),
    ).toEqual([
      { statId: 27, label: 'SO', reverse: true },
      { statId: 17, label: 'OBP', reverse: false },
      { statId: 83, label: 'SVHD', reverse: false },
    ])
  })

  it('holds pitching rates to the innings minimum', () => {
    const cats = leagueCategories('baseball', [{ statId: 47 }])
    const side = (er: number, outs: number) => {
      const s = toStats({ 45: er, 34: outs })
      return { totals: s, given: s }
    }
    const leader = (
      a: ReturnType<typeof side>,
      b: ReturnType<typeof side>,
      min: number | null,
    ) => scoreCategories('baseball', cats, a, b, min)[0].leader
    // A 9.00 ERA over enough innings beats a 0.00 ERA that falls short…
    expect(leader(side(10, 30), side(0, 9), 27)).toBe('mine')
    // …which would win without a minimum.
    expect(leader(side(10, 30), side(0, 9), null)).toBe('opponent')
    // Neither qualifies: tied.
    expect(leader(side(10, 9), side(0, 9), 27)).toBe('tie')
  })

  it('reads ESPN’s "Infinity", sums stats, and shows innings from outs', () => {
    const s = toStats({ 47: 'Infinity', 34: 0, 45: { score: 2 } })
    expect(s[47]).toBe(Infinity)
    expect(categoryValue('baseball', 47, s, s)).toBeNull()
    expect(formatCategory('baseball', 47, Infinity)).toBe('—')
    expect(addStats({ 1: 2, 0: 4 }, { 1: 1, 0: 3 })).toEqual({ 1: 3, 0: 7 })
    expect(categoryValue('baseball', 2, { 1: 3, 0: 7 })).toBeCloseTo(3 / 7)
    expect(innings(16)).toBe('5.1')
  })
})
