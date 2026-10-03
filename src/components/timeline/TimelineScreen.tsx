import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { timeAgo, useNow } from './format'
import { DayButton } from './DayButton'
import { DayStrip } from './DayStrip'
import { ScopeBar } from './ScopeBar'
import { GameStrip } from './GameStrip'
import type { Scope } from '@/lib/model/scope'
import type { FeedEntry, Typing } from '@/lib/timeline/chat'
import type { Follow, GameSummary } from '@/lib/model/timeline'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import { defaultScope, scopeFollows } from '@/lib/model/scope'
import { isRanked } from '@/lib/model/timeline'
import { takePlayOpened } from '@/lib/timeline/playSheet'
import { PlaySheet } from '@/components/games/PlayDetailScreen'
import { useHideOnScroll } from '@/lib/useHideOnScroll'
import { withViewTransition } from '@/lib/viewTransition'
import { gameSearch, vtName } from '@/lib/timeline/gameLink'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { BoxSheet } from '@/components/games/GameView'
import { Sheet } from '@/components/chat/Sheet'
import {
  BubbleStack,
  LeagueAvatar,
  Notice,
  ReadDivider,
  TeamAvatar,
  TypingDots,
} from '@/components/chat/ChatParts'
import { AppHeader } from '@/components/layout/AppHeader'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { buildChat, typingFor } from '@/lib/timeline/chat'
import { ensureSportsDay } from '@/lib/timeline/server'
import { useLiveTimeline } from '@/lib/timeline/useLiveTimeline'
import { cn } from '@/lib/utils'
import { useReadMarkerWriter, useViewer } from '@/lib/viewer/useViewer'

export function TimelineScreen({
  day,
  gameId,
  scope,
  playId,
}: {
  day?: string
  gameId?: string
  scope?: Scope
  playId?: string
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
      scope={scope}
      playId={playId ?? null}
    />
  )
}

/** Does this Game belong on the score cards for the Scope? */
function inScope(
  game: GameSummary,
  scope: Scope,
  viewerFollows: ReadonlyArray<Follow>,
  items: ReadonlyArray<{ gameId: string }>,
): boolean {
  if (scope === 'all') return true
  if (scope !== 'following') return game.league === scope
  // Player Follows can't be judged from the Game alone: include any Game
  // that has Plays on this Timeline.
  return (
    followsGame(game, viewerFollows) || items.some((i) => i.gameId === game.id)
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
        : f.kind === 'top25'
          ? game.league === 'cfb' && isRanked(game)
          : false,
  )
}

