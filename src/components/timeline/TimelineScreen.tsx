import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { timeAgo, useNow } from './format'
import { DayStrip } from './DayStrip'
import { GameStrip } from './GameStrip'
import type { FeedEntry, Typing } from '@/lib/timeline/chat'
import type { Follow, GameSummary } from '@/lib/model/timeline'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import { withViewTransition } from '@/lib/viewTransition'
import { gameSearch, vtName } from '@/lib/timeline/gameLink'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { BoxSheet, GameFocusBar } from '@/components/games/GameView'
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

export function TimelineScreen({
  day,
  gameId,
}: {
  day?: string
  gameId?: string
}) {
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
      // Not keyed by day: moving between days keeps this Timeline (and its
      // cache) so the switch is a transition, not a rebuild.
      key={viewerState.data?.viewer?.id ?? 'guest'}
      sportsDay={sportsDay}
      today={today}
      gameId={gameId ?? null}
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

function Timeline({
  sportsDay,
  today,
  gameId,
}: {
  sportsDay: string
  today: string
  gameId: string | null
}) {
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
  // Highlights = Scoring and Notable Plays only. It starts on when the
  // Viewer sees every League (the default Follows), off for their own Follows.
  const [highlights, setHighlights] = useState(() => !followed?.length)
  const timeline = useLiveTimeline(follows, sportsDay, today)
  // While a day loads, keep the previous one on screen, dimmed.
  const dimmed = timeline.loading && timeline.previousItems.length > 0
  // Only today's Timeline moves the Read Marker; browsing history must not.
  useReadMarkerWriter(timeline.items, viewer !== null && isToday && !gameId)
  const backfill = usePastDay(sportsDay, isToday, timeline.reload)
  const now = useNow()
  const game = useLiveGame(gameId)
  const [boxOpen, setBoxOpen] = useState(false)
  useEffect(() => setBoxOpen(false), [gameId])

  // Selecting a Game only filters this same feed (newest first, same
  // bubbles). Until the Game's full history loads, filter what is here.
  const items = useMemo(() => {
    const source = !gameId
      ? dimmed
        ? timeline.previousItems
        : timeline.items
      : game.data
        ? [...game.data.items].reverse()
        : timeline.items.filter((i) => i.gameId === gameId)
    return highlights
      ? source.filter((i) => i.kind !== 'play' || i.significance !== 'routine')
      : source
  }, [
    gameId,
    game.data,
    timeline.items,
    timeline.previousItems,
    dimmed,
    highlights,
  ])
  const selectedGame =
    (gameId &&
      (game.data?.game ?? timeline.games.find((g) => g.id === gameId))) ||
    null

  const entries = useMemo(() => buildChat(items, { fold: true }), [items])
  const typing = useMemo(
    () =>
      (isToday ? timeline.games : [])
        .filter((g) => (gameId ? g.id === gameId : followsGame(g, follows)))
        .flatMap((g) => {
          const t = typingFor(g)
          return t ? [{ typing: t, game: g }] : []
        }),
    [timeline.games, follows, isToday, gameId],
  )
  const showMarker = isToday && readAt !== null && !gameId
  const newCount =
    showMarker && readAt ? items.filter((i) => i.occurredAt > readAt).length : 0
  const dividerAt =
    showMarker && readAt ? entries.findIndex((e) => entryTime(e) <= readAt) : -1

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      {/* Pinned: everything above the conversation stays put while it scrolls. */}
      <div
        className="sticky top-0 z-10 -mx-4 mb-3 border-b border-border bg-background/95 px-4 pb-3 backdrop-blur"
        style={{ viewTransitionName: 'pinned' }}
      >
        <AppHeader pinned={false}>
          <ConnectionDot connection={timeline.connection} />
        </AppHeader>
        <DayStrip sportsDay={sportsDay} today={today} />
        <div className={cn('transition-opacity', dimmed && 'opacity-50')}>
          <GameStrip
            games={
              dimmed && timeline.previousGames.length
                ? timeline.previousGames
                : timeline.games
            }
            selected={gameId ?? undefined}
          />
        </div>
        <PlaysToggle
          highlights={highlights}
          onChange={(value) => withViewTransition(() => setHighlights(value))}
        />
        <GameFocusBar game={selectedGame} onBox={() => setBoxOpen(true)} />
      </div>

      {viewer && !followed?.length && !gameId && (
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

      <ol
        className={cn(
          'flex flex-col gap-3 transition-opacity',
          dimmed && 'opacity-50',
        )}
        aria-busy={timeline.loading}
      >
        {typing.map(({ typing: t, game: g }) => (
          <li
            key={`typing:${g.id}`}
            style={{ viewTransitionName: vtName(`typing:${g.id}`) }}
          >
            <TypingRow typing={t} game={g} focused={g.id === gameId} />
          </li>
        ))}
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

      {items.length === 0 && typing.length === 0 && (
        <p className="mt-16 text-center text-sm text-muted">
          {gameId
            ? game.isPending
              ? 'Loading…'
              : 'No plays in this game yet.'
            : backfill === 'loading' || timeline.loading
              ? 'Loading this day’s games…'
              : isToday
                ? 'No plays yet today.'
                : 'No plays on this day.'}
        </p>
      )}

      {!gameId && timeline.hasMore && (
        <button
          type="button"
          onClick={() => void timeline.loadMore()}
          disabled={timeline.loadingMore}
          className="mx-auto mt-6 block min-h-11 rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent"
        >
          {timeline.loadingMore ? 'Loading…' : 'Earlier plays'}
        </button>
      )}

      {boxOpen && selectedGame && (
        <BoxSheet
          game={selectedGame}
          box={game.data?.box ?? null}
          onClose={() => setBoxOpen(false)}
        />
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
  focused,
}: {
  entry: Extract<FeedEntry, { type: 'cluster' }>
  now: number
  /** One Game is selected: the home team answers from the right, like a thread. */
  focused: boolean
}) {
  const first = entry.bubbles[0]
  const lead = first.type === 'fold' ? first.items[0] : first.item
  const team = entry.side === 'home' ? lead.homeTeam : lead.awayTeam
  const align = focused && entry.side === 'home' ? 'right' : 'left'
  return (
    <div
      className={cn(
        'flex items-end gap-2',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      <Link
        to="/"
        search={gameSearch(entry.gameId, lead.sportsDay)}
        viewTransition
        resetScroll={false}
        aria-label={`Show only the ${team.abbreviation} game`}
      >
        <TeamAvatar team={team} />
      </Link>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-1',
          align === 'right' && 'items-end',
        )}
      >
        <span className="px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {team.abbreviation}
          </span>{' '}
          · {lead.segmentLabel} · {timeAgo(lead.occurredAt, now)}
        </span>
        <BubbleStack bubbles={entry.bubbles} align={align} />
      </div>
    </div>
  )
}

function TypingRow({
  typing,
  game,
  focused,
}: {
  typing: Typing
  game: GameSummary
  focused: boolean
}) {
  const team =
    typing.side === 'home'
      ? game.homeTeam
      : typing.side === 'away'
        ? game.awayTeam
        : null
  const right = focused && typing.side === 'home'
  return (
    <Link
      to="/"
      search={gameSearch(game.id, game.sportsDay)}
      viewTransition
      resetScroll={false}
      className={cn('flex items-end gap-2', right && 'flex-row-reverse')}
    >
      {team ? (
        <TeamAvatar team={team} />
      ) : (
        <LeagueAvatar league={game.league} />
      )}
      <div className={cn('flex min-w-0 flex-col gap-1', right && 'items-end')}>
        <span className="truncate px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {team
              ? team.abbreviation
              : `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`}
          </span>{' '}
          · {typing.text}
        </span>
        <TypingDots align={right ? 'right' : 'left'} />
      </div>
    </Link>
  )
}

/** All plays vs Highlights (Scoring and Notable only), under the score cards. */
function PlaysToggle({
  highlights,
  onChange,
}: {
  highlights: boolean
  onChange: (highlights: boolean) => void
}) {
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={highlights === value}
      onClick={() => onChange(value)}
      className={cn(
        'min-h-9 flex-1 rounded-full text-[13px] font-semibold transition-colors',
        highlights === value
          ? 'bg-surface text-foreground shadow-sm'
          : 'text-muted',
      )}
    >
      {label}
    </button>
  )
  return (
    <div
      role="radiogroup"
      aria-label="Which plays to show"
      className="mt-2 flex gap-1 rounded-full bg-notice p-1"
    >
      {option(false, 'All plays')}
      {option(true, 'Highlights')}
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
