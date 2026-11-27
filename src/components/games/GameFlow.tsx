/**
 * A Game's flow: each team's score over the Game as a stepped line in its
 * color, a dot on each Scoring Play (not in the NBA, where hundreds would
 * be noise), and its segments (quarters, innings, periods) along the
 * bottom. Tap anywhere for the nearest scoring play, which reads under the
 * chart (the lines are decorative, so focus lands only on plays).
 * Refreshes while live. Signal: drawn in ink (the home team solid, the
 * away team muted and dashed), with the lit orange only for "now": the
 * lines' ends while the Game is live.
 */

import { defineChart, dot, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { decorative } from '@tanstack/charts/mark/decorative'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { FlowScore, FlowStep } from '@/lib/games/flow'
import type { GameSummary } from '@/lib/model/timeline'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import {
  KeyPlayPanel,
  keyPlaySelection,
  useKeyPlay,
} from '@/components/charts/KeyPlays'
import { buildFlow } from '@/lib/games/flow'
import { gameDetailQuery } from '@/lib/games/queries'
import { scoringHeadline } from '@/lib/timeline/chat'
import { SectionLabel } from '@/components/signal/Section'

const AWAY = CHART_COLORS.muted
const HOME = CHART_COLORS.foreground
const AWAY_DASH = '5 3'
const NOW = 'var(--signal)'

const scoreKey = (s: FlowScore) => s.item.id

export function GameFlow({ game }: { game: GameSummary }) {
  const live = game.status === 'live' || game.status === 'delayed'
  const detail = useQuery(gameDetailQuery(game.id))
  const flow = useMemo(
    () => (detail.data ? buildFlow(detail.data.items, game.league) : null),
    [detail.data, game.league],
  )
  const away = game.awayTeam.abbreviation
  const home = game.homeTeam.abbreviation
  // Basketball scores too often for a dot each.
  const dots = game.league !== 'nba' && game.league !== 'cbb'
  // Every scoring play in order, both sides', for the panel to step through.
  const scores = useMemo(
    () => (dots && flow ? [...flow.scores].sort((a, b) => a.x - b.x) : []),
    [flow, dots],
  )
  const keyPlay = useKeyPlay(scores, scoreKey)

  const definition = useMemo(() => {
    if (!flow) return null
    const picking = keyPlaySelection<FlowScore>(
      keyPlay.selected,
      keyPlay.pick,
      scoreKey,
    )
    const segmentAt = new Map(flow.segments.map((s) => [s.x, s.label]))
    // The lines are context: focus and tooltips land on the scoring dots.
    const step = (
      id: string,
      rows: Array<FlowStep>,
      stroke: string,
      strokeDasharray?: string,
    ) =>
      decorative(
        lineY(
          rows.map((r, i) => ({ ...r, i })),
          {
            id,
            x: 'x',
            y: 'score',
            key: 'i',
            stroke,
            strokeWidth: 2,
            ...(strokeDasharray ? { strokeDasharray } : {}),
          },
        ),
      )
    // Now: where each line ends, lit while the Game is live.
    const ends = [flow.away.at(-1), flow.home.at(-1)].flatMap((r, i) =>
      r ? [{ x: r.x, score: r.score, i }] : [],
    )
    const now = decorative(
      dot(ends, {
        id: 'now',
        x: 'x',
        y: 'score',
        key: 'i',
        r: 3.5,
        fill: NOW,
        stroke: 'var(--color-surface)',
        strokeWidth: 1.5,
      }),
    )
    const scored = (side: 'away' | 'home', fill: string) =>
      dot(
        flow.scores.filter((s) => s.side === side),
        {
          id: `${side}-scores`,
          x: 'x',
          y: 'score',
          key: scoreKey,
          r: 3.5,
          fill,
          stroke: 'var(--color-surface)',
          strokeWidth: 1.5,
        },
      )
    return defineChart({
      marks: [
        step('away', flow.away, AWAY, AWAY_DASH),
        step('home', flow.home, HOME),
        ...(dots
          ? [
              scored('away', AWAY),
              scored('home', HOME),
              picking.highlight(scores, {
                x: (s) => s.x,
                y: (s) => s.score,
                fill: 'var(--color-surface)',
              }),
            ]
          : []),
        ...(live ? [now] : []),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          domain: [0, flow.end],
          grid: true,
          axis: {
            ticks: {
              values: flow.segments.map((s) => s.x),
              format: (v: number) => segmentAt.get(v) ?? '',
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          axis: { ticks: { count: 4 } },
        },
      },
      ...(dots
        ? {
            selection: picking.selection,
            focus: picking.focus,
            maxFocusDistance: picking.maxFocusDistance,
          }
        : {}),
    })
  }, [flow, dots, live, scores, keyPlay.selected, keyPlay.pick])

  if (!flow || !definition || flow.end < 2) return null
  const leader =
    game.score.away === game.score.home
      ? null
      : game.score.away > game.score.home
        ? away
        : home
  return (
    <section>
      <SectionLabel title="Game flow" as="h3" />
      <div>
        <ChartCard
          legend={[
            { label: away, color: AWAY, shape: 'line' },
            { label: home, color: HOME, shape: 'line' },
          ]}
          headline={
            <span className="flex items-center gap-1.5 font-semibold text-foreground tabular-nums">
              {live && <span aria-hidden="true" className="led led-pulse" />}
              {away} {game.score.away} – {game.score.home} {home}
              {live ? ' · live' : game.status === 'final' ? ' · Final' : ''}
            </span>
          }
          footer={
            leader
              ? undefined
              : game.status === 'final'
                ? 'Tied at the end'
                : undefined
          }
        >
          <Chart
            definition={definition}
            height={170}
            initialWidth={340}
            ariaLabel={`${away} ${game.score.away}, ${home} ${game.score.home}: each team's score over the game${leader ? `, ${leader} leading` : ''}`}
          />
          <KeyPlayPanel
            count={scores.length}
            index={keyPlay.index}
            onStep={(i) => keyPlay.pick(scoreKey(scores[i]))}
            onClose={() => keyPlay.pick(null)}
          >
            {keyPlay.play && (
              <ScoreDetail score={keyPlay.play} away={away} home={home} />
            )}
          </KeyPlayPanel>
        </ChartCard>
      </div>
    </section>
  )
}

/** A scoring play as the panel tells it: what, when, and the score after. */
function ScoreDetail({
  score,
  away,
  home,
}: {
  score: FlowScore
  away: string
  home: string
}) {
  const { item } = score
  return (
    <>
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-[2px]"
          style={{ background: score.side === 'away' ? AWAY : HOME }}
        />
        <span className="truncate">{scoringHeadline(item)}</span>
        <span className="ml-auto shrink-0 font-normal text-muted tabular-nums">
          {item.segmentLabel}
        </span>
      </p>
      <p className="line-clamp-2">{item.description}</p>
      <p className="tabular-nums">
        {away} {item.score.away} – {item.score.home} {home}
      </p>
    </>
  )
}
