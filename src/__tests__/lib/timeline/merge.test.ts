import { describe, expect, it } from 'vitest'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import {
  applyEvents,
  emptyState,
  orderedGames,
  orderedItems,
  readMarkerIndex,
  withItems,
} from '@/lib/timeline/merge'

const DAY = '2026-10-01'

function item(
  id: string,
  occurredAt: string,
  sequence = 0,
  overrides: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    id,
    gameId: 'g1',
    league: 'mlb',
    sportsDay: DAY,
    kind: 'play',
    sequence,
    occurredAt,
    segmentLabel: 'Top 1st',
    score: { away: 0, home: 0 },
    awayTeam: { id: 'a', abbreviation: 'PHI' },
    homeTeam: { id: 'h', abbreviation: 'ATL' },
    description: id,
    playType: 'single',
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

function game(id: string, status: string, startsAt: string): GameSummary {
  return {
    id,
    league: 'mlb',
    sportsDay: DAY,
    status,
    startsAt,
    awayTeam: { id: 'a', abbreviation: 'PHI', name: 'Phillies' },
    homeTeam: { id: 'h', abbreviation: 'ATL', name: 'Braves' },
    score: { away: 0, home: 0 },
    situation: null,
  }
}

describe('Timeline merge', () => {
  it('orders newest first, breaking ties by in-Game sequence', () => {
    const s = withItems(emptyState(DAY), [
      item('a', '2026-10-01T23:00:00Z', 1),
      item('c', '2026-10-01T23:05:00Z', 3),
      item('b', '2026-10-01T23:05:00Z', 2),
    ])
    expect(orderedItems(s).map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })

  it('replaces an item in place on a Revision', () => {
    let s = withItems(emptyState(DAY), [item('a', '2026-10-01T23:00:00Z')])
    s = applyEvents(s, [
      {
        type: 'upsert',
        item: item('a', '2026-10-01T23:00:00Z', 0, {
          description: 'E6',
          revisedAt: 'now',
        }),
      },
    ])
    expect(orderedItems(s)).toHaveLength(1)
    expect(orderedItems(s)[0].description).toBe('E6')
  })

  it('drops Removals and ignores unknown ids', () => {
    let s = withItems(emptyState(DAY), [item('a', '2026-10-01T23:00:00Z')])
    s = applyEvents(s, [
      { type: 'remove', id: 'zzz', gameId: 'g1' },
      { type: 'remove', id: 'a', gameId: 'g1' },
    ])
    expect(orderedItems(s)).toEqual([])
  })

  it('ignores items from another Sports Day', () => {
    const s = applyEvents(emptyState(DAY), [
      {
        type: 'upsert',
        item: item('old', '2026-09-30T23:00:00Z', 0, {
          sportsDay: '2026-09-30',
        }),
      },
    ])
    expect(orderedItems(s)).toEqual([])
  })

  it('lists live Games first, then upcoming, then finished', () => {
    const s = applyEvents(emptyState(DAY), [
      { type: 'game', game: game('final', 'final', '2026-10-01T17:00:00Z') },
      {
        type: 'game',
        game: game('later', 'scheduled', '2026-10-02T02:00:00Z'),
      },
      { type: 'game', game: game('live', 'live', '2026-10-01T23:00:00Z') },
    ])
    expect(orderedGames(s).map((g) => g.id)).toEqual(['live', 'later', 'final'])
  })
})

describe('readMarkerIndex', () => {
  const items = [
    item('c', '2026-10-01T23:30:00Z'),
    item('b', '2026-10-01T23:20:00Z'),
    item('a', '2026-10-01T23:10:00Z'),
  ]

  it('sits above the first item already seen', () => {
    expect(readMarkerIndex(items, '2026-10-01T23:20:00Z')).toBe(1)
    expect(readMarkerIndex(items, '2026-10-01T23:25:00Z')).toBe(1)
  })

  it('is hidden when nothing is new, nothing was seen, or there is no marker', () => {
    expect(readMarkerIndex(items, '2026-10-01T23:30:00Z')).toBeNull()
    expect(readMarkerIndex(items, '2026-10-01T22:00:00Z')).toBeNull()
    expect(readMarkerIndex(items, null)).toBeNull()
  })
})
