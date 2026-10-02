import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { timeAgo, useNow } from './format'
import { DayBar } from './DayBar'
import { GameStrip } from './GameStrip'
import type { FeedEntry, Typing } from '@/lib/timeline/chat'
import type { Follow, GameSummary } from '@/lib/model/timeline'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import {
  BubbleStack,
  LeagueAvatar,
  Notice,
  ReadDivider,
  TeamAvatar,
  TypingDots,
} from '@/components/chat/ChatParts'
import { AppHeader } from '@/components/layout/AppHeader'
import { DEFAULT_FOLLOWS } from '@/lib/model/timeline'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { buildChat, typingFor } from '@/lib/timeline/chat'
import { ensureSportsDay } from '@/lib/timeline/server'
import { useLiveTimeline } from '@/lib/timeline/useLiveTimeline'
import { cn } from '@/lib/utils'
import { useReadMarkerWriter, useViewer } from '@/lib/viewer/useViewer'

export function TimelineScreen({ day }: { day?: string }) {
  const viewerState = useViewer()
  const [today] = useState(() => sportsDayOf(new Date()))
  const sportsDay = day && day < today ? day : today
  // Wait for the session so a signed-in Viewer never flashes the default Timeline.
  if (viewerState.isPending) {
    return (
      <div className="mx-auto max-w-xl px-4">
        <AppHeader />
      </div>
    )
  }
  return (
    <Timeline
      key={`${viewerState.data?.viewer?.id ?? 'guest'}:${sportsDay}`}
      sportsDay={sportsDay}
      today={today}
    />
  )
}

/** Is this live Game one the Viewer's Follows cover (for its typing indicator)? */
function followsGame(
  game: GameSummary,
  follows: ReadonlyArray<Follow>,
): boolean {
  return follows.some((f) =>
    f.kind === 'league'
      ? f.league === game.league
      : f.kind === 'team'
        ? f.teamId === game.awayTeam.id || f.teamId === game.homeTeam.id
        : false,
  )
}

function Timeline({ sportsDay, today }: { sportsDay: string; today: string }) {
  const isToday = sportsDay === today
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
  const timeline = useLiveTimeline(follows, includeRoutine, sportsDay)
  // Only today's Timeline moves the Read Marker; browsing history must not.
  useReadMarkerWriter(timeline.items, viewer !== null && isToday)
  const backfill = usePastDay(sportsDay, isToday, timeline.reload)
  const now = useNow()

  const entries = useMemo(
    () => buildChat(timeline.items, { fold: true }),
    [timeline.items],
  )
  const typing = useMemo(
    () =>
      (isToday ? timeline.games : [])
        .filter((g) => followsGame(g, follows))
        .flatMap((g) => {
          const t = typingFor(g)
          return t ? [{ typing: t, game: g }] : []
        }),
    [timeline.games, follows, isToday],
  )
  const showMarker = isToday && readAt !== null
  const newCount =
    showMarker && readAt
      ? timeline.items.filter((i) => i.occurredAt > readAt).length
      : 0
  const dividerAt =
    showMarker && readAt ? entries.findIndex((e) => entryTime(e) <= readAt) : -1

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader
        right={
          <button
            type="button"
            onClick={() => setIncludeRoutine((v) => !v)}
            aria-pressed={includeRoutine}
            className={cn(
              'min-h-11 rounded-full px-4 text-[13px] font-semibold transition-colors',
              includeRoutine
                ? 'bg-foreground text-background'
                : 'bg-accent-soft text-accent',
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
          className="mb-3 block rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
        >
          You’re seeing every League.{' '}
          <span className="font-semibold text-accent">
            Follow Teams and Players
          </span>{' '}
          to make this Timeline yours.
        </Link>
      )}

      <DayBar sportsDay={sportsDay} today={today} />

      <GameStrip games={timeline.games} />

      <ol className="mt-4 flex flex-col gap-3">
        {typing.map(({ typing: t, game }) => (
          <li key={`typing:${game.id}`}>
            <TypingRow typing={t} game={game} />
          </li>
        ))}
        {entries.map((entry, i) => (
          <li
            key={entry.type === 'notice' ? entry.item.id : entry.id}
            className="flex flex-col gap-3"
          >
            {i === dividerAt && i > 0 && <ReadDivider count={newCount} />}
            {entry.type === 'notice' ? (
              <Notice item={entry.item} now={now} showLeague />
            ) : (
              <Cluster entry={entry} now={now} />
            )}
          </li>
        ))}
      </ol>

      {timeline.items.length === 0 && typing.length === 0 && (
        <p className="mt-16 text-center text-sm text-muted">
          {backfill === 'loading'
            ? 'Loading this day’s games…'
            : isToday
              ? 'No plays yet today.'
              : 'No plays on this day.'}
        </p>
      )}

      {timeline.hasMore && (
        <button
          type="button"
          onClick={() => void timeline.loadMore()}
          disabled={timeline.loadingMore}
          className="mx-auto mt-6 block min-h-11 rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent"
        >
          {timeline.loadingMore ? 'Loading…' : 'Earlier plays'}
        </button>
      )}
    </div>
  )
}

