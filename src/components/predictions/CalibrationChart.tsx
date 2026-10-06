/**
 * "Are you beating the odds?" for the Record: settled Predictions bucketed
 * by the chance they were bought at (x) against how often they won (y),
 * each bucket a dot sized by how many bets it holds, over a dashed y = x
 * "fair" line. Above the line, the Viewer won more often than the market
 * priced them to; below it, less.
 */

import { defineChart, dot, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'
import type { Calibration, CalibrationBucket } from '@/lib/kalshi/record'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { pct } from '@/components/charts/format'
import { cn } from '@/lib/utils'

const TICKS = [0, 0.25, 0.5, 0.75, 1]
const FAIR = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
]

/** "Won 6 pts less often than the odds implied". */
function edgeText(edge: number): string {
  const points = Math.round(Math.abs(edge) * 100)
  if (points === 0) return 'Won about as often as the odds implied'
  return `Won ${points} pt${points === 1 ? '' : 's'} ${edge > 0 ? 'more' : 'less'} often than the odds implied`
}

export function CalibrationChart({
  calibration: c,
}: {
  calibration: Calibration
}) {
  const largest = Math.max(1, ...c.buckets.map((b) => b.count))
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(FAIR, {
            id: 'fair',
            x: 'x',
            y: 'y',
            stroke: 'currentColor',
            strokeOpacity: 0.35,
            strokeWidth: 1.5,
            strokeDasharray: '4 4',
          }),
          dot(c.buckets, {
            id: 'buckets',
            x: 'implied',
            y: 'actual',
            // Area grows with the bets in the bucket.
            r: (b: CalibrationBucket) => 4 + 10 * Math.sqrt(b.count / largest),
            fill: CHART_COLORS.accent,
            fillOpacity: 0.75,
            stroke: 'var(--color-surface)',
            strokeWidth: 1.5,
          }),
        ],
        scales: {
          x: {
            scale: scaleLinear().domain([0, 1]),
            grid: true,
            axis: {
              label: 'Chance you bought in at',
              ticks: { values: TICKS, format: pct },
            },
          },
          y: {
            scale: scaleLinear().domain([0, 1]),
            grid: true,
            axis: {
              label: 'How often you won',
              ticks: { values: TICKS, format: pct },
            },
          },
        },
        tooltip: {
          use: tooltip,
          format(point) {
            const b = point.datum as Partial<CalibrationBucket>
            if (b.count === undefined) return 'Fair: won as often as priced'
            return `Bought at ~${pct(b.implied!)} · won ${b.won} of ${b.count} (${pct(b.actual!)})`
          },
        },
      }),
    [c.buckets, largest],
  )

  if (c.count === 0 || c.edge === null) return null
  return (
    <ChartCard
      legend={[
        {
          label: 'Your bets, by price',
          color: CHART_COLORS.accent,
          shape: 'dot',
        },
        { label: 'Fair', color: CHART_COLORS.muted, shape: 'line' },
      ]}
      headline={
        <span
          className={cn(
            'font-semibold',
            c.edge > 0.005
              ? 'text-scoring'
              : c.edge < -0.005
                ? 'text-live'
                : '',
          )}
        >
          {c.edge > 0 ? '+' : c.edge < 0 ? '−' : ''}
          {Math.round(Math.abs(c.edge) * 100)} pts
        </span>
      }
      footer={
        <>
          {edgeText(c.edge)}, over {c.count} settled bets. Above the line, you
          beat the price.
        </>
      }
    >
      <Chart
        definition={definition}
        height={220}
        initialWidth={340}
        ariaLabel={`${edgeText(c.edge)}, over ${c.count} settled bets`}
      />
    </ChartCard>
  )
}
