/**
 * A Player's page: their profile in full (as in their sheet), then every
 * Play naming them, newest first by Sports Day. Tapping a Play opens its
 * detail in a sheet here.
 */

import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { TimelineItem } from '@/lib/model/timeline'
import { AppHeader } from '@/components/layout/AppHeader'
import {
  PlayerDetailSections,
  PlayerHeader,
} from '@/components/players/PlayerProfile'
import {
  LeagueAvatar,
  PlayBubble,
  TeamAvatarLink,
} from '@/components/chat/ChatParts'
import { PlaySheet } from '@/components/games/PlayDetailScreen'
import { dayLabel } from '@/components/timeline/DayButton'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { getPlayerPage } from '@/lib/players/server'
import { takePlayOpened } from '@/lib/timeline/playSheet'

export function PlayerScreen({
  playerId,
  playId,
}: {
  playerId: string
  playId: string | null
}) {
  const [today] = useState(() => sportsDayOf(new Date()))
  const query = useInfiniteQuery({
    queryKey: ['player', playerId],
    queryFn: ({ pageParam }) =>
      getPlayerPage({ data: { playerId, before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.nextBefore ?? undefined,
  })
  const first = query.data?.pages[0]
  const items = query.data?.pages.flatMap((p) => p?.items ?? []) ?? []

  const navigate = useNavigate()
  const router = useRouter()
  const closePlay = useCallback(() => {
    // Opened from a bubble: go Back, exactly like the Back gesture.
    if (takePlayOpened()) router.history.back()
    else
      void navigate({
        to: '/players/$playerId',
        params: { playerId },
        search: { play: undefined },
        replace: true,
      })
  }, [navigate, router, playerId])
  useEffect(() => {
    if (!playId) takePlayOpened()
  }, [playId])

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      {query.isPending ? (
        <p className="mt-16 text-center text-sm text-muted">Loading…</p>
      ) : !first ? (
        <p className="mt-16 text-center text-sm text-muted">
          Player not found.
        </p>
      ) : (
        <>
          <PlayerHeader player={first.player} />
          <div className="mt-6 mb-6">
            <PlayerDetailSections player={first.player} />
          </div>
          <h2 className="mb-3 text-xs font-bold tracking-wide text-muted uppercase">
            Plays
          </h2>

          {items.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">
              No plays yet. Their plays will collect here.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {groupByDay(items).map(({ sportsDay, entries }) => (
                <section key={sportsDay} className="flex flex-col gap-3">
                  <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
                    {dayLabel(sportsDay, today)}
                  </h2>
                  {entries.map((item) => (
                    <PlayEntry key={item.id} item={item} />
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
                  {query.isFetchingNextPage ? 'Loading…' : 'Earlier plays'}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {playId && <PlaySheet playId={playId} onClose={closePlay} />}
    </div>
  )
}

function PlayEntry({ item }: { item: TimelineItem }) {
  const team = item.side === 'home' ? item.homeTeam : item.awayTeam
  return (
    <div className="flex items-end gap-2">
      {item.side ? (
        <TeamAvatarLink team={team} />
      ) : (
        <LeagueAvatar league={item.league} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {item.awayTeam.abbreviation} {item.score.away} – {item.score.home}{' '}
            {item.homeTeam.abbreviation}
          </span>{' '}
          · {item.segmentLabel}
        </span>
        <PlayBubble
          item={item}
          align="left"
          position="single"
          reactable={false}
        />
      </div>
    </div>
  )
}

function groupByDay(
  items: ReadonlyArray<TimelineItem>,
): Array<{ sportsDay: string; entries: Array<TimelineItem> }> {
  const days: Array<{ sportsDay: string; entries: Array<TimelineItem> }> = []
  for (const item of items) {
    const last = days.at(-1)
    if (last?.sportsDay === item.sportsDay) last.entries.push(item)
    else days.push({ sportsDay: item.sportsDay, entries: [item] })
  }
  return days
}
