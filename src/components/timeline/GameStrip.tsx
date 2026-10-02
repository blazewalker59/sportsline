import { Link } from '@tanstack/react-router'
import { startTime } from './format'
import type { GameSummary } from '@/lib/model/timeline'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
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
  onBox,
}: {
  games: Array<GameSummary>
  selected?: string
  /** Opens the selected Game's box score; its button sits beside the card. */
  onBox?: () => void
}) {
  if (games.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2 pt-1.5 pb-0.5">
        {games.map((game) => (
          <li key={game.id} className="flex shrink-0 gap-1.5">
            <GameCard game={game} selected={game.id === selected} />
            {game.id === selected && onBox && (
              <button
                type="button"
                onClick={onBox}
                aria-label="Box score"
                className="animate-in fade-in zoom-in-95 flex w-12 flex-col items-center justify-center gap-0.5 rounded-2xl bg-notice text-[10px] font-semibold text-muted duration-200 hover:text-foreground"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 10h18M9 10v10M15 10v10" />
                </svg>
                Box
              </button>
            )}
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
        'relative flex w-[124px] flex-col gap-0.5 rounded-2xl border bg-surface px-2.5 py-1.5 transition-colors',
        selected
          ? 'border-accent bg-accent-soft'
          : live
            ? 'border-live/50'
            : 'border-border',
      )}
    >
      <span className="flex items-center gap-1.5">
        <LeagueLogo league={game.league} size={16} />
        <span
          className={cn(
            'truncate text-[11px] leading-tight font-semibold',
            live ? 'text-live' : 'text-muted',
          )}
        >
          {status(game)}
        </span>
      </span>
      {(['away', 'home'] as const).map((side) => {
        const team = side === 'away' ? game.awayTeam : game.homeTeam
        return (
          <span
            key={side}
            className={cn(
              'flex items-center gap-1.5 text-[15px] leading-[22px] tabular-nums',
              leader === side ? 'font-bold' : 'text-foreground/75',
            )}
          >
            <TeamLogo team={team} size={22} />
            <span className="flex-1 text-[13px] font-semibold">
              {team.abbreviation}
            </span>
            <span>{started ? game.score[side] : ''}</span>
          </span>
        )
      })}
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
