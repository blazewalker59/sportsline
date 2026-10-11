/**
 * Fantasy tags in the feed: which plays are by one of the Viewer's
 * Starters, or their opponent's, in the Viewer's Matchups.
 */

import { createContext, useContext } from 'react'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { TimelineItem } from '@/lib/model/timeline'
import { cn } from '@/lib/utils'

type FantasySide = 'mine' | 'opponent'

/** Our Player id → whose Starter they are, in the Viewer's Matchups. */
const FantasyTags = createContext<ReadonlyMap<string, FantasySide> | null>(null)

export function FantasyTagsProvider({
  leagues,
  children,
}: {
  leagues: ReadonlyArray<FantasyLeagueView>
  children: React.ReactNode
}) {
  const tags = new Map<string, FantasySide>()
  for (const l of leagues) {
    if (!l.enabled || !l.matchup) continue
    for (const p of l.matchup.opponent?.lineup ?? [])
      if (p.starter && p.playerId) tags.set(p.playerId, 'opponent')
    // The Viewer's own Starters win when a Player is on both sides.
    for (const p of l.matchup.mine.lineup)
      if (p.starter && p.playerId) tags.set(p.playerId, 'mine')
  }
  return <FantasyTags.Provider value={tags}>{children}</FantasyTags.Provider>
}

/** Under a bubble: whose Starter the play is about, if anyone's. */
export function FantasyTag({
  item,
  align,
}: {
  item: TimelineItem
  align: 'left' | 'right'
}) {
  const tags = useContext(FantasyTags)
  if (!tags || item.kind === 'milestone') return null
  const hits = item.players.flatMap((p) => {
    const side = tags.get(p.id)
    return side
      ? [{ side, name: p.name.split(' ').slice(1).join(' ') || p.name }]
      : []
  })
  if (hits.length === 0) return null
  const side = hits.some((h) => h.side === 'mine') ? 'mine' : 'opponent'
  const names = hits.filter((h) => h.side === side).map((h) => h.name)
  return (
    <span
      className={cn(
        'flex px-2 text-[11px] font-semibold',
        align === 'right' ? 'justify-end' : 'justify-start',
        side === 'mine' ? 'text-scoring' : 'text-live',
      )}
    >
      {side === 'mine' ? '★ Yours' : 'Opponent'} · {names.join(', ')}
    </span>
  )
}
