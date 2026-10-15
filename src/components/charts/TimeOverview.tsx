/**
 * The whole of a time chart in miniature, under it, with the stretch the
 * chart shows marked: drag the mark, or its edges, to move through the
 * series, and switch between the latest action and all of it. Pairs with
 * useTimeWindow, which holds the view the chart and this both show.
 */

import { defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { brushX } from '@tanstack/charts/interaction/brush'
import { controlledSignal } from '@tanstack/charts/interaction/signal'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { useMemo, useState } from 'react'
import { sameWindow } from './timeWindow'
import type {
  BrushRange,
  BrushXChange,
} from '@tanstack/charts/interaction/brush'
import type { TimeWindow } from './timeWindow'
import { cn } from '@/lib/utils'

/**
 * Plot insets shared by a windowed chart and its overview, so the
 * overview's marked stretch sits under the part of the chart it shows.
 */
export const WINDOWED_MARGIN = { left: 36, right: 26 }

export interface OverviewSeries {
  id: string
  rows: ReadonlyArray<{ t: number; y: number }>
  color: string
}

/**
 * The view a chart shows: its latest action until the Viewer picks
 * another. A view picked to run to the end keeps following new data.
 */
export function useTimeWindow(extent: TimeWindow, action: TimeWindow) {
  const [picked, setPicked] = useState<{
    start: number
    toEnd: boolean
    end: number
  } | null>(null)
  const view: TimeWindow = picked
    ? {
        start: Math.max(extent.start, picked.start),
        end: picked.toEnd ? extent.end : Math.min(extent.end, picked.end),
      }
    : action
  return {
    view,
    pick: (w: TimeWindow) =>
      setPicked({
        start: w.start,
        end: w.end,
        toEnd: extent.end - w.end < (extent.end - extent.start) / 100,
      }),
    showAction: () => setPicked(null),
    showAll: () => setPicked({ ...extent, toEnd: true }),
  }
}

export function TimeOverview({
  series,
  extent,
  action,
  view,
  onPick,
  onShowAction,
  onShowAll,
  format,
  label,
}: {
  series: ReadonlyArray<OverviewSeries>
  extent: TimeWindow
  /** The latest action's stretch, for "Latest action". */
  action: TimeWindow
  view: TimeWindow
  onPick: (w: TimeWindow) => void
  onShowAction: () => void
  onShowAll: () => void
  format: (t: number) => string
  /** What the series is, for the range control's name ("Odds"). */
  label: string
}) {
  const times = useMemo(
    () =>
      [...new Set(series.flatMap((s) => s.rows.map((r) => r.t)))].sort(
        (a, b) => a - b,
      ),
    [series],
  )
  // The brush moves between the series' own times: the shown stretch, on
  // the nearest of them.
  const nearest = (t: number) =>
    times.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best))
  const range = { start: nearest(view.start), end: nearest(view.end) }
  const definition = useMemo(
    () =>
      defineChart({
        margin: { ...WINDOWED_MARGIN, top: 3, bottom: 3 },
        marks: series.map((s) =>
          lineY(
            s.rows.map((r, i) => ({ ...r, i })),
            {
              id: `overview-${s.id}`,
              x: 't',
              y: 'y',
              key: 'i',
              stroke: s.color,
              strokeOpacity: 0.6,
              strokeWidth: 1.25,
            },
          ),
        ),
        scales: {
          x: {
            scale: scaleLinear().domain([extent.start, extent.end]),
            axis: false,
          },
          y: { scale: scaleLinear, axis: false },
        },
        focus: false,
        controls: [
          brushX({
            range: controlledSignal<BrushRange<number>, BrushXChange<number>>(
              range,
              (next, { reason }) => {
                if (reason.type === 'cancel') onPick(reason.origin)
                else if (next.end > next.start) onPick(next)
              },
            ),
            values: times,
            format,
            ariaLabel: `${label} shown`,
            startAriaLabel: 'From',
            endAriaLabel: 'To',
            selectionStyle: {
              fill: 'var(--color-accent)',
              fillOpacity: 0.12,
              stroke: 'var(--color-accent)',
              strokeOpacity: 0.6,
            },
          }),
        ],
      }),
    // format and onPick are fresh closures over the same values each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, times, extent.start, extent.end, view.start, view.end, label],
  )
  const onAction = sameWindow(view, action)
  const onAll = sameWindow(view, extent)
  return (
    <div className="mt-1">
      <div className="rounded-md bg-background/60">
        <Chart
          definition={definition}
          height={34}
          initialWidth={340}
          ariaLabel={`All of the ${label.toLowerCase()}, ${format(extent.start)} to ${format(extent.end)}`}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[11px]">
        <span className="tabular-nums" aria-live="polite">
          {format(view.start)} – {format(view.end)}
        </span>
        {!sameWindow(action, extent) && (
          <span className="flex gap-1">
            <WindowButton active={onAction} onClick={onShowAction}>
              Latest action
            </WindowButton>
            <WindowButton active={onAll} onClick={onShowAll}>
              All
            </WindowButton>
          </span>
        )}
      </div>
    </div>
  )
}

function WindowButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 font-medium',
        active
          ? 'border-accent bg-accent/15 text-foreground'
          : 'border-border text-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
