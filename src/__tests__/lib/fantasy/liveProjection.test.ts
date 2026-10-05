import { describe, expect, it } from 'vitest'
import type { LineupPlayer } from '@/lib/fantasy/matchup'
import { liveProjected, playedShare } from '@/lib/fantasy/liveProjection'

const player = (
  points: number | null,
  projected: number | null,
  teamId: string,
) => ({ points, projected, teamId }) as LineupPlayer

describe('a side’s live projection', () => {
  it('reads how much of a Game is played from its clock', () => {
    expect(playedShare({ status: 'scheduled', segmentLabel: null })).toBe(0)
    expect(playedShare({ status: 'live', segmentLabel: 'Q1 15:00' })).toBe(0)
    expect(playedShare({ status: 'live', segmentLabel: 'Q3 7:30' })).toBe(0.625)
    expect(playedShare({ status: 'live', segmentLabel: 'Halftime' })).toBe(0.5)
    expect(playedShare({ status: 'final', segmentLabel: null })).toBe(1)
  })

  it('counts what finished Starters scored, the rest of the live ones, the projection of those to come', () => {
    const games: Record<
      string,
      { status: string; segmentLabel: string | null }
    > = {
      done: { status: 'final', segmentLabel: null },
      half: { status: 'live', segmentLabel: 'Halftime' },
      later: { status: 'scheduled', segmentLabel: null },
    }
    const total = liveProjected(
      [
        // A dud: 4.2 against 15 projected counts as 4.2, not 15.
        player(4.2, 15, 'done'),
        // Halfway: 10 so far, half of 12 still to come.
        player(10, 12, 'half'),
        player(null, 18.5, 'later'),
      ],
      (p) => games[p.teamId!],
    )
    expect(total).toBe(4.2 + 10 + 6 + 18.5)
  })

  it('falls back to points, else the projection, without a known Game', () => {
    expect(
      liveProjected(
        [player(7, 12, 'x'), player(null, 9, 'y')],
        () => undefined,
      ),
    ).toBe(16)
    expect(liveProjected([player(null, null, 'x')], () => undefined)).toBeNull()
  })
})
