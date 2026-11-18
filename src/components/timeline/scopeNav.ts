/**
 * Moving between the Timeline's Scopes (CONTEXT.md, "Scope"), shared by
 * the main navigation (whose four tabs are the Scopes), the League row at
 * the top of the Timeline and the swipe across it: which Scope is showing,
 * the League choice the All tab returns to, and the move itself.
 */

import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { readStoredScope } from './timelineScope'
import type { Scope } from '@/lib/model/scope'
import type { RowItem } from '@/lib/model/leagues'
import { parseScope, resolveScope, scopeTab } from '@/lib/model/scope'
import { DEFAULT_LEAGUE_SETTINGS, visibleRowItems } from '@/lib/model/leagues'
import { notifyDeviceValue, useDeviceValue } from '@/lib/useDeviceValue'
import { useViewer } from '@/lib/viewer/useViewer'

const LAST_LEAGUE_KEY = 'sportsline:leagueScope'

function readLastLeague(): string | null {
  try {
    return localStorage.getItem(LAST_LEAGUE_KEY)
  } catch {
    return null
  }
}

/**
 * The League choice the All tab returns to from another Scope: the one
 * showing, else the last one shown on this device (if the Viewer still
 * shows it), else All. Showing a League-shaped Scope remembers it.
 */
export function useLastLeague(
  scope: Scope | null,
  items: ReadonlyArray<RowItem>,
): 'all' | RowItem {
  const leagueScope = scope !== null && scopeTab(scope) === 'all'
  useEffect(() => {
    if (!leagueScope || scope === readLastLeague()) return
    try {
      localStorage.setItem(LAST_LEAGUE_KEY, scope)
      notifyDeviceValue()
    } catch {
      // Storage is a convenience.
    }
  }, [scope, leagueScope])
  const saved = useDeviceValue(readLastLeague, null)
  if (leagueScope) return scope as 'all' | RowItem
  return saved && items.includes(saved as RowItem) ? (saved as RowItem) : 'all'
}

/**
 * The Scope the Timeline at the current address shows, or null away from
 * the Timeline. The same rule the Timeline itself follows (resolveScope),
 * read from the address, this device and the Viewer's Follows, so the nav
 * and the Timeline always agree.
 */
export function useCurrentScope(): Scope | null {
  const onTimeline = useRouterState({
    select: (s) => s.location.pathname === '/',
  })
  const search = (key: string) => (s: { location: { search: unknown } }) => {
    const value = (s.location.search as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : undefined
  }
  const requested = parseScope(useRouterState({ select: search('scope') }))
  const predictionId = useRouterState({ select: search('prediction') })
  const matchupId = useRouterState({ select: search('matchup') })
  const stored = useDeviceValue(readStoredScope, undefined)
  const { data } = useViewer()
  const followed = data?.follows
  const viewerFollows = useMemo(
    () => (followed ?? []).map((f) => f.follow),
    [followed],
  )
  if (!onTimeline) return null
  return resolveScope({
    requested,
    stored,
    viewerFollows,
    predictionId,
    matchupId,
  })
}

/** The Viewer's visible Leagues and college groups, in their order. */
export function useRowItems(): ReadonlyArray<RowItem> {
  const { data } = useViewer()
  const settings = data?.leagues ?? DEFAULT_LEAGUE_SETTINGS
  return useMemo(() => visibleRowItems(settings), [settings])
}

/**
 * Show the Timeline in a Scope. On the Timeline it is a View Transition
 * over cached data that keeps the day and drops any Game, Play, open
 * Prediction or Matchup, or narrowing; from another screen it opens the Timeline (today) in it.
 */
export function useGoToScope(): (value: Scope) => void {
  const navigate = useNavigate()
  const router = useRouter()
  return (value: Scope) => {
    if (router.state.location.pathname !== '/') {
      void navigate({ to: '/', search: { scope: value } })
      return
    }
    void navigate({
      to: '/',
      search: (prev) => ({
        ...prev,
        scope: value,
        game: undefined,
        play: undefined,
        detail: undefined,
        // A Scope replaces any one Prediction the Timeline was narrowed to.
        prediction: undefined,
        matchup: undefined,
      }),
      viewTransition: true,
      resetScroll: false,
    })
  }
}
