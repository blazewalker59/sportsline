/**
 * The figure a screen is about (Signal): a score, a clock, a portfolio's
 * worth, a Matchup's points. Inter at its heaviest, tightly set, with
 * tabular figures so a changing score doesn't shift. Never the dot matrix:
 * numbers and scores are always read in Inter. A unit (%, ¢, pts) is set
 * small beside it, in the label face.
 */

import { cn } from '@/lib/utils'

export function Num({
  children,
  unit,
  className,
  title,
}: {
  children: React.ReactNode
  unit?: string
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'font-sans leading-[0.9] font-extrabold tracking-[-0.035em] tabular-nums',
        className,
      )}
    >
      {children}
      {unit && <span className="num-unit">{unit}</span>}
    </span>
  )
}
