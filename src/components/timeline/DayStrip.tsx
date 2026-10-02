import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { shiftSportsDay } from '@/lib/model/sportsDay'
import { BACKFILL_DAYS } from '@/lib/timeline/days'
import { cn } from '@/lib/utils'

function chip(
  sportsDay: string,
  today: string,
): { top: string; bottom: string } {
  if (sportsDay === today) return { top: 'Today', bottom: '' }
  if (sportsDay === shiftSportsDay(today, -1))
    return { top: 'Yest', bottom: '' }
  const d = new Date(`${sportsDay}T12:00:00Z`)
  return {
    top: d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    bottom: d.toLocaleDateString(undefined, {
      day: 'numeric',
      timeZone: 'UTC',
    }),
  }
}

/**
 * The last few weeks as a swipeable strip of day chips ending at Today,
 * like a calendar app's week strip. The selected day stays scrolled into
 * view; switching days is a View Transition.
 */
export function DayStrip({
  sportsDay,
  today,
  onPick,
}: {
  sportsDay: string
  today: string
  /** Called when a day is chosen (the header's day picker closes). */
  onPick?: () => void
}) {
  const days = Array.from({ length: BACKFILL_DAYS + 1 }, (_, i) =>
    shiftSportsDay(today, i - BACKFILL_DAYS),
  )
  const selected = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    selected.current?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [sportsDay])
  return (
    <nav
      aria-label="Sports Day"
      className="-mx-4 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none]"
    >
      <ol className="flex w-max gap-1">
        {days.map((day) => {
          const label = chip(day, today)
          const isSelected = day === sportsDay
          return (
            <li key={day}>
              <Link
                ref={isSelected ? selected : undefined}
                to="/"
                search={day === today ? {} : { day }}
                viewTransition
                resetScroll={false}
                onClick={onPick}
                aria-current={isSelected ? 'date' : undefined}
                aria-label={new Date(`${day}T12:00:00Z`).toLocaleDateString(
                  undefined,
                  {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  },
                )}
                className={cn(
                  'flex h-11 min-w-11 flex-col items-center justify-center rounded-xl px-2 leading-none transition-colors',
                  isSelected
                    ? 'bg-foreground text-background'
                    : 'text-muted hover:bg-notice hover:text-foreground',
                )}
              >
                <span className="text-[11px] font-semibold">{label.top}</span>
                {label.bottom && (
                  <span className="mt-0.5 text-[15px] font-bold">
                    {label.bottom}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
