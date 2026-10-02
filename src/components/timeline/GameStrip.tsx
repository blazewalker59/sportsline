import { Link } from '@tanstack/react-router'
import { startTime } from './format'
import type { GameSummary } from '@/lib/model/timeline'
import { TeamLogo } from '@/components/brand/TeamMark'
import { cn } from '@/lib/utils'

/**
 * Today's Games as small score cards, live first. Tapping one filters the
 * Timeline to that Game; tapping it again (or "All") shows everything.
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
      <ul className="flex gap-2 pb-1">
        {selected && (
          <li className="shrink-0">
            <Link
              to="/"
              search={(prev) => ({ ...prev, game: undefined })}
              className="flex h-full min-h-14 items-center gap-1.5 rounded-2xl bg-foreground px-3 text-[13px] font-semibold text-background"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              All
            </Link>
          </li>
        )}
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
      aria-pressed={selected}
      aria-label={`${game.awayTeam.abbreviation} ${game.score.away}, ${game.homeTeam.abbreviation} ${game.score.home}, ${status(game)}`}
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-2xl border bg-surface py-1.5 pr-3 pl-2.5',
        selected
          ? 'border-accent ring-2 ring-accent/30'
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
