import { describe, expect, it } from 'vitest'
import type { WireLeague } from '@/lib/fantasy/matchup'
import type {
  WhatIfMatchupInput,
  WhatIfPlayer,
  WhatIfSideInput,
} from '@/lib/fantasy/whatIf'
import { readWhatIfWeek } from '@/lib/fantasy/matchup'
import {
  analyzeMatchup,
  maxWeightAssignment,
  optimalTotal,
  summarizeWhatIf,
} from '@/lib/fantasy/whatIf'

const p = (
  id: string,
  points: number,
  slot: string,
  eligible: Array<string>,
): WhatIfPlayer => ({
  id,
  name: id,
  points,
  slot,
  starter: slot !== 'BN',
  eligible,
})

const SLOTS = ['QB', 'RB', 'FLEX']

const side = (
  teamId: number,
  total: number,
  roster: Array<WhatIfPlayer>,
): WhatIfSideInput => ({
  teamId,
  name: `Team ${teamId}`,
  abbrev: `T${teamId}`,
  total,
  roster,
})

describe('maxWeightAssignment', () => {
  it('takes the most points, each Player once', () => {
    // Two slots; the second Player is best in both, so one gives way.
    const { assignment, total } = maxWeightAssignment([
      [5, 10],
      [1, 9],
    ])
    expect(total).toBe(14)
    expect(assignment).toEqual([0, 1])
  })

  it('leaves a slot empty when no one can fill it', () => {
    const { assignment, total } = maxWeightAssignment([[-Infinity, -Infinity]])
    expect(assignment).toEqual([-1])
    expect(total).toBe(0)
  })
})

describe('optimalTotal', () => {
  it('fills flex slots from any eligible position', () => {
    const roster = [
      p('qb', 20, 'QB', ['QB']),
      p('rb1', 8, 'RB', ['RB', 'FLEX']),
      p('rb2', 15, 'FLEX', ['RB', 'FLEX']),
      p('wr', 12, 'BN', ['FLEX']),
    ]
    // QB 20, RB 15 (rb2), FLEX 12 (wr): rb1 sits.
    expect(optimalTotal(roster, SLOTS)).toBe(47)
  })
})

describe('analyzeMatchup', () => {
  it('finds a loss the best lineup would have won, by one swap', () => {
    const loser = side(1, 90, [
      p('qb', 20, 'QB', ['QB']),
      p('rb', 30, 'RB', ['RB', 'FLEX']),
      p('flex', 40, 'FLEX', ['RB', 'FLEX']),
      p('bench', 52, 'BN', ['RB', 'FLEX']),
    ])
    const winner = side(2, 100, [p('qb2', 100, 'QB', ['QB'])])
    const m: WhatIfMatchupInput = { period: 3, home: loser, away: winner }
    const read = analyzeMatchup(m, SLOTS)
    expect(read.winner).toBe('away')
    expect(read.home.benchLeft).toBe(22)
    expect(read.home.bestSwap).toEqual({ in: 'bench', out: 'rb', gain: 22 })
    expect(read).toMatchObject({ flipped: true, oneMove: true })
  })

  it('lets a result stand that the best lineup still loses', () => {
    const read = analyzeMatchup(
      {
        period: 1,
        home: side(1, 50, [p('qb', 50, 'QB', ['QB']), p('b', 5, 'BN', ['QB'])]),
        away: side(2, 120, [p('qb2', 120, 'QB', ['QB'])]),
      },
      ['QB'],
    )
    expect(read).toMatchObject({
      winner: 'away',
      flipped: false,
      oneMove: false,
    })
    expect(read.home.benchLeft).toBe(0)
  })
})

