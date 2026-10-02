import { describe, expect, it } from 'vitest'
import finalPbp from '../../../fixtures/nhl/pbp-2026020009.json'
import finalBox from '../../../fixtures/nhl/box-2026020009.json'
import livePbp from '../../../fixtures/nhl/pbp-2026020015.json'
import liveBox from '../../../fixtures/nhl/box-2026020015.json'
import type { NhlBoxscore, NhlPlayByPlay } from '@/lib/sources/nhl/feed'
import type { SourceMilestone, SourcePlay } from '@/lib/model/types'
import {
  estimateTime,
  parseGame,
  periodLabel,
  strength,
} from '@/lib/sources/nhl/parse'

const final = parseGame(
  finalPbp as unknown as NhlPlayByPlay,
  finalBox as unknown as NhlBoxscore,
)
const live = parseGame(
  livePbp as unknown as NhlPlayByPlay,
  liveBox as unknown as NhlBoxscore,
)
const plays = (s: typeof final) =>
  s.items.filter((i): i is SourcePlay => i.kind === 'play')
const milestones = (s: typeof final) =>
  s.items.filter((i): i is SourceMilestone => i.kind === 'milestone')

describe('NHL parseGame — final in OT (PHI @ NJD)', () => {
  it('reports the Game', () => {
    expect(final.status).toBe('final')
    expect(final.away.abbreviation).toBe('PHI')
    expect(final.home.abbreviation).toBe('NJD')
    expect(final.score).toEqual({ away: 2, home: 3 })
    expect(final.sportsDay).toBe('2026-10-01')
  })

  it('keeps game events as Plays and drops stoppages and delayed-penalty signals', () => {
    const types = new Set(plays(final).map((p) => p.playType))
    for (const t of [
      'goal',
      'shot-on-goal',
      'hit',
      'faceoff',
      'penalty',
      'blocked-shot',
    ])
      expect(types).toContain(t)
    expect(types).not.toContain('stoppage')
    expect(types).not.toContain('delayed-penalty')
  })

  it('makes every goal Scoring with a composed description naming scorer and assists', () => {
    const goals = plays(final).filter((p) => p.playType === 'goal')
    expect(goals).toHaveLength(5)
    expect(goals.every((g) => g.significance === 'scoring')).toBe(true)
    expect(goals.at(-1)!.score).toEqual({ away: 2, home: 3 })
    const first = goals[0]
    expect(first.description).toMatch(
      /^PHI goal: .+ \(1\), tip in shot\. Assists: .+\(1\), .+\(1\)\./,
    )
    expect(first.involved.map((p) => p.role)).toEqual([
      'scorer',
      'assist',
      'assist',
      'goalie',
    ])
    expect(first.involved[0].name).not.toMatch(/^#/)
  })

  it('marks penalties Notable', () => {
    expect(
      plays(final)
        .filter((p) => p.playType === 'penalty')
        .every((p) => p.significance === 'notable'),
    ).toBe(true)
  })

  it('labels periods and ends with an OT Final', () => {
    expect(
      milestones(final).find((m) => m.milestone === 'final')!.description,
    ).toBe('Final/OT: PHI 2, NJD 3')
    expect(
      milestones(final)
        .filter((m) => m.milestone === 'segment_end')
        .map((m) => m.description),
    ).toEqual(expect.arrayContaining(['End of 1st period: PHI 1, NJD 0']))
  })

  it('estimates times in order, flagged as estimates', () => {
    const ps = plays(final)
    expect(ps.every((p) => p.timeEstimated)).toBe(true)
    for (let i = 1; i < ps.length; i++)
      expect(ps[i].occurredAt >= ps[i - 1].occurredAt).toBe(true)
  })

  it('builds a linescore from goals and skater/goalie tables', () => {
    expect(final.box!.linescore.segments).toEqual(['1', '2', '3', 'OT'])
    expect(final.box!.linescore.awayTotals[0]).toBe(2)
    expect(
      final.box!.linescore.home.reduce<number>((a, g) => a + (g ?? 0), 0),
    ).toBe(3)
    expect(final.box!.tables.map((t) => t.title)).toEqual([
      'PHI Skaters',
      'PHI Goalies',
      'NJD Skaters',
      'NJD Goalies',
    ])
  })
})

describe('NHL parseGame — live (EDM @ VAN)', () => {
  it('has a Situation and no Final', () => {
    expect(live.status).toBe('live')
    expect(live.situation?.segmentLabel).toBeTruthy()
    expect(milestones(live).some((m) => m.milestone === 'final')).toBe(false)
  })

  it('orders every item uniquely', () => {
    const keys = live.items.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('NHL helpers', () => {
  it('reads strength from the situation code, from the owner’s side', () => {
    expect(strength('1551', 'home')).toBe('even strength')
    expect(strength('1451', 'home')).toBe('power play')
    expect(strength('1451', 'away')).toBe('shorthanded')
    expect(strength('1560', 'away')).toBe('empty net')
  })

  it('labels periods', () => {
    expect(periodLabel({ number: 2, periodType: 'REG' })).toBe('2nd')
    expect(periodLabel({ number: 4, periodType: 'OT' })).toBe('OT')
    expect(periodLabel({ number: 5, periodType: 'SO' })).toBe('SO')
  })

  it('estimates later periods later', () => {
    const start = '2026-10-01T23:00:00Z'
    expect(
      estimateTime(start, 2, '00:00') > estimateTime(start, 1, '19:59'),
    ).toBe(true)
  })
})
