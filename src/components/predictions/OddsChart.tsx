/**
 * A Prediction's odds over its whole life, for its sheet: the Viewer's
 * side's chance as a line (0–100%), a dashed rule at the chance they
 * bought in at, and the Scoring Plays in its Games as dots in the scoring
 * team's color, set on the line at the moment they happened, so a swing
 * shows its cause. Tap a dot for the play.
 */

import { areaY, defineChart, dot, lineY, ruleY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'
import type { PredictionDetail, PredictionMove } from '@/lib/kalshi/server'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { clockTime, pct, shortDate } from '@/components/charts/format'
import { usePredictionDetail } from '@/lib/kalshi/usePredictions'
import { cn } from '@/lib/utils'

interface OddsRow {
  kind: 'odds'
  t: number
  chance: number
}

interface PlayRow extends PredictionMove {
  kind: 'play'
  t: number
  /** The odds when it happened (the last point at or before it). */
  chance: number
}

const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]
/** A team without a color in our table still gets a visible dot. */
const NEUTRAL = 'var(--color-muted)'

/**
 * The chance axis: 0–100%, unless the Prediction never got near the top
 * half (a long-shot Combo at 4%), where a full axis would flatten every
 * swing; then 0 to a little above its peak, in 5-point steps.
 */
function chanceAxis(peak: number): { top: number; ticks: Array<number> } {
  if (peak > 0.4) return { top: 1, ticks: Y_TICKS }
  // Round steps: 5 points up to a 20% top, 10 above it.
  const step = peak * 1.25 <= 0.2 ? 0.05 : 0.1
  const top = Math.max(0.1, Math.ceil((peak * 1.25) / step) * step)
  const ticks: Array<number> = []
  for (let t = 0; t <= top + 1e-9; t += step)
    ticks.push(Math.round(t * 100) / 100)
  return { top, ticks }
}

/** About four evenly spaced times across the span. */
function timeTicks(start: number, end: number): Array<number> {
  if (end <= start) return [start]
  return Array.from({ length: 4 }, (_, i) => start + ((end - start) * i) / 3)
}

/** Minutes from kalshi_prices ("2026-10-04T19:42") or ISO instants → ms. */
const ms = (at: string) => Date.parse(at.length === 16 ? `${at}:00Z` : at)

export function OddsChart({ predictionId }: { predictionId: string }) {
  const detail = usePredictionDetail(predictionId)
  if (detail.isPending) {
    return (
      <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
        Loading the odds…
      </p>
    )
  }
  if (!detail.data || detail.data.history.length < 2) {
    return (
      <p className="rounded-xl border border-border bg-surface px-3 py-3 text-center text-xs text-muted">
        No odds history kept for this one.
      </p>
    )
  }
  return <OddsChartBody detail={detail.data} />
}

