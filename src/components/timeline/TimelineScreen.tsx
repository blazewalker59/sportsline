/**
 * The Timeline (CONTEXT.md): a chat feed of the Sports Day's plays for the
 * Viewer's Scope, live. This file wires its parts together: the Scope and
 * what it covers (useTimelineScope), the pinned top (TimelineTop), the feed
 * (TimelineFeed) and the sheets it opens (TimelineSheets).
 */

import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNow } from './format'
import { entryTime } from './FeedRows'
import { FeedFooter, TimelineFeed } from './TimelineFeed'
import { TimelineSheets } from './TimelineSheets'
import { TimelineTop } from './TimelineTop'
import { followsGame } from './timelineScope'
import { usePastDay } from './usePastDay'
import { useTimelineScope } from './useTimelineScope'
import type { Scope } from '@/lib/model/scope'
import { FantasyTagsProvider } from '@/components/fantasy/FantasyParts'
import { ReactionsProvider } from '@/components/chat/Reactions'
import { takePlayOpened } from '@/lib/timeline/playSheet'
import { useHideOnScroll } from '@/lib/useHideOnScroll'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { catchUp } from '@/lib/timeline/catchup'
import { AppHeader } from '@/components/layout/AppHeader'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { buildChat, typingFor } from '@/lib/timeline/chat'
import { useLiveTimeline } from '@/lib/timeline/useLiveTimeline'
import { useReadMarkerWriter, useViewer } from '@/lib/viewer/useViewer'

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
  const [matchupOpen, setMatchupOpen] = useState<string | null>(null)
  const navigate = useNavigate()
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
  const recap = useMemo(
    () => (showMarker && readAt ? catchUp(items, readAt) : null),
    [showMarker, readAt, items],
  )
  const [recapOpen, setRecapOpen] = useState(false)

  return (
    // A chat feed, not a document: nothing selects, so long-pressing a
    // bubble to react never makes iOS highlight the page around it.
    <div className="mx-auto max-w-xl px-4 pb-16 select-none [-webkit-touch-callout:none]">
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
        onMatchup={setMatchupOpen}
      />
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
        <TimelineFeed
          entries={entries}
          typing={typing}
          gameId={gameId}
          now={now}
          dimmed={dimmed}
          loading={timeline.loading}
          recap={recap}
          readAt={readAt}
          dividerAt={dividerAt}
          newCount={newCount}
          onRecap={() => setRecapOpen(true)}
          onLive={() => setLiveOpen(true)}
          sharpPicks={scope === 'predictions' && !gameId}
        />
      </FantasyTagsProvider>

      <FeedFooter
        error={Boolean(timeline.error)}
        onRetry={() => void timeline.reload()}
        empty={items.length === 0 && typing.length === 0}
        emptyText={
          gameId
            ? game.isPending
              ? 'Loading…'
              : 'No plays in this game yet.'
            : backfill === 'loading' || timeline.loading
              ? 'Loading this day’s games…'
              : isToday
                ? 'No plays yet today.'
                : 'No plays on this day.'
        }
        hasMore={!gameId && timeline.hasMore}
        loadingMore={timeline.loadingMore}
        onMore={() => void timeline.loadMore()}
      />

      <TimelineSheets
        playId={playId}
        onPlayClose={closePlay}
        matchup={
          matchupOpen
            ? (s.fantasyLeagues.find((l) => l.id === matchupOpen) ?? null)
            : null
        }
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
        now={now}
        onRecapClose={() => setRecapOpen(false)}
        live={liveOpen && typing.length > 1 ? typing : null}
        onLiveClose={() => setLiveOpen(false)}
        boxGame={boxOpen ? selectedGame : null}
        box={game.data?.box ?? null}
        onBoxClose={() => setBoxOpen(false)}
      />
    </div>
  )
}
