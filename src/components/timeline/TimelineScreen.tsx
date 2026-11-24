/**
 * The Timeline (CONTEXT.md): a chat feed of the Sports Day's plays for the
 * Viewer's Scope, live. This file wires its parts together: the Scope and
 * what it covers (useTimelineScope), the pinned top (TimelineTop), the feed
 * (TimelineFeed), the selected Game (GamePane) and the sheets it opens
 * (TimelineSheets).
 *
 * On phones a selected Game takes the feed's place, filtered to it, and a
 * Prediction or Matchup opens as a bottom sheet; what the Timeline shows
 * is picked from the home board over the feed (LiveBoard: the tab's Games,
 * Predictions or Matchups, narrowed or not) rather than at the top's
 * cards (useCompactTimeline). From `lg`
 * (useWideTimeline) each opens in a pane beside the Scope's feed, which
 * stays exactly as it was: one at a time, kept in the address (`game`, or
 * `detail` for a Prediction or Matchup) so reload and Back behave alike.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { entryTime } from './FeedRows'
import { FeedFooter, TimelineFeed } from './TimelineFeed'
import { GamePane } from './GamePane'
import { DetailPane, DetailPaneMissing } from './DetailPane'
import { TimelineSheets } from './TimelineSheets'
import { TimelineTop } from './TimelineTop'
import { currentPageKey, pageKey, pageSearch, scopePages } from './scopePages'
import { useCompactTimeline } from './useCompactTimeline'
import { useGoToScope, useLastLeague } from './scopeNav'
import { ScopePrompt } from './ScopePrompt'
import { followsGame, inScope } from './timelineScope'
import { usePastDay } from './usePastDay'
import { useTimelineScope } from './useTimelineScope'
import { useWideTimeline } from './useWideTimeline'
import {
  FeedFilter,
  LiveBoard,
  LiveTicker,
  NarrowedBar,
  YourNight,
  useBoardLayout,
} from './LiveBoard'
import type { ScopePage } from './scopePages'
import type { Typing } from '@/lib/timeline/chat'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { Scope } from '@/lib/model/scope'
import type { LeagueMatchup } from '@/lib/fantasy/matchup'
import type { TimelineScopeState } from './useTimelineScope'
import type { PaneDetail } from '@/lib/timeline/gameLink'
import { detailParam, parseDetail } from '@/lib/timeline/gameLink'
import { PredictionDetail } from '@/components/predictions/PredictionSheet'
import { FirstRunFollows } from '@/components/follows/FirstRunFollows'
import { neighborScope, scopeStops } from '@/lib/model/scope'
import { useSwipe } from '@/components/layout/useSwipe'
import { MatchupDetail } from '@/components/fantasy/FantasyParts'
import { StakesProvider } from '@/components/chat/StakeTags'
import {
  affectsViewer,
  boardOrder,
  gameStakes,
  stakeIndex,
} from '@/lib/timeline/stakes'
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
  detail,
}: {
  day?: string
  gameId?: string
  scope?: Scope
  playId?: string
  predictionId?: string
  matchupId?: string
  /** A Prediction or Matchup open beside the wide Timeline (parseDetail). */
  detail?: string
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
        detail={detail}
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
  detail,
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
  detail?: string
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
  const [portfolioOpen, setPortfolioOpen] = useState(false)
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
  // What the Viewer has riding on the plays: their Starters (and their
  // opponents'), and their open Predictions' Players and Games.
  const stakes = useMemo(
    () => stakeIndex(s.fantasyLeagues, s.openPredictions),
    [s.fantasyLeagues, s.openPredictions],
  )
  // "Affects me": only the plays that move one of those stakes.
  const [mine, setMine] = useState(false)
  const hasStakes = stakes.starters.size > 0 || stakes.legs.size > 0
  // While a day loads, keep the previous one on screen, dimmed.
  const dimmed = timeline.loading && timeline.previousItems.length > 0
  // Beside the wide feed a Game opens in its own pane; on phones it takes
  // the feed's place, and the Scope's feed isn't rendered at all.
  const wide = useWideTimeline()
  // Below `md` the Scope bar over the tab bar stands in for the cards.
  const compact = useCompactTimeline()
  const showScope = !gameId || wide
  // A Prediction or Matchup open in the pane (a Game takes precedence,
  // though opening either clears the other).
  const paneDetail = gameId ? null : parseDetail(detail)
  const showDetail = useCallback(
    (next: PaneDetail | null) =>
      void navigate({
        to: '/',
        search: (prev) => ({
          ...prev,
          detail: next ? detailParam(next) : undefined,
          game: undefined,
        }),
        viewTransition: true,
        resetScroll: false,
      }),
    [navigate],
  )
  // Beside the wide feed they open in the pane; on phones, as sheets.
  const openPrediction = (id: string) =>
    wide ? showDetail({ kind: 'prediction', id }) : setPredictionOpen(id)
  const openMatchup = (id: string, other?: LeagueMatchup) =>
    wide
      ? showDetail({
          kind: 'matchup',
          leagueId: id,
          teamId: other?.left.teamId,
        })
      : setMatchupOpen({ id, other })
  // Tapping a card narrows the Timeline to it; beside the wide feed it
  // also opens in the pane (and tapping again clears both), so the space
  // shows what the feed is narrowed to.
  const selectWide = (kind: 'prediction' | 'matchup', id: string | null) =>
    void navigate({
      to: '/',
      search: (prev) => ({
        ...prev,
        scope: kind === 'prediction' ? 'predictions' : 'fantasy',
        prediction: kind === 'prediction' ? (id ?? undefined) : undefined,
        matchup: kind === 'matchup' ? (id ?? undefined) : undefined,
        detail:
          id === null
            ? undefined
            : detailParam(
                kind === 'prediction' ? { kind, id } : { kind, leagueId: id },
              ),
        game: undefined,
        play: undefined,
      }),
      viewTransition: true,
      resetScroll: false,
    })
  const selectPrediction = (id: string | null) =>
    wide ? selectWide('prediction', id) : s.selectPrediction(id)
  const selectMatchup = (id: string | null) =>
    wide ? selectWide('matchup', id) : s.selectMatchup(id)
  // One left in the address on a phone (a link, or a window narrowed):
  // it shows as its sheet there.
  const sheetDetail = wide ? null : paneDetail
  // The league whose Matchup's sheet is open, whichever way it opened.
  const sheetLeague =
    matchupOpen?.id ??
    (sheetDetail?.kind === 'matchup' ? sheetDetail.leagueId : null)
  // Only today's Timeline moves the Read Marker; browsing history must not,
  // nor a phone reading one Game.
  useReadMarkerWriter(timeline.items, viewer !== null && isToday && showScope)
  const backfill = usePastDay(sportsDay, isToday, timeline.reload)
  // Today's Timeline socket already carries the Game's events.
  const game = useLiveGame(gameId, { shared: isToday })
  // Whose box score is open: it stays shut for any other Game, so moving
  // to another Game closes it, and one opened for a Game still on its way
  // (picked from a list) shows once it's there.
  const [boxFor, setBoxFor] = useState<string | null>(null)
  const boxOpen = boxFor !== null && boxFor === gameId
  // Moving to another Game puts it away, so coming back doesn't reopen it.
  useEffect(
    () => setBoxFor((open) => (open === gameId ? open : null)),
    [gameId],
  )
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
  // Two feeds: the Scope's, and the selected Game's. On phones selecting a
  // Game only swaps one for the other (newest first, same bubbles); from
  // `lg` they sit side by side (useWideTimeline).
  const scopeItems = useMemo(() => {
    const source = dimmed ? timeline.previousItems : timeline.items
    const shown = highlights ? onlyHighlights(source) : source
    return mine && hasStakes
      ? shown.filter((i) => affectsViewer(i, stakes))
      : shown
  }, [
    timeline.items,
    timeline.previousItems,
    dimmed,
    highlights,
    mine,
    hasStakes,
    stakes,
  ])
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

  // The phone's Scope bar: the same Games the cards would show, the open
  // Predictions or the Matchups, the selection in the address deciding
  // which page is current.
  const pagerGames = useMemo(
    () =>
      (dimmed && timeline.previousGames.length
        ? timeline.previousGames
        : timeline.games
      ).filter((g) =>
        inScope(
          g,
          scope,
          s.viewerFollows,
          timeline.items,
          s.leagues,
          s.predictionGames,
        ),
      ),
    [
      dimmed,
      timeline.previousGames,
      timeline.games,
      timeline.items,
      scope,
      s.viewerFollows,
      s.leagues,
      s.predictionGames,
    ],
  )
  const pages = scopePages({
    scope,
    gameId,
    selectedGame,
    games: pagerGames,
    predictions: s.openPredictions,
    leagues: s.fantasyLeagues,
  })
  const currentPage = currentPageKey({
    gameId,
    predictionId: s.selectedPrediction?.id ?? null,
    matchupId: s.selectedMatchup?.id ?? null,
  })
  const display = s.kalshi.data?.changeDisplay
  // Picking a card from the whole Scope is one step in history (Back
  // returns to the whole Scope); picking another from there replaces it,
  // so Back doesn't retrace every card tapped, and going back to the
  // whole Scope from the bar is Back. `pagedTo` is where the bar last took
  // the address: anywhere else since (a link, a sheet), and it starts over.
  const pagedTo = useRef<string | null>(null)
  const pickPage = (
    page: ScopePage,
    {
      transition = true,
    }: {
      /**
       * Glide the feed to its new self (a View Transition). Not under a
       * sheet opening with it: the transition freezes the screen as a
       * picture, stalling the sheet's slide halfway, then jumps.
       */
      transition?: boolean
    } = {},
  ) => {
    const here = router.state.location.href
    if (page.kind === 'all' && pagedTo.current === here) {
      pagedTo.current = null
      router.history.back()
      return
    }
    const into = currentPage === 'all' && page.kind !== 'all'
    void navigate({
      to: '/',
      search: (prev) => ({
        ...prev,
        ...pageSearch(page, gameId),
        detail: undefined,
        play: undefined,
      }),
      replace: !into,
      viewTransition: transition,
      resetScroll: false,
    }).then(() => {
      pagedTo.current = page.kind === 'all' ? null : router.state.location.href
    })
  }
  // One picked from a list (the portfolio): what you're after is its
  // detail, so it opens in full at once, and the Timeline narrows to it
  // out of sight beneath (no transition of its own: the sheet's slide up
  // is the one movement).
  const jumpAndOpen = (page: ScopePage) => {
    openPage(page)
    if (pageKey(page) !== currentPage) pickPage(page, { transition: false })
  }
  // A phone picks what the Timeline shows from the home board (LiveBoard)
  // over the feed, narrowed or not: the one place, at the top.
  const home = compact === true && !s.setup
  // "Affects me" is the whole Scope's: narrowed, every play.
  const filterable = home && currentPage === 'all'
  useEffect(() => {
    if (!filterable) setMine(false)
  }, [filterable])
  const [boardLayout, setBoardLayout] = useBoardLayout()
  const staked = useCallback(
    (g: GameSummary) =>
      gameStakes(g, stakes, (x) => followsGame(x, s.viewerFollows)),
    [stakes, s.viewerFollows],
  )
  const boardGames = useMemo(
    () => boardOrder(pagerGames, (g) => staked(g).length > 0),
    [pagerGames, staked],
  )
  // What the board offers: the tab's Games, Predictions or Matchups, the
  // same whether or not one is picked (a Game opened from the feed under
  // Predictions doesn't turn the board into Games).
  const boardPages = scopePages({
    scope,
    gameId: null,
    selectedGame: null,
    games: boardGames,
    predictions: s.openPredictions,
    leagues: s.fantasyLeagues,
  }).filter((p) => p.kind !== 'all')
  const narrowedTo = pages.find(
    (p) => p.kind !== 'all' && pageKey(p) === currentPage,
  )
  const followingGames = useMemo(
    () =>
      s.viewerFollows.length > 0
        ? timeline.games.filter((g) => followsGame(g, s.viewerFollows))
        : null,
    [s.viewerFollows, timeline.games],
  )
  // A tile tapped narrows to it; tapped again, it opens in full.
  const pickTile = (page: ScopePage) =>
    pageKey(page) === currentPage ? openPage(page) : pickPage(page)
  const pickGame = (g: GameSummary) =>
    pickTile({ kind: 'game', id: g.id, game: g })
  // Once the board scrolls up under the top, its scores pin there.
  const [boardAway, setBoardAway] = useState(false)
  const [board, setBoard] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!board || !home) {
      setBoardAway(false)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) =>
        setBoardAway(
          !entry.isIntersecting && entry.boundingClientRect.top < topHeight,
        ),
      { rootMargin: `-${topHeight}px 0px 0px 0px` },
    )
    observer.observe(board)
    return () => observer.disconnect()
  }, [board, home, topHeight])
  const openPage = (page: ScopePage) => {
    if (page.kind === 'all') {
      if (pages.some((p) => p.kind === 'prediction')) setPortfolioOpen(true)
    } else if (page.kind === 'game') setBoxFor(page.id)
    else if (page.kind === 'prediction') openPrediction(page.id)
    else openMatchup(page.id)
  }
  // The phone's board, over the Scope's feed or a narrowed Game's thread.
  const homeTop = home && (
    <div className="flex flex-col">
      <YourNight
        leagues={s.fantasyLeagues}
        predictions={s.openPredictions}
        display={display}
        following={followingGames}
        scope={scope}
        onScope={goToScope}
      />
      <LiveBoard
        pages={boardPages}
        current={currentPage}
        stakesOf={staked}
        layout={boardLayout}
        onLayout={setBoardLayout}
        onPick={pickTile}
        onPortfolio={() => setPortfolioOpen(true)}
        display={display}
        boardRef={setBoard}
      />
      {narrowedTo && narrowedTo.kind !== 'all' ? (
        <NarrowedBar
          page={narrowedTo}
          onOpen={() => openPage(narrowedTo)}
          onClear={() => pickPage({ kind: 'all' })}
        />
      ) : (
        hasStakes && <FeedFilter mine={mine} onMine={setMine} />
      )}
    </div>
  )

  // Escape closes the pane beside the wide feed (a Game, a Prediction or a
  // Matchup), unless a sheet is open (Escape is the sheet's then).
  const paneOpen = Boolean(gameId || paneDetail)
  useEffect(() => {
    if (!paneOpen || !wide) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"]')) return
      showDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paneOpen, wide, showDetail])

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
        compact={compact}
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
        onBox={() => setBoxFor(gameId)}
        onPrediction={openPrediction}
        onMatchup={openMatchup}
        onSelectPrediction={selectPrediction}
        onSelectMatchup={selectMatchup}
        ticker={
          home && boardAway ? (
            <LiveTicker
              games={boardGames}
              current={currentPage}
              onPick={pickGame}
            />
          ) : undefined
        }
      />

      {/* Tags each play with what it did for the Viewer's stakes. */}
      <StakesProvider index={stakes}>
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
                {homeTop}
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
            lead={homeTop}
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
        ) : paneDetail && wide ? (
          <TimelineDetailPane
            // A new subject is a new pane: its scroll starts at the top.
            key={detail}
            detail={paneDetail}
            scope={s}
            games={timeline.games}
          />
        ) : (
          wide && <PanePlaceholder scope={s.setup ? null : scope} />
        )}
      </StakesProvider>

      <TimelineSheets
        playId={playId}
        onPlayClose={closePlay}
        {...(matchupOpen
          ? {
              matchup: findLeague(s, matchupOpen.id),
              otherMatchup: matchupOpen.other,
              onMatchupClose: () => setMatchupOpen(null),
            }
          : sheetDetail?.kind === 'matchup'
            ? {
                matchup: findLeague(s, sheetDetail.leagueId),
                otherMatchup: findOther(s, sheetDetail),
                onMatchupClose: () => showDetail(null),
              }
            : { matchup: null, onMatchupClose: noop })}
        // No cards on a phone (nor their League Matchups): the sheet lists
        // the league's Matchups itself.
        onMatchupOther={
          compact && sheetLeague
            ? (other) => {
                // One left in the address gives way to the one picked here.
                if (!matchupOpen) showDetail(null)
                setMatchupOpen({ id: sheetLeague, other })
              }
            : undefined
        }
        games={timeline.games}
        portfolio={portfolioOpen ? s.openPredictions : null}
        display={display}
        onPortfolioClose={() => setPortfolioOpen(false)}
        onPortfolioOpen={(id) => {
          setPortfolioOpen(false)
          const page = pages.find((p) => pageKey(p) === `prediction:${id}`)
          if (page) jumpAndOpen(page)
          else openPrediction(id)
        }}
        {...(predictionOpen
          ? {
              prediction: findPrediction(s, predictionOpen),
              onPredictionClose: () => setPredictionOpen(null),
            }
          : sheetDetail?.kind === 'prediction'
            ? {
                prediction: findPrediction(s, sheetDetail.id),
                onPredictionClose: () => showDetail(null),
                // Its links replace `detail` themselves.
                onPredictionNavigate: noop,
              }
            : { prediction: null, onPredictionClose: noop })}
        recap={recapOpen ? recap : null}
        onRecapClose={() => setRecapOpen(false)}
        live={liveOpen && scopeTyping.length > 1 ? scopeTyping : null}
        onLiveClose={() => setLiveOpen(false)}
        boxGame={boxOpen && !wide ? selectedGame : null}
        box={game.data?.box ?? null}
        onBoxClose={() => setBoxFor(null)}
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

