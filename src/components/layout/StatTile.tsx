/**
 * A row of headline numbers (a Record's volume and results, the Sharp
 * picks' record, an Agent's trend picks), Signal style: a panel of dot
 * numerals in threes, each over its label in the manual's face and an
 * optional note.
 */

import { Num } from '@/components/signal/Num'
import { cn } from '@/lib/utils'

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 rounded-card bg-surface p-4">
      {children}
    </div>
  )
}

export function StatTile({
  label,
  value,
  sub,
  className,
}: {
  label: string
  value: string
  sub?: string
  /** On the number (a profit's tone). */
  className?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-stat-tile="">
      <Num className={cn('text-[24px] whitespace-nowrap', className)}>
        {value}
      </Num>
      <span className="flex flex-col gap-0.5">
        <span className="truncate text-3xs text-muted uppercase">{label}</span>
        {sub && <span className="truncate text-2xs text-muted">{sub}</span>}
      </span>
    </div>
  )
}
