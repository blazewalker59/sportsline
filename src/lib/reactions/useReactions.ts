/** Reactions on the client: a Sports Day's tallies, and reacting. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getReactions, setReaction } from './server'
import type { ItemReactions, Reaction } from './model'

/** Friends' Reactions arrive by polling: they are a nicety, not live data. */
const REFRESH_MS = 30_000

const key = (sportsDay: string) => ['reactions', sportsDay] as const

export function useReactions(sportsDay: string) {
  return useQuery({
    queryKey: key(sportsDay),
    queryFn: () => getReactions({ data: { sportsDay } }),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}

/** React (or clear with null), updating the tally before the server answers. */
export function useSetReaction(sportsDay: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { itemId: string; emoji: Reaction | null }) =>
      setReaction({ data: v }),
    onMutate: async ({ itemId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: key(sportsDay) })
      queryClient.setQueryData<Record<string, ItemReactions>>(
        key(sportsDay),
        (old) => ({
          ...old,
          [itemId]: withMine(old?.[itemId], emoji),
        }),
      )
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key(sportsDay) }),
        queryClient.invalidateQueries({ queryKey: ['my-reactions'] }),
      ]),
  })
}

/** An item's tally with this Viewer's Reaction swapped for `emoji`. */
export function withMine(
  current: ItemReactions | undefined,
  emoji: Reaction | null,
): ItemReactions {
  const counts = (current?.counts ?? []).map((c) => ({ ...c }))
  const bump = (e: Reaction, by: number) => {
    const c = counts.find((x) => x.emoji === e)
    if (c) c.count += by
    else if (by > 0) counts.push({ emoji: e, count: by })
  }
  if (current?.mine) bump(current.mine, -1)
  if (emoji) bump(emoji, 1)
  return {
    counts: counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count),
    mine: emoji,
  }
}
