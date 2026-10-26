/** The Viewer's ESPN connection and Fantasy leagues, on the client. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addFantasyLeague,
  answerWhoHas,
  connectEspn,
  connectSleeper,
  disconnectEspn,
  disconnectSleeper,
  makeMove,
  reorderFantasyLeagues,
  setEspnMoves,
  setFantasyLeagueEnabled,
  syncFantasyNow,
} from './server'
import {
  availablePlayersQuery,
  espnConnectionQuery,
  fantasyQuery,
  moveOptionsQuery,
  sleeperConnectionQuery,
  whoHasQuery,
} from './queries'
import { fantasyLeagueQuery } from './leagueQuery'
import type { FantasyLeagueView } from './server'
import type { MoveKind, MovePlayer } from './moves'
import { useViewer } from '@/lib/viewer/useViewer'

const ESPN_KEY = espnConnectionQuery().queryKey
const SLEEPER_KEY = sleeperConnectionQuery().queryKey
const FANTASY_KEY = fantasyQuery().queryKey

export function useEspnConnection() {
  const { data: viewerState } = useViewer()
  return useQuery({
    ...espnConnectionQuery(),
    enabled: Boolean(viewerState?.viewer),
  })
}

export function useSleeperConnection() {
  const { data: viewerState } = useViewer()
  return useQuery({
    ...sleeperConnectionQuery(),
    enabled: Boolean(viewerState?.viewer),
  })
}

/** Is any Fantasy provider connected (ESPN or Sleeper)? Pending while unknown. */
export function useFantasyConnected(): {
  connected: boolean
  pending: boolean
} {
  const espn = useEspnConnection()
  const sleeper = useSleeperConnection()
  return {
    connected: Boolean(espn.data) || Boolean(sleeper.data),
    pending: espn.isPending || sleeper.isPending,
  }
}

export function useFantasy() {
  const { connected } = useFantasyConnected()
  return useQuery({ ...fantasyQuery(), enabled: connected })
}

/** One of the Viewer's leagues, with its Standings. */
export function useFantasyLeague(leagueId: string) {
  const { data: viewerState } = useViewer()
  return useQuery({
    ...fantasyLeagueQuery(leagueId),
    enabled: Boolean(viewerState?.viewer),
  })
}

function useRefreshAll() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ESPN_KEY })
    void queryClient.invalidateQueries({ queryKey: SLEEPER_KEY })
    void queryClient.invalidateQueries({ queryKey: FANTASY_KEY })
  }
}

export function useConnectEspn() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (v: { swid: string; espnS2: string }) =>
      connectEspn({ data: v }),
    onSuccess: refresh,
  })
}

export function useDisconnectEspn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => disconnectEspn(),
    onSuccess: () => {
      queryClient.setQueryData(ESPN_KEY, null)
      // Sleeper's leagues stay: read the list again.
      void queryClient.invalidateQueries({ queryKey: FANTASY_KEY })
    },
  })
}

/** Turn roster moves on or off for ESPN (docs/adr/0010). */
export function useSetEspnMoves() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => setEspnMoves({ data: { enabled } }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ESPN_KEY })
      void queryClient.invalidateQueries({ queryKey: ['move-options'] })
    },
  })
}

/**
 * Make a confirmed roster move in a league; its Available players and
 * moves are read again afterwards, whatever came of it.
 */
export function useMakeMove(leagueId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (move: {
      moveId: string
      kind: MoveKind
      add: MovePlayer | null
      dropId: number | null
      bid: number | null
    }) => makeMove({ data: { leagueId, ...move } }),
    onSettled: () => {
      for (const { queryKey } of [
        moveOptionsQuery(leagueId),
        availablePlayersQuery(leagueId),
        fantasyLeagueQuery(leagueId),
      ])
        void queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function useSyncFantasy() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: () => syncFantasyNow(), onSettled: refresh })
}

export function useAddFantasyLeague() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (url: string) => addFantasyLeague({ data: { url } }),
    onSuccess: refresh,
  })
}

export function useSetFantasyLeagueEnabled() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      setFantasyLeagueEnabled({ data: v }),
    onSettled: refresh,
  })
}

/** Reorder leagues: the list moves at once and saves behind. */
export function useReorderFantasyLeagues() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: Array<string>) =>
      reorderFantasyLeagues({ data: { ids } }),
    onMutate: (ids) =>
      queryClient.setQueryData<Array<FantasyLeagueView>>(FANTASY_KEY, (old) =>
        old ? ids.flatMap((id) => old.find((l) => l.id === id) ?? []) : old,
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FANTASY_KEY }),
  })
}

export function useConnectSleeper() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (username: string) => connectSleeper({ data: { username } }),
    onSuccess: refresh,
  })
}

export function useDisconnectSleeper() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: () => disconnectSleeper(),
    onSuccess: refresh,
  })
}

/** A Who Has? encounter to offer, once the Viewer has a Fantasy league. */
export function useWhoHas() {
  const { connected } = useFantasyConnected()
  return useQuery({ ...whoHasQuery(), enabled: connected })
}

/** Answer (or pass on, with no team) a Who Has? encounter. */
export function useAnswerWhoHas() {
  return useMutation({
    mutationFn: (v: { id: string; teamId: number | null }) =>
      answerWhoHas({ data: v }),
  })
}
