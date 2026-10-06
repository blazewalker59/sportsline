/**
 * A Game's flow: each team's score over the Game as a stepped line in its
 * color, a dot on each Scoring Play (not in the NBA, where hundreds would
 * be noise), and its segments (quarters, innings, periods) along the
 * bottom. Tap or hover a dot for the play (the lines are decorative, so
 * focus lands only on plays). Refreshes while live.
 */

import { defineChart, dot, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { decorative } from '@tanstack/charts/mark/decorative'
import { tooltip } from '@tanstack/charts/tooltip'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { FlowScore, FlowStep } from '@/lib/games/flow'
import type { GameSummary } from '@/lib/model/timeline'
import { ChartCard } from '@/components/charts/ChartCard'
import { buildFlow } from '@/lib/games/flow'
import { flowColors } from '@/lib/games/flowColors'
import { getGameDetail } from '@/lib/games/server'
import { scoringHeadline } from '@/lib/timeline/chat'

const AWAY = 'var(--team-away)'
const HOME = 'var(--team-home)'

const isScore = (d: unknown): d is FlowScore =>
  typeof d === 'object' && d !== null && 'item' in d

export function GameFlow({ game }: { game: GameSummary }) {
  const live = game.status === 'live' || game.status === 'delayed'
  const detail = useQuery({
    queryKey: ['game', game.id],
    queryFn: () => getGameDetail({ data: { gameId: game.id } }),
    refetchInterval: live ? 30_000 : false,
    staleTime: live ? 15_000 : 5 * 60_000,
  })
  const flow = useMemo(
    () => (detail.data ? buildFlow(detail.data.items, game.league) : null),
    [detail.data, game.league],
  )
  const colors = useMemo(
    () => flowColors(game.awayTeam, game.homeTeam),
    [game.awayTeam, game.homeTeam],
  )
  const away = game.awayTeam.abbreviation
  const home = game.homeTeam.abbreviation

  const definition = useMemo(() => {
    if (!flow) return null
    const dots = game.league !== 'nba'
    const segmentAt = new Map(flow.segments.map((s) => [s.x, s.label]))
    // The lines are context: focus and tooltips land on the scoring dots.
    const step = (id: string, rows: Array<FlowStep>, stroke: string) =>
      decorative(
        lineY(
          rows.map((r, i) => ({ ...r, i })),
          { id, x: 'x', y: 'score', key: 'i', stroke, strokeWidth: 2.25 },
        ),
      )
    const scored = (side: 'away' | 'home', fill: string) =>
      dot(
        flow.scores.filter((s) => s.side === side),
        {
          id: `${side}-scores`,
          x: 'x',
          y: 'score',
          r: 3.5,
          fill,
          stroke: 'var(--color-surface)',
          strokeWidth: 1.5,
        },
      )
    return defineChart({
      marks: [
        step('away', flow.away, AWAY),
        step('home', flow.home, HOME),
        ...(dots ? [scored('away', AWAY), scored('home', HOME)] : []),
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
      tooltip: {
        use: tooltip,
        format(point) {
          const d = point.datum as FlowScore | FlowStep
          if (!isScore(d)) return ''
          const { item } = d
          const text =
            item.description.length > 90
              ? `${item.description.slice(0, 88)}…`
              : item.description
          return [
            `${scoringHeadline(item)} · ${item.segmentLabel}`,
            text,
            `${away} ${item.score.away} – ${item.score.home} ${home}`,
          ].join('\n')
        },
      },
    })
  }, [flow, game.league, away, home])

  if (!flow || !definition || flow.end < 2) return null
  const leader =
    game.score.away === game.score.home
      ? null
      : game.score.away > game.score.home
        ? away
        : home
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        Game flow
      </h3>
      <div
        className="team-lines"
        style={
          {
            '--team-away-light': colors.away.light,
            '--team-away-dark': colors.away.dark,
            '--team-home-light': colors.home.light,
            '--team-home-dark': colors.home.dark,
          } as React.CSSProperties
        }
      >
        <ChartCard
          legend={[
            { label: away, color: AWAY, shape: 'line' },
            { label: home, color: HOME, shape: 'line' },
          ]}
          headline={
            <span className="font-semibold text-foreground tabular-nums">
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
        </ChartCard>
      </div>
    </section>
  )
}
