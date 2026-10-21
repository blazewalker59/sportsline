/** Running NBA box stats used to recognize one-time Fantasy milestones. */
export interface BasketballStats {
  points: number
  rebounds: number
  assists: number
  steals: number
  blocks: number
}

export type BasketballMilestone =
  | 'points-20'
  | 'points-30'
  | 'points-40'
  | 'rebounds-10'
  | 'assists-10'
  | 'steals-5'
  | 'blocks-4'
  | 'double-double'
  | 'triple-double'

export const BASKETBALL_MILESTONE_CREDIT = 'fantasy:'

export function emptyBasketballStats(): BasketballStats {
  return { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 }
}

const doubleFigures = (s: BasketballStats) =>
  Object.values(s).filter((value) => value >= 10).length

/** Milestones crossed between two consecutive plays, never ones already met. */
export function basketballMilestones(
  before: BasketballStats,
  after: BasketballStats,
): Array<BasketballMilestone> {
  const found: Array<BasketballMilestone> = []
  for (const threshold of [20, 30, 40] as const) {
    if (before.points < threshold && after.points >= threshold) {
      found.push(`points-${threshold}`)
    }
  }
  if (before.rebounds < 10 && after.rebounds >= 10) found.push('rebounds-10')
  if (before.assists < 10 && after.assists >= 10) found.push('assists-10')
  if (before.steals < 5 && after.steals >= 5) found.push('steals-5')
  if (before.blocks < 4 && after.blocks >= 4) found.push('blocks-4')
  const beforeDoubles = doubleFigures(before)
  const afterDoubles = doubleFigures(after)
  if (beforeDoubles < 2 && afterDoubles >= 2) found.push('double-double')
  if (beforeDoubles < 3 && afterDoubles >= 3) found.push('triple-double')
  return found
}

export const BASKETBALL_MILESTONE_LABEL: Record<BasketballMilestone, string> = {
  'points-20': '20 points',
  'points-30': '30 points',
  'points-40': '40 points',
  'rebounds-10': 'Boardman (10 REB)',
  'assists-10': 'Feed machine (10 AST)',
  'steals-5': 'Steal machine (5 STL)',
  'blocks-4': 'Block monster (4 BLK)',
  'double-double': 'Double-double',
  'triple-double': 'Triple-double',
}

export const isBasketballMilestone = (
  value: string,
): value is BasketballMilestone => value in BASKETBALL_MILESTONE_LABEL
