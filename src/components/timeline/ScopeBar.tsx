import { Link } from '@tanstack/react-router'
import type { Scope } from '@/lib/model/scope'
import { LeagueLogo, leagueLabel } from '@/components/brand/LeagueLogo'
import { LEAGUES } from '@/lib/model/types'
import { cn } from '@/lib/utils'

/**
 * All · Following · each League (and college football's Top 25). Switching Scope is a View Transition
 * over cached data, like changing day.
 */
export function ScopeBar({
  scope,
  canFollow,
}: {
  scope: Scope
  /** The Viewer follows something, so "Following" is offered. */
  canFollow: boolean
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
          {LEAGUES.flatMap((league) => [
            chip(
              league,
              <LeagueLogo league={league} size={20} />,
              `${leagueLabel(league)} only`,
            ),
            // College football's AP Top 25 sits beside its League.
            league === 'cfb' &&
              chip('top25', 'Top 25', 'AP Top 25 college football'),
          ])}
        </ol>
      </div>
    </div>
  )
}
