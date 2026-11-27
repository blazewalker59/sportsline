/**
 * Kalshi prices as cents (54¢) or as a payout multiplier after the fee
 * (1.79x). One setting for the app and the Viewer's Agents.
 */

import type { PriceDisplay } from '@/lib/model/price'
import { Segmented } from '@/components/signal/Segmented'
import { usePriceDisplay, useSetPriceDisplay } from '@/lib/viewer/useViewer'

const OPTIONS: ReadonlyArray<readonly [PriceDisplay, string]> = [
  ['cents', 'Cents'],
  ['multiplier', 'Multiplier'],
]

export function PriceDisplayToggle() {
  const display = usePriceDisplay()
  const set = useSetPriceDisplay()
  return (
    <section className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        Show prices as
        <span className="block text-2xs">
          {display === 'multiplier'
            ? 'What $1 pays back, after Kalshi’s fee: 1.79x'
            : 'What a contract costs: 54¢'}
        </span>
      </span>
      <Segmented
        label="Show prices as"
        value={display}
        options={OPTIONS}
        onChange={(v) => set.mutate(v)}
      />
    </section>
  )
}
