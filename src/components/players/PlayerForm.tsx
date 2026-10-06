/**
 * A Player's recent form: their headline stat (receiving yards, points,
 * strikeouts…) in each recent game as bars, oldest to newest, against
 * their per-game average as a dashed rule. Tap a bar for the full line.
 */

import { barY, defineChart, ruleY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'
import type { PlayerOverview } from '@/lib/model/types'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { shortDate } from '@/components/charts/format'

type Game = PlayerOverview['recent'][number]

interface Bar {
  key: string
  tick: string
  value: number
  game: Game
  above: boolean
}

export function PlayerForm({
  form,
  recent,
}: {
  form: NonNullable<PlayerOverview['form']>
  recent: PlayerOverview['recent']
}) {
  // Save percentage reads as .912; everything else is a count.
  const show = (v: number) =>
    form.label.includes('%')
      ? v.toFixed(3).replace(/^0/, '')
      : Number.isInteger(v)
        ? String(v)
        : v.toFixed(1)

  const bars = useMemo(
    () =>
      [...recent].reverse().flatMap((g, i): Array<Bar> =>
        g.value === null
          ? []
          : [
              {
                key: `${i}`,
                tick: `${g.home ? '' : '@'}${g.opponent}`,
                value: g.value,
                game: g,
                above: form.average !== null && g.value >= form.average,
              },
            ],
      ),
    [recent, form.average],
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(bars, {
            id: 'games',
            x: 'key',
            y: 'value',
            key: 'key',
            fill: (b) => (b.above ? CHART_COLORS.good : CHART_COLORS.accent),
            fillOpacity: 0.75,
            radius: 3,
          }),
          ...(form.average !== null
            ? [
                ruleY([form.average], {
                  id: 'average',
                  stroke: 'currentColor',
                  strokeOpacity: 0.55,
                  strokeDasharray: '4 3',
                }),
              ]
            : []),
        ],
        scales: {
          x: {
            scale: () => scaleBand<string>().padding(0.3),
            axis: {
              ticks: {
                format: (k: string) =>
                  bars.find((b) => b.key === k)?.tick ?? '',
              },
            },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { ticks: { count: 4, format: (v: number) => show(v) } },
          },
        },
        tooltip: {
          use: tooltip,
          format(point) {
            const b = point.datum as Bar
            const g = b.game
            return [
              `${g.date ? shortDate(g.date) : ''} · ${g.home ? 'vs' : '@'} ${g.opponent}`,
              [g.result, g.score].filter(Boolean).join(' '),
              `${show(b.value)} ${form.label}`,
              g.line,
            ]
              .filter(Boolean)
              .join('\n')
          },
        },
      }),
    // `show` only depends on form.label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bars, form.average, form.label],
  )

  if (bars.length < 2) return null
  return (
    <ChartCard
      className="mb-2"
      legend={[
        { label: form.label, color: CHART_COLORS.accent },
        ...(form.average !== null
          ? [
              {
                label: `${form.averageLabel} ${show(form.average)}`,
                color: 'currentColor',
                shape: 'line' as const,
              },
            ]
          : []),
      ]}
    >
      <Chart
        definition={definition}
        height={130}
        initialWidth={340}
        ariaLabel={`${form.label} in the last ${bars.length} games${
          form.average !== null
            ? `, against a ${form.averageLabel.toLowerCase()} of ${show(form.average)}`
            : ''
        }`}
      />
    </ChartCard>
  )
}
