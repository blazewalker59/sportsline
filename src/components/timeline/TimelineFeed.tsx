/**
 * The Timeline's feed: the catch-up card, what's live (typing), then the
 * plays as chat entries with the read divider; and under them the error,
 * empty and "Earlier plays" states.
 */

import { CatchUpCard } from './CatchUp'
import { Cluster, TypingRow, TypingSummary } from './FeedRows'
import type { FeedEntry, Typing } from '@/lib/timeline/chat'
import type { GameSummary } from '@/lib/model/timeline'
import type { CatchUp } from '@/lib/timeline/catchup'
import { Notice, ReadDivider } from '@/components/chat/ChatParts'
import { vtName } from '@/lib/timeline/gameLink'
import { cn } from '@/lib/utils'

export function TimelineFeed({
  entries,
  typing,
  gameId,
  now,
  dimmed,
  loading,
  recap,
  readAt,
  dividerAt,
  newCount,
  onRecap,
  onLive,
}: {
  entries: ReadonlyArray<FeedEntry>
  typing: Array<{ typing: Typing; game: GameSummary }>
  gameId: string | null
  now: number
  dimmed: boolean
  loading: boolean
  recap: CatchUp | null
  readAt: string | null
  /** The entry the read divider sits above (-1 for none). */
  dividerAt: number
  newCount: number
  onRecap: () => void
  onLive: () => void
}) {
  return (
    <ol
      className={cn(
        'flex flex-col gap-3 transition-opacity',
        dimmed && 'opacity-50',
      )}
      aria-busy={loading}
    >
      {recap && readAt && (
        <li style={{ viewTransitionName: 'catchup' }}>
          <CatchUpCard catchUp={recap} readAt={readAt} onOpen={onRecap} />
        </li>
      )}
      {typing.length > 1 ? (
        <li style={{ viewTransitionName: 'typing' }}>
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
          className="flex flex-col gap-3"
        >
          {i === dividerAt && i > 0 && <ReadDivider count={newCount} />}
          {entry.type === 'notice' ? (
            <div
              className="flex flex-col"
              style={{ viewTransitionName: vtName(entry.item.id) }}
            >
              <Notice item={entry.item} now={now} showLeague={!gameId} />
            </div>
          ) : (
            <Cluster entry={entry} now={now} focused={Boolean(gameId)} />
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
  emptyText,
  hasMore,
  loadingMore,
  onMore,
}: {
  error: boolean
  onRetry: () => void
  /** Nothing to show (no plays, nothing live). */
  empty: boolean
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
          className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-sm text-live"
        >
          Couldn’t load this feed.
          <button
            type="button"
            onClick={onRetry}
            className="min-h-9 rounded-full bg-background px-3 font-semibold"
          >
            Try again
          </button>
        </div>
      )}

      {!error && empty && (
        <p className="mt-16 text-center text-sm text-muted">{emptyText}</p>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          disabled={loadingMore}
          className="mx-auto mt-6 block min-h-11 rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent"
        >
          {loadingMore ? 'Loading…' : 'Earlier plays'}
        </button>
      )}
    </>
  )
}
