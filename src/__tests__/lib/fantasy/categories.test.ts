import { describe, expect, it } from 'vitest'
import baseball from '../../fixtures/fantasy/baseball-category-matchup.json'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type { WireLeague } from '@/lib/fantasy/matchup'
import {
  addStats,
  categoryLean,
  categoryValue,
  formatCategory,
  innings,
  leagueCategories,
  scoreCategories,
  toStats,
} from '@/lib/fantasy/categories'
import { readMatchup, readMatchupDay } from '@/lib/fantasy/matchup'

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
    // Shooting reads as averages do: no leading zero, no percent sign.
    expect(cats['FG%'].mine).toMatch(/^\.\d{3}$/)
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

  it('scores today on its own, and knows the matchup’s days', () => {
    const league = basketball as unknown as WireLeague
    const view = readMatchup('basketball', league, homeOf(league))!
    expect(view.days).toEqual([78, 79, 80, 81, 82, 83, 84, 85])
    const today = Object.fromEntries(view.today!.map((c) => [c.label, c]))
    // Today's Starters alone: 21-40 and 9-25 from the floor.
    expect(today['FG%']).toMatchObject({
      mine: '.525',
      opponent: '.360',
      leader: 'mine',
    })
    expect(today.PTS).toMatchObject({ mine: '60', opponent: '28' })
    expect(today['3PM']).toMatchObject({ mine: '6', opponent: '3' })
    // Fewer turnovers wins the day too.
    expect(today.TO).toMatchObject({ mine: '5', opponent: '4' })
    expect(today.TO.leader).toBe('opponent')
    // The matchup's totals are untouched.
    expect(view.categories!.find((c) => c.label === 'PTS')!.mine).not.toBe('60')
  })

  it('reads one day of a matchup: that day’s Lineups and categories', () => {
    const league = basketball as unknown as WireLeague
    const day = readMatchupDay('basketball', league, homeOf(league), 85)!
    expect(day.scoringPeriod).toBe(85)
    expect(day.categories.map((c) => c.label)).toEqual(
      readMatchup('basketball', league, homeOf(league))!.today!.map(
        (c) => c.label,
      ),
    )
    expect(day.categories.find((c) => c.label === 'PTS')!.mine).toBe('60')
    expect(day.mine.length).toBeGreaterThan(0)
    expect(day.opponent?.length).toBeGreaterThan(0)
    // A day with no lines yet: nothing to show, nobody leads.
    const empty = readMatchupDay('basketball', league, homeOf(league), 80)!
    expect(empty.categories.every((c) => c.leader === null)).toBe(true)
    expect(empty.categories[0].mine).toBe('—')
    // Not a category league: no days to read.
    expect(
      readMatchupDay(
        'basketball',
        {
          ...league,
          settings: { scoringSettings: { scoringType: 'H2H_POINTS' } },
        },
        homeOf(league),
        85,
      ),
    ).toBeNull()
  })

  it('orders basketball shooting first, points last, whatever the league lists', () => {
    const listed = [0, 11, 1, 2, 3, 6, 17, 21, 20, 19, 37].map((statId) => ({
      statId,
    }))
    expect(leagueCategories('basketball', listed).map((c) => c.label)).toEqual([
      'FG%',
      'FT%',
      '3P%',
      '3PM',
      'REB',
      'AST',
      'STL',
      'BLK',
      'TO',
      'PTS',
      // Not in the order: after the rest.
      'DD',
    ])
    // Other sports keep the league's own order.
    expect(
      leagueCategories('baseball', [{ statId: 5 }, { statId: 20 }]).map(
        (c) => c.label,
      ),
    ).toEqual(['HR', 'R'])
  })

  it('writes shooting percentages without a leading zero', () => {
    expect(formatCategory('basketball', 19, 0.5294)).toBe('.529')
    expect(formatCategory('basketball', 20, 0.8)).toBe('.800')
    expect(formatCategory('basketball', 21, 1)).toBe('1.000')
    expect(formatCategory('basketball', 19, null)).toBe('—')
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

describe('how far a category leans', () => {
  it('leans toward the leader by the margin, flipped where lower wins', () => {
    expect(
      categoryLean({
        reverse: false,
        leader: 'mine',
        mineValue: 31,
        opponentValue: 25,
      }),
    ).toBeCloseTo(Math.sqrt(6 / 31))
    expect(
      categoryLean({
        reverse: false,
        leader: 'opponent',
        mineValue: 10,
        opponentValue: 11,
      }),
    ).toBeCloseTo(-Math.sqrt(1 / 11))
    // ERA 2.49 vs 4.09: lower wins, so it leans the Viewer's way.
    expect(
      categoryLean({
        reverse: true,
        leader: 'mine',
        mineValue: 2.49,
        opponentValue: 4.09,
      }),
    ).toBeGreaterThan(0.6)
  })

  it('is even for ties, a minimum for close calls, full for no contest', () => {
    expect(
      categoryLean({
        reverse: false,
        leader: 'tie',
        mineValue: 30,
        opponentValue: 30,
      }),
    ).toBe(0)
    expect(
      categoryLean({
        reverse: false,
        leader: 'mine',
        mineValue: 0.482,
        opponentValue: 0.4815,
      }),
    ).toBeCloseTo(0.12)
    expect(
      categoryLean({
        reverse: false,
        leader: 'mine',
        mineValue: 4,
        opponentValue: null,
      }),
    ).toBe(1)
    expect(categoryLean({ reverse: false, leader: null })).toBe(0)
  })

  it('carries raw values from scoring', () => {
    const league = baseball as unknown as WireLeague
    const view = readMatchup('baseball', league, homeOf(league))!
    const runs = view.categories!.find((c) => c.label === 'R')!
    expect([runs.mineValue, runs.opponentValue]).toEqual([31, 25])
  })
})
