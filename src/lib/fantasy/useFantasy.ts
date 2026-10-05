/** The Viewer's ESPN connection and Fantasy leagues, on the client. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addFantasyLeague,
  connectEspn,
  connectSleeper,
  disconnectEspn,
  disconnectSleeper,
  getEspnConnection,
  getFantasy,
  getSleeperConnection,
  reorderFantasyLeagues,
  setFantasyLeagueEnabled,
  syncFantasyNow,
} from './server'
import type { FantasyLeagueView } from './server'
import { useViewer } from '@/lib/viewer/useViewer'

export const ESPN_KEY = ['espn-connection'] as const
export const FANTASY_KEY = ['fantasy'] as const
/** Matchups refresh on the server every two minutes. */
const REFRESH_MS = 60_000

export function useEspnConnection() {
  const { data: viewerState } = useViewer()
  return useQuery({
    queryKey: ESPN_KEY,
    queryFn: () => getEspnConnection(),
    enabled: Boolean(viewerState?.viewer),
    staleTime: 60_000,
  })
}

export const SLEEPER_KEY = ['sleeper-connection'] as const

export function useSleeperConnection() {
  const { data: viewerState } = useViewer()
  return useQuery({
    queryKey: SLEEPER_KEY,
    queryFn: () => getSleeperConnection(),
    enabled: Boolean(viewerState?.viewer),
    staleTime: 60_000,
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
  return useQuery({
    queryKey: FANTASY_KEY,
    queryFn: () => getFantasy(),
    enabled: connected,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
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
