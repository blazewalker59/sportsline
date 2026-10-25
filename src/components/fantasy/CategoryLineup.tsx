/**
 * A category league's Lineup as a box score (as dreamteam lays it out):
 * one side at a time, chosen with a toggle; a row per Player and a column
 * per category, shooting as makes/attempts; each column's leader on the
 * team picked out; the Starters' totals under them; the bench dimmed.
 * The Player column stays put while the stats scroll sideways.
 */

import { useState } from 'react'
import {
  INJURY_ABBREV,
  POSITIONS,
  headshotOf,
  injuryLabel,
  injuryTone,
  shortName,
} from './format'
import { gameState } from './gameState'
import type { LeagueCategory } from '@/lib/fantasy/categories'
import type { LineupPlayer, MatchupSide } from '@/lib/fantasy/matchup'
import type { FantasySport } from '@/lib/fantasy/sports'
import type { GameSummary } from '@/lib/model/timeline'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { CHART_COLORS } from '@/components/charts/ChartCard'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { PlayerButton } from '@/components/players/playerSheet'
import {
  boxCell,
  boxColumns,
  boxLeaders,
  boxTotals,
  played,
} from '@/lib/fantasy/boxScore'
import { cn } from '@/lib/utils'

type Side = 'mine' | 'opponent'

