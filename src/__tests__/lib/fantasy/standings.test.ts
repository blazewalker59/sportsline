import { describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import football from '../../fixtures/fantasy/football-matchup-2026-week-1.json'
import type { WireLeague } from '@/lib/fantasy/matchup'
import { ranked, readStandings } from '@/lib/fantasy/standings'

const row = (teamId: number, wins: number, losses: number, pf: number) => ({
  teamId,
  name: `Team ${teamId}`,
  abbrev: `T${teamId}`,
  logo: null,
  wins,
  losses,
  ties: 0,
  pointsFor: pf,
  pointsAgainst: null,
  streak: null,
  mine: false,
})

describe('ranked', () => {
  it('places by win percentage, then points for', () => {
    const rows = ranked([
      row(1, 2, 2, 400),
      row(2, 3, 1, 300),
      row(3, 2, 2, 450),
    ])
    expect(rows.map((r) => [r.teamId, r.rank])).toEqual([
      [2, 1],
      [3, 2],
      [1, 3],
    ])
  })

  it('counts a tie as half a win', () => {
    const tied = { ...row(1, 2, 1, 0), ties: 1 }
    expect(ranked([row(2, 2, 2, 0), tied])[0].teamId).toBe(1)
  })
})

describe('readStandings', () => {
  it('reads a category league in ESPN’s order, without points', () => {
    const s = readStandings(basketball as unknown as WireLeague, 2)!
    expect(s.playoffTeams).toBe(6)
    expect(s.rows[0]).toMatchObject({
      teamId: 1,
      rank: 1,
      wins: 8,
      losses: 3,
      // Category wins aren't Fantasy points.
      pointsFor: null,
      pointsAgainst: null,
      streak: 'W3',
      mine: false,
    })
    expect(s.rows[1]).toMatchObject({ teamId: 2, streak: 'L1', mine: true })
  })

  it('places a points league by its seed before any game is played', () => {
    const s = readStandings(football as unknown as WireLeague, 6)!
    expect(s.rows.map((r) => [r.abbrev, r.rank])).toEqual([
      ['TA', 7],
      ['TB', 8],
    ])
    expect(s.rows[0]).toMatchObject({ pointsFor: 0, streak: null, mine: true })
  })

  it('ranks by record when ESPN hasn’t placed every team', () => {
    const league = {
      teams: [
        { id: 1, record: { overall: { wins: 1, losses: 3 } } },
        { id: 2, playoffSeed: 1, record: { overall: { wins: 3, losses: 1 } } },
      ],
    } as unknown as WireLeague
    expect(readStandings(league, null)!.rows.map((r) => r.teamId)).toEqual([
      2, 1,
    ])
  })

  it('has none without teams', () => {
    expect(readStandings({} as WireLeague, null)).toBeNull()
  })
})
