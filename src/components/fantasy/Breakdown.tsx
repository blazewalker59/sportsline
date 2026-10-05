/**
 * A Lineup Player's breakdown, opened from their figure: a points league's
 * stats and points as a table, or a category league's day as a box score.
 */

import { Fragment } from 'react'
import { injuryLabel, injuryTone, pts } from './format'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer } from '@/lib/fantasy/matchup'
import { statName, statValue } from '@/lib/fantasy/stats'
import { cn } from '@/lib/utils'

export function Breakdown({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  const tone = injuryTone(player.injury)
  return (
    <div className="mx-2 mb-2 rounded-lg bg-notice px-3 py-2.5 text-xs">
      <p className="mb-2 flex items-baseline gap-2">
        <span className="font-semibold">{player.name}</span>
        {player.injury && (
          <span
            className={cn(
              'font-semibold',
              tone === 'red'
                ? 'text-red-600 dark:text-red-400'
                : 'text-yellow-700 dark:text-yellow-400',
            )}
          >
            {injuryLabel(player.injury)}
          </span>
        )}
      </p>
      {player.dayLine != null ? (
        <DayLine line={player.dayLine} />
      ) : (
        <PointsTable sport={sport} player={player} />
      )}
    </div>
  )
}

/**
 * A points league's breakdown as a table without rules: each stat, its
 * value and its points in aligned columns, then the total and projection.
 */
function PointsTable({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  if (player.breakdown.length === 0)
    return (
      <p className="text-muted">
        No points yet
        {player.projected !== null && ` · projected ${pts(player.projected)}`}
      </p>
    )
  const cell = 'text-right tabular-nums'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] gap-x-3 gap-y-1">
      <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        Stat
      </span>
      <span
        className={cn(
          cell,
          'text-[10px] font-semibold tracking-wide text-muted uppercase',
        )}
      >
        Value
      </span>
      <span
        className={cn(
          cell,
          'text-[10px] font-semibold tracking-wide text-muted uppercase',
        )}
      >
        Pts
      </span>
      {player.breakdown.map((b) => (
        <Fragment key={b.statId}>
          <span className="truncate text-foreground/80">
            {b.label ?? statName(sport, b.statId)}
          </span>
          <span className={cn(cell, 'text-muted')}>
            {b.value === 0 ? '—' : statValue(b.value)}
          </span>
          <span
            className={cn(
              cell,
              'font-semibold',
              b.points < 0 && 'text-red-600 dark:text-red-400',
            )}
          >
            {b.points > 0 ? '+' : ''}
            {pts(b.points)}
          </span>
        </Fragment>
      ))}
      <span className="mt-1.5 font-semibold">Total</span>
      <span className="mt-1.5" />
      <span className={cn(cell, 'mt-1.5 font-bold')}>{pts(player.points)}</span>
      {player.projected !== null && (
        <>
          <span className="text-muted">Projected</span>
          <span />
          <span className={cn(cell, 'text-muted')}>
            {pts(player.projected)}
          </span>
        </>
      )}
    </div>
  )
}

/** A category league's day as a box-score line: values over their labels. */
function DayLine({ line }: { line: NonNullable<LineupPlayer['dayLine']> }) {
  if (line.length === 0) return <p className="text-muted">No stats today.</p>
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-x-2 gap-y-2">
      {line.map((l) => (
        <span key={l.label} className="flex flex-col items-center">
          <span className="text-sm font-bold tabular-nums">{l.value}</span>
          <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
            {l.label}
          </span>
        </span>
      ))}
    </div>
  )
}
