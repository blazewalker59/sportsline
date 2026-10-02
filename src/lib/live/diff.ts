/**
 * Play diffing for a live Game: compares what a Source reports now with what
 * was already seen and classifies each difference as new, a Revision, an
 * Overturn or a Removal (CONTEXT.md). Pure, so it is tested without a
 * Durable Object.
 */

import type { Score, SourceItem } from '@/lib/model/types'

/** What a LiveGame remembers about an item it has already published. */
export interface SeenItem {
  id: string
  description: string
  hash: string
  scoring: boolean
  score: Score
  /** When this item was first seen, if that replaced an estimated time. */
  stampedAt?: string
}

export type ItemChange =
  | { type: 'added'; item: SourceItem }
  | { type: 'revised'; item: SourceItem; seen: SeenItem }
  | { type: 'overturned'; item: SourceItem; seen: SeenItem }
  | { type: 'removed'; key: string; seen: SeenItem }

/**
 * A poll that would remove more than this many items at once is treated as
 * a Source glitch (truncated or partial response) and its Removals ignored.
 */
export const MAX_REMOVALS_PER_POLL = 3

export function fingerprint(item: SourceItem): Omit<SeenItem, 'id'> {
  return {
    description: item.description,
    hash: hash(JSON.stringify(item)),
    scoring: item.kind === 'play' && item.significance === 'scoring',
    score: item.score,
  }
}

export function diffItems(
  seen: ReadonlyMap<string, SeenItem>,
  items: ReadonlyArray<SourceItem>,
): Array<ItemChange> {
  const changes: Array<ItemChange> = []
  const present = new Set<string>()

  for (const item of items) {
    present.add(item.key)
    const before = seen.get(item.key)
    if (!before) {
      changes.push({ type: 'added', item })
      continue
    }
    const now = fingerprint(item)
    if (now.hash === before.hash) continue
    // An Overturn undoes a scoring outcome; any other change is a Revision.
    const overturned = before.scoring && !now.scoring
    changes.push({
      type: overturned ? 'overturned' : 'revised',
      item,
      seen: before,
    })
  }

  const removals: Array<ItemChange> = []
  for (const [key, before] of seen) {
    if (!present.has(key)) removals.push({ type: 'removed', key, seen: before })
  }
  if (items.length > 0 && removals.length <= MAX_REMOVALS_PER_POLL) {
    changes.push(...removals)
  }

  return changes
}

/** FNV-1a, 32-bit: cheap, stable change detection (not security). */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}
