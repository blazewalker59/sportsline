import { Link } from '@tanstack/react-router'
import type { Scope } from '@/lib/model/scope'
import type { RowItem } from '@/lib/model/leagues'
import { RowItemMark, rowItemName } from '@/components/brand/RowItemMark'
import { cn } from '@/lib/utils'

/**
 * All · Following · the Viewer's Leagues and college football groups, in
 * their order. Switching Scope is a View Transition
 * over cached data, like changing day.
 */
export function ScopeBar({
  scope,
  items,
  canFollow,
}: {
  scope: Scope
  /** The Viewer's visible Leagues and college groups, in their order. */
  items: ReadonlyArray<RowItem>
  /** The Viewer follows something, so "Following" is offered. */
  canFollow: boolean
}) {
  const chip = (
    value: Scope,
    label: React.ReactNode | ((selected: boolean) => React.ReactNode),
    ariaLabel: string,
  ) => {
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
          {typeof label === 'function' ? label(selected) : label}
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
          {items.map((item) =>
            chip(
              item,
              (selected) => <RowItemMark item={item} inverse={selected} />,
              item === 'top25'
                ? 'AP Top 25 college football'
                : `${rowItemName(item)} only`,
            ),
          )}
        </ol>
      </div>
    </div>
  )
}
