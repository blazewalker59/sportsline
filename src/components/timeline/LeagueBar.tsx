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
 *
 * On a phone it sits in the All tab's hero as a segmented control, the
 * same control as the board's others (`segmented`); from `md`, chips
 * under the header.
 */
export function LeagueBar({
  scope,
  items,
  segmented = false,
}: {
  /** The League-shaped Scope showing. */
  scope: Scope
  /** The Viewer's visible Leagues and college groups, in their order. */
  items: ReadonlyArray<RowItem>
  /** A segmented control (the phone's All hero), not a row of chips. */
  segmented?: boolean
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
      className={cn(
        'overflow-x-auto [scrollbar-width:none]',
        segmented ? '-mx-3.5 px-3.5' : '-mx-4 px-4 pt-1 pb-1 lg:mx-0 lg:px-0',
      )}
    >
      <ol
        className={cn(
          'flex w-max',
          segmented ? 'gap-0.5 rounded-full bg-notice p-0.5' : 'gap-1.5',
        )}
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
                  'flex min-w-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                  segmented ? 'h-7' : 'h-8',
                  selected
                    ? segmented
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'bg-foreground text-background'
                    : segmented
                      ? 'text-muted hover:text-foreground'
                      : 'bg-notice text-muted hover:text-foreground',
                )}
              >
                {item === 'all' ? (
                  segmented ? (
                    'All leagues'
                  ) : (
                    'All'
                  )
                ) : item === 'top25' ? (
                  'Top 25'
                ) : (
                  <>
                    <RowItemMark
                      item={item}
                      size={16}
                      inverse={selected && !segmented}
                    />
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
