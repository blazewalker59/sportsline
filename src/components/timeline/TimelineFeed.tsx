/**
 * The Timeline's feed: the Sharp picks banner (Predictions Scope), the
 * catch-up card, what's live (typing), then the
 * plays as chat entries with the read divider; and under them the error,
 * empty and "Earlier plays" states.
 */

import { CatchUpCard } from './CatchUp'
import { Cluster, TypingRow, TypingSummary } from './FeedRows'
import type { FeedEntry, Typing } from '@/lib/timeline/chat'
import type { GameSummary } from '@/lib/model/timeline'
import type { CatchUp } from '@/lib/timeline/catchup'
import { SharpPicksBanner } from '@/components/predictions/SharpPicks'
import { Notice, ReadDivider } from '@/components/chat/ChatParts'
import { BubblesSkeleton } from '@/components/layout/Skeleton'
import { useVtName } from '@/lib/timeline/gameLink'
import { cn } from '@/lib/utils'

export function TimelineFeed({
  entries,
  typing,
  gameId,
  dimmed,
  loading,
  recap,
  readAt,
  dividerAt,
  newCount,
  onRecap,
  onLive,
  sharpPicks = false,
}: {
  entries: ReadonlyArray<FeedEntry>
  typing: Array<{ typing: Typing; game: GameSummary }>
  gameId: string | null
  dimmed: boolean
  loading: boolean
  recap: CatchUp | null
  readAt: string | null
  /** The entry the read divider sits above (-1 for none). */
  dividerAt: number
  newCount: number
  onRecap: () => void
  onLive: () => void
  /** Lead with the day's Sharp picks banner (the Predictions Scope). */
  sharpPicks?: boolean
}) {
  const vtName = useVtName()
  return (
    // A chat feed, not a document: nothing selects, so long-pressing a
    // bubble to react never makes iOS highlight the feed around it.
    <ol
      className={cn(
        'flex flex-col gap-3 transition-opacity select-none [-webkit-touch-callout:none]',
        dimmed && 'opacity-50',
      )}
      aria-busy={loading}
    >
      {sharpPicks && (
        <li>
          <SharpPicksBanner />
        </li>
      )}
      {recap && readAt && (
        <li style={{ viewTransitionName: vtName('catchup') && 'catchup' }}>
          <CatchUpCard catchUp={recap} readAt={readAt} onOpen={onRecap} />
        </li>
      )}
      {typing.length > 1 ? (
        <li style={{ viewTransitionName: vtName('typing') && 'typing' }}>
          <TypingSummary typing={typing} onOpen={onLive} />
        </li>
      ) : (
        typing.map(({ typing: t, game: g }) => (
          <li
            key={`typing:${g.id}`}
            style={{ viewTransitionName: vtName(`typing:${g.id}`) }}
          >
            <TypingRow typing={t} game={g} focused={g.id === gameId} />
          </li>
        ))
      )}
      {entries.map((entry, i) => (
        <li
          key={entry.type === 'notice' ? entry.item.id : entry.id}
          // Off-screen rows skip layout and paint until scrolled near; each
          // keeps its last measured height so the scrollbar holds still (the
          // clip margin spares the Reaction pills' shadow).
          className="flex flex-col gap-3 [contain-intrinsic-size:auto_96px] [content-visibility:auto] [overflow-clip-margin:8px]"
        >
          {i === dividerAt && i > 0 && <ReadDivider count={newCount} />}
          {entry.type === 'notice' ? (
            <div
              className="flex flex-col"
              style={{ viewTransitionName: vtName(entry.item.id) }}
            >
              <Notice item={entry.item} showLeague={!gameId} />
            </div>
          ) : (
            <Cluster entry={entry} focused={Boolean(gameId)} />
          )}
        </li>
      ))}
    </ol>
  )
}

/** Under the feed: a load error, the empty state, or "Earlier plays". */
export function FeedFooter({
  error,
  onRetry,
  empty,
  loading = false,
  emptyText,
  hasMore,
  loadingMore,
  onMore,
}: {
  error: boolean
  onRetry: () => void
  /** Nothing to show (no plays, nothing live). */
  empty: boolean
  /** Nothing yet because it's still loading: bubbles, not the empty text. */
  loading?: boolean
  emptyText: string
  /** More plays to page in (never inside one Game). */
  hasMore: boolean
  loadingMore: boolean
  onMore: () => void
}) {
  return (
    <>
      {error && (
        <div
          role="alert"
          className="well mt-6 flex items-center justify-between gap-3 rounded-card px-3.5 py-2.5 text-sm"
        >
          Couldn’t load this feed.
          <button
            type="button"
            onClick={onRetry}
            className="key inline-flex h-9 items-center rounded-control px-3 text-3xs font-bold uppercase"
          >
            Try again
          </button>
        </div>
      )}

      {!error && empty && loading && (
        <BubblesSkeleton label="Loading plays" className="mt-3" />
      )}

      {!error && empty && !loading && (
        <p className="well mt-6 rounded-card px-4 py-8 text-center text-sm text-muted">
          {emptyText}
        </p>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          disabled={loadingMore}
          className="key mx-auto mt-6 flex h-11 items-center rounded-control px-5 text-3xs font-bold uppercase"
        >
          {loadingMore ? 'Loading…' : 'Earlier plays'}
        </button>
      )}
    </>
  )
}
