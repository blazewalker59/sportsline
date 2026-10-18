/**
 * The Agents page's queries (API tokens, trading, the find_bet record) and
 * the hooks that read them: each key with its fetch and timing.
 */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { getApiTokens, getBetRecord, getTrading } from './server'

export function apiTokensQuery() {
  return queryOptions({
    queryKey: ['api-tokens'] as const,
    queryFn: () => getApiTokens(),
  })
}

export function tradingQuery() {
  return queryOptions({
    queryKey: ['agent-trading'] as const,
    queryFn: () => getTrading(),
    // Proposals expire in minutes: keep the page current while it's open.
    refetchInterval: 15_000,
  })
}

export function betRecordQuery() {
  return queryOptions({
    queryKey: ['bet-record'] as const,
    queryFn: () => getBetRecord(),
  })
}

export function useApiTokens() {
  return useQuery(apiTokensQuery())
}

export function useTrading() {
  return useQuery(tradingQuery())
}

/** What came of the trend picks Agents asked find_bet for. */
export function useBetRecord() {
  return useQuery(betRecordQuery())
}
