import { describe, expect, it } from 'vitest'
import type { SourcePlay } from '@/lib/model/types'
import type { SeenItem } from '@/lib/live/diff'
import { MAX_REMOVALS_PER_POLL, diffItems, fingerprint } from '@/lib/live/diff'

function play(key: string, overrides: Partial<SourcePlay> = {}): SourcePlay {
  return {
    kind: 'play',
    key,
    sequence: 1,
    occurredAt: '2026-10-01T00:00:00Z',
    segmentLabel: 'Top 1st',
    score: { away: 0, home: 0 },
    description: 'Groundout',
    playType: 'field_out',
    significance: 'routine',
    side: 'away',
    involved: [],
    detail: null,
    ...overrides,
  }
}

function seenFrom(...items: Array<SourcePlay>): Map<string, SeenItem> {
  return new Map(
    items.map((i) => [i.key, { id: `id-${i.key}`, ...fingerprint(i) }]),
  )
}

describe('diffItems', () => {
  it('reports unseen items as added', () => {
    const changes = diffItems(new Map(), [play('a')])
    expect(changes).toEqual([{ type: 'added', item: play('a') }])
  })

  it('ignores items whose facts are unchanged', () => {
    expect(diffItems(seenFrom(play('a')), [play('a')])).toEqual([])
  })

  it('reports changed facts as a Revision', () => {
    const before = play('a', { description: 'Single', playType: 'single' })
    const after = play('a', {
      description: 'Fielding error',
      playType: 'field_error',
    })
    const [change] = diffItems(seenFrom(before), [after])
    expect(change.type).toBe('revised')
  })

  it('reports a scoring Play that stops scoring as an Overturn', () => {
    const before = play('td', {
      significance: 'scoring',
      score: { away: 7, home: 0 },
    })
    const after = play('td', {
      significance: 'routine',
      description: 'Reversed',
    })
    const [change] = diffItems(seenFrom(before), [after])
    expect(change.type).toBe('overturned')
  })

  it('treats a non-scoring Play becoming scoring as a Revision, not an Overturn', () => {
    const before = play('a')
    const after = play('a', {
      significance: 'scoring',
      score: { away: 1, home: 0 },
    })
    expect(diffItems(seenFrom(before), [after])[0].type).toBe('revised')
  })

  it('reports items the Source dropped as Removals', () => {
    const changes = diffItems(seenFrom(play('a'), play('b')), [play('a')])
    expect(changes).toEqual([
      {
        type: 'removed',
        key: 'b',
        seen: expect.objectContaining({ id: 'id-b' }),
      },
    ])
  })

  it('ignores mass Removals as a Source glitch', () => {
    const many = Array.from({ length: MAX_REMOVALS_PER_POLL + 1 }, (_, i) =>
      play(`x${i}`),
    )
    const changes = diffItems(seenFrom(play('a'), ...many), [play('a')])
    expect(changes).toEqual([])
  })

  it('never removes anything on an empty response', () => {
    expect(diffItems(seenFrom(play('a')), [])).toEqual([])
  })
})
