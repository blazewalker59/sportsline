/**
 * Both Lineups slot by slot, each side a Player cell laid out as dreamteam
 * lays out football: name and figure, position · team · injury, and the
 * Player's Game as a strip.
 */

import { useState } from 'react'
import { Breakdown } from './Breakdown'
import {
  INJURY_ABBREV,
  POSITIONS,
  POSITION_COLOR,
  SLOT_TONES,
  headshotOf,
  injuryLabel,
  injuryTone,
  playerFigure,
  pts,
  shortName,
} from './format'
import { gameState } from './gameState'
import type { GameState } from './gameState'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer } from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { TeamLogo } from '@/components/brand/TeamMark'
import { PlayerButton } from '@/components/players/playerSheet'
import { cn } from '@/lib/utils'

/**
 * One side of a Lineup row (dreamteam's football layout): name and figure
 * abreast on the top line, position · team · injury under the name, the
 * projection under the figure, and the Game as a strip across the bottom.
 * On the field shows as an edge bar and tint, not a label.
 */
function PlayerCell({
  sport,
  player,
  align,
  games,
  open,
  onToggle,
  byes = false,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer | undefined
  align: 'left' | 'right'
  games: ReadonlyArray<GameSummary>
  open: boolean
  onToggle: () => void
  byes?: boolean
}) {
  if (!player) return <div className="min-h-14" />
  const right = align === 'right'
  const state = gameState(player, games)
  const position = player.positionId
    ? POSITIONS[sport][player.positionId]
    : undefined
  const injury = player.injury
    ? (INJURY_ABBREV[player.injury] ?? player.injury.slice(0, 4))
    : null
  const tone = injuryTone(player.injury)
  // One line, never split inside a word: longer names step down a size
  // to fit, and only then trail off.
  const short = shortName(player)
  const name = (
    <span
      title={player.name}
      className={cn(
        'block truncate leading-tight font-semibold whitespace-nowrap',
        short.length > 14
          ? 'text-[11px] tracking-tight'
          : short.length > 11
            ? 'text-[12px] tracking-tight'
            : 'text-[12.5px]',
      )}
    >
      {short}
    </span>
  )
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg px-1 py-1.5',
        state?.onField && 'field-state',
        state?.onField && right && 'field-state--right',
        state?.redZone && 'field-state--red-zone',
      )}
      aria-label={
        state?.onField
          ? `${player.name}: ${state.redZone ? 'in the red zone' : 'on the field'}`
          : undefined
      }
    >
      <div
        className={cn('flex items-start gap-1', right && 'flex-row-reverse')}
      >
        <Avatar sport={sport} player={player} />
        <div className={cn('min-w-0 flex-1', right && 'text-right')}>
          {player.playerId ? (
            <PlayerButton
              playerId={player.playerId}
              className={cn('w-full', right && 'text-right')}
            >
              {name}
            </PlayerButton>
          ) : (
            name
          )}
          <span
            className={cn(
              'mt-0.5 flex flex-wrap items-center gap-x-1 text-[10px] leading-tight font-medium',
              right && 'justify-end',
            )}
          >
            {position && (
              <span
                className={cn(
                  'font-bold',
                  POSITION_COLOR[position] ?? 'text-muted',
                )}
              >
                {position}
              </span>
            )}
            {position && player.teamAbbrev && (
              <span className="text-muted/60" aria-hidden="true">
                ·
              </span>
            )}
            {player.teamAbbrev && (
              <span className="text-muted">{player.teamAbbrev}</span>
            )}
            {injury && (
              <span
                className={cn(
                  'font-bold',
                  tone === 'yellow'
                    ? 'text-yellow-700 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400',
                )}
                title={injuryLabel(player.injury!)}
              >
                {injury}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={
            player.dayLine == null
              ? `${shortName(player)}: ${pts(player.points)} points. Show breakdown`
              : `${shortName(player)}: today's line`
          }
          className={cn(
            'flex shrink-0 flex-col rounded-md px-0.5 py-0.5 tabular-nums transition-colors',
            right ? 'items-start' : 'items-end',
            open ? 'bg-accent-soft' : 'hover:bg-notice',
          )}
        >
          <span className="text-[14px] leading-tight font-bold">
            {playerFigure(player)}
          </span>
          {player.dayLine == null && player.projected !== null && (
            <span className="text-[10px] leading-tight text-muted">
              {pts(player.projected)}
            </span>
          )}
        </button>
      </div>
      {state ? (
        <GameStrip player={player} state={state} />
      ) : (
        byes &&
        player.teamId && (
          <span className="block rounded-md border border-border/60 px-1.5 py-1 text-center text-[9px] leading-none font-semibold tracking-wide text-muted uppercase">
            Bye week
          </span>
        )
      )}
    </div>
  )
}

