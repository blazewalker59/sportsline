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
 * The League row, under the All tab: All Leagues, then the Viewer's
 * Leagues and college groups (Top 25, the Conferences) in the order they
 * arranged, a chip each, scrolling sideways. Choosing one is a View
 * Transition to that Scope. Following, Predictions and Fantasy are the
 * main navigation's other tabs, so they aren't offered here.
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
  // The chosen chip in view, even when it's far along the row.
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
      className="-mx-4 overflow-x-auto px-4 pt-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      <ol className="flex w-max gap-1.5" aria-label="Leagues">
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
                  'flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                  selected
                    ? 'bg-foreground text-background'
                    : 'bg-notice text-muted hover:text-foreground',
                )}
              >
                {item === 'all' ? (
                  'All'
                ) : item === 'top25' ? (
                  'Top 25'
                ) : (
                  <>
                    <RowItemMark item={item} size={16} inverse={selected} />
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
