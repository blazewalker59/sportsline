/** A Player on the client: their page, their sheet and their season. */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  playerDetailQuery,
  playerFirstPageQuery,
  playerPagesQuery,
} from './queries'

export function usePlayerPages(playerId: string) {
  return useInfiniteQuery(playerPagesQuery(playerId))
}

export function usePlayerFirstPage(playerId: string) {
  return useQuery(playerFirstPageQuery(playerId))
}

export function usePlayerDetail(playerId: string) {
  return useQuery(playerDetailQuery(playerId))
}
