import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { Scope } from '@/lib/model/scope'
import type { RowItem } from '@/lib/model/leagues'
import {
  RowItemMark,
  rowItemLabel,
  rowItemName,
} from '@/components/brand/RowItemMark'
import { isLeague } from '@/lib/model/leagues'
import { cn } from '@/lib/utils'

const LAST_LEAGUE_KEY = 'sportsline:leagueScope'

/**
 * Four views: the Leagues picker (All, or one League or college group),
 * Following, Predictions and Fantasy. The picker is one pill: tapped from
 * another view it returns to the last League choice; tapped while showing,
 * it opens the list of the Viewer's Leagues and college groups, in their
 * order. Switching Scope is a View Transition over cached data.
 */
export function ScopeBar({
  scope,
  items,
  canFollow,
  canPredict,
  canFantasy,
}: {
  scope: Scope
  /** The Viewer's visible Leagues and college groups, in their order. */
  items: ReadonlyArray<RowItem>
  /** The Viewer follows something, so "Following" is offered. */
  canFollow: boolean
  /** The Viewer has connected Kalshi, so "Predictions" is offered. */
  canPredict?: boolean
  /** The Viewer has Fantasy Matchups, so "Fantasy" is offered. */
  canFantasy?: boolean
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const leagueScope = scope === 'all' || items.includes(scope as RowItem)
  // The League choice to return to from another view.
  const [lastLeague, setLastLeague] = useState<'all' | RowItem>('all')
  useEffect(() => {
    if (leagueScope) {
      setLastLeague(scope as 'all' | RowItem)
      try {
        localStorage.setItem(LAST_LEAGUE_KEY, scope)
      } catch {
        // Storage is a convenience.
      }
      return
    }
    try {
      const saved = localStorage.getItem(LAST_LEAGUE_KEY)
      if (saved && items.includes(saved as RowItem))
        setLastLeague(saved as RowItem)
    } catch {
      // Storage is a convenience.
    }
  }, [scope, leagueScope, items])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const go = (value: Scope) => {
    setMenuOpen(false)
    void navigate({
      to: '/',
      search: (prev) => ({
        ...prev,
        scope: value,
        game: undefined,
        play: undefined,
        // A Scope replaces any one Prediction the Timeline was narrowed to.
        prediction: undefined,
        matchup: undefined,
      }),
      viewTransition: true,
      resetScroll: false,
    })
  }
  const chipClass = (selected: boolean) =>
    cn(
      'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
      selected
        ? 'bg-foreground text-background'
        : 'bg-notice text-muted hover:text-foreground',
    )
  const chip = (value: Scope, label: string, ariaLabel: string) => (
    <li key={value}>
      <button
        type="button"
        onClick={() => go(value)}
        aria-current={value === scope ? 'true' : undefined}
        aria-label={ariaLabel}
        className={chipClass(value === scope)}
      >
        {label}
      </button>
    </li>
  )
  const shown: 'all' | RowItem = leagueScope
    ? (scope as 'all' | RowItem)
    : lastLeague

  return (
    <div className="relative flex items-center gap-2 pt-1 pb-2">
      <div className="-ml-4 min-w-0 flex-1 overflow-x-auto pl-4 [scrollbar-width:none]">
        <ol className="flex w-max gap-1.5" aria-label="Scope">
          <li>
            <button
              type="button"
              onClick={() =>
                leagueScope ? setMenuOpen((o) => !o) : go(lastLeague)
              }
              aria-current={leagueScope ? 'true' : undefined}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={
                shown === 'all'
                  ? 'All Leagues: choose a League'
                  : `${rowItemName(shown)}: choose a League`
              }
              className={chipClass(leagueScope)}
            >
              {shown === 'all' ? (
                'All'
              ) : (
                <ItemLabel item={shown} inverse={leagueScope} />
              )}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={cn(
                  'size-3.5 fill-none stroke-current stroke-[2.5] transition-transform',
                  menuOpen && 'rotate-180',
                )}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </li>
          {canFollow && chip('following', 'Following', 'Following')}
          {canPredict && chip('predictions', 'Predictions', 'Your Predictions')}
          {canFantasy && chip('fantasy', 'Fantasy', 'Your Fantasy Matchups')}
        </ol>
      </div>
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close League list"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <ul
            role="menu"
            aria-label="Leagues"
            className="animate-in fade-in slide-in-from-top-1 absolute top-full left-0 z-20 max-h-[60dvh] w-60 overflow-y-auto rounded-2xl border border-border bg-surface py-1.5 shadow-xl duration-150"
          >
            {(['all', ...items] as const).map((item) => {
              const selected = item === scope
              return (
                <li key={item} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => go(item)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm font-medium hover:bg-notice',
                      // College groups sit under College Football.
                      item !== 'all' && !isLeague(item) && 'pl-8',
                    )}
                  >
                    <span className="flex w-6 justify-center">
                      {item === 'all' ? (
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className="size-5 fill-none stroke-current stroke-2 text-muted"
                        >
                          <rect x="4" y="4" width="7" height="7" rx="1.5" />
                          <rect x="13" y="4" width="7" height="7" rx="1.5" />
                          <rect x="4" y="13" width="7" height="7" rx="1.5" />
                          <rect x="13" y="13" width="7" height="7" rx="1.5" />
                        </svg>
                      ) : item === 'top25' ? (
                        <span className="text-[10px] font-bold text-muted">
                          25
                        </span>
                      ) : (
                        <RowItemMark item={item} size={20} />
                      )}
                    </span>
                    <span className="flex-1">
                      {item === 'all' ? 'All Leagues' : rowItemName(item)}
                    </span>
                    {selected && (
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="size-4 fill-none stroke-accent stroke-[2.5]"
                      >
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

/** A League choice on the pill: its mark and short name. */
function ItemLabel({ item, inverse }: { item: RowItem; inverse: boolean }) {
  if (item === 'top25') return <>Top 25</>
  return (
    <>
      <RowItemMark item={item} size={18} inverse={inverse} />
      {rowItemLabel(item)}
    </>
  )
}
