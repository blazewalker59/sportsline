import { useEffect, useRef } from 'react'
import { useGoToScope } from './scopeNav'
import type { Scope } from '@/lib/model/scope'
import type { RowItem } from '@/lib/model/leagues'
import {
  RowItemMark,
  rowItemLabel,
  rowItemName,
} from '@/components/brand/RowItemMark'
import { cn } from '@/lib/utils'

/**
 * The League row, in the All tab's hero (LiveBoard's ScopeHero): All
 * Leagues, then the Viewer's Leagues and college groups (Top 25, the
 * Conferences) in the order they arranged, as one segmented control (the
 * same control as the board's others) scrolling sideways. Choosing one is
 * a View Transition to that Scope. Following, Predictions and Fantasy are
 * the main navigation's other tabs, so they aren't offered here.
 */
export function LeagueBar({
  scope,
  items,
}: {
  /** The League-shaped Scope showing. */
  scope: Scope
  /** The Viewer's visible Leagues and college groups, in their order. */
  items: ReadonlyArray<RowItem>
}) {
  const goTo = useGoToScope()
  const row = useRef<HTMLDivElement>(null)
  // The chosen one in view, even when it's far along the row.
  useEffect(() => {
    const chip = row.current?.querySelector<HTMLElement>('[aria-current]')
    const strip = row.current
    if (!chip || !strip) return
    const left = chip.offsetLeft - strip.offsetLeft
    if (left + chip.offsetWidth > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = left + chip.offsetWidth - strip.clientWidth + 16
    else if (left < strip.scrollLeft) strip.scrollLeft = Math.max(0, left - 16)
  }, [scope])

  return (
    <div
      ref={row}
      className="-mx-3.5 overflow-x-auto px-3.5 [scrollbar-width:none]"
    >
      <ol
        className="flex w-max gap-0.5 rounded-full bg-notice p-0.5"
        aria-label="Leagues"
      >
        {(['all', ...items] as const).map((item) => {
          const selected = item === scope
          return (
            <li key={item}>
              <button
                type="button"
                onClick={() => goTo(item)}
                aria-current={selected ? 'true' : undefined}
                aria-label={item === 'all' ? 'All Leagues' : rowItemName(item)}
                className={cn(
                  'flex h-7 min-w-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                  selected
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {item === 'all' ? (
                  'All leagues'
                ) : item === 'top25' ? (
                  'Top 25'
                ) : (
                  <>
                    <RowItemMark item={item} size={16} />
                    {rowItemLabel(item)}
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
