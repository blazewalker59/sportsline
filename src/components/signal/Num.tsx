/**
 * A number set in dots (Signal's Doto): the figure a screen is about, such
 * as a score, a portfolio's worth or a Matchup's points. Doto's punctuation
 * is redrawn as plain dots (scripts/fonts/doto-punctuation.py), so a value
 * like "3:41" or "$412.80" reads as written. A unit (%, ¢, pts) is set
 * small beside it, in the label face, since Doto's are hard to read.
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
        'font-dots leading-[0.85] font-black tracking-[-0.02em] tabular-nums',
        className,
      )}
    >
      {children}
      {unit && <span className="num-unit">{unit}</span>}
    </span>
  )
}
