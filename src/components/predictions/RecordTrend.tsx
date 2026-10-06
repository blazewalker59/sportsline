/**
 * The Record's trend, on TanStack Charts: daily volume as bars (left axis)
 * and running realized P&L as a line on its own scale (right axis), with
 * a zero rule. Hover, tap or keyboard focus shows a day's staked, its
 * P&L and the running total. Colors follow the app's theme tokens.
 */

import { barY, defineChart, lineY, ruleY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'
import type { PredictionRecord } from '@/lib/kalshi/record'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { shortDate, signedUsd, usd } from '@/components/charts/format'
import { cn } from '@/lib/utils'

interface DayRow {
  /** "Oct 4", the band label. */
  label: string
  staked: number
  pnl: number
  running: number
}

export function RecordTrend({ days }: { days: PredictionRecord['days'] }) {
  const rows = useMemo(() => {
    let running = 0
    return days.map((d): DayRow => ({
      label: shortDate(d.day),
      staked: d.staked,
      pnl: d.pnl,
      running: (running += d.pnl),
    }))
  }, [days])
  const end = rows.at(-1)?.running ?? 0
  const lineColor = end >= 0 ? CHART_COLORS.good : CHART_COLORS.bad

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(rows, {
            id: 'volume',
            x: 'label',
            y: 'staked',
            fill: CHART_COLORS.accent,
            fillOpacity: 0.35,
            radius: 2,
          }),
          ruleY([0], {
            id: 'even',
            yScale: 'pnl',
            stroke: 'currentColor',
            strokeOpacity: 0.3,
            strokeDasharray: '3 3',
          }),
          lineY(rows, {
            id: 'running',
            x: 'label',
            y: 'running',
            yScale: 'pnl',
            stroke: lineColor,
            strokeWidth: 2,
          }),
        ],
        scales: {
          x: {
            scale: () => scaleBand<string>().padding(0.25),
          },
          y: {
            scale: scaleLinear,
            nice: true,
            axis: { ticks: { format: (v: number) => usd(v) } },
          },
          pnl: {
            channel: 'y',
            scale: scaleLinear,
            nice: true,
            side: 'right',
            axis: { ticks: { format: (v: number) => signedUsd(v) } },
          },
        },
        focus: 'group-x',
        tooltip: {
          use: tooltip,
          formatGroup(points) {
            const row = points[0]?.datum as DayRow | undefined
            if (!row) return ''
            return [
              row.label,
              `Staked ${usd(row.staked)}`,
              `Day P&L ${signedUsd(row.pnl)}`,
              `Running ${signedUsd(row.running)}`,
            ].join('\n')
          },
        },
      }),
    [rows, lineColor],
  )

  return (
    <ChartCard
      legend={[
        { label: 'Daily volume', color: CHART_COLORS.accent },
        { label: 'Running P&L', color: lineColor, shape: 'line' },
      ]}
      headline={
        <span
          className={cn(
            'font-semibold',
            end > 0.004 ? 'text-scoring' : end < -0.004 ? 'text-live' : '',
          )}
        >
          {signedUsd(end)}
        </span>
      }
    >
      <Chart
        definition={definition}
        height={150}
        initialWidth={340}
        ariaLabel={`Volume over ${rows.length} days; running profit and loss ends at ${signedUsd(end)}`}
      />
    </ChartCard>
  )
}
