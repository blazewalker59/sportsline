/**
 * A Prediction's odds over its whole life, for its sheet: the Viewer's
 * side's chance as a line (0–100%), a dashed rule at the chance they
 * bought in at, and the Scoring Plays in its Games as dots in the scoring
 * team's color, set on the line at the moment they happened, so a swing
 * shows its cause. Tap anywhere for the nearest play, which reads under
 * the chart with the swing it caused. It opens on the latest action
 * (a Prediction bought hours before its games is flat until they start),
 * with the whole of it in an overview underneath to scan.
 */

import { areaY, defineChart, dot, lineY, ruleY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { decorative } from '@tanstack/charts/mark/decorative'
import { useMemo } from 'react'
import type { PredictionDetail, PredictionMove } from '@/lib/kalshi/server'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import {
  KeyPlayPanel,
  keyPlaySelection,
  useKeyPlay,
} from '@/components/charts/KeyPlays'
import {
  TimeOverview,
  WINDOWED_MARGIN,
  useTimeWindow,
} from '@/components/charts/TimeOverview'
import { pct } from '@/components/charts/format'
import {
  actionWindow,
  windowTicks,
  withinWindow,
} from '@/components/charts/timeWindow'
import { usePredictionDetail } from '@/lib/kalshi/usePredictions'
import { cn } from '@/lib/utils'
import { clockTime, shortDate } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

interface OddsRow {
  kind: 'odds'
  t: number
  chance: number
}

interface PlayRow extends PredictionMove {
  kind: 'play'
  key: string
  t: number
  /** The odds when it happened (the last point at or before it). */
  chance: number
  /** The odds once it sank in: a few minutes on, or the latest. */
  after: number
}

/** How long a play takes to show in the odds. */
const SETTLE_MS = 3 * 60_000

const playKey = (p: PlayRow) => p.key

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

const MINUTE = 60_000
/** Odds moving this much (from the last such move) is a moment. */
const SWING = 0.03

/** When something happened: each scoring play, and each real odds swing. */
function moments(
  rows: ReadonlyArray<OddsRow>,
  plays: ReadonlyArray<PlayRow>,
): Array<number> {
  const out = plays.map((p) => p.t)
  let anchor = rows[0].chance
  for (const r of rows) {
    if (Math.abs(r.chance - anchor) < SWING) continue
    out.push(r.t)
    anchor = r.chance
  }
  return out
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
      const after = (
        rows.find((r) => r.t >= t + SETTLE_MS) ?? rows[rows.length - 1]
      ).chance
      return [
        {
          ...m,
          kind: 'play',
          key: `${m.at}|${m.headline}|${m.team ?? ''}`,
          t,
          chance,
          after,
        },
      ]
    })
  }, [detail.moves, rows])

  const start = rows[0].t
  const end = rows[rows.length - 1].t
  const action = useMemo(
    () =>
      actionWindow({ start, end }, moments(rows, plays), {
        gapMs: 45 * MINUTE,
        leadMs: 15 * MINUTE,
      }),
    [rows, plays, start, end],
  )
  const { view, pick, showAction, showAll } = useTimeWindow(
    { start, end },
    action,
  )
  const shown = useMemo(() => withinWindow(rows, view), [rows, view])
  const shownPlays = useMemo(
    () => plays.filter((p) => p.t >= view.start && p.t <= view.end),
    [plays, view],
  )
  const keyPlay = useKeyPlay(shownPlays, playKey)
  const overview = useMemo(
    () => [
      {
        id: 'odds',
        rows: rows.map((r) => ({ t: r.t, y: r.chance })),
        color: CHART_COLORS.muted,
      },
    ],
    [rows],
  )
  const now = rows[rows.length - 1].chance
  const entry = detail.entryChance
  const move = entry === null ? null : Math.round((now - entry) * 100)
  const up = move === null ? now >= rows[0].chance : move >= 0
  const lineColor = up ? CHART_COLORS.good : CHART_COLORS.bad
  const axis = chanceAxis(Math.max(entry ?? 0, ...rows.map((r) => r.chance)))
  // Over a day and a half, label dates; within one, clock times.
  const timeZone = useTimeZone()
  const formatTime = (t: number) =>
    view.end - view.start > 36 * 3_600_000
      ? shortDate(t, timeZone)
      : clockTime(t, timeZone)
  // The overview's range reads with the day when the whole spans days.
  const formatRange = (t: number) =>
    end - start > 18 * 3_600_000
      ? `${shortDate(t, timeZone)} ${clockTime(t, timeZone)}`
      : clockTime(t, timeZone)

  const definition = useMemo(() => {
    const picking = keyPlaySelection<PlayRow>(
      keyPlay.selected,
      keyPlay.pick,
      playKey,
    )
    // One dot mark per scoring team: a dot's fill is constant.
    const byColor = new Map<string, Array<PlayRow>>()
    for (const p of shownPlays) {
      const key = p.color ?? NEUTRAL
      byColor.set(key, [...(byColor.get(key) ?? []), p])
    }
    return defineChart({
      margin: WINDOWED_MARGIN,
      clip: true,
      // The odds are context: taps and focus land on the plays.
      marks: [
        decorative(
          areaY(shown, {
            id: 'odds-area',
            x: 't',
            y: 'chance',
            fill: lineColor,
            fillOpacity: 0.12,
          }),
        ),
        ...(entry === null
          ? []
          : [
              decorative(
                ruleY([entry], {
                  id: 'entry',
                  stroke: 'currentColor',
                  strokeOpacity: 0.45,
                  strokeDasharray: '4 4',
                }),
              ),
            ]),
        decorative(
          lineY(shown, {
            id: 'odds',
            x: 't',
            y: 'chance',
            stroke: lineColor,
            strokeWidth: 2,
          }),
        ),
        ...[...byColor].map(([color, group], i) =>
          dot(group, {
            id: `plays-${i}`,
            x: 't',
            y: 'chance',
            key: playKey,
            r: 4.5,
            fill: color,
            // A ring, so a dark team color still shows on a dark card.
            stroke: 'var(--color-foreground)',
            strokeOpacity: 0.55,
            strokeWidth: 1.25,
          }),
        ),
        picking.highlight(shownPlays, {
          x: (p) => p.t,
          y: (p) => p.chance,
          fill: lineColor,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([view.start, view.end]),
          axis: {
            ticks: { values: windowTicks(view), format: formatTime },
          },
        },
        y: {
          scale: scaleLinear().domain([0, axis.top]),
          grid: true,
          axis: { ticks: { values: axis.ticks, format: pct } },
        },
      },
      selection: picking.selection,
      focus: picking.focus,
      maxFocusDistance: picking.maxFocusDistance,
    })
    // formatTime only depends on the view and the zone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shown,
    shownPlays,
    lineColor,
    entry,
    view,
    axis.top,
    keyPlay.selected,
    timeZone,
  ])

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
      <KeyPlayPanel
        count={shownPlays.length}
        index={keyPlay.index}
        onStep={(i) => keyPlay.pick(playKey(shownPlays[i]))}
        onClose={() => keyPlay.pick(null)}
      >
        {keyPlay.play && <PlayDetail play={keyPlay.play} />}
      </KeyPlayPanel>
      <TimeOverview
        series={overview}
        extent={{ start, end }}
        action={action}
        view={view}
        onPick={pick}
        onShowAction={showAction}
        onShowAll={showAll}
        format={formatRange}
        label="Odds"
      />
    </ChartCard>
  )
}

/** A key play as the panel tells it: what, who, and the swing it caused. */
function PlayDetail({ play }: { play: PlayRow }) {
  const timeZone = useTimeZone()
  const swing = Math.round((play.after - play.chance) * 100)
  return (
    <>
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: play.color ?? NEUTRAL }}
        />
        <span className="truncate">
          {play.headline}
          {play.team ? ` · ${play.team}` : ''}
        </span>
        <span className="ml-auto shrink-0 font-normal text-muted tabular-nums">
          {clockTime(play.t, timeZone)}
        </span>
      </p>
      <p className="line-clamp-2">{play.description}</p>
      <p className="tabular-nums">
        Odds {pct(play.chance)} → {pct(play.after)}
        {swing !== 0 && (
          <span
            className={cn(
              'ml-1 font-semibold',
              swing > 0 ? 'text-scoring' : 'text-live',
            )}
          >
            {swing > 0 ? '▲' : '▼'}
            {Math.abs(swing)}
          </span>
        )}
      </p>
    </>
  )
}
