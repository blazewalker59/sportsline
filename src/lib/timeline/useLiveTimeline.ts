/**
 * The Viewer's Timeline for one Sports Day, from the query cache so moving
 * between days (and back) never starts from blank: pages and Games are
 * cached per day, today's stay live from the LiveHub socket, and the
 * neighbouring days are prefetched. Routine Plays are always fetched;
 * "Highlights" is a filter on the client, so toggling it is instant.
 */

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import {
  applyEventsToPages,
  emptyState,
  orderedGames,
  orderedItems,
  withGames,
  withItems,
} from './merge'
import { getGames, getTimeline } from './server'
import { useHubSocket } from './useHubSocket'
import type { InfiniteData } from '@tanstack/react-query'
import type { TimelinePage } from './server'
import type { Follow, GameSummary } from '@/lib/model/timeline'
import { followsToParam } from '@/lib/model/timeline'
import { shiftSportsDay } from '@/lib/model/sportsDay'

export type { Connection } from './useHubSocket'

const STALE_MS = 30_000

export function timelineKey(sportsDay: string, followParam: string) {
  return ['timeline', sportsDay, followParam] as const
}

export function gamesKey(sportsDay: string) {
  return ['games', sportsDay] as const
}

function timelineQuery(sportsDay: string, followParam: string) {
  return {
    queryKey: timelineKey(sportsDay, followParam),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      getTimeline({
        data: {
          sportsDay,
          follows: followParam,
          includeRoutine: true,
          ...(pageParam ? { before: pageParam } : {}),
        },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: TimelinePage) => last.nextBefore,
    staleTime: STALE_MS,
  }
}

function gamesQuery(sportsDay: string) {
  return {
    queryKey: gamesKey(sportsDay),
    queryFn: () => getGames({ data: { sportsDay } }),
    staleTime: STALE_MS,
  }
}

export function useLiveTimeline(
  follows: ReadonlyArray<Follow>,
  sportsDay: string,
  today: string,
) {
  const followParam = followsToParam(follows)
  const queryClient = useQueryClient()
  const live = sportsDay === today

  const pages = useInfiniteQuery({
    ...timelineQuery(sportsDay, followParam),
    // Keep the day on screen until the next one arrives (no blank flash).
    placeholderData: keepPreviousData,
  })
  const games = useQuery({
    ...gamesQuery(sportsDay),
    placeholderData: keepPreviousData,
  })

  // Warm the neighbouring days so stepping between them is instant.
  useEffect(() => {
    const id = setTimeout(() => {
      for (const day of [
        shiftSportsDay(sportsDay, -1),
        shiftSportsDay(sportsDay, 1),
      ]) {
        if (day > today) continue
        void queryClient.prefetchInfiniteQuery(timelineQuery(day, followParam))
        void queryClient.prefetchQuery(gamesQuery(day))
      }
    }, 400)
    return () => clearTimeout(id)
  }, [queryClient, sportsDay, today, followParam])

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: timelineKey(sportsDay, followParam),
      }),
      queryClient.invalidateQueries({ queryKey: gamesKey(sportsDay) }),
    ])
  }, [queryClient, sportsDay, followParam])

  const connection = useHubSocket(
    live
      ? new URLSearchParams({ follows: followParam, routine: '1' }).toString()
      : null,
    (events) => {
      queryClient.setQueryData<InfiniteData<TimelinePage, string | null>>(
        timelineKey(sportsDay, followParam),
        (old) =>
          old ? { ...old, pages: applyEventsToPages(old.pages, events) } : old,
      )
      const gameEvents = events.flatMap((e) =>
        e.type === 'game' ? [e.game] : [],
      )
      if (gameEvents.length > 0) {
        queryClient.setQueryData<Array<GameSummary>>(
          gamesKey(sportsDay),
          (old) => {
            const byId = new Map((old ?? []).map((g) => [g.id, g]))
            for (const g of gameEvents)
              if (g.sportsDay === sportsDay) byId.set(g.id, g)
            return [...byId.values()]
          },
        )
      }
    },
    () => void reload(),
  )

  // Placeholder data is the previous day's: don't present it as this one's.
  const showingDay = !pages.isPlaceholderData
  const items = useMemo(
    () =>
      orderedItems(
        withItems(
          emptyState(sportsDay),
          showingDay ? (pages.data?.pages.flatMap((p) => p.items) ?? []) : [],
        ),
      ),
    [pages.data, sportsDay, showingDay],
  )
  const previousItems = useMemo(
    () => (showingDay ? [] : (pages.data?.pages.flatMap((p) => p.items) ?? [])),
    [pages.data, showingDay],
  )
  const gameList = useMemo(
    () =>
      orderedGames(
        withGames(
          emptyState(sportsDay),
          games.isPlaceholderData ? [] : (games.data ?? []),
        ),
      ),
    [games.data, games.isPlaceholderData, sportsDay],
  )

  return {
    items,
    /** The previous day's items while this day loads, to show dimmed. */
    previousItems,
    previousGames: games.isPlaceholderData ? (games.data ?? []) : [],
    games: gameList,
    loading: pages.isPlaceholderData || pages.isPending,
    connection: live ? connection : ('live' as const),
    hasMore: Boolean(pages.hasNextPage),
    loadingMore: pages.isFetchingNextPage,
    loadMore: () => void pages.fetchNextPage(),
    reload,
  }
}
