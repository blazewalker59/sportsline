/**
 * Placeholders shaped like the content on its way, so a screen keeps its
 * layout while it loads instead of flashing "Loading…". In Signal they are
 * empty slots pressed into the aluminum (the well's tone and inner shade),
 * on the page and in a panel alike, waiting for their part. They pulse only
 * for Viewers who haven't asked for reduced motion, and are hidden from
 * assistive tech behind one "Loading" label.
 */

import { cn } from '@/lib/utils'

/** One recessed slot; size and shape come from `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      data-skeleton=""
      className={cn(
        // The well's tone and shade, so it reads as a slot on the page
        // and on a panel alike.
        'block rounded-control bg-notice shadow-[inset_0_1px_2px_var(--key-shade)] motion-safe:animate-pulse',
        className,
      )}
    />
  )
}

/**
 * One "Loading" status around blocks laid out by hand, for a screen whose
 * shape none of the ready-made skeletons below matches.
 */
export function SkeletonStatus(props: {
  label?: string
  className?: string
  children: React.ReactNode
}) {
  return <Loading label="Loading" {...props} />
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

/**
 * Plays as chat bubbles, like the Timeline, a Player's plays or Reactions:
 * a team avatar at the foot of each, a caption line, then the bubble.
 */
export function BubblesSkeleton({
  rows = 4,
  label = 'Loading',
  className,
}: {
  rows?: number
  label?: string
  className?: string
}) {
  // Bubbles of a few sizes, so it reads as a conversation, not a grid.
  const shapes = ['h-16 w-4/5', 'h-11 w-3/5', 'h-20 w-11/12', 'h-11 w-2/3']
  return (
    <Loading label={label} className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-skeleton-row="" className="flex items-end gap-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex max-w-[300px] min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="mx-1 h-3 w-28" />
            <Skeleton
              className={cn(
                'rounded-sheet rounded-bl-control',
                shapes[i % shapes.length],
              )}
            />
          </div>
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
