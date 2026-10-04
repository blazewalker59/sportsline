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
 * Selecting never changes the strip's layout: the selected card's corner
 * badge opens its box score.
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
      <ul className="flex gap-2 pt-2 pb-0.5">
        {games.map((game) => (
          <li key={game.id} className="relative shrink-0">
            <GameCard game={game} selected={game.id === selected} />
            {game.id === selected && onBox && (
              <CornerButton label="Box score" onClick={onBox}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M9 10v10M15 10v10" />
              </CornerButton>
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
              {team.rank && (
                <span className="mr-0.5 text-[10px] font-bold text-muted">
                  {team.rank}
                </span>
              )}
              {team.abbreviation}
            </span>
            <span>{started ? game.score[side] : ''}</span>
          </span>
        )
      })}
    </Link>
  )
}

/**
 * A selected card's action (box score, details) as a badge on its corner:
 * it appears in place, so nothing in the strip moves.
 */
export function CornerButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="animate-in fade-in zoom-in-75 absolute -top-2 -right-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-accent text-background shadow-md ring-2 ring-background duration-200 active:scale-90"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
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