function Timeline({
  sportsDay,
  today,
  gameId,
  scope: requestedScope,
  playId,
}: {
  sportsDay: string
  today: string
  gameId: string | null
  scope?: Scope
  playId: string | null
}) {
  const isToday = sportsDay === today
  const { data } = useViewer()
  const viewer = data?.viewer ?? null
  const followed = data?.follows
  const viewerFollows = useMemo(
    () => (followed ?? []).map((f) => f.follow),
    [followed],
  )
  // The Scope from the URL, else Following for a Viewer who follows
  // something, else All (CONTEXT.md, "Scope").
  const scope: Scope =
    requestedScope === 'following' && viewerFollows.length === 0
      ? 'all'
      : (requestedScope ?? defaultScope(viewerFollows))
  const follows = useMemo(
    () => scopeFollows(scope, viewerFollows),
    [scope, viewerFollows],
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
  const [dayOpen, setDayOpen] = useState(false)
  useEffect(() => setDayOpen(false), [sportsDay])
  const cardsHidden = useHideOnScroll()
  const panelHidden = cardsHidden && !dayOpen
  // The spacer under the fixed top section follows its full height.
  const topRef = useRef<HTMLDivElement>(null)
  const [topHeight, setTopHeight] = useState(0)
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setTopHeight(el.offsetHeight))
    observer.observe(el)
    setTopHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [])
  const navigate = useNavigate()
  const router = useRouter()
  const closePlay = useCallback(() => {
    // Opened from a bubble: go Back, exactly like the Back gesture.
    if (takePlayOpened()) router.history.back()
    else
      void navigate({
        to: '/',
        search: (prev) => ({ ...prev, play: undefined }),
        replace: true,
      })
  }, [navigate, router])
  useEffect(() => {
    if (!playId) takePlayOpened()
  }, [playId])
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
  // Several live Games collapse into one typing bubble; this sheet lists them.
  const [liveOpen, setLiveOpen] = useState(false)
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
      {/*
        Pinned over the content rather than in its flow: hiding the score
        cards slides them up behind the header without changing the page's
        height, so scrolling never feeds back into the hide/show.
      */}
      <div
        ref={topRef}
        className="pointer-events-none fixed inset-x-0 top-0 z-10"
        style={{ viewTransitionName: 'pinned' }}
      >
        <div className="mx-auto max-w-xl">
          <div
            className={cn(
              'pointer-events-auto relative z-20 bg-background px-4 transition-[border-color]',
              'border-b',
              panelHidden ? 'border-border' : 'border-transparent',
            )}
          >
            <AppHeader
              pinned={false}
              title={
                <DayButton
                  sportsDay={sportsDay}
                  today={today}
                  open={dayOpen}
                  onToggle={() => setDayOpen((v) => !v)}
                />
              }
              right={
                <HighlightsButton
                  on={highlights}
                  onChange={(value) =>
                    withViewTransition(() => setHighlights(value))
                  }
                />
              }
            >
              <ConnectionDot connection={timeline.connection} />
            </AppHeader>
            <Collapse open={dayOpen}>
              <DayStrip
                sportsDay={sportsDay}
                today={today}
                onPick={() => setDayOpen(false)}
              />
            </Collapse>
          </div>
          {/* Scope chips and score cards tuck away while reading down, return on the way up. */}
          <div
            className={cn(
              'pointer-events-auto relative z-10 border-b border-border bg-background px-4 pb-2 transition-transform duration-300 ease-out',
              panelHidden && '-translate-y-full',
            )}
            inert={panelHidden}
            aria-hidden={panelHidden}
          >
            <ScopeBar scope={scope} canFollow={viewerFollows.length > 0} />
            <div className={cn('transition-opacity', dimmed && 'opacity-50')}>
              <GameStrip
                games={(dimmed && timeline.previousGames.length
                  ? timeline.previousGames
                  : timeline.games
                ).filter((g) =>
                  inScope(g, scope, viewerFollows, timeline.items),
                )}
                selected={gameId ?? undefined}
                onBox={() => setBoxOpen(true)}
              />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="mb-3" style={{ height: topHeight }} />

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
        {typing.length > 1 ? (
          <li style={{ viewTransitionName: 'typing' }}>
            <TypingSummary typing={typing} onOpen={() => setLiveOpen(true)} />
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

      {playId && <PlaySheet playId={playId} onClose={closePlay} />}

      {liveOpen && typing.length > 1 && (
        <Sheet
          title={`Live now · ${typing.length}`}
          onClose={() => setLiveOpen(false)}
        >
          <ol className="flex flex-col gap-3">
            {typing.map(({ typing: t, game: g }) => (
              <li key={g.id} onClick={() => setLiveOpen(false)}>
                <TypingRow typing={t} game={g} focused={false} />
              </li>
            ))}
          </ol>
        </Sheet>
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
        search={(prev) => ({
          ...prev,
          play: undefined,
          ...gameSearch(entry.gameId, lead.sportsDay),
        })}
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
      search={(prev) => ({
        ...prev,
        play: undefined,
        ...gameSearch(game.id, game.sportsDay),
      })}
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

/**
 * Several Games in progress at once, as one typing bubble: their teams'
 * avatars stacked and a count. Opens the list of what's live.
 */
/** Stacked avatars: up to three, stepped so the stack fills 32px. */
const STACK_AVATAR = 24
const STACK_STEP = 4

function TypingSummary({
  typing,
  onOpen,
}: {
  typing: Array<{ typing: Typing; game: GameSummary }>
  onOpen: () => void
}) {
  const shown = typing.slice(0, 3)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${typing.length} games in progress. Show them`}
      className="flex items-end gap-2 text-left"
    >
      {/*
        A stack the size of one avatar (32px), so the bubble lines up with
        every other message: each team's mark sits a few pixels behind the
        one in front.
      */}
      <span className="relative size-8 shrink-0" aria-hidden="true">
        {shown.map(({ typing: t, game: g }, i) => {
          const team =
            t.side === 'home'
              ? g.homeTeam
              : t.side === 'away'
                ? g.awayTeam
                : null
          const offset = (shown.length - 1 - i) * STACK_STEP
          return (
            <span
              key={g.id}
              className="absolute rounded-full ring-2 ring-background"
              style={{ top: offset, left: offset, zIndex: shown.length - i }}
            >
              {team ? (
                <TeamAvatar team={team} size={STACK_AVATAR} />
              ) : (
                <LeagueAvatar league={g.league} size={STACK_AVATAR} />
              )}
            </span>
          )
        })}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {typing.length} games live
          </span>{' '}
          · tap to see all
        </span>
        <TypingDots align="left" />
      </span>
    </button>
  )
}

/** Highlights on/off (Scoring and Notable only): a labeled pill in the header. */
function HighlightsButton({
  on,
  onChange,
}: {
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(
        'flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
        on
          ? 'bg-accent text-background'
          : 'bg-notice text-muted hover:text-foreground',
      )}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
      </svg>
      Highlights
    </button>
  )
}

/** Height-animated show/hide (grid rows 0fr ↔ 1fr), so rows slide instead of popping. */
function Collapse({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-250 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
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
      role="status"
      aria-label={label}
      title={label}
      className="flex size-6 items-center justify-center"
    >
      <span
        className={cn(
          'size-2 rounded-full',
          connection === 'live' ? 'animate-pulse bg-live' : 'bg-muted',
        )}
      />
    </span>
  )
}
