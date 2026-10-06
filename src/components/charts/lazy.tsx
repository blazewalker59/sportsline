/**
 * Every chart, loaded on demand: TanStack Charts (~40 KB gzipped) arrives
 * only when a chart is first shown, not with the Timeline or any screen
 * that merely might open one. Each holds its height while loading, so
 * nothing below it jumps. Import charts from here, not their modules.
 */

import { Suspense, lazy } from 'react'
import type { ComponentProps, ComponentType } from 'react'
import type { CalibrationChart as CalibrationChartType } from '@/components/predictions/CalibrationChart'
import type { GameFlow as GameFlowType } from '@/components/games/GameFlow'
import type { MatchupRace as MatchupRaceType } from '@/components/fantasy/MatchupRace'
import type { OddsChart as OddsChartType } from '@/components/predictions/OddsChart'
import type { PlayerForm as PlayerFormType } from '@/components/players/PlayerForm'
import type { RecordTrend as RecordTrendType } from '@/components/predictions/RecordTrend'
import type { TeamResults as TeamResultsType } from '@/components/teams/TeamResults'

/** A card-shaped placeholder the chart's height, while its code loads. */
function Placeholder({ height }: { height: number }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-xl border border-border bg-surface"
      style={{ height }}
    />
  )
}

function lazyChart<TProps extends object>(
  load: () => Promise<ComponentType<TProps>>,
  height: number,
) {
  const Lazy = lazy(() => load().then((component) => ({ default: component })))
  return function LazyChart(props: TProps) {
    return (
      <Suspense fallback={<Placeholder height={height} />}>
        <Lazy {...props} />
      </Suspense>
    )
  }
}

export const RecordTrend = lazyChart<ComponentProps<typeof RecordTrendType>>(
  () =>
    import('@/components/predictions/RecordTrend').then((m) => m.RecordTrend),
  196,
)
export const CalibrationChart = lazyChart<
  ComponentProps<typeof CalibrationChartType>
>(
  () =>
    import('@/components/predictions/CalibrationChart').then(
      (m) => m.CalibrationChart,
    ),
  300,
)
export const OddsChart = lazyChart<ComponentProps<typeof OddsChartType>>(
  () => import('@/components/predictions/OddsChart').then((m) => m.OddsChart),
  240,
)
export const GameFlow = lazyChart<ComponentProps<typeof GameFlowType>>(
  () => import('@/components/games/GameFlow').then((m) => m.GameFlow),
  260,
)
export const MatchupRace = lazyChart<ComponentProps<typeof MatchupRaceType>>(
  () => import('@/components/fantasy/MatchupRace').then((m) => m.MatchupRace),
  220,
)
export const PlayerForm = lazyChart<ComponentProps<typeof PlayerFormType>>(
  () => import('@/components/players/PlayerForm').then((m) => m.PlayerForm),
  190,
)
export const TeamResults = lazyChart<ComponentProps<typeof TeamResultsType>>(
  () => import('@/components/teams/TeamResults').then((m) => m.TeamResults),
  210,
)
