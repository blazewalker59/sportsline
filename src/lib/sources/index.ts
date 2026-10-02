/**
 * The Source boundary (CONTEXT.md, "Source"). Each League has exactly one
 * Source at a time; everything outside `src/lib/sources` reaches it through
 * `sourceFor(league)` and sees only the shared model.
 */

import { mlbAdapter } from './mlb'
import type { League, SourceAdapter } from '@/lib/model/types'

const ADAPTERS: Partial<Record<League, SourceAdapter>> = {
  mlb: mlbAdapter,
}

/** Leagues with a Source wired up. */
export const ACTIVE_LEAGUES = Object.keys(ADAPTERS) as Array<League>

export function sourceFor(league: League): SourceAdapter {
  const adapter = ADAPTERS[league]
  if (!adapter) throw new Error(`No Source for League ${league}`)
  return adapter
}
