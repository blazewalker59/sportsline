/**
 * A segmented choice (Signal): its options in a recessed well, the current
 * one a key cap pressed in. A radio group to assistive tech. Shared by the
 * Predictions, Agents and Alerts screens.
 */

import { cn } from '@/lib/utils'

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  fill = false,
}: {
  /** The group's name for a screen reader. */
  label: string
  value: T | null | undefined
  /** Each option: its value, what the key shows, and (when the key shows
   *  a short form) its full name for a screen reader. */
  options: ReadonlyArray<
    readonly [T, React.ReactNode] | readonly [T, React.ReactNode, string]
  >
  onChange: (value: T) => void
  className?: string
  /** Spread the options across the full width. */
  fill?: boolean
}) {
  return (
    <span
      role="radiogroup"
      aria-label={label}
      className={cn(
        'well grid auto-cols-fr grid-flow-col gap-1 rounded-control p-1',
        // Inline, it keeps its labels' width: the text beside it wraps
        // instead (a longer description must never squeeze a key).
        fill ? 'w-full' : 'inline-grid shrink-0',
        className,
      )}
    >
      {options.map(([v, text, name]) => {
        const checked = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={name}
            onClick={() => onChange(v)}
            className={cn(
              'min-h-8 rounded-[8px] px-2.5 text-3xs leading-tight font-bold whitespace-nowrap uppercase',
              checked
                ? 'key key-pressed text-foreground'
                : 'text-muted hover:text-foreground',
            )}
          >
            {text}
          </button>
        )
      })}
    </span>
  )
}
