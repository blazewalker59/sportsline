/** The Viewer's Kalshi connection and Predictions, on the client. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  connectKalshi,
  disconnectKalshi,
  setChangeDisplay,
  syncKalshiNow,
} from './server'
import {
  kalshiConnectionQuery,
  predictionDetailQuery,
  predictionRecordQuery,
  predictionsQuery,
} from './queries'
import type { ChangeDisplay, KalshiConnection } from './server'
import { useViewer } from '@/lib/viewer/useViewer'

const CONNECTION_KEY = kalshiConnectionQuery().queryKey
const PREDICTIONS_KEY = predictionsQuery().queryKey

export function useKalshiConnection() {
  const { data: viewerState } = useViewer()
  return useQuery({
    ...kalshiConnectionQuery(),
    enabled: Boolean(viewerState?.viewer),
  })
}

export function usePredictions() {
  const connection = useKalshiConnection()
  return useQuery({ ...predictionsQuery(), enabled: Boolean(connection.data) })
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

/** One Prediction's odds history and the plays in its Games, for its sheet. */
export function usePredictionDetail(id: string) {
  return useQuery(predictionDetailQuery(id))
}

export function usePredictionRecord() {
  const connection = useKalshiConnection()
  return useQuery({
    ...predictionRecordQuery(),
    enabled: Boolean(connection.data),
  })
}
