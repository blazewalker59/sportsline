/**
 * Sharp picks on the client: the latest slate and the record, each query's
 * key with its fetch and timing. (./queries is the server's reading.)
 */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { getSharpHistory, getSharpSlate } from './server'
import { useViewer } from '@/lib/viewer/useViewer'

export function sharpSlateQuery() {
  return queryOptions({
    queryKey: ['sharp-slate'] as const,
    queryFn: () => getSharpSlate(),
    // Re-checked every fifteen minutes on the server.
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  })
}

export function sharpHistoryQuery() {
  return queryOptions({
    queryKey: ['sharp-history'] as const,
    queryFn: () => getSharpHistory(),
    staleTime: 5 * 60_000,
  })
}

export function useSharpSlate() {
  const { data } = useViewer()
  return useQuery({ ...sharpSlateQuery(), enabled: Boolean(data?.viewer) })
}

export function useSharpHistory() {
  const { data } = useViewer()
  return useQuery({ ...sharpHistoryQuery(), enabled: Boolean(data?.viewer) })
}
