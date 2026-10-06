import { describe, expect, it } from 'vitest'
import type { TeamRef, TimelineItem } from '@/lib/model/timeline'
import { buildFlow, segmentOf } from '@/lib/games/flow'
import { colorDistance, flowColors } from '@/lib/games/flowColors'

const item = (
  sequence: number,
  score: [number, number],
  over: Partial<TimelineItem> = {},
): TimelineItem =>
  ({
    id: `i${sequence}`,
    gameId: 'g',
    league: 'nfl',
    kind: 'play',
    side: null,
    sequence,
    segmentLabel: 'Q1 10:00',
    score: { away: score[0], home: score[1] },
    significance: 'routine',
    status: 'active',
    description: '',
    playType: null,
    players: [],
    ...over,
  }) as TimelineItem

describe('segments', () => {
  it('reads each League’s segment from its label', () => {
    expect(segmentOf('Q3 2:47', 'nba')).toBe('Q3')
    expect(segmentOf('Q1', 'nfl')).toBe('Q1')
    expect(segmentOf('Top 1st', 'mlb')).toBe('1')
    expect(segmentOf('Bot 9th', 'mlb')).toBe('9')
    expect(segmentOf('2nd 05:59', 'nhl')).toBe('P2')
    expect(segmentOf('OT 3:00', 'nhl')).toBe('OT')
    expect(segmentOf('Final', 'nfl')).toBeNull()
    expect(segmentOf('Halftime', 'nfl')).toBeNull()
  })
})

describe('a Game’s flow', () => {
  const flow = buildFlow(
    [
      item(1, [0, 0]),
      item(2, [7, 0], { side: 'away', significance: 'scoring' }),
      item(3, [7, 0], { segmentLabel: 'Q2 15:00' }),
      item(4, [7, 3], {
        side: 'home',
        significance: 'scoring',
        segmentLabel: 'Q2 9:00',
      }),
      item(5, [7, 3], { kind: 'overturn', side: 'home' }),
    ],
    'nfl',
  )

  it('steps each team’s line at the play that changed its score', () => {
    expect(flow.away).toEqual([
      { x: 0, score: 0 },
      { x: 2, score: 0 },
      { x: 2, score: 7 },
      { x: 4, score: 7 },
    ])
    expect(flow.home).toEqual([
      { x: 0, score: 0 },
      { x: 4, score: 0 },
      { x: 4, score: 3 },
      { x: 4, score: 3 },
    ])
  })

  it('marks Scoring Plays and where segments begin, leaving out Overturns', () => {
    expect(flow.scores.map((s) => [s.x, s.side, s.score])).toEqual([
      [2, 'away', 7],
      [4, 'home', 3],
    ])
    expect(flow.segments).toEqual([
      { x: 0.5, label: 'Q1' },
      { x: 2.5, label: 'Q2' },
    ])
    expect(flow.end).toBe(4)
  })

  it('never steps a score down (a correction would draw as a spike)', () => {
    const f = buildFlow(
      [item(1, [3, 0]), item(2, [1, 0]), item(3, [3, 2])],
      'nba',
    )
    const scores = f.away.map((s) => s.score)
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
    expect(scores.at(-1)).toBe(3)
  })
})

describe('team line colors', () => {
  const team = (primary: string, secondary: string) =>
    ({
      id: primary,
      abbreviation: 'T',
      logoUrl: null,
      colors: { primary, secondary },
    }) as TeamRef

  it('keeps hues apart and visible in each theme', () => {
    // Calgary red and Vancouver: navy is too dark on the dark page, green
    // is plainly different from red.
    const c = flowColors(team('#dd1a32', '#000000'), team('#003e7e', '#008752'))
    expect(c.home.dark).toBe('#008752')
    // Warriors (gold fails on the light page, so navy) and Clippers navy:
    // too alike, so the Clippers take their red.
    const w = flowColors(team('#fdb927', '#1d428a'), team('#12173f', '#c8102e'))
    expect(w.away.light).toBe('#1d428a')
    expect(w.home.light).toBe('#c8102e')
    expect(colorDistance('#dd1a32', '#008752')).toBeGreaterThan(300)
  })
})
