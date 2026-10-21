/** A small row of choices, one picked: a view's sub-tabs. */

import { cn } from '@/lib/utils'

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: ReadonlyArray<{ key: T; label: string }>
  value: T
  onChange: (key: T) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex gap-1 overflow-x-auto', className)}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'min-h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors',
            value === o.key
              ? 'bg-foreground text-background'
              : 'bg-notice text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
