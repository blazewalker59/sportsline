import { describe, expect, it } from 'vitest'
import {
  RACE_POINT_EVERY_MS,
  leadChanges,
  raceSteps,
  shouldRecord,
} from '@/lib/fantasy/race'

const at = (minute: number) =>
  new Date(Date.UTC(2026, 9, 4, 17, minute)).toISOString()

describe('the race', () => {
  it('keeps a point when the score moves, or after ten quiet minutes', () => {
    const last = { at: at(0), mine: 10, opponent: 8 }
    const now = Date.parse(at(1))
    expect(shouldRecord(undefined, { mine: 0, opponent: 0 }, now)).toBe(true)
    expect(shouldRecord(last, { mine: 10, opponent: 8 }, now)).toBe(false)
    expect(shouldRecord(last, { mine: 16, opponent: 8 }, now)).toBe(true)
    expect(
      shouldRecord(
        last,
        { mine: 10, opponent: 8 },
        Date.parse(at(0)) + RACE_POINT_EVERY_MS,
      ),
    ).toBe(true)
  })

  it('counts lead changes, not ties on the way', () => {
    const points = [
      { at: at(0), mine: 0, opponent: 0 },
      { at: at(5), mine: 6, opponent: 0 },
      { at: at(9), mine: 6, opponent: 6 },
      { at: at(12), mine: 6, opponent: 9 },
      { at: at(20), mine: 13, opponent: 9 },
    ]
    expect(leadChanges(points)).toBe(2)
    expect(leadChanges(points.slice(0, 3))).toBe(0)
  })

  it('draws each side as steps: a corner holds the old score to the change', () => {
    const points = [
      { at: at(0), mine: 0, opponent: 0 },
      { at: at(5), mine: 6, opponent: 0 },
      { at: at(9), mine: 6, opponent: 3 },
    ]
    expect(raceSteps(points, 'mine').map((s) => [s.score, s.corner])).toEqual([
      [0, false],
      [0, true],
      [6, false],
      [6, false],
    ])
    expect(raceSteps(points, 'opponent').map((s) => s.score)).toEqual([
      0, 0, 0, 3,
    ])
  })
})
