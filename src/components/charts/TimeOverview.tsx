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
import { useEffect, useMemo, useRef, useState } from 'react'
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

/** Each handle's touch area: this wide, and half this past the strip. */
const HANDLE = 28
/** The strip the series is drawn in. */
const STRIP = 28
/** Room above and below the strip for the handles' touch areas. */
const PAD = HANDLE / 2

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
  // The overview's width, to set the grips on the brush's edges.
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const plot = width - WINDOWED_MARGIN.left - WINDOWED_MARGIN.right
  const xOf = (t: number) =>
    WINDOWED_MARGIN.left +
    (extent.end > extent.start
      ? ((t - extent.start) / (extent.end - extent.start)) * plot
      : 0)
  const left = xOf(range.start)
  const right = xOf(range.end)
  const definition = useMemo(
    () =>
      defineChart({
        margin: { ...WINDOWED_MARGIN, top: PAD, bottom: PAD },
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
            handleSize: HANDLE,
            selectionStyle: {
              fill: 'var(--color-accent)',
              fillOpacity: 0.1,
              stroke: 'var(--color-accent)',
              strokeOpacity: 0.7,
            },
            // The handles stay as touch areas; the grips below draw them.
            handleStyle: { fillOpacity: 0, strokeOpacity: 0 },
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
    <div className="mt-0.5">
      <div ref={box} className="relative">
        {/* The strip's track, under the series. */}
        <div
          aria-hidden="true"
          className="absolute rounded-md bg-background/60"
          style={{
            top: PAD,
            height: STRIP,
            left: WINDOWED_MARGIN.left,
            right: WINDOWED_MARGIN.right,
          }}
        />
        <Chart
          definition={definition}
          height={STRIP + 2 * PAD}
          initialWidth={340}
          ariaLabel={`All of the ${label.toLowerCase()}, ${format(extent.start)} to ${format(extent.end)}`}
        />
        {/* Over the brush, letting touches through: the stretch outside
            the shown one dimmed, and a grip on each edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[2]"
        >
          <div
            className="absolute rounded-l-md bg-surface/70"
            style={{
              top: PAD,
              height: STRIP,
              left: WINDOWED_MARGIN.left,
              width: Math.max(0, left - WINDOWED_MARGIN.left),
            }}
          />
          <div
            className="absolute rounded-r-md bg-surface/70"
            style={{
              top: PAD,
              height: STRIP,
              left: right,
              width: Math.max(0, WINDOWED_MARGIN.left + plot - right),
            }}
          />
          <Grip x={left} side="start" />
          <Grip x={right} side="end" />
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 px-1 text-[11px]">
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

/**
 * A brush edge's grip: a pill with two ridges, just outside the edge (as
 * on a video trimmer), so a narrow stretch's two grips never overlap. It
 * stays inside its handle's touch area, which straddles the edge.
 */
function Grip({ x, side }: { x: number; side: 'start' | 'end' }) {
  return (
    <div
      className="absolute flex w-3 items-center justify-center gap-px rounded-full border-2 border-accent bg-surface shadow-sm"
      style={{
        left: side === 'start' ? x - 12 : x,
        top: PAD - 5,
        height: STRIP + 10,
      }}
    >
      <span className="h-2.5 w-px rounded-full bg-accent" />
      <span className="h-2.5 w-px rounded-full bg-accent" />
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
