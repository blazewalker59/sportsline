/** The Viewer's Kalshi connection and Predictions, on the client. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  connectKalshi,
  disconnectKalshi,
  getKalshiConnection,
  getPredictionDetail,
  getPredictionRecord,
  getPredictions,
  setChangeDisplay,
  syncKalshiNow,
} from './server'
import type { ChangeDisplay, KalshiConnection } from './server'
import { useViewer } from '@/lib/viewer/useViewer'

const CONNECTION_KEY = ['kalshi-connection'] as const
const PREDICTIONS_KEY = ['predictions'] as const
/** Odds refresh on the server each minute; check in a bit more often. */
const REFRESH_MS = 30_000

export function useKalshiConnection() {
  const { data: viewerState } = useViewer()
  return useQuery({
    queryKey: CONNECTION_KEY,
    queryFn: () => getKalshiConnection(),
    enabled: Boolean(viewerState?.viewer),
    staleTime: 60_000,
  })
}

export function usePredictions() {
  const connection = useKalshiConnection()
  return useQuery({
    queryKey: PREDICTIONS_KEY,
    queryFn: () => getPredictions(),
    enabled: Boolean(connection.data),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}

export function useConnectKalshi() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { keyId: string; privateKey: string }) =>
      connectKalshi({ data: v }),
    onSuccess: (connection) => {
      queryClient.setQueryData(CONNECTION_KEY, connection)
      void queryClient.invalidateQueries({ queryKey: PREDICTIONS_KEY })
    },
  })
}

export function useDisconnectKalshi() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => disconnectKalshi(),
    onSuccess: () => {
      queryClient.setQueryData(CONNECTION_KEY, null)
      queryClient.setQueryData(PREDICTIONS_KEY, [])
    },
  })
}

export function useSyncKalshi() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncKalshiNow(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PREDICTIONS_KEY })
      void queryClient.invalidateQueries({ queryKey: CONNECTION_KEY })
    },
  })
}

/** Dollars or percent on Prediction cards; the cards switch straight away. */
export function useSetChangeDisplay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (display: ChangeDisplay) =>
      setChangeDisplay({ data: { display } }),
    onMutate: (display) => {
      queryClient.setQueryData<KalshiConnection | null>(
        CONNECTION_KEY,
        (old) => (old ? { ...old, changeDisplay: display } : old),
      )
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: CONNECTION_KEY }),
  })
}

/** Every Prediction made, for the Record (built per range on the device). */
/**
 * One Prediction's whole odds history and the plays in its Games, for its
 * sheet; refreshed with the odds (a point a minute) while it's open.
 */
export function usePredictionDetail(id: string) {
  return useQuery({
    queryKey: ['prediction-detail', id],
    queryFn: () => getPredictionDetail({ data: { id } }),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}

export function usePredictionRecord() {
  const connection = useKalshiConnection()
  return useQuery({
    queryKey: ['prediction-record'],
    queryFn: () => getPredictionRecord(),
    enabled: Boolean(connection.data),
    staleTime: 5 * 60_000,
  })
}
