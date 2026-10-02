import { Link } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { useNow } from './format'
import { GameStrip } from './GameStrip'
import { TimelineItemCard } from './TimelineItemCard'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import { AppHeader } from '@/components/layout/AppHeader'
import { DEFAULT_FOLLOWS } from '@/lib/model/timeline'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { readMarkerIndex } from '@/lib/timeline/merge'
import { useLiveTimeline } from '@/lib/timeline/useLiveTimeline'
import { cn } from '@/lib/utils'
import { useReadMarkerWriter, useViewer } from '@/lib/viewer/useViewer'

export function TimelineScreen() {
  const viewerState = useViewer()
  // Wait for the session so a signed-in Viewer never flashes the default Timeline.
  if (viewerState.isPending) {
    return (
      <div className="mx-auto max-w-xl px-4">
        <AppHeader />
      </div>
    )
  }
  return <Timeline key={viewerState.data?.viewer?.id ?? 'guest'} />
}

function Timeline() {
  const { data } = useViewer()
  const viewer = data?.viewer ?? null
  const followed = data?.follows
  const follows = useMemo(
    () => (followed?.length ? followed.map((f) => f.follow) : DEFAULT_FOLLOWS),
    [followed],
  )
  // The divider marks where the Viewer stopped last time, so it is fixed at
  // load while the stored marker keeps moving.
  const [readAt] = useState(() => data?.readAt ?? null)
  const [includeRoutine, setIncludeRoutine] = useState(false)
  const [sportsDay] = useState(() => sportsDayOf(new Date()))
  const timeline = useLiveTimeline(follows, includeRoutine, sportsDay)
  useReadMarkerWriter(timeline.items, viewer !== null)
  const now = useNow()
  const dividerAt = readMarkerIndex(timeline.items, readAt)

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader
        right={
          <button
            type="button"
            onClick={() => setIncludeRoutine((v) => !v)}
            aria-pressed={includeRoutine}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              includeRoutine
                ? 'border-foreground/60 bg-foreground text-background'
                : 'border-border text-muted hover:text-foreground',
            )}
          >
            All plays
          </button>
        }
      >
        <ConnectionDot connection={timeline.connection} />
      </AppHeader>

      {viewer && !followed?.length && (
        <Link
          to="/follows"
          className="mb-3 block rounded-xl border border-border bg-surface px-4 py-3 text-sm"
        >
          You’re seeing every League.{' '}
          <span className="underline">Follow Teams and Players</span> to make
          this Timeline yours.
        </Link>
      )}

      <GameStrip games={timeline.games} />

      <ol className="mt-4 flex flex-col gap-2">
        {timeline.items.map((item, i) => (
          <Fragment key={item.id}>
            {i === dividerAt && (
              <li
                aria-label="You were here"
                className="flex items-center gap-3 py-1 text-xs font-semibold text-live"
              >
                <span className="h-px flex-1 bg-live/50" />
                You were here
                <span className="h-px flex-1 bg-live/50" />
              </li>
            )}
            <li>
              <TimelineItemCard item={item} now={now} />
            </li>
          </Fragment>
        ))}
      </ol>

      {timeline.items.length === 0 && (
        <p className="mt-16 text-center text-sm text-muted">
          No plays yet today.
        </p>
      )}

      {timeline.hasMore && (
        <button
          type="button"
          onClick={() => void timeline.loadMore()}
          disabled={timeline.loadingMore}
          className="mx-auto mt-4 block rounded-full border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          {timeline.loadingMore ? 'Loading…' : 'Earlier plays'}
        </button>
      )}
    </div>
  )
}

function ConnectionDot({ connection }: { connection: Connection }) {
  const label = {
    live: 'Live',
    connecting: 'Connecting',
    offline: 'Reconnecting',
  }[connection]
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted"
      aria-live="polite"
    >
      <span
        className={cn(
          'size-2 rounded-full',
          connection === 'live' ? 'animate-pulse bg-live' : 'bg-muted',
        )}
      />
      {label}
    </span>
  )
}