/**
 * The Player's Game across the bottom of their cell: their team and score,
 * the opponent's, and its state; quieter before kickoff, warm while live.
 */
function GameStrip({
  player,
  state,
}: {
  player: LineupPlayer
  state: GameState
}) {
  const g = state.game
  const ours = state.home ? g.homeTeam : g.awayTeam
  const theirs = state.home ? g.awayTeam : g.homeTeam
  const ourScore = state.home ? g.score.home : g.score.away
  const theirScore = state.home ? g.score.away : g.score.home
  const started = !state.upcoming
  return (
    <span
      className={cn(
        'block rounded-md border px-1.5 py-1 tabular-nums',
        state.upcoming
          ? 'border-border/70 bg-background/40'
          : state.live
            ? 'border-amber-500/25 bg-amber-500/10'
            : 'border-border/40 bg-notice/60',
      )}
    >
      <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 text-[10px] leading-none font-semibold">
        <span className="flex min-w-0 items-center gap-1">
          <TeamLogo team={ours} size={13} />
          <span className="truncate">
            {player.teamAbbrev ?? ours.abbreviation}
          </span>
          {started && <span>{ourScore}</span>}
        </span>
        <span className="text-muted" aria-hidden="true">
          {started ? '-' : state.home ? 'vs' : '@'}
        </span>
        <span className="flex min-w-0 items-center justify-end gap-1">
          {started && <span>{theirScore}</span>}
          <span className="truncate">{theirs.abbreviation}</span>
          <TeamLogo team={theirs} size={13} />
        </span>
      </span>
      <span
        className={cn(
          'mt-1 block text-center text-[9px] leading-none font-semibold tracking-wide uppercase',
          state.live ? 'text-amber-700 dark:text-amber-300' : 'text-muted',
        )}
      >
        {state.status}
      </span>
    </span>
  )
}

function Avatar({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  // Injury reads as its letter (Q, O) on the meta line, not a dot here.
  return (
    <PlayerAvatar
      name={player.name}
      headshotUrl={headshotOf(sport, player)}
      size={22}
    />
  )
}

/**
 * Both Lineups slot by slot: the Viewer's Player left, their opponent's
 * right, the slot as a small chip on the top line between them.
 */
export function LineupRows({
  sport,
  mine,
  theirs,
  games,
  byes = false,
}: {
  sport: FantasyLeagueView['sport']
  mine: Array<LineupPlayer>
  theirs: Array<LineupPlayer>
  games: ReadonlyArray<GameSummary>
  /** The week's Games are all here: a Team without one is on a bye. */
  byes?: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const rows = Math.max(mine.length, theirs.length)
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {Array.from({ length: rows }, (_, i) => {
        const slot = (mine[i] ?? theirs[i])?.slot ?? ''
        const toggle = (side: 'm' | 't') => () =>
          setOpen((o) => (o === `${side}${i}` ? null : `${side}${i}`))
        const expanded =
          open === `m${i}` ? mine[i] : open === `t${i}` ? theirs[i] : undefined
        return (
          <li key={i}>
            <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-start gap-x-0.5 px-0.5 py-1">
              <PlayerCell
                sport={sport}
                player={mine[i]}
                align="left"
                games={games}
                byes={byes}
                open={open === `m${i}`}
                onToggle={toggle('m')}
              />
              <span
                className={cn(
                  'mt-2 flex h-6 items-center justify-center rounded-md text-[9px] leading-none font-bold uppercase',
                  SLOT_TONES[slot] ?? 'bg-notice text-muted',
                )}
              >
                {slot === 'Bench' ? 'BN' : slot}
              </span>
              <PlayerCell
                sport={sport}
                player={theirs[i]}
                align="right"
                games={games}
                byes={byes}
                open={open === `t${i}`}
                onToggle={toggle('t')}
              />
            </div>
            {expanded && <Breakdown sport={sport} player={expanded} />}
          </li>
        )
      })}
    </ul>
  )
}
