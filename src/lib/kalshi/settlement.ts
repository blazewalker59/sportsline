/** Settlement math for Kalshi results. Pure. */

import { dollars } from './markets'
import type { KalshiSettlement } from './client'

/**
 * What a settlement paid, in dollars. Kalshi's revenue (cents) when it
 * reports one; it has been seen as 0 on winning Combos, so a win with no
 * revenue pays its winning contracts at $1 each (or the market's
 * per-contract value).
 */
export function payoutOf(
  s: Pick<
    KalshiSettlement,
    'revenue' | 'value' | 'yes_count_fp' | 'no_count_fp'
  >,
  side: 'yes' | 'no',
  result: 'won' | 'lost' | 'void',
): number {
  const revenue = (s.revenue ?? 0) / 100
  if (revenue > 0 || result !== 'won') return revenue
  const winning = dollars(side === 'yes' ? s.yes_count_fp : s.no_count_fp)
  const perContract =
    typeof s.value === 'number' && s.value > 0 ? s.value / 100 : 1
  return winning * perContract
}
