import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import {
  getViewerState,
  markRead,
  setFollow,
  setLeagueSettings,
  setPriceDisplay,
} from './server'
import type { PriceDisplay } from '@/lib/model/price'
import type { Follow, TimelineItem, ViewerFollow } from '@/lib/model/timeline'
import type { FollowEntry, ViewerState } from './server'
import type { LeagueSettings } from '@/lib/model/leagues'
import { followsToParam } from '@/lib/model/timeline'

export const VIEWER_KEY = ['viewer'] as const

export function useViewer() {
  return useQuery({
    queryKey: VIEWER_KEY,
    queryFn: () => getViewerState(),
    staleTime: 60_000,
  })
}

export function followKey(follow: Follow): string {
  return followsToParam([follow])
}

/** Follow or unfollow; the Viewer's Follows update from the server's answer. */
export function useSetFollow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      follow,
      following,
    }: {
      follow: ViewerFollow
      following: boolean
    }) => {
      const target =
        follow.kind === 'league'
          ? follow.league
          : follow.kind === 'team'
            ? follow.teamId
            : follow.playerId
      return setFollow({ data: { kind: follow.kind, target, following } })
    },
    onSuccess: (entries: Array<FollowEntry>) => {
      queryClient.setQueryData<ViewerState>(VIEWER_KEY, (old) =>
        old ? { ...old, follows: entries } : old,
      )
    },
  })
}

/** Reorder or hide Leagues; the row updates before the server answers. */
export function useSetLeagueSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: LeagueSettings) =>
      setLeagueSettings({ data: settings }),
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: VIEWER_KEY })
      const previous = queryClient.getQueryData<ViewerState>(VIEWER_KEY)
      queryClient.setQueryData<ViewerState>(VIEWER_KEY, (old) =>
        old ? { ...old, leagues: settings } : old,
      )
      return { previous }
    },
    onError: (_error, _settings, context) => {
      if (context?.previous)
        queryClient.setQueryData(VIEWER_KEY, context.previous)
    },
    onSuccess: (leagues) => {
      queryClient.setQueryData<ViewerState>(VIEWER_KEY, (old) =>
        old ? { ...old, leagues } : old,
      )
    },
  })
}

const MARK_EVERY_MS = 15_000
/** Within this far of the top, the Viewer is taken to have seen the newest item. */
const TOP_SLACK_PX = 300

/**
 * Keeps the Viewer's Read Marker at the newest item they have had on screen:
 * while the tab is visible and scrolled to the top, and when it is hidden.
 */
export function useReadMarkerWriter(
  items: ReadonlyArray<TimelineItem>,
  enabled: boolean,
) {
  const newest = items[0]?.occurredAt ?? null
  const newestRef = useRef(newest)
  newestRef.current = newest
  const sent = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    const send = () => {
      const readAt = newestRef.current
      if (!readAt || (sent.current && readAt <= sent.current)) return
      sent.current = readAt
      void markRead({ data: { readAt } }).catch(() => {
        sent.current = null
      })
    }
    const tick = () => {
      if (
        document.visibilityState === 'visible' &&
        window.scrollY < TOP_SLACK_PX
      )
        send()
    }
    const onVisibility = () => {
      if (
        document.visibilityState === 'hidden' &&
        window.scrollY < TOP_SLACK_PX
      )
        send()
    }
    const id = setInterval(tick, MARK_EVERY_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])
}

/** How the Viewer wants Kalshi prices shown (cents until they choose). */
export function usePriceDisplay(): PriceDisplay {
  return useViewer().data?.priceDisplay ?? 'cents'
}

export function useSetPriceDisplay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (display: PriceDisplay) =>
      setPriceDisplay({ data: { display } }),
    onMutate: (display) => {
      queryClient.setQueryData<ViewerState>(VIEWER_KEY, (old) =>
        old ? { ...old, priceDisplay: display } : old,
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: VIEWER_KEY }),
  })
}
