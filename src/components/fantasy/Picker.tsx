/**
 * The league page's quiet controls: a section's heading with its choices
 * beside it, each a small dropdown (a native select, so phones show their
 * own picker) rather than another row of chips.
 */

import { cn } from '@/lib/utils'

export function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** What it picks, for screen readers ("Position"). */
  label: string
  options: ReadonlyArray<{ key: T; label: string }>
  value: T
  onChange: (key: T) => void
  className?: string
}) {
  return (
    <label className={cn('relative inline-flex shrink-0', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-8 cursor-pointer appearance-none rounded-lg bg-transparent py-1 pr-5 pl-1.5 text-xs font-semibold text-foreground hover:bg-notice focus-visible:bg-notice"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-1 size-3 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 4.5 6 7.5 9 4.5" />
      </svg>
    </label>
  )
}

/** A section's heading, its Pickers on the right. */
export function SectionHead({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-1.5 flex min-h-8 items-center justify-between gap-2">
      <h2 className="min-w-0 truncate text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {children && (
        <div className="-mr-1.5 flex shrink-0 items-center">{children}</div>
      )}
    </div>
  )
}
