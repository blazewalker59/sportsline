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
import {
  gamesKey,
  gamesQuery,
  timelineDayKey,
  timelineKey,
  timelineQuery,
} from './queries'
import { useHubSocket } from './useHubSocket'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { TimelinePage } from './server'
import type { Follow, GameSummary, TimelineEvent } from '@/lib/model/timeline'
import {
  DEFAULT_FOLLOWS,
  followsFromParam,
  followsToParam,
  matchesFilter,
} from '@/lib/model/timeline'
import { shiftSportsDay } from '@/lib/model/sportsDay'
import { applyEventsToGames } from '@/lib/games/queries'

export type { Connection } from './useHubSocket'

const ALL_PARAM = followsToParam(DEFAULT_FOLLOWS)

/**
 * Hand the socket's events to everything cached for the day: each Scope's
 * pages take the events its Follows cover, the day's Games their updates,
 * and any open Game (useLiveGame) its own Plays.
 */
export function applyLiveEvents(
  queryClient: QueryClient,
  sportsDay: string,
  events: ReadonlyArray<TimelineEvent>,
): void {
  for (const [key] of queryClient.getQueriesData({
    queryKey: timelineDayKey(sportsDay),
  })) {
    const filter = {
      follows: followsFromParam(String(key[2])),
      includeRoutine: true,
    }
    const mine = events.filter(
      (e) => e.type !== 'upsert' || matchesFilter(e.item, filter),
    )
    if (mine.length === 0) continue
    queryClient.setQueryData<InfiniteData<TimelinePage, string | null>>(
      key,
      (old) =>
        old ? { ...old, pages: applyEventsToPages(old.pages, mine) } : old,
    )
  }
  const gameEvents = events.flatMap((e) => (e.type === 'game' ? [e.game] : []))
  if (gameEvents.length > 0) {
    queryClient.setQueryData<Array<GameSummary>>(gamesKey(sportsDay), (old) => {
      const byId = new Map((old ?? []).map((g) => [g.id, g]))
      for (const g of gameEvents)
        if (g.sportsDay === sportsDay) byId.set(g.id, g)
      return [...byId.values()]
    })
  }
  applyEventsToGames(queryClient, events)
}

/** After a dropped connection: read again whatever the socket missed. */
export function refetchMissed(
  queryClient: QueryClient,
  sportsDay: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: timelineDayKey(sportsDay) }),
    queryClient.invalidateQueries({ queryKey: gamesKey(sportsDay) }),
    queryClient.invalidateQueries({ queryKey: ['game'] }),
  ])
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

  // One live connection for every League; each cached Scope for this day
  // takes the events its Follows cover, so switching Scope never reconnects
  // and every cached Scope stays current.
  const connection = useHubSocket(
    live
      ? new URLSearchParams({ follows: ALL_PARAM, routine: '1' }).toString()
      : null,
    (events) => applyLiveEvents(queryClient, sportsDay, events),
    () => void refetchMissed(queryClient, sportsDay),
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
    // A failed load isn't loading: the Timeline shows the error instead of
    // staying dimmed.
    loading: !pages.isError && (pages.isPlaceholderData || pages.isPending),
    error: pages.isError,
    connection: live ? connection : ('live' as const),
    hasMore: Boolean(pages.hasNextPage),
    loadingMore: pages.isFetchingNextPage,
    loadMore: () => void pages.fetchNextPage(),
    reload,
  }
}
