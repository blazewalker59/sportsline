/**
 * The Timeline's Scope and what it covers: the Viewer's Follows, their open
 * Predictions and Fantasy Matchups, the one selected (if any), and the
 * Follows the feed is read with. Selecting a Prediction or Matchup is a
 * navigation, so it lives in the URL like the Scope.
 */

import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  matchupFollows,
  predictionFollows,
  readStoredScope,
  storeScope,
} from './timelineScope'
import type { Scope } from '@/lib/model/scope'
import { useFantasy, useFantasyConnected } from '@/lib/fantasy/useFantasy'
import {
  useKalshiConnection,
  usePredictions,
} from '@/lib/kalshi/usePredictions'
import { defaultScope, scopeFollows } from '@/lib/model/scope'
import {
  DEFAULT_LEAGUE_SETTINGS,
  visibleLeagues,
  visibleRowItems,
} from '@/lib/model/leagues'
import { useViewer } from '@/lib/viewer/useViewer'

export function useTimelineScope({
  requestedScope,
  predictionId,
  matchupId,
}: {
  requestedScope?: Scope
  predictionId: string | null
  matchupId: string | null
}) {
  const { data } = useViewer()
  const followed = data?.follows
  const viewerFollows = useMemo(
    () => (followed ?? []).map((f) => f.follow),
    [followed],
  )
  // Predictions (CONTEXT.md): open ones, and the Games they depend on.
  const kalshi = useKalshiConnection()
  const predictionList = usePredictions()
  const openPredictions = useMemo(
    () => (predictionList.data ?? []).filter((p) => p.status === 'open'),
    [predictionList.data],
  )
  const predictionGames = useMemo(
    () => [
      ...new Set(
        openPredictions.flatMap((p) =>
          p.legs.flatMap((l) => (l.game ? [l.game.id] : [])),
        ),
      ),
    ],
    [openPredictions],
  )
  // Fantasy (CONTEXT.md, "Matchup"): enabled leagues' Matchups, and the
  // Players starting on either side.
  const fantasyConnection = useFantasyConnected()
  const fantasy = useFantasy()
  const fantasyLeagues = useMemo(
    () => (fantasy.data ?? []).filter((l) => l.enabled && l.matchup),
    [fantasy.data],
  )
  const fantasyPlayers = useMemo(
    () => [
      ...new Set(
        fantasyLeagues.flatMap((l) =>
          [...l.matchup!.mine.lineup, ...(l.matchup!.opponent?.lineup ?? [])]
            .filter((p) => p.starter && p.playerId)
            .map((p) => p.playerId!),
        ),
      ),
    ],
    [fantasyLeagues],
  )
  const selectedMatchup = matchupId
    ? (fantasyLeagues.find((l) => l.id === matchupId) ?? null)
    : null
  const selectedPrediction = predictionId
    ? (predictionList.data?.find((p) => p.id === predictionId) ?? null)
    : null
  // The Scope from the link, else the one the Viewer last chose (on this
  // device), else their default: Following for a Viewer who follows
  // something, else All (CONTEXT.md, "Scope").
  const [storedScope] = useState(readStoredScope)
  useEffect(() => {
    if (requestedScope) storeScope(requestedScope)
  }, [requestedScope])
  const wanted = requestedScope ?? storedScope
  const scope: Scope = selectedPrediction
    ? 'predictions'
    : selectedMatchup
      ? 'fantasy'
      : (wanted === 'following' && viewerFollows.length === 0) ||
          (wanted === 'predictions' && !kalshi.data && !kalshi.isPending) ||
          (wanted === 'fantasy' &&
            !fantasyConnection.connected &&
            !fantasyConnection.pending)
        ? 'all'
        : (wanted ?? defaultScope(viewerFollows))
  // The Viewer's row in their order, hidden items left out; All covers
  // the visible Leagues.
  const settings = data?.leagues ?? DEFAULT_LEAGUE_SETTINGS
  const rowItems = useMemo(() => visibleRowItems(settings), [settings])
  const leagues = useMemo(() => visibleLeagues(settings), [settings])
  const follows = useMemo(
    () =>
      selectedPrediction
        ? predictionFollows(selectedPrediction)
        : selectedMatchup
          ? matchupFollows(selectedMatchup)
          : scopeFollows(
              scope,
              viewerFollows,
              leagues,
              predictionGames,
              fantasyPlayers,
            ),
    [
      selectedPrediction,
      selectedMatchup,
      scope,
      viewerFollows,
      leagues,
      predictionGames,
      fantasyPlayers,
    ],
  )
  const navigate = useNavigate()
  /** Select a Prediction (narrowing the Timeline to it), or clear it. */
  const selectPrediction = useCallback(
    (id: string | null) =>
      void navigate({
        to: '/',
        search: (prev) => ({
          ...prev,
          scope: 'predictions',
          prediction: id ?? undefined,
          matchup: undefined,
          game: undefined,
          play: undefined,
        }),
        viewTransition: true,
        resetScroll: false,
      }),
    [navigate],
  )
  /** Select a Fantasy Matchup (narrowing the Timeline to it), or clear it. */
  const selectMatchup = useCallback(
    (id: string | null) =>
      void navigate({
        to: '/',
        search: (prev) => ({
          ...prev,
          scope: 'fantasy',
          matchup: id ?? undefined,
          prediction: undefined,
          game: undefined,
          play: undefined,
        }),
        viewTransition: true,
        resetScroll: false,
      }),
    [navigate],
  )

  return {
    scope,
    follows,
    viewerFollows,
    rowItems,
    leagues,
    kalshi,
    predictionList,
    openPredictions,
    predictionGames,
    selectedPrediction,
    selectPrediction,
    fantasyLeagues,
    selectedMatchup,
    selectMatchup,
  }
}

export type TimelineScopeState = ReturnType<typeof useTimelineScope>