export function CategoryLineup({
  sport,
  categories,
  mine,
  opponent,
  lineups,
  games,
  knowsGames,
  summary = false,
}: {
  sport: FantasySport
  categories: ReadonlyArray<LeagueCategory>
  mine: Pick<MatchupSide, 'abbrev' | 'name'>
  opponent: Pick<MatchupSide, 'abbrev' | 'name'> | null
  /** Each side's Lineup on the day being looked at. */
  lineups: { mine: Array<LineupPlayer>; theirs: Array<LineupPlayer> }
  /** That day's Games. */
  games: ReadonlyArray<GameSummary>
  /** The day's Games are all here: a Player without one isn't playing. */
  knowsGames: boolean
  /**
   * The whole matchup rather than a day: each Player's matchup line, the
   * totals the matchup's, and those who haven't counted dimmed.
   */
  summary?: boolean
}) {
  const [side, setSide] = useState<Side>('mine')
  const timeZone = useTimeZone()
  const shown = side === 'mine' || !opponent ? lineups.mine : lineups.theirs
  const color = side === 'mine' ? CHART_COLORS.mine : CHART_COLORS.opponent
  const columns = boxColumns(sport, categories)
  const starters = shown.filter((p) => p.starter)
  const bench = shown.filter((p) => !p.starter)
  const leaders = new Map(
    columns.map((c) => [
      c.statId,
      boxLeaders(
        sport,
        c,
        starters.map((p) => ({ key: p.espnId, stats: p.dayStats })),
      ),
    ]),
  )
  const totals = boxTotals(starters.map((p) => p.dayStats))
  const tab = (value: Side, label: string, tone: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={side === value}
      onClick={() => setSide(value)}
      className={cn(
        'min-w-0 flex-1 truncate rounded-md px-3 py-1 text-xs font-semibold transition-colors',
        side === value
          ? 'bg-surface text-foreground shadow-sm'
          : 'text-muted hover:text-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className="mr-1.5 inline-block size-2 rounded-full align-middle"
        style={{ background: tone }}
      />
      {label}
    </button>
  )
  const row = (p: LineupPlayer) => {
    const state = gameState(p, games, timeZone)
    const idle = !p.starter || (knowsGames && !state && !played(p.dayStats))
    return (
      <tr key={p.espnId} className={cn(idle && 'opacity-50')}>
        <th
          scope="row"
          className={cn(
            'sticky left-0 z-10 border-r border-b border-border bg-surface px-2 py-1.5 text-left font-normal',
            state?.onField && 'field-state',
          )}
          aria-label={state?.onField ? `${p.name}: on the court` : undefined}
        >
          <PlayerLabel sport={sport} player={p} games={games} slot={!summary} />
        </th>
        {columns.map((c) => {
          const leads = p.starter && leaders.get(c.statId)?.has(p.espnId)
          const cell = boxCell(sport, c, p.dayStats)
          return (
            <td
              key={c.statId}
              className="border-b border-border px-1 py-1.5 text-center"
            >
              <span
                className={cn(
                  'inline-block rounded px-1 py-0.5 leading-none',
                  cell === '–'
                    ? 'text-muted/50'
                    : leads
                      ? 'font-bold ring-1'
                      : 'text-foreground/80',
                )}
                style={
                  leads
                    ? ({
                        color,
                        '--tw-ring-color': color,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {cell}
              </span>
            </td>
          )
        })}
      </tr>
    )
  }
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
          Lineup
        </h3>
        {opponent && (
          <div
            role="tablist"
            aria-label="Whose lineup"
            className="flex w-44 gap-0.5 rounded-lg bg-notice p-0.5"
          >
            {tab('mine', mine.abbrev, CHART_COLORS.mine)}
            {tab('opponent', opponent.abbrev, CHART_COLORS.opponent)}
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[9.5rem] border-r border-b border-border bg-surface px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-muted uppercase">
                {side === 'mine' || !opponent ? mine.name : opponent.name}
              </th>
              {columns.map((c) => (
                <th
                  key={c.statId}
                  className="min-w-[2.75rem] border-b border-border px-1 py-1.5 text-center text-[10px] font-semibold tracking-wide text-muted uppercase"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {starters.map(row)}
            <tr className="bg-notice/60 font-semibold">
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-b border-border bg-notice px-2 py-1.5 text-left text-[10px] tracking-wide uppercase"
              >
                {summary ? 'Matchup' : 'Starters'}
              </th>
              {columns.map((c) => (
                <td
                  key={c.statId}
                  className="border-b border-border px-1 py-1.5 text-center"
                >
                  {boxCell(sport, c, totals)}
                </td>
              ))}
            </tr>
            {bench.map(row)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * The Player column: avatar, name and slot on top; position, team and
 * their Game that day (opponent, state, score) under it.
 */
function PlayerLabel({
  sport,
  player,
  games,
  slot,
}: {
  sport: FantasySport
  player: LineupPlayer
  games: ReadonlyArray<GameSummary>
  /** Mark a Player who isn't starting with their slot (BN, IR). */
  slot: boolean
}) {
  const state = gameState(player, games, useTimeZone())
  const position = player.positionId
    ? POSITIONS[sport][player.positionId]
    : undefined
  const injury = player.injury
    ? (INJURY_ABBREV[player.injury] ?? player.injury.slice(0, 4))
    : null
  const name = (
    <span className="block truncate text-[12px] leading-tight font-semibold">
      {shortName(player)}
    </span>
  )
  let game: React.ReactNode = null
  if (state) {
    const g = state.game
    const them = state.home ? g.awayTeam : g.homeTeam
    const ours = state.home ? g.score.home : g.score.away
    const theirs = state.home ? g.score.away : g.score.home
    game = (
      <span className="text-foreground/80">
        {state.home ? 'vs' : '@'}
        {them.abbreviation}{' '}
        <span
          className={cn(
            state.live ? 'text-amber-700 dark:text-amber-300' : 'text-muted',
          )}
        >
          {state.status}
        </span>
        {!state.upcoming && (
          <span className="font-semibold text-foreground">
            {' '}
            {ours}-{theirs}
          </span>
        )}
      </span>
    )
  }
  return (
    <span className="flex max-w-[11rem] items-center gap-1.5">
      <PlayerAvatar
        name={player.name}
        headshotUrl={headshotOf(sport, player)}
        size={24}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          {player.playerId ? (
            <PlayerButton playerId={player.playerId} className="min-w-0">
              {name}
            </PlayerButton>
          ) : (
            name
          )}
          {slot && !player.starter && (
            <span className="shrink-0 rounded bg-notice px-1 text-[8px] leading-tight font-bold text-muted uppercase">
              {player.slot === 'Bench' ? 'BN' : player.slot}
            </span>
          )}
          {injury && (
            <span
              title={injuryLabel(player.injury!)}
              className={cn(
                'shrink-0 text-[9px] font-bold',
                injuryTone(player.injury) === 'yellow'
                  ? 'text-yellow-700 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {injury}
            </span>
          )}
        </span>
        <span className="block truncate text-[10px] leading-tight text-muted">
          {[position, player.teamAbbrev].filter(Boolean).join(' · ')}
          {game && <> · {game}</>}
        </span>
      </span>
    </span>
  )
}
