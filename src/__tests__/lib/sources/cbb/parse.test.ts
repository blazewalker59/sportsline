import { describe, expect, it } from 'vitest'
import fixture from '../../../fixtures/cbb/final-401906774.json'
import type { NbaSummary } from '@/lib/sources/nba/feed'
import { HALVES, QUARTERS } from '@/lib/sources/espn/common'
import { parseGame } from '@/lib/sources/nba/parse'

// A finished men's college basketball Game from ESPN's summary:
// Milwaukee 67, Florida 76.
const snapshot = parseGame(fixture as unknown as NbaSummary, HALVES)

describe('men’s college basketball (ESPN, the NBA’s shapes in halves)', () => {
  it('reads the final score', () => {
    expect(snapshot.status).toBe('final')
    expect(snapshot.score).toEqual({ away: 67, home: 76 })
    expect(snapshot.away.abbreviation).toBe('MILW')
    expect(snapshot.home.abbreviation).toBe('FLA')
  })

  it('labels plays by half, never by quarter', () => {
    const labels = new Set(
      snapshot.items.flatMap((i) =>
        i.kind === 'play' ? [i.segmentLabel.split(' ')[0]] : [],
      ),
    )
    expect([...labels].sort()).toEqual(['H1', 'H2'])
  })

  it('marks halftime after the first half, then the Final', () => {
    const milestones = snapshot.items.flatMap((i) =>
      i.kind === 'milestone' ? [i] : [],
    )
    const halftime = milestones.find((m) => m.key === 'end:1')
    expect(halftime?.description).toMatch(/^Halftime: /)
    expect(milestones.some((m) => m.milestone === 'final')).toBe(true)
    // No "End of Q…" anywhere.
    expect(milestones.map((m) => m.description).join(' ')).not.toMatch(/Q\d/)
  })

  it('lines the box score up by half', () => {
    expect(snapshot.box?.linescore?.segments).toEqual(['1', '2'])
  })

  it('names each period as its format does', () => {
    expect([1, 2, 3, 4].map(HALVES.label)).toEqual(['H1', 'H2', 'OT', '2OT'])
    expect([4, 5, 6].map(QUARTERS.label)).toEqual(['Q4', 'OT', '2OT'])
  })
})
