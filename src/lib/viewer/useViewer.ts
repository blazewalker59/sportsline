import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { getViewerState, markRead, setFollow } from './server'
import type { Follow, TimelineItem } from '@/lib/model/timeline'
import type { FollowEntry, ViewerState } from './server'
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
      follow: Follow
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
