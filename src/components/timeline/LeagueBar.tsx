import { useEffect, useRef } from 'react'
import { useGoToScope } from './scopeNav'
import { CHIP, CHIP_ON } from './signalClasses'
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
 * Leagues, then the Viewer's Leagues in the order they arranged (college
 * ones covering only what the Viewer opted into), as a row of chips
 * scrolling sideways, the chosen one inked (Signal: never a blue fill). Choosing one is
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
      className="-mx-4 overflow-x-auto px-4 py-0.5 [scrollbar-width:none]"
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
                  'flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-control px-2.5 text-3xs font-bold uppercase',
                  CHIP,
                  selected && CHIP_ON,
                )}
              >
                {item === 'all' ? (
                  'All leagues'
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
