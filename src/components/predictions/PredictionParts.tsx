/**
 * Predictions (CONTEXT.md), the pieces their card, sheet and portfolio
 * share: money and Odds formatting, the Odds sparkline, Leg dots and a stat
 * Leg's Progress.
 */

import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { LegView, PredictionView } from '@/lib/kalshi/predictionViews'
import type { Progress } from '@/lib/kalshi/props'
import type { GameSummary } from '@/lib/model/timeline'
import { cn } from '@/lib/utils'

export const pct = (n: number) => `${Math.round(n * 100)}%`
export const money = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`

/** The change in a Prediction's Odds since the Viewer got in, in points. */
export function movement(p: PredictionView): number | null {
  if (p.chance === null || p.entryChance === null) return null
  return Math.round((p.chance - p.entryChance) * 100)
}

/** What cashing out now would make or lose, in dollars and as a return. */
export function profitOf(
  p: Pick<PredictionView, 'value' | 'cost'>,
): { dollars: number; percent: number | null } | null {
  if (p.value === null) return null
  const dollars = p.value - p.cost
  return { dollars, percent: p.cost > 0 ? dollars / p.cost : null }
}

/** "+$3.40" / "−$1.10", or "+27%" / "−12%". */
export function profitText(
  profit: { dollars: number; percent: number | null },
  display: ChangeDisplay,
): string {
  if (display === 'percent' && profit.percent !== null) {
    const n = Math.round(profit.percent * 100)
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`
  }
  const sign = profit.dollars > 0.004 ? '+' : profit.dollars < -0.004 ? '−' : ''
  return `${sign}$${Math.abs(profit.dollars).toFixed(2)}`
}

export const toneOf = (n: number) =>
  n > 0.004 ? 'text-scoring' : n < -0.004 ? 'text-live' : 'text-muted'

/** Odds over time as a line, with where the Viewer got in dashed. */
export function Sparkline({
  points,
  entry,
  width = 96,
  height = 28,
}: {
  points: ReadonlyArray<{ chance: number }>
  entry: number | null
  width?: number
  height?: number
}) {
  if (points.length < 2) return null
  const y = (c: number) => height - 2 - c * (height - 4)
  const step = width / (points.length - 1)
  const line = points
    .map((p, i) => `${(i * step).toFixed(1)},${y(p.chance).toFixed(1)}`)
    .join(' ')
  const up = points.at(-1)!.chance >= points[0].chance
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      {entry !== null && (
        <line
          x1="0"
          x2={width}
          y1={y(entry)}
          y2={y(entry)}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeDasharray="3 3"
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        className={up ? 'text-scoring' : 'text-live'}
      />
    </svg>
  )
}

/** Dots a Combo card shows before the rest collapse into "+K". */
export const MAX_LEG_DOTS = 6

/**
 * A dot per Leg, colored by status. A big Combo (16 Legs) would run past the
 * card's fixed width, so past MAX_LEG_DOTS the rest read as "+K".
 */
export function LegDots({ legs }: { legs: ReadonlyArray<LegView> }) {
  const shown = legs.slice(0, MAX_LEG_DOTS)
  const rest = legs.length - shown.length
  return (
    <span
      className="flex min-w-0 shrink items-center gap-0.5 overflow-hidden"
      aria-hidden="true"
    >
      {shown.map((l, i) => (
        <span
          key={i}
          data-leg-dot=""
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            l.status === 'won'
              ? 'bg-scoring'
              : l.status === 'lost'
                ? 'bg-live'
                : 'bg-muted/40',
          )}
        />
      ))}
      {rest > 0 && (
        <span className="shrink-0 text-[10px] leading-none tabular-nums">
          +{rest}
        </span>
      )}
    </span>
  )
}

/** The Game a Prediction (or its first Leg) is about, for its header. */
export function leadGame(p: PredictionView): GameSummary | null {
  return p.legs.find((l) => l.game)?.game ?? null
}

/**
 * A stat prop's count against its line: "212 / 300 rec yds", filling as it
 * climbs, a check once the line is reached.
 */
export function PropProgress({
  progress,
  compact,
}: {
  progress: Progress
  compact?: boolean
}) {
  const hit = progress.current >= progress.target
  const share = Math.min(1, progress.current / Math.max(1, progress.target))
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          'flex items-baseline justify-between gap-2 tabular-nums',
          compact ? 'text-[11px]' : 'text-xs',
        )}
      >
        <span className={cn('font-semibold', hit && 'text-scoring')}>
          {hit && '✓ '}
          {progress.current}
          <span className="font-normal text-muted">
            {' '}
            / {progress.target} {progress.label}
          </span>
        </span>
        {!hit && !compact && (
          <span className="text-muted">
            {progress.target - progress.current} to go
          </span>
        )}
      </span>
      <span
        className="h-1.5 overflow-hidden rounded-full bg-notice"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.target}
        aria-valuenow={progress.current}
        aria-label={`${progress.current} of ${progress.target} ${progress.label}`}
      >
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-500',
            hit ? 'bg-scoring' : 'bg-accent',
          )}
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </span>
  )
}