function OddsChartBody({ detail }: { detail: PredictionDetail }) {
  const rows = useMemo(() => {
    // One point per moment (the area can't stack two at one x): the last
    // wins, in time order.
    const byTime = new Map<number, OddsRow>()
    for (const h of detail.history)
      byTime.set(ms(h.at), { kind: 'odds', t: ms(h.at), chance: h.chance })
    return [...byTime.values()].sort((a, b) => a.t - b.t)
  }, [detail.history])
  const plays = useMemo(() => {
    const first = rows[0]
    return detail.moves.flatMap((m): Array<PlayRow> => {
      const t = ms(m.at)
      if (t < first.t || t > rows[rows.length - 1].t) return []
      let chance = first.chance
      for (const r of rows) {
        if (r.t > t) break
        chance = r.chance
      }
      return [{ ...m, kind: 'play', t, chance }]
    })
  }, [detail.moves, rows])

  const start = rows[0].t
  const end = rows[rows.length - 1].t
  const now = rows[rows.length - 1].chance
  const entry = detail.entryChance
  const move = entry === null ? null : Math.round((now - entry) * 100)
  const up = move === null ? now >= rows[0].chance : move >= 0
  const lineColor = up ? CHART_COLORS.good : CHART_COLORS.bad
  const axis = chanceAxis(Math.max(entry ?? 0, ...rows.map((r) => r.chance)))
  // Over a day and a half, label dates; within one, clock times.
  const formatTime = (t: number) =>
    end - start > 36 * 3_600_000
      ? shortDate(new Date(t))
      : clockTime(new Date(t))

  const definition = useMemo(() => {
    // One dot mark per scoring team: a dot's fill is constant.
    const byColor = new Map<string, Array<PlayRow>>()
    for (const p of plays) {
      const key = p.color ?? NEUTRAL
      byColor.set(key, [...(byColor.get(key) ?? []), p])
    }
    return defineChart({
      marks: [
        areaY(rows, {
          id: 'odds-area',
          x: 't',
          y: 'chance',
          fill: lineColor,
          fillOpacity: 0.12,
        }),
        ...(entry === null
          ? []
          : [
              ruleY([entry], {
                id: 'entry',
                stroke: 'currentColor',
                strokeOpacity: 0.45,
                strokeDasharray: '4 4',
              }),
            ]),
        lineY(rows, {
          id: 'odds',
          x: 't',
          y: 'chance',
          stroke: lineColor,
          strokeWidth: 2,
        }),
        ...[...byColor].map(([color, group], i) =>
          dot(group, {
            id: `plays-${i}`,
            x: 't',
            y: 'chance',
            r: 4.5,
            fill: color,
            // A ring, so a dark team color still shows on a dark card.
            stroke: 'var(--color-foreground)',
            strokeOpacity: 0.55,
            strokeWidth: 1.25,
          }),
        ),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          axis: {
            ticks: { values: timeTicks(start, end), format: formatTime },
          },
        },
        y: {
          scale: scaleLinear().domain([0, axis.top]),
          grid: true,
          axis: { ticks: { values: axis.ticks, format: pct } },
        },
      },
      tooltip: {
        use: tooltip,
        format(point) {
          const d = point.datum as Partial<PlayRow> & { t?: number }
          const when = d.t === undefined ? '' : clockTime(new Date(d.t))
          if (d.kind === 'play')
            return [
              `${when} · ${d.headline}${d.team ? ` · ${d.team}` : ''}`,
              d.description,
              `Odds then ${pct(d.chance!)}`,
            ].join('\n')
          if (d.kind === 'odds') return `${when} · ${pct(d.chance!)}`
          return entry === null ? '' : `You got in at ${pct(entry)}`
        },
      },
    })
    // formatTime only depends on start and end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, plays, lineColor, entry, start, end, axis.top])

  return (
    <ChartCard
      legend={[
        { label: 'Your odds', color: lineColor, shape: 'line' },
        ...(entry === null
          ? []
          : [
              {
                label: 'Got in',
                color: CHART_COLORS.muted,
                shape: 'line' as const,
              },
            ]),
        ...(plays.length > 0
          ? [
              {
                label: 'Scores',
                color: CHART_COLORS.foreground,
                shape: 'dot' as const,
              },
            ]
          : []),
      ]}
      headline={
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{pct(now)}</span>
          {move !== null && (
            <span
              className={cn(
                'ml-1 font-semibold',
                move > 0 ? 'text-scoring' : move < 0 ? 'text-live' : '',
              )}
            >
              · {move > 0 ? '▲' : move < 0 ? '▼' : ''}
              {Math.abs(move)} since you bought in
            </span>
          )}
        </span>
      }
    >
      <Chart
        definition={definition}
        height={170}
        initialWidth={340}
        ariaLabel={`Your odds moved from ${pct(rows[0].chance)} to ${pct(now)}${
          plays.length ? `, with ${plays.length} scoring plays marked` : ''
        }`}
      />
    </ChartCard>
  )
}
