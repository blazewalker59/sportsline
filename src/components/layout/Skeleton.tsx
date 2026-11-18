/**
 * Placeholders shaped like the content on its way, so a screen keeps its
 * layout while it loads instead of flashing "Loading…". They pulse only
 * for Viewers who haven't asked for reduced motion, and are hidden from
 * assistive tech behind one "Loading" label.
 */

import { cn } from '@/lib/utils'

/** One grey block; size and shape come from `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      data-skeleton=""
      className={cn(
        // A wash of the ink, so it reads on the page and on a card alike.
        'block rounded-control bg-foreground/10 motion-safe:animate-pulse',
        className,
      )}
    />
  )
}

function Loading({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={className}
    >
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  )
}

/** A list of rows, like Reactions, Alerts or a roster: avatar, two lines. */
export function RowsSkeleton({
  rows = 5,
  label = 'Loading',
  className,
}: {
  rows?: number
  label?: string
  className?: string
}) {
  return (
    <Loading
      label={label}
      className={cn(
        'flex flex-col divide-y divide-border rounded-card border border-border bg-surface',
        className,
      )}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          data-skeleton-row=""
          className="flex items-center gap-3 p-3"
        >
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Vary the widths a little so it reads as text, not bars. */}
            <Skeleton className={cn('h-3.5', i % 2 ? 'w-3/5' : 'w-4/5')} />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </Loading>
  )
}

/** A card, like a Prediction, a Matchup or a box score: title, lines, footer. */
export function CardSkeleton({
  label = 'Loading',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <Loading
      label={label}
      className={cn(
        'flex flex-col gap-3 rounded-card border border-border bg-surface p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-3/5" />
      <div className="mt-1 flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </Loading>
  )
}

/** The top of a Player or Team page: big avatar, name, a line, a pill. */
export function DetailHeaderSkeleton({
  label = 'Loading',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <Loading label={label} className={cn('flex items-center gap-4', className)}>
      <Skeleton className="size-22 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-6 w-3/5" />
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="mt-1 h-8 w-24 rounded-full" />
      </div>
    </Loading>
  )
}
