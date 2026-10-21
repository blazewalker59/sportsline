import { describe, expect, it } from 'vitest'
import {
  basketballMilestones,
  emptyBasketballStats,
} from '@/lib/fantasy/basketballMilestones'

describe('basketballMilestones', () => {
  it('marks each scoring threshold only when it is crossed', () => {
    expect(
      basketballMilestones(
        { ...emptyBasketballStats(), points: 19 },
        { ...emptyBasketballStats(), points: 21 },
      ),
    ).toContain('points-20')
    expect(
      basketballMilestones(
        { ...emptyBasketballStats(), points: 20 },
        { ...emptyBasketballStats(), points: 22 },
      ),
    ).not.toContain('points-20')
  })

  it('marks the specialty thresholds', () => {
    const before = {
      points: 8,
      rebounds: 9,
      assists: 9,
      steals: 4,
      blocks: 3,
    }
    expect(
      basketballMilestones(before, {
        points: 8,
        rebounds: 10,
        assists: 10,
        steals: 5,
        blocks: 4,
      }),
    ).toEqual(
      expect.arrayContaining([
        'rebounds-10',
        'assists-10',
        'steals-5',
        'blocks-4',
      ]),
    )
  })

  it('marks the first double-double and triple-double', () => {
    expect(
      basketballMilestones(
        { points: 12, rebounds: 9, assists: 8, steals: 1, blocks: 0 },
        { points: 12, rebounds: 10, assists: 8, steals: 1, blocks: 0 },
      ),
    ).toContain('double-double')
    expect(
      basketballMilestones(
        { points: 12, rebounds: 10, assists: 9, steals: 1, blocks: 0 },
        { points: 12, rebounds: 10, assists: 10, steals: 1, blocks: 0 },
      ),
    ).toContain('triple-double')
  })
})
