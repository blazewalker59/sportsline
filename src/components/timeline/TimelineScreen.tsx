import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { timeAgo, useNow } from './format'
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

  const entries = useMemo(
    () => buildChat(timeline.items, { fold: true }),
    [timeline.items],
  )
  const typing = useMemo(
    () =>
      timeline.games
        .filter((g) => followsGame(g, follows))
        .flatMap((g) => {
          const t = typingFor(g)
          return t ? [{ typing: t, game: g }] : []
        }),
    [timeline.games, follows],
  )
  const newCount = readAt
    ? timeline.items.filter((i) => i.occurredAt > readAt).length
    : 0
  const dividerAt = readAt
    ? entries.findIndex((e) => entryTime(e) <= readAt)
    : -1

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
          No plays yet today.
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
