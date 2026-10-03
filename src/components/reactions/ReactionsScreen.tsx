/**
 * Your Reactions over time (CONTEXT.md, "Reaction"), newest first and
 * grouped by Sports Day. Tapping a Play opens its detail in a sheet here.
 */

import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { MyReaction } from '@/lib/reactions/server'
import { AppHeader } from '@/components/layout/AppHeader'
import {
  LeagueAvatar,
  PlayBubble,
  TeamAvatar,
} from '@/components/chat/ChatParts'
import { PlaySheet } from '@/components/games/PlayDetailScreen'
import { dayLabel } from '@/components/timeline/DayButton'
import { timeAgo, useNow } from '@/components/timeline/format'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { getMyReactions } from '@/lib/reactions/server'
import { takePlayOpened } from '@/lib/timeline/playSheet'
import { useViewer } from '@/lib/viewer/useViewer'

export function ReactionsScreen({ playId }: { playId: string | null }) {
  const { data: viewerState, isPending } = useViewer()
  const signedIn = Boolean(viewerState?.viewer)
  const now = useNow()
  const [today] = useState(() => sportsDayOf(new Date()))
  const query = useInfiniteQuery({
    queryKey: ['my-reactions'],
    queryFn: ({ pageParam }) => getMyReactions({ data: { before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: signedIn,
  })
  const reactions = query.data?.pages.flatMap((p) => p.reactions) ?? []
  const days = groupByDay(reactions)

  const navigate = useNavigate()
  const router = useRouter()
  const closePlay = useCallback(() => {
    // Opened from a bubble: go Back, exactly like the Back gesture.
    if (takePlayOpened()) router.history.back()
    else
      void navigate({
        to: '/reactions',
        search: { play: undefined },
        replace: true,
      })
  }, [navigate, router])
  useEffect(() => {
    if (!playId) takePlayOpened()
  }, [playId])

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 select-none [-webkit-touch-callout:none]">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Reactions</h1>
      {isPending ? null : !signedIn ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to keep your Reactions.
        </p>
      ) : query.isPending ? (
        <p className="mt-16 text-center text-sm text-muted">Loading…</p>
      ) : reactions.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">
          Long-press any Play on the Timeline to react. Your Reactions collect
          here.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map(({ sportsDay, entries }) => (
            <section key={sportsDay} className="flex flex-col gap-4">
              <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
                {dayLabel(sportsDay, today)}
              </h2>
              {entries.map((r) => (
                <ReactionEntry key={r.item.id} reaction={r} now={now} />
              ))}
            </section>
          ))}
          {query.hasNextPage && (
            <button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="mx-auto block min-h-11 rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent"
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Older Reactions'}
            </button>
          )}
        </div>
      )}
      {playId && <PlaySheet playId={playId} onClose={closePlay} />}
    </div>
  )
}

function ReactionEntry({
  reaction: { item, emoji, reactedAt },
  now,
}: {
  reaction: MyReaction
  now: number
}) {
  const team = item.side === 'home' ? item.homeTeam : item.awayTeam
  return (
    <div className="flex items-end gap-2">
      {item.side ? (
        <TeamAvatar team={team} />
      ) : (
        <LeagueAvatar league={item.league} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {item.awayTeam.abbreviation} {item.score.away} – {item.score.home}{' '}
            {item.homeTeam.abbreviation}
          </span>{' '}
          · {item.segmentLabel} · reacted {timeAgo(reactedAt, now)}
        </span>
        <div className="relative flex flex-col self-start">
          <PlayBubble
            item={item}
            align="left"
            position="single"
            reactable={false}
          />
          <span
            aria-label={`You reacted ${emoji}`}
            className="absolute -right-2 -bottom-3 flex size-8 items-center justify-center rounded-full border border-border bg-surface text-lg shadow"
          >
            {emoji}
          </span>
        </div>
      </div>
    </div>
  )
}

function groupByDay(
  reactions: ReadonlyArray<MyReaction>,
): Array<{ sportsDay: string; entries: Array<MyReaction> }> {
  const days: Array<{ sportsDay: string; entries: Array<MyReaction> }> = []
  for (const r of reactions) {
    const day = r.item.sportsDay
    const last = days.at(-1)
    if (last?.sportsDay === day) last.entries.push(r)
    else days.push({ sportsDay: day, entries: [r] })
  }
  return days
}
