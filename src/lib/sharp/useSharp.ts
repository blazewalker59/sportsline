/** Sharp picks on the client: the latest slate and the record. */

import { useQuery } from '@tanstack/react-query'
import { getSharpHistory, getSharpSlate } from './server'
import { useViewer } from '@/lib/viewer/useViewer'

export function useSharpSlate() {
  const { data } = useViewer()
  return useQuery({
    queryKey: ['sharp-slate'],
    queryFn: () => getSharpSlate(),
    enabled: Boolean(data?.viewer),
    // Re-checked every fifteen minutes on the server.
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  })
}

export function useSharpHistory() {
  const { data } = useViewer()
  return useQuery({
    queryKey: ['sharp-history'],
    queryFn: () => getSharpHistory(),
    enabled: Boolean(data?.viewer),
    staleTime: 5 * 60_000,
  })
}
