/**
 * The Viewer's Scope row on the Follows screen: Leagues and college
 * football's groups. Drag the handle (or use the arrow keys on it) to
 * reorder, Hide/Show to drop an item from the row (a League also from
 * All), and Follow Leagues as before.
 */

import { useRef, useState } from 'react'
import { FollowButton } from './FollowButton'
import type { RowItem } from '@/lib/model/leagues'
import { RowItemMark, rowItemName } from '@/components/brand/RowItemMark'
import {
  DEFAULT_LEAGUE_SETTINGS,
  isLeague,
  moveLeague,
  visibleLeagues,
} from '@/lib/model/leagues'
import { useSetLeagueSettings, useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

interface Drag {
  league: RowItem
  from: number
  startY: number
  dy: number
  rowHeight: number
}

export function LeagueList() {
  const { data } = useViewer()
  const save = useSetLeagueSettings()
  const settings = data?.leagues ?? DEFAULT_LEAGUE_SETTINGS
  const [drag, setDrag] = useState<Drag | null>(null)
  const list = useRef<HTMLOListElement>(null)

  const target = drag
    ? Math.max(
        0,
        Math.min(
          settings.order.length - 1,
          drag.from + Math.round(drag.dy / drag.rowHeight),
        ),
      )
    : -1
  // Rows keep their DOM order while dragging (moving the dragged node would
  // drop its pointer capture); the others slide to show where it lands.
  const shift = (index: number): number => {
    if (!drag) return 0
    if (index === drag.from) return drag.dy
    if (drag.from < target && index > drag.from && index <= target)
      return -drag.rowHeight
    if (target < drag.from && index >= target && index < drag.from)
      return drag.rowHeight
    return 0
  }
  // All needs a League to show: the last visible one can't be hidden.
  const lastLeague = visibleLeagues(settings).length <= 1

  const reorder = (league: RowItem, to: number) => {
    const next = moveLeague(settings.order, league, to)
    if (next.join() !== settings.order.join())
      save.mutate({ ...settings, order: next })
  }
  const toggle = (league: RowItem) => {
    const hidden = settings.hidden.includes(league)
      ? settings.hidden.filter((l) => l !== league)
      : [...settings.hidden, league]
    save.mutate({ ...settings, hidden })
  }

  return (
    <ol
      ref={list}
      className="divide-y divide-border rounded-xl border border-border bg-surface"
      aria-label="Leagues, in the order they appear"
    >
      {settings.order.map((league, index) => {
        const hidden = settings.hidden.includes(league)
        const dragging = drag?.league === league
        return (
          <li
            key={league}
            className={cn(
              'relative flex h-14 items-center gap-3 bg-surface pr-3 pl-1',
              dragging
                ? 'z-10 rounded-xl shadow-lg ring-1 ring-border'
                : drag && 'transition-transform duration-150',
            )}
            style={
              drag ? { transform: `translateY(${shift(index)}px)` } : undefined
            }
          >
            <button
              type="button"
              aria-label={`Move ${rowItemName(league)}. Use the arrow keys to reorder.`}
              className="flex h-full w-10 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                const row = e.currentTarget.closest('li')
                setDrag({
                  league,
                  from: index,
                  startY: e.clientY,
                  dy: 0,
                  rowHeight: row?.getBoundingClientRect().height ?? 56,
                })
              }}
              onPointerMove={(e) =>
                setDrag((d) =>
                  d && d.league === league
                    ? { ...d, dy: e.clientY - d.startY }
                    : d,
                )
              }
              onPointerUp={() => {
                if (drag) reorder(drag.league, target)
                setDrag(null)
              }}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  reorder(league, index + (e.key === 'ArrowUp' ? -1 : 1))
                }
              }}
            >
              <svg
                width="14"
                height="20"
                viewBox="0 0 14 20"
                fill="currentColor"
                aria-hidden="true"
              >
                {[3, 10, 17].flatMap((y) =>
                  [4, 10].map((x) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />
                  )),
                )}
              </svg>
            </button>
            <span
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3',
                hidden && 'opacity-45',
              )}
            >
              <span className="flex w-[30px] shrink-0 justify-center">
                <RowItemMark item={league} size={26} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {rowItemName(league)}
                </span>
                {!isLeague(league) && (
                  <span className="truncate text-xs text-muted">
                    College Football
                  </span>
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => toggle(league)}
              disabled={!hidden && isLeague(league) && lastLeague}
              aria-pressed={!hidden}
              className={cn(
                'min-h-9 rounded-full px-3 text-[13px] font-semibold disabled:opacity-40',
                hidden
                  ? 'bg-notice text-muted'
                  : 'border border-border text-foreground/80',
              )}
            >
              {hidden ? 'Show' : 'Hide'}
            </button>
            {isLeague(league) && (
              <FollowButton follow={{ kind: 'league', league }} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
