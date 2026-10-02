import { shiftSportsDay } from '@/lib/model/sportsDay'
import { cn } from '@/lib/utils'

export function dayLabel(sportsDay: string, today: string): string {
  if (sportsDay === today) return 'Today'
  if (sportsDay === shiftSportsDay(today, -1)) return 'Yesterday'
  return new Date(`${sportsDay}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** The header's title: the Sports Day on screen; opens the day chips. */
export function DayButton({
  sportsDay,
  today,
  open,
  onToggle,
}: {
  sportsDay: string
  today: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${dayLabel(sportsDay, today)}. Choose a day`}
      className="-ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-lg font-extrabold tracking-tight hover:bg-notice"
    >
      {dayLabel(sportsDay, today)}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn(
          'text-muted transition-transform duration-200',
          open && 'rotate-180',
        )}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  )
}
