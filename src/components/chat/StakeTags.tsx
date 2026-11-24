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
        'flex flex-wrap gap-1 px-1 text-3xs font-semibold',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      {fantasy && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5',
            fantasy.side === 'mine'
              ? 'bg-scoring/15 text-scoring'
              : 'bg-live/10 text-live',
          )}
        >
          {fantasy.side === 'mine' ? '★ Your starter' : 'Opponent'} ·{' '}
          {fantasy.names.join(', ')}
        </span>
      )}
      {legs.map(({ prediction, leg }, i) => (
        <span
          key={`${prediction.id}:${i}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-positive/15 px-2 py-0.5 text-positive tabular-nums"
        >
          {leg.title}
          {leg.progress && (
            <>
              <span>
                {leg.progress.current}/{leg.progress.target}
              </span>
              <span
                aria-hidden="true"
                className="h-1 w-7 overflow-hidden rounded-full bg-positive/25"
              >
                <span
                  className="block h-full rounded-full bg-positive"
                  style={{
                    width: `${Math.min(100, (leg.progress.current / Math.max(1, leg.progress.target)) * 100)}%`,
                  }}
                />
              </span>
            </>
          )}
        </span>
      ))}
    </span>
  )
}
