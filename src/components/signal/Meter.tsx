/**
 * A segmented meter (Signal): a row of wells, filled in ink up to the
 * value, the last filled one lit orange. For a share of something: a win
 * chance, a Matchup's points against its projection, a Leg's Progress.
 */

import { cn } from '@/lib/utils'

export function Meter({
  value,
  segments = 24,
  label,
  className,
  thin = false,
}: {
  /** 0 to 1. */
  value: number
  segments?: number
  /** What a screen reader hears: the meter's name. */
  label: string
  className?: string
  thin?: boolean
}) {
  const share = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const filled = Math.round(share * segments)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      className={cn('grid gap-[3px]', className)}
      style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cn('meter-seg', thin ? 'h-1.5' : 'h-3')}
          data-on={i < filled ? '' : undefined}
          data-edge={i === filled - 1 ? '' : undefined}
        />
      ))}
    </div>
  )
}
