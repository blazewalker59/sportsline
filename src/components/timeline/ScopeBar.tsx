import { Link } from '@tanstack/react-router'
import type { Scope } from '@/lib/model/scope'
import { LeagueLogo, leagueLabel } from '@/components/brand/LeagueLogo'
import { LEAGUES } from '@/lib/model/types'
import { cn } from '@/lib/utils'

/**
 * All · Following · each League, plus the Highlights toggle. Switching
 * Scope is a View Transition over cached data, like changing day.
 */
export function ScopeBar({
  scope,
  canFollow,
  highlights,
  onHighlights,
}: {
  scope: Scope
  /** The Viewer follows something, so "Following" is offered. */
  canFollow: boolean
  highlights: boolean
  onHighlights: (on: boolean) => void
}) {
  const chip = (value: Scope, label: React.ReactNode, ariaLabel: string) => {
    const selected = value === scope
    return (
      <li key={value}>
        <Link
          to="/"
          search={(prev) => ({
            ...prev,
            scope: value,
            game: undefined,
            play: undefined,
          })}
          viewTransition
          resetScroll={false}
          aria-current={selected ? 'true' : undefined}
          aria-label={ariaLabel}
          className={cn(
            'flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold transition-colors',
            selected
              ? 'bg-foreground text-background'
              : 'bg-notice text-muted hover:text-foreground',
          )}
        >
          {label}
        </Link>
      </li>
    )
  }
  return (
    <div className="flex items-center gap-2 pt-1 pb-2">
      <div className="-ml-4 min-w-0 flex-1 overflow-x-auto pl-4 [scrollbar-width:none]">
        <ol className="flex w-max gap-1.5" aria-label="Scope">
          {chip('all', 'All', 'All Leagues')}
          {canFollow && chip('following', 'Following', 'Following')}
          {LEAGUES.map((league) =>
            chip(
              league,
              <LeagueLogo league={league} size={20} />,
              `${leagueLabel(league)} only`,
            ),
          )}
        </ol>
      </div>
      <button
        type="button"
        onClick={() => onHighlights(!highlights)}
        aria-pressed={highlights}
        aria-label="Highlights only"
        title="Highlights only"
        className={cn(
          'flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors',
          highlights ? 'bg-accent text-background' : 'bg-notice text-muted',
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
        </svg>
        <span className="sr-only sm:not-sr-only">Highlights</span>
      </button>
    </div>
  )
}
