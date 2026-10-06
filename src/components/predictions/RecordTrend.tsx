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
import { cn } from '@/lib/utils'

interface DayRow {
  /** "Oct 4", the band label. */
  label: string
  staked: number
  pnl: number
  running: number
}

const usd = (n: number, signed = false) =>
  `${signed ? (n > 0.004 ? '+' : n < -0.004 ? '−' : '') : ''}$${Math.abs(
    n,
  ).toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
  })}`

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })

export function RecordTrend({ days }: { days: PredictionRecord['days'] }) {
  const rows = useMemo(() => {
    let running = 0
    return days.map((d): DayRow => ({
      label: dayLabel(d.day),
      staked: d.staked,
      pnl: d.pnl,
      running: (running += d.pnl),
    }))
  }, [days])
  const end = rows.at(-1)?.running ?? 0
  const lineColor = end >= 0 ? 'var(--color-scoring)' : 'var(--color-live)'

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(rows, {
            id: 'volume',
            x: 'label',
            y: 'staked',
            fill: 'var(--color-accent)',
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
            axis: { ticks: { format: (v: number) => usd(v, true) } },
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
              `Day P&L ${usd(row.pnl, true)}`,
              `Running ${usd(row.running, true)}`,
            ].join('\n')
          },
        },
      }),
    [rows, lineColor],
  )

  return (
    <figure className="rounded-xl border border-border bg-surface px-2 py-2.5 text-muted">
      <figcaption className="mb-1 flex items-baseline justify-between px-1 text-[11px]">
        <span>
          <span className="mr-1 inline-block size-2 rounded-sm bg-accent/40 align-middle" />
          Daily volume
        </span>
        <span>
          <span
            className={cn(
              'mr-1 inline-block h-0.5 w-3 align-middle',
              end >= 0 ? 'bg-scoring' : 'bg-live',
            )}
          />
          Running P&L{' '}
          <span
            className={cn(
              'font-semibold',
              end > 0.004 ? 'text-scoring' : end < -0.004 ? 'text-live' : '',
            )}
          >
            {usd(end, true)}
          </span>
        </span>
      </figcaption>
      <Chart
        definition={definition}
        height={150}
        initialWidth={340}
        ariaLabel={`Volume over ${rows.length} days; running profit and loss ends at ${usd(end, true)}`}
      />
    </figure>
  )
}
