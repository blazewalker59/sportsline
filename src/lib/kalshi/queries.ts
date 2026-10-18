/**
 * The Viewer's Kalshi queries (connection, Predictions, one Prediction's
 * detail, the Record): each key with its fetch and timing.
 */

import { queryOptions } from '@tanstack/react-query'
import { getKalshiConnection } from './server'
import { getPredictionRecord, getPredictions } from './predictionViews'
import { getPredictionDetail } from './predictionDetail'

/** Odds refresh on the server each minute; check in a bit more often. */
const REFRESH_MS = 30_000

export function kalshiConnectionQuery() {
  return queryOptions({
    queryKey: ['kalshi-connection'] as const,
    queryFn: () => getKalshiConnection(),
    staleTime: 60_000,
  })
}

export function predictionsQuery() {
  return queryOptions({
    queryKey: ['predictions'] as const,
    queryFn: () => getPredictions(),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}

/**
 * One Prediction's whole odds history and the plays in its Games, for its
 * sheet; refreshed with the odds (a point a minute) while it's open.
 */
export function predictionDetailQuery(id: string) {
  return queryOptions({
    queryKey: ['prediction-detail', id] as const,
    queryFn: () => getPredictionDetail({ data: { id } }),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
}

/** Every Prediction made, for the Record (built per range on the device). */
export function predictionRecordQuery() {
  return queryOptions({
    queryKey: ['prediction-record'] as const,
    queryFn: () => getPredictionRecord(),
    staleTime: 5 * 60_000,
  })
}
