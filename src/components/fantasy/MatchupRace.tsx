/**
 * The race (points leagues): both sides' live score over the matchup
 * period as step lines, from the points sync keeps (fantasy/race.ts),
 * with each side's projected finish as a faint dashed rule. Hover, tap
 * or keyboard focus shows the time, both scores and who led by how much.
 */

import { defineChart, lineY, ruleY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { pts } from './format'
import type { MatchupView } from '@/lib/fantasy/matchup'
import type { RacePoint, RaceStep } from '@/lib/fantasy/race'
import { CHART_COLORS, ChartCard } from '@/components/charts/ChartCard'
import { clockTime } from '@/components/charts/format'
import { leadChanges, raceSteps } from '@/lib/fantasy/race'
import { getMatchupRace } from '@/lib/fantasy/server'

const HOUR = 3_600_000

/** "Sun 4:25 PM": weekday and time when the race spans days. */
function when(t: number, spansDays: boolean): string {
  const d = new Date(t)
  return spansDays
    ? `${d.toLocaleDateString([], { weekday: 'short' })} ${clockTime(d)}`
    : clockTime(d)
}

export function MatchupRace({
  leagueId,
  m,
}: {
  leagueId: string
  m: MatchupView
}) {
  const race = useQuery({
    queryKey: ['matchup-race', leagueId, m.matchupPeriod],
    queryFn: () => getMatchupRace({ data: { leagueId } }),
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  })
  const opponent = m.opponent
  // The race so far, ending at the score the sheet shows now.
  const points = useMemo((): Array<RacePoint> => {
    const stored = race.data ?? []
    const last = stored.at(-1)
    if (!opponent) return stored
    const now = { mine: m.mine.score, opponent: opponent.score }
    return last && last.mine === now.mine && last.opponent === now.opponent
      ? stored
      : [...stored, { at: new Date().toISOString(), ...now }]
  }, [race.data, m.mine.score, opponent])

  const definition = useMemo(() => {
    const ts = points.map((p) => Date.parse(p.at))
    const spansDays = ts.length > 1 && ts.at(-1)! - ts[0] > 30 * HOUR
    const mine = raceSteps(points, 'mine')
    const theirs = raceSteps(points, 'opponent')
    const projections = [
      { value: m.mine.projected, color: CHART_COLORS.mine, id: 'proj-mine' },
      {
        value: opponent?.projected ?? null,
        color: CHART_COLORS.opponent,
        id: 'proj-opponent',
      },
    ].flatMap((p) =>
      p.value === null
        ? []
        : [
            ruleY([p.value], {
              id: p.id,
              stroke: p.color,
              strokeOpacity: 0.35,
              strokeDasharray: '4 4',
            }),
          ],
    )
    return defineChart({
      marks: [
        ...projections,
        lineY(theirs, {
          id: 'opponent',
          x: 't',
          y: 'score',
          stroke: CHART_COLORS.opponent,
          strokeWidth: 2,
        }),
        lineY(mine, {
          id: 'mine',
          x: 't',
          y: 'score',
          stroke: CHART_COLORS.mine,
          strokeWidth: 2.5,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          axis: {
            ticks: { format: (v: number) => when(v, spansDays), count: 3 },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { ticks: { format: (v: number) => String(Math.round(v)) } },
        },
      },
      focus: 'group-x',
      tooltip: {
        use: tooltip,
        formatGroup(focused) {
          // Corners repeat the previous reading; show the reading itself.
          const steps = focused.map((f) => f.datum as RaceStep)
          const step = steps.find((s) => !s.corner) ?? steps[0]
          if (!step) return ''
          const p = step.point
          const lead = p.mine - p.opponent
          return [
            when(Date.parse(p.at), true),
            `${m.mine.abbrev} ${pts(p.mine)}`,
            `${opponent?.abbrev ?? 'Opp'} ${pts(p.opponent)}`,
            lead === 0
              ? 'Level'
              : `${lead > 0 ? m.mine.abbrev : (opponent?.abbrev ?? 'Opp')} by ${pts(Math.abs(lead))}`,
          ].join('\n')
        },
      },
    })
  }, [points, m.mine.projected, m.mine.abbrev, opponent])

  if (!opponent || m.categories) return null
  const changes = leadChanges(points)
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        The race
      </h3>
      <ChartCard
        legend={[
          { label: m.mine.abbrev, color: CHART_COLORS.mine, shape: 'line' },
          {
            label: opponent.abbrev,
            color: CHART_COLORS.opponent,
            shape: 'line',
          },
          ...(m.mine.projected !== null || opponent.projected !== null
            ? [
                {
                  label: 'Projected',
                  color: 'var(--color-muted)',
                  shape: 'line' as const,
                },
              ]
            : []),
        ]}
        headline={
          points.length >= 2 ? (
            <span className="font-semibold text-foreground">
              {changes === 0
                ? 'No lead changes'
                : `Lead changed ${changes} ${changes === 1 ? 'time' : 'times'}`}
            </span>
          ) : undefined
        }
      >
        {points.length < 2 ? (
          <p className="px-1 py-4 text-center text-xs">
            The race fills in as the week’s games are played.
          </p>
        ) : (
          <Chart
            definition={definition}
            height={150}
            initialWidth={340}
            ariaLabel={`${m.mine.abbrev} ${pts(m.mine.score)} to ${opponent.abbrev} ${pts(opponent.score)}; the lead changed ${changes} times`}
          />
        )}
      </ChartCard>
    </section>
  )
}
