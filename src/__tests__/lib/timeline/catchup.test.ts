import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '@/lib/model/timeline'
import { catchUp, catchUpLine } from '@/lib/timeline/catchup'

let n = 0
function item(overrides: Partial<TimelineItem>): TimelineItem {
  n++
  return {
    id: `i${n}`,
    gameId: 'g1',
    league: 'nfl',
    sportsDay: '2026-10-02',
    kind: 'play',
    side: 'home',
    sequence: n,
    occurredAt: '2026-10-02T20:00:00Z',
    segmentLabel: 'Q1',
    score: { away: 0, home: 0 },
    awayTeam: { id: 'a', abbreviation: 'PIT', logoUrl: null },
    homeTeam: { id: 'h', abbreviation: 'CLE', logoUrl: null },
    description: '',
    playType: null,
    significance: 'routine',
    milestone: null,
    status: 'active',
    revisedAt: null,
    overturnOf: null,
    players: [],
    detail: null,
    ...overrides,
  }
}

const READ = '2026-10-02T19:00:00Z'

describe('catchUp', () => {
  it('collects Finals and key Plays since the Read Marker, newest first', () => {
    const old = item({
      significance: 'scoring',
      occurredAt: '2026-10-02T18:00:00Z',
    })
    const td = item({
      significance: 'scoring',
      occurredAt: '2026-10-02T19:10:00Z',
    })
    const sack = item({
      significance: 'notable',
      occurredAt: '2026-10-02T19:20:00Z',
    })
    const run = item({ occurredAt: '2026-10-02T19:25:00Z' })
    const final = item({
      kind: 'milestone',
      milestone: 'final',
      significance: null,
      occurredAt: '2026-10-02T19:30:00Z',
    })
    const other = item({
      gameId: 'g2',
      significance: 'scoring',
      occurredAt: '2026-10-02T19:05:00Z',
    })
    const overturned = item({
      significance: 'scoring',
      status: 'overturned',
      occurredAt: '2026-10-02T19:06:00Z',
    })

    const c = catchUp([old, td, sack, run, final, other, overturned], READ)!
    expect(c.finals).toEqual([final])
    expect(c.keyPlays.map((i) => i.id)).toEqual([sack.id, td.id, other.id])
    expect(c.newCount).toBe(5)
    expect(c.gameCount).toBe(2)
    expect(catchUpLine(c)).toBe('1 final · 2 scores · 1 big play')
  })

  it('is null when only Routine Plays happened', () => {
    expect(
      catchUp([item({ occurredAt: '2026-10-02T19:10:00Z' })], READ),
    ).toBeNull()
  })
})
