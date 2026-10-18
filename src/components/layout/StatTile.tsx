/**
 * A row of headline numbers (a Record's volume and results, the Sharp
 * picks' record, an Agent's trend picks): small label, the number, and an
 * optional note under it, in a ruled grid of three.
 */

import { cn } from '@/lib/utils'

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
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
    <div className="flex flex-col bg-surface px-3 py-2">
      <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      <span
        className={cn(
          'text-lg leading-tight font-bold tabular-nums',
          className,
        )}
      >
        {value}
      </span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  )
}
