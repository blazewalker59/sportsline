/**
 * The Timeline (CONTEXT.md): a chat feed of the Sports Day's plays for the
 * Viewer's Scope, live. This file wires its parts together: the Scope and
 * what it covers (useTimelineScope), the pinned top (TimelineTop), the feed
 * (TimelineFeed), the selected Game (GamePane) and the sheets it opens
 * (TimelineSheets).
 *
 * On phones a selected Game takes the feed's place, filtered to it. From
 * `lg` (useWideTimeline) the Game opens in a pane beside the Scope's feed,
 * which stays exactly as it was.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { entryTime } from './FeedRows'
import { FeedFooter, TimelineFeed } from './TimelineFeed'
import { GamePane } from './GamePane'
import { TimelineSheets } from './TimelineSheets'
import { TimelineTop } from './TimelineTop'
import { useGoToScope, useLastLeague } from './scopeNav'
import { ScopePrompt } from './ScopePrompt'
import { followsGame } from './timelineScope'
import { usePastDay } from './usePastDay'
import { useTimelineScope } from './useTimelineScope'
import { useWideTimeline } from './useWideTimeline'
import type { Typing } from '@/lib/timeline/chat'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { Scope } from '@/lib/model/scope'
import type { LeagueMatchup } from '@/lib/fantasy/matchup'
import { FirstRunFollows } from '@/components/follows/FirstRunFollows'
import { neighborScope, scopeStops } from '@/lib/model/scope'
import { useSwipe } from '@/components/layout/useSwipe'
import { FantasyTagsProvider } from '@/components/fantasy/FantasyParts'
import { ReactionsProvider } from '@/components/chat/Reactions'
import { takePlayOpened } from '@/lib/timeline/playSheet'
import { useHideOnScroll } from '@/lib/useHideOnScroll'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { catchUp } from '@/lib/timeline/catchup'
import { AppHeader } from '@/components/layout/AppHeader'
import { buildChat, typingFor } from '@/lib/timeline/chat'
import { useLiveTimeline } from '@/lib/timeline/useLiveTimeline'
import { useToday } from '@/lib/timeline/useToday'
import { useReadMarkerWriter, useViewer } from '@/lib/viewer/useViewer'
import { viewerQuery } from '@/lib/viewer/queries'
import { cn } from '@/lib/utils'

export function TimelineScreen({
  day,
  gameId,
  scope,
  playId,
  predictionId,
  matchupId,
}: {
  day?: string
  gameId?: string
  scope?: Scope
  playId?: string
  predictionId?: string
  matchupId?: string
}) {
  const viewerState = useViewer()
  // Rolls over at the Sports Day boundary: today's Timeline moves on with it.
  const today = useToday()
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
    <ReactionsProvider sportsDay={sportsDay}>
      <Timeline
        // Not keyed by day: moving between days keeps this Timeline (and its
        // cache) so the switch is a transition, not a rebuild.
        key={viewerState.data?.viewer?.id ?? 'guest'}
        sportsDay={sportsDay}
        today={today}
        gameId={gameId ?? null}
        scope={scope}
        playId={playId ?? null}
        predictionId={predictionId ?? null}
        matchupId={matchupId ?? null}
      />
    </ReactionsProvider>
  )
}

function Timeline({
  sportsDay,
  today,
  gameId,
  scope: requestedScope,
  playId,
  predictionId,
  matchupId,
}: {
  sportsDay: string
  today: string
  gameId: string | null
  scope?: Scope
  playId: string | null
  /** One Prediction selected: the Timeline narrows to its Games and Players. */
  predictionId: string | null
  /** One Fantasy Matchup selected: the Timeline narrows to its Starters. */
  matchupId: string | null
}) {
  const isToday = sportsDay === today
  const { data } = useViewer()
  const viewer = data?.viewer ?? null
  const followed = data?.follows
  const s = useTimelineScope({ requestedScope, predictionId, matchupId })
  const { scope, follows } = s
  const [predictionOpen, setPredictionOpen] = useState<string | null>(null)
  // A league's sheet: the Viewer's Matchup, or another in the league.
  const [matchupOpen, setMatchupOpen] = useState<{
    id: string
    other?: LeagueMatchup
  } | null>(null)
  const navigate = useNavigate()
  // The divider marks where the Viewer stopped last time, so it is fixed at
  // load while the stored marker keeps moving.
  const [readAt, setReadAt] = useState(() => data?.readAt ?? null)
  // A new Sports Day while the app is open: the divider moves up to where
  // the Viewer had read by then, so the new day doesn't offer last night's
  // plays as missed.
  const queryClient = useQueryClient()
  const openedOn = useRef(today)
  useEffect(() => {
    if (today === openedOn.current) return
    openedOn.current = today
    let cancelled = false
    queryClient
      .fetchQuery({ ...viewerQuery(), staleTime: 0 })
      .then((state) => {
        if (!cancelled) setReadAt(state.readAt)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [today, queryClient])
  // Highlights = Scoring and Notable Plays only. It starts on when the
  // Viewer sees every League (the default Follows), off for their own Follows.
  const [highlights, setHighlights] = useState(() => !followed?.length)
  const timeline = useLiveTimeline(follows, sportsDay, today)
  // While a day loads, keep the previous one on screen, dimmed.
  const dimmed = timeline.loading && timeline.previousItems.length > 0
  // Beside the wide feed a Game opens in its own pane; on phones it takes
  // the feed's place, and the Scope's feed isn't rendered at all.
  const wide = useWideTimeline()
  const showScope = !gameId || wide
  // Only today's Timeline moves the Read Marker; browsing history must not,
  // nor a phone reading one Game.
  useReadMarkerWriter(timeline.items, viewer !== null && isToday && showScope)
  const backfill = usePastDay(sportsDay, isToday, timeline.reload)
  // Today's Timeline socket already carries the Game's events.
  const game = useLiveGame(gameId, { shared: isToday })
  const [boxOpen, setBoxOpen] = useState(false)
  const [dayOpen, setDayOpen] = useState(false)
  useEffect(() => setDayOpen(false), [sportsDay])
  const cardsHidden = useHideOnScroll()
  const panelHidden = cardsHidden && !dayOpen
  // The spacer under the fixed top section follows its full height.
  const topRef = useRef<HTMLDivElement>(null)
  // Swiping across the Timeline steps through the nav's four Scopes, in
  // its order (not while one Game is open: that's a drill-in, not a view).
  const rootRef = useRef<HTMLDivElement>(null)
  const lastLeague = useLastLeague(scope, s.rowItems)
  const goToScope = useGoToScope()
  useSwipe(rootRef, (direction) => {
    if (gameId) return
    const next = neighborScope(
      scopeStops(lastLeague),
      scope,
      direction === 'left' ? 1 : -1,
    )
    if (next) goToScope(next)
  })
  const [topHeight, setTopHeight] = useState(0)
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setTopHeight(el.offsetHeight))
    observer.observe(el)
    setTopHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [])
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

  // Two feeds: the Scope's, and the selected Game's. On phones selecting a
  // Game only swaps one for the other (newest first, same bubbles); from
  // `lg` they sit side by side (useWideTimeline).
  const scopeItems = useMemo(() => {
    const source = dimmed ? timeline.previousItems : timeline.items
    return highlights ? onlyHighlights(source) : source
  }, [timeline.items, timeline.previousItems, dimmed, highlights])
  // Until the Game's full history loads, filter what is here.
  const gameItems = useMemo(() => {
    if (!gameId) return []
    const source = game.data
      ? [...game.data.items].reverse()
      : timeline.items.filter((i) => i.gameId === gameId)
    return highlights ? onlyHighlights(source) : source
  }, [gameId, game.data, timeline.items, highlights])
  const selectedGame =
    (gameId &&
      (game.data?.game ?? timeline.games.find((g) => g.id === gameId))) ||
    null

  const scopeEntries = useMemo(
    () => buildChat(scopeItems, { fold: true }),
    [scopeItems],
  )
  const gameEntries = useMemo(
    () => buildChat(gameItems, { fold: true }),
    [gameItems],
  )
  // Several live Games collapse into one typing bubble; this sheet lists them.
  const [liveOpen, setLiveOpen] = useState(false)
  const scopeTyping = useMemo(
    () =>
      isToday
        ? typingRows(timeline.games.filter((g) => followsGame(g, follows)))
        : [],
    [timeline.games, follows, isToday],
  )
  const gameTyping = useMemo(
    () =>
      isToday ? typingRows(timeline.games.filter((g) => g.id === gameId)) : [],
    [timeline.games, gameId, isToday],
  )
  // The Read Marker and Catch-up belong to the Scope's feed: wherever it
  // shows (not on a phone with a Game open).
  const showMarker = isToday && readAt !== null && showScope
  const newCount =
    showMarker && readAt
      ? scopeItems.filter((i) => i.occurredAt > readAt).length
      : 0
  const dividerAt =
    showMarker && readAt
      ? scopeEntries.findIndex((e) => entryTime(e) <= readAt)
      : -1
  const recap = useMemo(
    () => (showMarker && readAt ? catchUp(scopeItems, readAt) : null),
    [showMarker, readAt, scopeItems],
  )
  const [recapOpen, setRecapOpen] = useState(false)

  // Escape closes the Game's pane beside the wide feed, unless a sheet is
  // open (Escape is the sheet's then).
  useEffect(() => {
    if (!gameId || !wide) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"]')) return
      void navigate({
        to: '/',
        search: (prev) => ({ ...prev, game: undefined }),
        viewTransition: true,
        resetScroll: false,
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameId, wide, navigate])

  const feedFooter = (
    <FeedFooter
      error={Boolean(timeline.error)}
      onRetry={() => void timeline.reload()}
      empty={scopeItems.length === 0 && scopeTyping.length === 0}
      loading={backfill === 'loading' || timeline.loading}
      emptyText={isToday ? 'No plays yet today.' : 'No plays on this day.'}
      hasMore={timeline.hasMore}
      loadingMore={timeline.loadingMore}
      onMore={() => void timeline.loadMore()}
    />
  )

  return (
    // Only the feed (TimelineFeed) and the reaction bar refuse selection;
    // scores and names up here copy like any page's. From `lg`, two
    // columns whether or not a Game is open, so opening one never moves
    // the feed: it already sits where it stays.
    <div
      ref={rootRef}
      className="mx-auto max-w-xl px-4 lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-6"
    >
      <TimelineTop
        topRef={topRef}
        scope={s}
        sportsDay={sportsDay}
        today={today}
        gameId={gameId}
        dayOpen={dayOpen}
        onDayToggle={() => setDayOpen((v) => !v)}
        onDayClose={() => setDayOpen(false)}
        panelHidden={panelHidden}
        highlights={highlights}
        onHighlights={setHighlights}
        connection={timeline.connection}
        dimmed={dimmed}
        games={timeline.games}
        previousGames={timeline.previousGames}
        items={timeline.items}
        onBox={() => setBoxOpen(true)}
        onPrediction={setPredictionOpen}
        onMatchup={(id, other) => setMatchupOpen({ id, other })}
      />

      {/* Tags plays by either side's Starters, in the Fantasy view. */}
      <FantasyTagsProvider
        leagues={
          s.selectedMatchup
            ? [s.selectedMatchup]
            : scope === 'fantasy'
              ? s.fantasyLeagues
              : []
        }
      >
        {showScope && (
          // The Scope's feed, unfiltered. With a Game open it shows only
          // beside it, from `lg` (CSS, so the server render is right too).
          <div
            data-scope-feed=""
            className={cn('pb-16', gameId && 'hidden lg:block')}
          >
            <div
              aria-hidden="true"
              className="mb-3"
              style={{ height: topHeight }}
            />
            {/* A Viewer with no Follows: pick Leagues, then Teams, once. */}
            {viewer && !gameId && <FirstRunFollows />}
            {s.setup ? (
              // The picker above already asks a new Viewer to follow.
              (s.setup !== 'following' || data?.firstRunDone !== false) && (
                <ScopePrompt setup={s.setup} />
              )
            ) : (
              <>
                <TimelineFeed
                  entries={scopeEntries}
                  typing={scopeTyping}
                  gameId={null}
                  dimmed={dimmed}
                  loading={timeline.loading}
                  recap={recap}
                  readAt={readAt}
                  dividerAt={dividerAt}
                  newCount={newCount}
                  onRecap={() => setRecapOpen(true)}
                  onLive={() => setLiveOpen(true)}
                  sharpPicks={scope === 'predictions'}
                />
                {feedFooter}
              </>
            )}
          </div>
        )}

        {gameId ? (
          <GamePane
            // A new Game is a new pane: its box score folds, its scroll
            // starts at the top.
            key={gameId}
            gameId={gameId}
            game={selectedGame}
            box={game.data?.box ?? null}
            entries={gameEntries}
            typing={gameTyping}
            wide={wide}
            topHeight={topHeight}
            dimmed={dimmed}
            loading={game.isPending}
            detailError={game.isError ? game.error : null}
            onDetailRetry={() => game.refetch()}
            feedError={Boolean(timeline.error)}
            onFeedRetry={() => void timeline.reload()}
          />
        ) : (
          wide && <PanePlaceholder />
        )}
      </FantasyTagsProvider>

      <TimelineSheets
        playId={playId}
        onPlayClose={closePlay}
        matchup={
          matchupOpen
            ? (s.fantasyLeagues.find((l) => l.id === matchupOpen.id) ?? null)
            : null
        }
        otherMatchup={matchupOpen?.other}
        games={timeline.games}
        onMatchupClose={() => setMatchupOpen(null)}
        prediction={
          predictionOpen
            ? (s.predictionList.data?.find((x) => x.id === predictionOpen) ??
              null)
            : null
        }
        onPredictionClose={() => setPredictionOpen(null)}
        recap={recapOpen ? recap : null}
        onRecapClose={() => setRecapOpen(false)}
        live={liveOpen && scopeTyping.length > 1 ? scopeTyping : null}
        onLiveClose={() => setLiveOpen(false)}
        boxGame={boxOpen && !wide ? selectedGame : null}
        box={game.data?.box ?? null}
        onBoxClose={() => setBoxOpen(false)}
      />
    </div>
  )
}

/** Scoring and Notable Plays, and every Game Milestone (Highlights). */
function onlyHighlights(
  items: ReadonlyArray<TimelineItem>,
): ReadonlyArray<TimelineItem> {
  return items.filter((i) => i.kind !== 'play' || i.significance !== 'routine')
}

function typingRows(
  games: ReadonlyArray<GameSummary>,
): Array<{ typing: Typing; game: GameSummary }> {
  return games.flatMap((g) => {
    const t = typingFor(g)
    return t ? [{ typing: t, game: g }] : []
  })
}

/**
 * Beside the wide feed with no Game open: where a Game will show. It keeps
 * the feed in the column it stays in when one opens.
 */
function PanePlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 hidden h-dvh items-center justify-center border-l border-border px-6 lg:flex"
    >
      <p className="max-w-60 text-center text-sm text-muted">
        Pick a game from the strip or the feed to follow it here.
      </p>
    </div>
  )
}
