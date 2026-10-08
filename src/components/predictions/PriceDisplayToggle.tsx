/**
 * Kalshi prices as cents (54¢) or as a payout multiplier after the fee
 * (1.79x). One setting for the app and the Viewer's Agents.
 */

import type { PriceDisplay } from '@/lib/model/price'
import { usePriceDisplay, useSetPriceDisplay } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

const OPTIONS: Array<[PriceDisplay, string]> = [
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
        <span className="block text-[11px]">
          {display === 'multiplier'
            ? 'What $1 pays back, after Kalshi’s fee: 1.79x'
            : 'What a contract costs: 54¢'}
        </span>
      </span>
      <span
        role="radiogroup"
        aria-label="Show prices as"
        className="flex gap-1 rounded-full bg-notice p-1"
      >
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={display === value}
            onClick={() => set.mutate(value)}
            className={cn(
              'min-h-8 rounded-full px-3 text-[13px] font-semibold transition-colors',
              display === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted',
            )}
          >
            {label}
          </button>
        ))}
      </span>
    </section>
  )
}