function noop() {}

function findPrediction(s: TimelineScopeState, id: string) {
  return s.predictionList.data?.find((p) => p.id === id) ?? null
}

function findLeague(s: TimelineScopeState, id: string) {
  return s.fantasyLeagues.find((l) => l.id === id) ?? null
}

/** Another Matchup in the league, by its first team (or the Viewer's: none). */
function findOther(
  s: TimelineScopeState,
  d: Extract<PaneDetail, { kind: 'matchup' }>,
): LeagueMatchup | undefined {
  if (d.teamId === undefined) return undefined
  return findLeague(s, d.leagueId)?.matchup?.others?.find(
    (o) => o.left.teamId === d.teamId,
  )
}

/**
 * A Prediction or Matchup beside the wide feed: its sheet's content in
 * the pane. Its Game links swap the pane to that Game (they set `game`
 * and drop `detail`); a Play or Player still opens as its sheet.
 */
function TimelineDetailPane({
  detail,
  scope: s,
  games,
}: {
  detail: PaneDetail
  scope: TimelineScopeState
  games: Array<GameSummary>
}) {
  if (detail.kind === 'prediction') {
    const prediction = findPrediction(s, detail.id)
    if (!prediction)
      return (
        <DetailPaneMissing kind="prediction" loading={s.predictionsLoading} />
      )
    return (
      <PredictionDetail
        prediction={prediction}
        onNavigate={noop}
        frame={(parts) => <DetailPane kind="prediction" {...parts} />}
      />
    )
  }
  const league = findLeague(s, detail.leagueId)
  const other = findOther(s, detail)
  if (!league || (detail.teamId !== undefined && !other))
    return <DetailPaneMissing kind="matchup" loading={s.fantasyLoading} />
  return (
    <MatchupDetail
      league={league}
      other={other}
      games={games}
      frame={(parts) => <DetailPane kind="matchup" {...parts} />}
    />
  )
}

/**
 * Beside the wide feed with nothing open: where a Game (or a Prediction,
 * or a Matchup) will show. It keeps the feed in the column it stays in
 * when one opens.
 */
function PanePlaceholder({ scope }: { scope: Scope | null }) {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 hidden h-dvh items-center justify-center border-l border-border px-6 lg:flex"
    >
      {/* Nothing to pick while the Scope is still to be set up. */}
      {scope && (
        <p className="max-w-60 text-center text-sm text-muted">
          {scope === 'predictions'
            ? 'Pick a Prediction, or a game, to see it in full here.'
            : scope === 'fantasy'
              ? 'Pick a Matchup, or a game, to see it in full here.'
              : 'Pick a game from the strip or the feed to follow it here.'}
        </p>
      )}
    </div>
  )
}
