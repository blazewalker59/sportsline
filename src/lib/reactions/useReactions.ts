/** Reactions on the client: a Sports Day's tallies, and reacting. */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { setReaction } from './server'
import { myReactionsQuery, reactionsQuery } from './queries'
import type { ItemReactions, Reaction } from './model'

export function useReactions(sportsDay: string) {
  return useQuery(reactionsQuery(sportsDay))
}

/** The Viewer's own Reactions, once signed in. */
export function useMyReactions(enabled: boolean) {
  return useInfiniteQuery({ ...myReactionsQuery(), enabled })
}

/** React (or clear with null), updating the tally before the server answers. */
export function useSetReaction(sportsDay: string) {
  const queryClient = useQueryClient()
  const { queryKey } = reactionsQuery(sportsDay)
  return useMutation({
    mutationFn: (v: { itemId: string; emoji: Reaction | null }) =>
      setReaction({ data: v }),
    onMutate: async ({ itemId, emoji }) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData<Record<string, ItemReactions>>(
        queryKey,
        (old) => ({
          ...old,
          [itemId]: withMine(old?.[itemId], emoji),
        }),
      )
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: myReactionsQuery().queryKey,
        }),
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
