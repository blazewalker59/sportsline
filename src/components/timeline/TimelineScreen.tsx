import { useState } from 'react'
import { useNow } from './format'
import { GameStrip } from './GameStrip'
import { TimelineItemCard } from './TimelineItemCard'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import { DEFAULT_FOLLOWS } from '@/lib/model/timeline'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { useLiveTimeline } from '@/lib/timeline/useLiveTimeline'
import { cn } from '@/lib/utils'

export function TimelineScreen() {
  const [includeRoutine, setIncludeRoutine] = useState(false)
  const [sportsDay] = useState(() => sportsDayOf(new Date()))
  const timeline = useLiveTimeline(DEFAULT_FOLLOWS, includeRoutine, sportsDay)
  const now = useNow()

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-3 bg-background/90 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">Sportsline</h1>
          <ConnectionDot connection={timeline.connection} />
          <button
            type="button"
            onClick={() => setIncludeRoutine((v) => !v)}
            aria-pressed={includeRoutine}
            className={cn(
              'ml-auto rounded-full border px-3 py-1 text-xs transition-colors',
              includeRoutine
                ? 'border-foreground/60 bg-foreground text-background'
                : 'border-border text-muted hover:text-foreground',
            )}
          >
            All plays
          </button>
        </div>
      </header>

      <GameStrip games={timeline.games} />

      <ol className="mt-4 flex flex-col gap-2">
        {timeline.items.map((item) => (
          <li key={item.id}>
            <TimelineItemCard item={item} now={now} />
          </li>
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
          connection === 'live' ? 'bg-live animate-pulse' : 'bg-muted',
        )}
      />
      {label}
    </span>
  )
}