describe('summarizeWhatIf', () => {
  it('counts real and what-if records, bench points and flips', () => {
    const flip = analyzeMatchup(
      {
        period: 1,
        home: side(1, 90, [
          p('a', 90, 'QB', ['QB']),
          p('b', 120, 'BN', ['QB']),
        ]),
        away: side(2, 100, [p('c', 100, 'QB', ['QB'])]),
      },
      ['QB'],
    )
    const stands = analyzeMatchup(
      {
        period: 2,
        home: side(1, 110, [p('a', 110, 'QB', ['QB'])]),
        away: side(2, 100, [p('c', 100, 'QB', ['QB'])]),
      },
      ['QB'],
    )
    const rows = summarizeWhatIf([flip, stands])
    expect(rows.map((r) => r.teamId)).toEqual([1, 2])
    expect(rows[0]).toMatchObject({
      wins: 1,
      losses: 1,
      whatIfWins: 2,
      whatIfLosses: 0,
      benchLeft: 30,
      flips: 1,
      oneMoveFlips: 1,
      weeks: 2,
    })
    expect(rows[1]).toMatchObject({ wins: 1, losses: 1, whatIfWins: 1 })
  })
})

describe('readWhatIfWeek', () => {
  const entry = (
    id: number,
    slot: number,
    points: number,
    eligible: Array<number>,
  ) => ({
    lineupSlotId: slot,
    playerPoolEntry: {
      player: {
        id,
        fullName: `P${id}`,
        eligibleSlots: eligible,
        stats: [{ scoringPeriodId: 4, statSourceId: 0, appliedTotal: points }],
      },
    },
  })
  const league = {
    settings: {
      scheduleSettings: { matchupPeriods: { '4': [4] } },
      rosterSettings: {
        lineupSlotCounts: { '0': 1, '2': 1, '20': 6, '21': 1 },
      },
    },
    teams: [
      { id: 1, abbrev: 'A', name: 'Alpha' },
      { id: 2, abbrev: 'B', name: 'Beta' },
    ],
    schedule: [
      {
        matchupPeriodId: 4,
        winner: 'AWAY',
        home: {
          teamId: 1,
          totalPoints: 30,
          rosterForCurrentScoringPeriod: {
            entries: [
              entry(10, 0, 18, [0, 20]),
              entry(11, 2, 12, [2, 23, 20]),
              entry(12, 20, 25, [2, 23, 20]),
              // Injured reserve: couldn't have started.
              entry(13, 21, 40, [2, 23, 20, 21]),
            ],
          },
        },
        away: {
          teamId: 2,
          totalPoints: 35,
          rosterForCurrentScoringPeriod: {
            entries: [entry(20, 0, 35, [0, 20])],
          },
        },
      },
      // Another week's: not this one.
      {
        matchupPeriodId: 3,
        winner: 'HOME',
        home: { teamId: 1 },
        away: { teamId: 2 },
      },
    ],
  } as unknown as WireLeague

  it('reads the league’s starting slots and each side’s roster that week', () => {
    const week = readWhatIfWeek('football', league, 4)!
    expect(week.slots).toEqual(['0', '2'])
    expect(week.matchups).toHaveLength(1)
    const home = week.matchups[0].home
    expect(home).toMatchObject({ teamId: 1, name: 'Alpha', total: 30 })
    expect(home.roster.map((r) => [r.id, r.points, r.slot, r.starter])).toEqual(
      [
        ['10', 18, '0', true],
        ['11', 12, '2', true],
        ['12', 25, '20', false],
      ],
    )
    expect(home.roster[2].eligible).toEqual(['2', '23'])
    const read = analyzeMatchup(week.matchups[0], week.slots)
    expect(read).toMatchObject({ winner: 'away', flipped: true, oneMove: true })
  })

  it('skips an undecided week and a two-week round', () => {
    const undecided = {
      ...league,
      schedule: [{ ...league.schedule![0], winner: 'UNDECIDED' }],
    } as WireLeague
    expect(readWhatIfWeek('football', undecided, 4)).toBeNull()
    const twoWeeks = {
      ...league,
      settings: {
        ...league.settings,
        scheduleSettings: { matchupPeriods: { '4': [4, 5] } },
      },
    } as WireLeague
    expect(readWhatIfWeek('football', twoWeeks, 4)).toBeNull()
  })
})
