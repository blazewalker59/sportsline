/**
 * A Team's season so far: each completed game's scoring margin as a bar,
 * up for a win and down for a loss, oldest to newest (the last 20 in a
 * long season). Tap a bar for the result.
 */

import { barY, defineChart, ruleY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'
import type { TeamGame, TeamPage } from '@/lib/teams/server'
import { ChartCard } from '@/components/charts/ChartCard'
import { shortDate } from '@/components/charts/format'

/** Past this many games (baseball, hockey, basketball), the latest only. */
const SHOWN = 20

interface Bar {
  key: string
  margin: number
  game: TeamGame
}

/** Wins and losses read apart in both themes (the theme's gold doesn't). */
const WIN = '#10b981'
const LOSS = '#ef4444'

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

export function TeamResults({ page }: { page: TeamPage }) {
  const finals = useMemo(
    () => page.games.filter((g) => g.status === 'final' && g.result),
    [page.games],
  )
  const bars = useMemo(
    () =>
      finals.slice(-SHOWN).map((g, i): Bar => ({
        key: `${i}`,
        margin: g.score.team - g.score.opponent,
        game: g,
      })),
    [finals],
  )
  // Many games: tick every few so the opponents stay legible.
  const every = Math.ceil(bars.length / 8)

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          ruleY([0], {
            id: 'even',
            stroke: 'currentColor',
            strokeOpacity: 0.35,
          }),
          barY(bars, {
            id: 'margins',
            x: 'key',
            y: 'margin',
            key: 'key',
            fill: (b) => (b.game.result === 'W' ? WIN : LOSS),
            fillOpacity: 0.8,
            radius: 2,
          }),
        ],
        scales: {
          x: {
            scale: () => scaleBand<string>().padding(0.25),
            axis: {
              ticks: {
                format: (k: string) => {
                  const i = Number(k)
                  if (i % every !== 0) return ''
                  const g = bars[i]?.game
                  return g
                    ? `${g.home ? '' : '@'}${g.opponent.abbreviation}`
                    : ''
                },
              },
            },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            axis: { ticks: { count: 4, format: (v: number) => sign(v) } },
          },
        },
        tooltip: {
          use: tooltip,
          format(point) {
            const g = (point.datum as Bar).game
            return `${g.result} ${g.score.team}–${g.score.opponent} ${g.home ? 'vs' : '@'} ${g.opponent.abbreviation} · ${shortDate(g.startsAt)}`
          },
        },
      }),
    [bars, every],
  )

  if (bars.length < 2) return null
  const wins = bars.filter((b) => b.game.result === 'W').length
  const net = bars.reduce((n, b) => n + b.margin, 0)
  return (
    <ChartCard
      className="mb-5"
      legend={[
        { label: 'Won by', color: WIN },
        { label: 'Lost by', color: LOSS },
      ]}
      headline={
        <span className="tabular-nums">
          {finals.length > SHOWN ? `Last ${bars.length} · ` : ''}
          <span className="font-semibold text-foreground">
            {wins}–{bars.length - wins}
          </span>{' '}
          · {sign(net)} net
        </span>
      }
    >
      <Chart
        definition={definition}
        height={130}
        initialWidth={340}
        ariaLabel={`Scoring margin in the last ${bars.length} games: ${wins} wins, net ${sign(net)}`}
      />
    </ChartCard>
  )
}
