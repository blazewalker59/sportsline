/**
 * Which part of a category Matchup the sheet shows: one of its days,
 * stepped through with ‹ ›, or the whole matchup so far (Summary). Tapping
 * the day's name opens every choice at once, as dreamteam's day pills do.
 */

import { useState } from 'react'
import { dayLabel, daySportsDay } from './format'
import type { MatchupView } from '@/lib/fantasy/matchup'
import { cn } from '@/lib/utils'
import { formatDay, shortDay } from '@/lib/time/format'

/** A day (its scoring period), or the whole matchup. */
export type MatchupPart = number | 'summary'

const arrow =
  'key grid size-9 shrink-0 place-items-center rounded-control text-xl leading-none font-semibold disabled:opacity-30'

export function MatchupDays({
  m,
  days,
  part,
  onPart,
  summary,
}: {
  m: Pick<MatchupView, 'scoringPeriod' | 'days'>
  /** The days to step through, first to last. */
  days: ReadonlyArray<number>
  part: MatchupPart
  onPart: (part: MatchupPart) => void
  /** Whether there's a summary to show. */
  summary: boolean
}) {
  const [open, setOpen] = useState(false)
  const at = part === 'summary' ? -1 : days.indexOf(part)
  const pick = (p: MatchupPart) => {
    onPart(p)
    setOpen(false)
  }
  const name = part === 'summary' ? 'Summary' : dayLabel(m, part)
  const detail =
    part === 'summary'
      ? 'The whole matchup so far'
      : m.days?.includes(part)
        ? `Day ${m.days.indexOf(part) + 1} of ${m.days.length}`
        : 'Before the matchup'
  return (
    <div className="flex flex-col gap-1.5">
      <nav
        aria-label="Matchup day"
        className="well flex items-center gap-1.5 rounded-[14px] p-1.5"
      >
        <button
          type="button"
          aria-label="Previous day"
          disabled={at <= 0}
          onClick={() => onPart(days[at - 1])}
          className={arrow}
        >
          ‹
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${name}: choose a day or the summary`}
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 flex-col items-center rounded-control py-0.5 leading-tight hover:bg-surface/60"
        >
          <span className="text-sm font-semibold" aria-live="polite">
            {name}
            <span aria-hidden="true" className="ml-1 text-3xs text-muted">
              {open ? '▴' : '▾'}
            </span>
          </span>
          <span className="text-3xs text-muted tabular-nums uppercase">
            {detail}
          </span>
        </button>
        <button
          type="button"
          aria-label="Next day"
          disabled={at < 0 || at >= days.length - 1}
          onClick={() => onPart(days[at + 1])}
          className={arrow}
        >
          ›
        </button>
      </nav>
      {open && (
        <div
          role="listbox"
          aria-label="Matchup days"
          className="well flex gap-1.5 overflow-x-auto rounded-[14px] p-1.5 pb-2"
        >
          {matchupChoices(m, days, summary).map((c) => (
            <Pill
              key={c.part}
              selected={part === c.part}
              today={c.part === m.scoringPeriod}
              onClick={() => pick(c.part)}
              top={c.top}
              bottom={c.bottom}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The choices when the day is tapped: the summary first (when there is
 * one), then each day as "Mon" over "Oct 13", today as "Today".
 */
export function matchupChoices(
  m: Pick<MatchupView, 'scoringPeriod'>,
  days: ReadonlyArray<number>,
  summary: boolean,
  now: Date = new Date(),
): Array<{ part: MatchupPart; top: string; bottom: string }> {
  return [
    ...(summary
      ? [{ part: 'summary' as const, top: 'Summary', bottom: 'All days' }]
      : []),
    ...days.map((d) => {
      const day = daySportsDay(m, d, now)
      return {
        part: d,
        top:
          d === m.scoringPeriod
            ? 'Today'
            : formatDay(day, { weekday: 'short' }),
        bottom: shortDay(day),
      }
    }),
  ]
}

function Pill({
  selected,
  today = false,
  onClick,
  top,
  bottom,
}: {
  selected: boolean
  today?: boolean
  onClick: () => void
  top: string
  bottom: string
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'key flex shrink-0 flex-col items-center rounded-control px-2.5 py-1 leading-tight',
        selected ? 'key-pressed font-bold' : !today && 'text-muted',
      )}
    >
      <span className="text-3xs uppercase">{top}</span>
      <span className="text-3xs tabular-nums opacity-75">{bottom}</span>
    </button>
  )
}
