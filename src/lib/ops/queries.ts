/** The health page's query: its key with its fetch and timing. */

import { queryOptions } from '@tanstack/react-query'
import { getOpsHealth } from './server'

export function opsHealthQuery() {
  return queryOptions({
    queryKey: ['ops-health'] as const,
    queryFn: () => getOpsHealth(),
    refetchInterval: 30_000,
  })
}
