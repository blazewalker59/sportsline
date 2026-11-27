/**
 * A section's head (Signal): an optional index like a manual's ("A1"), its
 * name in the label face, a hairline to the edge, and a reading or control
 * at the end. The `as` heading level keeps the page's outline.
 */

import { cn } from '@/lib/utils'

export function SectionLabel({
  title,
  index,
  children,
  as: Heading = 'h2',
  className,
}: {
  title: React.ReactNode
  /** "A1", "E2": where the section sits on its screen. */
  index?: string
  /** At the end of the rule: a count, a picker, a link. */
  children?: React.ReactNode
  as?: 'h2' | 'h3'
  className?: string
}) {
  return (
    <div className={cn('mb-2 flex min-h-8 items-center gap-2.5', className)}>
      {index && (
        <span
          aria-hidden="true"
          className="rounded-[5px] border border-border px-1.5 font-label text-[10px] leading-4 text-muted"
        >
          {index}
        </span>
      )}
      <Heading className="shrink-0 text-3xs font-bold text-foreground/80 uppercase">
        {title}
      </Heading>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border" />
      {children && (
        <div className="flex shrink-0 items-center text-3xs text-muted">
          {children}
        </div>
      )}
    </div>
  )
}