/**
 * A past Sports Day that was never loaded is fetched on first open; its
 * finished Games then backfill in the background, so refetch a few times.
 */
function usePastDay(
  sportsDay: string,
  isToday: boolean,
  reload: () => Promise<unknown>,
): 'idle' | 'loading' | 'done' {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  useEffect(() => {
    if (isToday) return
    let cancelled = false
    const timers: Array<ReturnType<typeof setTimeout>> = []
    void ensureSportsDay({ data: { sportsDay } }).then((r) => {
      if (cancelled || !r.loading) return
      setState('loading')
      for (const ms of [3_000, 8_000, 15_000, 30_000]) {
        timers.push(setTimeout(() => void reload(), ms))
      }
      timers.push(setTimeout(() => setState('done'), 30_000))
    })
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [sportsDay, isToday, reload])
  return state
}

function entryTime(entry: FeedEntry): string {
  if (entry.type === 'notice') return entry.item.occurredAt
  const first = entry.bubbles[0]
  return first.type === 'fold'
    ? first.items[0].occurredAt
    : first.item.occurredAt
}

function Cluster({
  entry,
  now,
}: {
  entry: Extract<FeedEntry, { type: 'cluster' }>
  now: number
}) {
  const first = entry.bubbles[0]
  const lead = first.type === 'fold' ? first.items[0] : first.item
  const team = entry.side === 'home' ? lead.homeTeam : lead.awayTeam
  return (
    <div className="flex items-end gap-2">
      <Link
        to="/games/$gameId"
        params={{ gameId: entry.gameId }}
        aria-label={`${team.abbreviation} game`}
      >
        <TeamAvatar team={team} />
      </Link>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="pl-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {team.abbreviation}
          </span>{' '}
          · {lead.segmentLabel} · {timeAgo(lead.occurredAt, now)}
        </span>
        <BubbleStack bubbles={entry.bubbles} align="left" />
      </div>
    </div>
  )
}

function TypingRow({ typing, game }: { typing: Typing; game: GameSummary }) {
  const team =
    typing.side === 'home'
      ? game.homeTeam
      : typing.side === 'away'
        ? game.awayTeam
        : null
  return (
    <Link
      to="/games/$gameId"
      params={{ gameId: game.id }}
      className="flex items-end gap-2"
    >
      {team ? (
        <TeamAvatar team={team} />
      ) : (
        <LeagueAvatar league={game.league} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate pl-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {team
              ? team.abbreviation
              : `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`}
          </span>{' '}
          · {typing.text}
        </span>
        <TypingDots align="left" />
      </div>
    </Link>
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
