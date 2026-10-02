import { Link } from '@tanstack/react-router'
import { shiftSportsDay } from '@/lib/model/sportsDay'
import { BACKFILL_DAYS } from '@/lib/timeline/days'
import { cn } from '@/lib/utils'

function label(sportsDay: string, today: string): string {
  if (sportsDay === today) return 'Today'
  if (sportsDay === shiftSportsDay(today, -1)) return 'Yesterday'
  return new Date(`${sportsDay}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** ‹ Sports Day › with a way back to today. Days live in the URL (`?day=`). */
export function DayBar({
  sportsDay,
  today,
}: {
  sportsDay: string
  today: string
}) {
  const previous = shiftSportsDay(sportsDay, -1)
  const next = shiftSportsDay(sportsDay, 1)
  const oldest = shiftSportsDay(today, -BACKFILL_DAYS)
  const isToday = sportsDay === today
  const arrow =
    'flex size-11 items-center justify-center rounded-full text-muted hover:bg-notice hover:text-foreground'
  return (
    <nav aria-label="Sports Day" className="mb-3 flex items-center gap-1">
      {previous >= oldest ? (
        <Link
          to="/"
          search={{ day: previous }}
          aria-label="Previous day"
          className={arrow}
        >
          <Chevron direction="left" />
        </Link>
      ) : (
        <span className={cn(arrow, 'opacity-30')} aria-hidden="true">
          <Chevron direction="left" />
        </span>
      )}
      <span className="min-w-28 text-center text-sm font-bold">
        {label(sportsDay, today)}
      </span>
      {isToday ? (
        <span className={cn(arrow, 'opacity-30')} aria-hidden="true">
          <Chevron direction="right" />
        </span>
      ) : (
        <Link
          to="/"
          search={next >= today ? {} : { day: next }}
          aria-label="Next day"
          className={arrow}
        >
          <Chevron direction="right" />
        </Link>
      )}
      {!isToday && (
        <Link
          to="/"
          search={{}}
          className="ml-auto flex min-h-11 items-center rounded-full bg-accent-soft px-4 text-[13px] font-semibold text-accent"
        >
          Back to today
        </Link>
      )}
    </nav>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}
