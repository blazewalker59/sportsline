import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/fantasy/football-matchup-2026-week-1.json'
import type { WireLeague } from '@/lib/fantasy/matchup'
import { myTeamId, readMatchup } from '@/lib/fantasy/matchup'
import { seasonOf } from '@/lib/fantasy/sports'

const league = fixture as unknown as WireLeague

describe('reading a football Matchup', () => {
  const view = readMatchup('football', league, 6)!

  it('finds both sides of the current Matchup', () => {
    expect(view.matchupPeriod).toBe(1)
    expect(view.mine.abbrev).toBe('TA')
    expect(view.opponent?.abbrev).toBe('TB')
    expect(view.scoringType).toBe('H2H_POINTS')
  })

  it('reads each Lineup with Starters first and named slots', () => {
    const starters = view.mine.lineup.filter((p) => p.starter)
    const bench = view.mine.lineup.filter((p) => !p.starter)
    // QB, 2 RB, 2 WR, TE, 2 FLEX, D/ST, K.
    expect(starters.length).toBe(10)
    expect(bench.every((p) => p.slot === 'Bench' || p.slot === 'IR')).toBe(true)
    expect(view.mine.lineup.indexOf(starters.at(-1)!)).toBeLessThan(
      view.mine.lineup.indexOf(bench[0]),
    )
    expect(starters.map((p) => p.slot)).toContain('FLEX')
    expect(starters.find((p) => p.name === 'Matthew Stafford')?.slot).toBe('QB')
    // Both Lineups in slot order, so they pair position by position.
    const order = [
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'FLEX',
      'D/ST',
      'K',
    ]
    expect(starters.map((p) => p.slot)).toEqual(order)
    expect(
      view.opponent!.lineup.filter((p) => p.starter).map((p) => p.slot),
    ).toEqual(order)
  })

  it('takes ESPN’s projection, and a score of 0 before kickoff', () => {
    expect(view.mine.projected).toBeCloseTo(114.35, 1)
    expect(view.mine.score).toBe(0)
  })

  it('finds the Viewer’s team by SWID, else the chosen team', () => {
    expect(myTeamId(league, '{ABC}', 5)).toBe(5)
    const owned = {
      ...league,
      teams: league.teams!.map((t) =>
        t.id === 6 ? { ...t, owners: ['{ABC-123}'] } : t,
      ),
    }
    expect(myTeamId(owned, 'abc-123')).toBe(6)
  })
})

describe('season years', () => {
  it('follow each sport’s calendar', () => {
    expect(seasonOf('football', new Date('2027-01-10'))).toBe(2026)
    expect(seasonOf('football', new Date('2026-10-04'))).toBe(2026)
    expect(seasonOf('basketball', new Date('2026-10-04'))).toBe(2027)
    expect(seasonOf('basketball', new Date('2027-03-01'))).toBe(2027)
    expect(seasonOf('baseball', new Date('2026-10-04'))).toBe(2026)
  })
})
