/** A Team's page query: its key with its fetch and timing. */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { getTeamPage } from './server'

export function teamPageQuery(teamId: string) {
  return queryOptions({
    queryKey: ['team', teamId] as const,
    queryFn: () => getTeamPage({ data: { teamId } }),
    staleTime: 60_000,
  })
}

export function useTeamPage(teamId: string) {
  return useQuery(teamPageQuery(teamId))
}
