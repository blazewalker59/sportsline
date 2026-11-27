/**
 * Sportsline's mark (Signal): an S drawn on a 5×7 dot grid, one dot lit
 * orange for the Play happening now. Orange only ever means live, so the
 * mark is a status light as much as a logo. The wordmark sets the name in
 * the same dots, closing on an orange point.
 *
 * public/favicon.svg and the app icons are drawn from MARK_ROWS too
 * (scripts/icons.ts).
 */

import { cn } from '@/lib/utils'

/** The S, row by row: # is a dot, . is none, o is the lit one. */
export const MARK_ROWS = [
  '.####',
  '#....',
  '#....',
  '.###o',
  '....#',
  '....#',
  '####.',
] as const

const DOT = 10
const GAP = 4
const PITCH = DOT + GAP
const WIDTH = 5 * PITCH - GAP
const HEIGHT = 7 * PITCH - GAP

/** The dots as SVG circles, in currentColor and the signal orange. */
export function markCircles(
  ink = 'currentColor',
  lit = 'var(--signal, #ff4f00)',
): Array<{ cx: number; cy: number; r: number; fill: string }> {
  return MARK_ROWS.flatMap((row, r) =>
    [...row].flatMap((c, i) =>
      c === '.'
        ? []
        : [
            {
              cx: i * PITCH + DOT / 2,
              cy: r * PITCH + DOT / 2,
              r: DOT / 2,
              fill: c === 'o' ? lit : ink,
            },
          ],
    ),
  )
}

export function Mark({
  className,
  title,
}: {
  className?: string
  /** Named for a screen reader when it stands alone (else decorative). */
  title?: string
}) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn('h-[1em] w-auto', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {markCircles().map((d) => (
        <circle key={`${d.cx}-${d.cy}`} {...d} />
      ))}
    </svg>
  )
}

/** The mark and the name in dots: the header's link home. */
export function Wordmark({
  className,
  ...rest
}: { className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-[0.35em] font-dots leading-none font-black',
        className,
      )}
    >
      <Mark className="h-[1.05em]" />
      <span>
        sportsline<span className="text-signal">.</span>
      </span>
    </span>
  )
}
