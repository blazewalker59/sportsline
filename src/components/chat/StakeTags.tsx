/**
 * Under a bubble: what the play did for the Viewer (src/lib/timeline/
 * stakes.ts). Whose Fantasy Starter it named, and which of their open
 * Predictions' Legs it moved, with the Leg's count so far.
 */

import { createContext, useContext } from 'react'
import type { TimelineItem } from '@/lib/model/timeline'
import type { StakeIndex } from '@/lib/timeline/stakes'
import { itemStakes } from '@/lib/timeline/stakes'
import { cn } from '@/lib/utils'

const Stakes = createContext<StakeIndex | null>(null)

export function StakesProvider({
  index,
  children,
}: {
  index: StakeIndex
  children: React.ReactNode
}) {
  return <Stakes.Provider value={index}>{children}</Stakes.Provider>
}

export function StakeTags({
  item,
  align,
}: {
  item: TimelineItem
  align: 'left' | 'right'
}) {
  const index = useContext(Stakes)
  if (!index) return null
  const { fantasy, legs } = itemStakes(item, index)
  if (!fantasy && legs.length === 0) return null
  return (
    <span
      className={cn(
        'flex flex-wrap gap-x-3 gap-y-1 px-1.5 font-label text-3xs leading-tight',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      {fantasy && (
        <span
          data-stake={fantasy.side}
          className={cn(
            'inline-flex items-center gap-1.5',
            // Orange is the Viewer's own; an opponent's stays in ink.
            fantasy.side === 'mine' ? 'text-live' : 'text-notable',
          )}
        >
          <Dot mine={fantasy.side === 'mine'} />
          {fantasy.side === 'mine' ? '★ Your starter' : 'Opponent'} ·{' '}
          {fantasy.names.join(', ')}
        </span>
      )}
      {legs.map(({ prediction, leg }, i) => (
        <span
          key={`${prediction.id}:${i}`}
          data-stake="leg"
          className="inline-flex items-center gap-1.5 text-live tabular-nums"
        >
          <Dot mine />
          {leg.title}
          {leg.progress && (
            <>
              <span>
                {leg.progress.current}/{leg.progress.target}
              </span>
              <LegMeter
                share={leg.progress.current / Math.max(1, leg.progress.target)}
              />
            </>
          )}
        </span>
      ))}
    </span>
  )
}

function Dot({ mine }: { mine: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        mine ? 'bg-signal' : 'bg-notable',
      )}
    />
  )
}

/** A Leg's Progress as a tiny segmented meter (Signal's Meter, in small). */
function LegMeter({ share }: { share: number }) {
  const segments = 6
  const filled = Math.round(Math.min(1, Math.max(0, share)) * segments)
  return (
    <span aria-hidden="true" className="inline-grid grid-cols-6 gap-px">
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="meter-seg h-1.5 w-1"
          data-on={i < filled ? '' : undefined}
          data-edge={i === filled - 1 ? '' : undefined}
        />
      ))}
    </span>
  )
}
