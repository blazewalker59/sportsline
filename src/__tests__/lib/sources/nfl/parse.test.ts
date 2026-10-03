import { describe, expect, it } from 'vitest'
import summaryFixture from '../../../fixtures/nfl/live-401872964.json'
import playsFixture from '../../../fixtures/nfl/live-401872964-plays.json'
import type { NflCorePlays, NflSummary } from '@/lib/sources/nfl/feed'
import type { SourceMilestone, SourcePlay } from '@/lib/model/types'
import { parseGame, quarterLabel } from '@/lib/sources/nfl/parse'

const live = parseGame(
  summaryFixture as unknown as NflSummary,
  playsFixture as unknown as NflCorePlays,
)
const plays = live.items.filter((i): i is SourcePlay => i.kind === 'play')
const milestones = live.items.filter(
  (i): i is SourceMilestone => i.kind === 'milestone',
)

describe('NFL parseGame — live game (PIT @ CLE)', () => {
  it('reports the Game and its Situation', () => {
    expect(live.status).toBe('live')
    expect(live.away.abbreviation).toBe('PIT')
    expect(live.home.abbreviation).toBe('CLE')
    expect(live.score).toEqual({ away: 16, home: 21 })
    expect(live.sportsDay).toBe('2026-10-01')
    expect(live.situation?.segmentLabel).toMatch(/^Q4 /)
  })

  it('makes snaps, penalties and team timeouts Plays, dropping TV timeouts and the coin toss', () => {
    const types = new Set(plays.map((p) => p.playType))
    expect(types).toContain('Rush')
    expect(types).toContain('Penalty')
    expect(types).toContain('Timeout')
    expect(types).not.toContain('Official Timeout')
    expect(types).not.toContain('Coin Toss')
    expect(types).not.toContain('End Period')
  })

  it('marks exactly the score-changing Plays as Scoring', () => {
    const scoring = plays.filter((p) => p.significance === 'scoring')
    expect(scoring.map((p) => p.playType)).toEqual([
      'Passing Touchdown',
      'Rushing Touchdown',
      'Rushing Touchdown',
      'Passing Touchdown',
      'Field Goal Good',
      'Passing Touchdown',
    ])
    expect(scoring.at(-1)!.score).toEqual({ away: 16, home: 21 })
  })

  it('marks turnovers and sacks Notable', () => {
    expect(
      plays
        .filter((p) => p.playType === 'Pass Interception Return')
        .every((p) => p.significance === 'notable'),
    ).toBe(true)
    expect(
      plays
        .filter((p) => p.playType === 'Sack')
        .every((p) => p.significance === 'notable'),
    ).toBe(true)
  })

  it('names participants with their roles', () => {
    const td = plays.find((p) => p.playType === 'Passing Touchdown')!
    const roles = Object.fromEntries(td.involved.map((i) => [i.name, i.role]))
    expect(roles['Aaron Rodgers']).toBe('passer')
    expect(Object.values(roles)).toContain('receiver')
  })

  it('carries down, distance, yards and drive as Play Detail', () => {
    const rush = plays.find((p) => p.playType === 'Rush')!
    expect(rush.detail).toMatchObject({
      before: expect.stringMatching(/& \d+/),
      drive: { number: expect.any(Number) },
    })
    expect(rush.segmentLabel).toMatch(/^Q\d \d+:\d\d$/)
  })

  it('emits kickoff, quarter ends and halftime, but no Final while live', () => {
    expect(milestones.map((m) => m.description)).toEqual(
      expect.arrayContaining([
        'Kickoff: PIT @ CLE',
        'End of Q1: PIT 7, CLE 0',
        'Halftime: PIT 10, CLE 21',
      ]),
    )
    expect(milestones.some((m) => m.milestone === 'final')).toBe(false)
  })

  it('orders every item uniquely', () => {
    const keys = live.items.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('builds a box score with quarter linescore and stat tables', () => {
    expect(live.box!.linescore.away).toEqual([7, 3, 0, 6])
    expect(live.box!.linescore.homeTotals).toEqual([21])
    expect(live.box!.tables.map((t) => t.title)).toContain('PIT Passing')
  })
})

describe('quarterLabel', () => {
  it('labels quarters and overtime', () => {
    expect(quarterLabel(1)).toBe('Q1')
    expect(quarterLabel(5)).toBe('OT')
    expect(quarterLabel(6)).toBe('2OT')
  })
})

describe('two-point conversions', () => {
  // PIT @ CLE: a two-point try, re-run after a penalty whose row dips back
  // to the pre-conversion score.
  const row = (
    sequenceNumber: string,
    type: string,
    score: [number, number],
    scoringPlay: boolean,
  ) => ({
    id: sequenceNumber,
    sequenceNumber,
    type: { text: type },
    text: type,
    awayScore: score[0],
    homeScore: score[1],
    scoringPlay,
    period: { number: 4 },
  })
  const game = parseGame(
    summaryFixture as unknown as NflSummary,
    {
      items: [
        row('379200', 'Field Goal Good', [16, 24], true),
        row('435300', 'Passing Touchdown', [24, 24], true),
        row('437900', 'Penalty', [22, 24], false),
        row('441200', 'Kickoff', [24, 24], false),
        row('463600', 'Field Goal Good', [24, 27], true),
      ],
    } as unknown as NflCorePlays,
  )
  const play = (type: string) =>
    game.items.find(
      (i): i is SourcePlay => i.kind === 'play' && i.playType === type,
    )!

  it('credits the conversion to the touchdown and never dips the score', () => {
    expect(play('Passing Touchdown').score).toEqual({ away: 24, home: 24 })
    expect(play('Penalty').score).toEqual({ away: 24, home: 24 })
    expect(play('Penalty').significance).not.toBe('scoring')
    expect(play('Kickoff').score).toEqual({ away: 24, home: 24 })
    expect(play('Kickoff').significance).not.toBe('scoring')
  })
})
