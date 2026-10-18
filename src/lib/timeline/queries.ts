/**
 * The Timeline's queries: a Sports Day's pages for one set of Follows, and
 * its Games. Each key comes with its fetch and timing, so the Timeline, its
 * route loader and the screens that borrow today's Games share entries.
 */

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { getGames, getTimeline } from './server'
import type { QueryClient } from '@tanstack/react-query'
import type { TimelinePage } from './server'
import type { Scope } from '@/lib/model/scope'
import type { ViewerState } from '@/lib/viewer/server'
import { defaultScope, scopeFollows } from '@/lib/model/scope'
import { DEFAULT_LEAGUE_SETTINGS, visibleLeagues } from '@/lib/model/leagues'
import { followsToParam } from '@/lib/model/timeline'

const STALE_MS = 30_000

export function timelineKey(sportsDay: string, followParam: string) {
  return ['timeline', sportsDay, followParam] as const
}

/** Every cached Scope's pages for one Sports Day. */
export function timelineDayKey(sportsDay: string) {
  return ['timeline', sportsDay] as const
}

export function gamesKey(sportsDay: string) {
  return ['games', sportsDay] as const
}

export function timelineQuery(sportsDay: string, followParam: string) {
  return infiniteQueryOptions({
    queryKey: timelineKey(sportsDay, followParam),
    queryFn: ({ pageParam }) =>
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
  })
}

export function gamesQuery(sportsDay: string) {
  return queryOptions({
    queryKey: gamesKey(sportsDay),
    queryFn: () => getGames({ data: { sportsDay } }),
    staleTime: STALE_MS,
  })
}

/**
 * The Follows a Timeline opens with before anything only the device knows
 * (its remembered Scope) or anything still loading (Predictions, Fantasy)
 * is in: what the server renders and the first client render matches.
 * Null when the Scope depends on those, so there's nothing to prefetch.
 */
export function openingFollowParam(
  state: ViewerState,
  requested: Scope | undefined,
): string | null {
  const viewerFollows = state.follows.map((f) => f.follow)
  const scope =
    requested === 'following' && viewerFollows.length === 0
      ? 'all'
      : (requested ?? defaultScope(viewerFollows))
  if (scope === 'predictions' || scope === 'fantasy') return null
  const leagues = visibleLeagues(state.leagues ?? DEFAULT_LEAGUE_SETTINGS)
  return followsToParam(scopeFollows(scope, viewerFollows, leagues))
}

/** Warm a Sports Day's opening Timeline and its Games. */
export function prefetchTimeline(
  queryClient: QueryClient,
  sportsDay: string,
  followParam: string | null,
): Promise<unknown> {
  return Promise.all([
    followParam !== null &&
      queryClient.prefetchInfiniteQuery(timelineQuery(sportsDay, followParam)),
    queryClient.prefetchQuery(gamesQuery(sportsDay)),
  ])
}
