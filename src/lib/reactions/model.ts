/** Reactions (CONTEXT.md): one emoji per Viewer per Play. Pure. */

export const REACTIONS = ['🔥', '😱', '😭', '💀', '🐐', '👏'] as const
export type Reaction = (typeof REACTIONS)[number]

export function isReaction(value: unknown): value is Reaction {
  return (REACTIONS as ReadonlyArray<unknown>).includes(value)
}

export interface ItemReactions {
  /** Count per emoji, most first; emojis no one chose are left out. */
  counts: Array<{ emoji: Reaction; count: number }>
  /** This Viewer's own Reaction, if any. */
  mine: Reaction | null
}

/** Rows of (item, viewer, emoji) → each item's tally for one Viewer. */
export function tally(
  rows: ReadonlyArray<{ itemId: string; viewerId: string; emoji: string }>,
  viewerId: string | null,
): Record<string, ItemReactions> {
  const out: Record<string, ItemReactions> = {}
  for (const r of rows) {
    if (!isReaction(r.emoji)) continue
    const entry = (out[r.itemId] ??= { counts: [], mine: null })
    const c = entry.counts.find((x) => x.emoji === r.emoji)
    if (c) c.count++
    else entry.counts.push({ emoji: r.emoji, count: 1 })
    if (r.viewerId === viewerId) entry.mine = r.emoji
  }
  for (const entry of Object.values(out)) {
    entry.counts.sort(
      (a, b) =>
        b.count - a.count ||
        REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji),
    )
  }
  return out
}
