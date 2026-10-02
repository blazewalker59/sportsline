import { Link } from '@tanstack/react-router'
import { startTime } from './format'
import type { GameSummary } from '@/lib/model/timeline'
import { TeamLogo } from '@/components/brand/TeamMark'
import { cn } from '@/lib/utils'

/**
 * The Sports Day's Games as small score cards, live first. Tapping one
 * filters the Timeline to that Game (a View Transition, so the feed just
 * loses the other Games' messages); tapping it again shows everything.
 * Selecting never changes the strip's layout.
 */
export function GameStrip({
  games,
  selected,
}: {
  games: Array<GameSummary>
  selected?: string
}) {
  if (games.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2 pt-1.5 pb-1">
        {games.map((game) => (
          <li key={game.id} className="shrink-0">
            <GameCard game={game} selected={game.id === selected} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function GameCard({
  game,
  selected,
}: {
  game: GameSummary
  selected: boolean
}) {
  const live = game.status === 'live' || game.status === 'delayed'
  const started = live || game.status === 'final'
  const leader =
    game.score.away === game.score.home
      ? null
      : game.score.away > game.score.home
        ? 'away'
        : 'home'
  return (
    <Link
      to="/"
      search={(prev) => ({ ...prev, game: selected ? undefined : game.id })}
      viewTransition
      resetScroll={false}
      aria-pressed={selected}
      aria-label={`${game.awayTeam.abbreviation} ${game.score.away}, ${game.homeTeam.abbreviation} ${game.score.home}, ${status(game)}${selected ? '. Showing only this game; tap to show all' : ''}`}
      className={cn(
        'relative flex min-h-14 items-center gap-3 rounded-2xl border bg-surface py-1.5 pr-3 pl-2.5 transition-colors',
        selected
          ? 'border-accent bg-accent-soft'
          : live
            ? 'border-live/50'
            : 'border-border',
      )}
    >
      <span className="flex flex-col gap-0.5">
        {(['away', 'home'] as const).map((side) => (
          <span
            key={side}
            className={cn(
              'flex items-center gap-1.5 text-[15px] leading-5 tabular-nums',
              leader === side ? 'font-bold' : 'text-foreground/75',
            )}
          >
            <TeamLogo
              team={side === 'away' ? game.awayTeam : game.homeTeam}
              size={18}
            />
            <span className="w-5 text-right">
              {started ? game.score[side] : ''}
            </span>
          </span>
        ))}
      </span>
      <span
        className={cn(
          'max-w-16 text-[11px] leading-tight font-semibold',
          live ? 'text-live' : 'text-muted',
        )}
      >
        {status(game)}
      </span>
      {selected && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-background"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </span>
      )}
    </Link>
  )
}

function status(game: GameSummary): string {
  switch (game.status) {
    case 'live':
      return game.situation?.segmentLabel ?? 'Live'
    case 'delayed':
      return 'Delayed'
    case 'final':
      return 'Final'
    case 'postponed':
      return 'Ppd'
    default:
      return startTime(game.startsAt)
  }
}
