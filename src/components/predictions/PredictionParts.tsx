/**
 * Predictions (CONTEXT.md), the pieces their card, sheet and portfolio
 * share: money and Odds formatting, the Odds sparkline, Leg dots and a stat
 * Leg's Progress.
 */

import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { LegView, PredictionView } from '@/lib/kalshi/predictionViews'
import type { Progress } from '@/lib/kalshi/props'
import type { GameSummary } from '@/lib/model/timeline'
import { Meter } from '@/components/signal/Meter'
import { isLiveGame } from '@/lib/timeline/stakes'
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

/** Money's tone: made is positive, lost negative (never the live orange). */
export const toneOf = (n: number) =>
  n > 0.004 ? 'text-positive' : n < -0.004 ? 'text-negative' : 'text-muted'

/** ▲ made, ▼ lost, · even. */
export const arrowOf = (n: number) => (n > 0.004 ? '▲' : n < -0.004 ? '▼' : '·')

/** A Prediction riding on a Game being played now. */
export const isLivePrediction = (p: Pick<PredictionView, 'legs' | 'status'>) =>
  p.status === 'open' && p.legs.some((l) => l.game && isLiveGame(l.game))

/** A Leg's state as a glyph: ● won, ○ lost (unlit), ◐ still to play. */
export const legGlyph = (status: LegView['status']) =>
  status === 'won' ? '●' : status === 'lost' ? '○' : '◐'

/** Odds over time as an ink line, with where the Viewer got in dashed. */
export function Sparkline({
  points,
  entry,
  width = 96,
  height = 28,
  live = false,
}: {
  points: ReadonlyArray<{ chance: number }>
  entry: number | null
  width?: number
  height?: number
  /** Its Game is on: the latest point is lit. */
  live?: boolean
}) {
  if (points.length < 2) return null
  const y = (c: number) => height - 2 - c * (height - 4)
  const step = width / (points.length - 1)
  const line = points
    .map((p, i) => `${(i * step).toFixed(1)},${y(p.chance).toFixed(1)}`)
    .join(' ')
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
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="text-foreground"
      />
      {live && (
        <circle
          cx={width}
          cy={y(points.at(-1)!.chance)}
          r="2.5"
          className="fill-signal"
        />
      )}
    </svg>
  )
}

/** Dots a Combo card shows before the rest collapse into "+K". */
export const MAX_LEG_DOTS = 6

/**
 * A glyph per Leg by status (● won, ◐ to play, ○ lost). A big Combo (16
 * Legs) would run past the card's fixed width, so past MAX_LEG_DOTS the
 * rest read as "+K".
 */
export function LegDots({ legs }: { legs: ReadonlyArray<LegView> }) {
  const shown = legs.slice(0, MAX_LEG_DOTS)
  const rest = legs.length - shown.length
  return (
    <span
      className="flex min-w-0 shrink items-center gap-1 overflow-hidden text-[11px] leading-none"
      aria-hidden="true"
    >
      {shown.map((l, i) => (
        <span
          key={i}
          data-leg-dot=""
          data-status={l.status}
          className={cn(
            'w-3 shrink-0 text-center',
            l.status === 'lost' ? 'text-muted' : 'text-foreground',
          )}
        >
          {legGlyph(l.status)}
        </span>
      ))}
      {rest > 0 && (
        <span className="shrink-0 font-label text-3xs tabular-nums">
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
 * A stat prop's count against its line (Progress): a segmented meter
 * filling as it climbs, "212 of 300 rec yds" under it, a check once the
 * line is reached.
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
    <span className="flex flex-col gap-1">
      <Meter
        value={share}
        segments={compact ? 16 : 20}
        thin={compact}
        label={`${progress.current} of ${progress.target} ${progress.label}`}
      />
      <span className="flex items-baseline justify-between gap-2 text-3xs text-muted uppercase tabular-nums">
        <span className={cn(hit && 'font-bold text-foreground')}>
          {hit && '✓ '}
          {progress.current} of {progress.target} {progress.label}
        </span>
        {!hit && !compact && (
          <span>{progress.target - progress.current} to go</span>
        )}
      </span>
    </span>
  )
}

/**
 * A Prediction's Odds as a segmented meter, with the label row a manual
 * would print under it: Odds now · got in at · cash out.
 */
export function OddsMeter({
  prediction: p,
  thin,
  segments = 24,
}: {
  prediction: PredictionView
  thin?: boolean
  segments?: number
}) {
  if (p.chance === null) return null
  return (
    <span className="flex flex-col gap-1.5">
      <Meter
        value={p.chance}
        segments={segments}
        thin={thin}
        label={`Odds ${pct(p.chance)}`}
      />
      <span className="flex justify-between gap-2 text-3xs text-muted uppercase tabular-nums">
        <span>Odds {pct(p.chance)}</span>
        {p.entryChance !== null && <span>Got in at {pct(p.entryChance)}</span>}
        <span>Cash out {p.value === null ? '—' : money(p.value)}</span>
      </span>
    </span>
  )
}
