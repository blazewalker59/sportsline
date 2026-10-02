import { describe, expect, it } from 'vitest'
import fixture from '../../../fixtures/nba/final-401859964.json'
import type { NbaSummary } from '@/lib/sources/nba/feed'
import type { SourceMilestone, SourcePlay } from '@/lib/model/types'
import { parseGame, roleOf } from '@/lib/sources/nba/parse'

const game = parseGame(fixture as unknown as NbaSummary)
const plays = game.items.filter((i): i is SourcePlay => i.kind === 'play')
const milestones = game.items.filter(
  (i): i is SourceMilestone => i.kind === 'milestone',
)

describe('NBA parseGame — 2026 Finals Game 2 (NY @ SA)', () => {
  it('reports the Game', () => {
    expect(game.status).toBe('final')
    expect(game.away.abbreviation).toBe('NY')
    expect(game.home.abbreviation).toBe('SA')
    expect(game.score).toEqual({ away: 105, home: 104 })
    expect(game.away.logoUrl).toContain('/nba/500-dark/ny.png')
  })

  it('keeps every game event as a Play, quarter ends as Milestones', () => {
    const types = new Set(plays.map((p) => p.playType))
    for (const t of [
      'Jump Shot',
      'Defensive Rebound',
      'Substitution',
      'Full Timeout',
      'Shooting Foul',
    ]) {
      expect(types).toContain(t)
    }
    expect(types).not.toContain('End Period')
    expect(milestones.map((m) => m.description)).toEqual(
      expect.arrayContaining([
        'Tip-off: NY @ SA',
        'End of Q1: NY 25, SA 34',
        'Halftime: NY 56, SA 52',
        'Final: NY 105, SA 104',
      ]),
    )
  })

  it('marks made baskets Scoring and their total matches the final score', () => {
    const scoring = plays.filter((p) => p.significance === 'scoring')
    const points = scoring.reduce(
      (n, p) => n + ((p.detail as { points: number }).points ?? 0),
      0,
    )
    expect(points).toBe(105 + 104)
    expect(scoring.at(-1)!.score).toEqual({ away: 105, home: 104 })
  })

  it('marks blocks, steals, technicals and reviews Notable', () => {
    const notable = plays
      .filter((p) => p.significance === 'notable')
      .map((p) => p.description)
    expect(notable.some((d) => /blocks/.test(d))).toBe(true)
    expect(notable.some((d) => /steals/.test(d))).toBe(true)
    expect(notable.some((d) => /technical foul/.test(d))).toBe(true)
  })

  it('reads each participant’s role from the sentence', () => {
    const assisted = plays.find(
      (p) =>
        p.description ===
        'Devin Vassell makes 24-foot three point jumper (Stephon Castle assists)',
    )!
    expect(assisted.involved.map((i) => [i.name, i.role])).toEqual([
      ['Devin Vassell', 'shooter'],
      ['Stephon Castle', 'assist'],
    ])
    const sub = plays.find(
      (p) =>
        p.description === 'Dylan Harper enters the game for De’Aaron Fox' ||
        /^Dylan Harper enters the game for/.test(p.description),
    )!
    expect(
      Object.fromEntries(sub.involved.map((i) => [i.name, i.role])),
    ).toMatchObject({ 'Dylan Harper': 'sub in' })
  })

  it('orders every item uniquely and builds a box score', () => {
    const keys = game.items.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(game.box!.linescore.away).toEqual([25, 31, 28, 21])
    expect(game.box!.tables.map((t) => t.title)).toEqual([
      'NY Players',
      'SA Players',
    ])
    expect(game.box!.tables[0].columns.slice(0, 4)).toEqual([
      'MIN',
      'PTS',
      'REB',
      'AST',
    ])
  })
})

describe('roleOf', () => {
  it('finds blockers and shooters in block sentences', () => {
    const text = "De'Aaron Fox blocks Jalen Brunson 's 6-foot pullup jump shot"
    expect(roleOf(text, "De'Aaron Fox", 0, true)).toBe('blocker')
    expect(roleOf(text, 'Jalen Brunson', 1, true)).toBe('shooter')
  })
})
