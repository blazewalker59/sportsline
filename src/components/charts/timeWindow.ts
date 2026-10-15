/**
 * Which stretch of a time chart to open on (src/components/charts). A
 * Prediction bought hours before its games, or a fantasy week with games
 * on three days, spends most of its span flat: shown whole, the moments
 * that matter crowd into a sliver. So a chart opens on its latest burst
 * of action, and its overview (TimeOverview) scans the rest. Pure.
 */

export interface TimeWindow {
  start: number
  end: number
}

const MINUTE = 60_000

export interface ActionWindowOptions {
  /** Quiet this long between moments splits them into separate stretches. */
  gapMs: number
  /** Shown before a stretch's first moment, so its lead-in reads. */
  leadMs: number
  /** Never open narrower than this. */
  minMs?: number
  /**
   * Show everything when the stretch would cover at least this share of
   * it anyway: zooming in that little only hides context.
   */
  wholeAbove?: number
}

/**
 * The window to open on: from just before the latest stretch of moments
 * (times something happened) to the end of the series. The whole extent
 * when nothing happened, or when the stretch is most of it already.
 */
export function actionWindow(
  extent: TimeWindow,
  moments: ReadonlyArray<number>,
  { gapMs, leadMs, minMs = 30 * MINUTE, wholeAbove = 0.7 }: ActionWindowOptions,
): TimeWindow {
  const span = extent.end - extent.start
  const times = moments
    .filter((t) => t >= extent.start && t <= extent.end)
    .sort((a, b) => a - b)
  if (times.length === 0 || span <= minMs) return extent
  // Walk back from the latest moment while the moments keep coming.
  let first = times.length - 1
  while (first > 0 && times[first] - times[first - 1] <= gapMs) first--
  const start = Math.max(
    extent.start,
    Math.min(times[first] - leadMs, extent.end - minMs),
  )
  if ((extent.end - start) / span >= wholeAbove) return extent
  return { start, end: extent.end }
}

/** Whether two windows are the same (to the minute). */
export function sameWindow(a: TimeWindow, b: TimeWindow): boolean {
  return (
    Math.abs(a.start - b.start) < MINUTE && Math.abs(a.end - b.end) < MINUTE
  )
}

/**
 * The rows a window shows, sorted by `t`: those inside it plus the one
 * either side, so a line runs to the window's edges instead of stopping
 * short of them.
 */
export function withinWindow<T extends { t: number }>(
  rows: ReadonlyArray<T>,
  w: TimeWindow,
): Array<T> {
  const first = rows.findIndex((r) => r.t >= w.start)
  if (first === -1) return rows.slice(-1)
  let last = rows.length - 1
  while (last > first && rows[last].t > w.end) last--
  return rows.slice(Math.max(0, first - 1), Math.min(rows.length, last + 2))
}

/** About `count` evenly spaced times across a window. */
export function windowTicks(w: TimeWindow, count = 4): Array<number> {
  if (w.end <= w.start) return [w.start]
  return Array.from(
    { length: count },
    (_, i) => w.start + ((w.end - w.start) * i) / (count - 1),
  )
}
