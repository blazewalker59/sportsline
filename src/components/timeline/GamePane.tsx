/**
 * The selected Game on the Timeline. On phones it is the Timeline itself,
 * filtered to the Game: the same feed, newest first, with the home team
 * answering from the right. Beside the wide Timeline (from `lg`) it is a
 * pane of its own that scrolls on its own: the scoreboard and a way to
 * close it, the box score inline, then the Game's thread.
 */

import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import { FeedFooter, TimelineFeed } from './TimelineFeed'
import { gameStatusLabel } from './GameStrip'
import type { FeedEntry, Typing } from '@/lib/timeline/chat'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { BoxBody } from '@/components/games/GameView'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { InlineError } from '@/components/layout/RouteStates'
import { DetailHeaderSkeleton } from '@/components/layout/Skeleton'
import { pairSubject, subjectStyle, teamSubject } from '@/lib/brand/subject'
import { FeedNames } from '@/lib/timeline/gameLink'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { cn } from '@/lib/utils'

export function GamePane({
  lead,
  gameId,
  game,
  box,
  entries,
  typing,
  wide,
  topHeight,
  dimmed,
  loading,
  detailError,
  onDetailRetry,
  feedError,
  onFeedRetry,
}: {
  /** On phones, over the thread: the home board (LiveBoard). */
  lead?: React.ReactNode
  gameId: string
  /** The Game's summary, once known (from its detail or the day's Games). */
  game: GameSummary | null
  box: GameBox | null
  entries: ReadonlyArray<FeedEntry>
  typing: Array<{ typing: Typing; game: GameSummary }>
  /** The two-pane Timeline is showing (useWideTimeline). */
  wide: boolean
  /** The pinned top's height: on phones the thread starts under it. */
  topHeight: number
  dimmed: boolean
  /** The Game's plays are still loading. */
  loading: boolean
  /** The Game's detail failed to load (shown in the wide pane). */
  detailError: unknown
  onDetailRetry: () => Promise<unknown>
  /** The day's feed failed to load (as on the single feed). */
  feedError: boolean
  onFeedRetry: () => void
}) {
  return (
    <section
      aria-label={
        game
          ? `${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}`
          : 'Game'
      }
      data-game-pane={gameId}
      // Not a Scope swipe beside the wide feed; one View Transition layer
      // there, so opening, swapping and closing it fade as one piece while
      // the feed beside it holds still.
      data-no-swipe={wide || undefined}
      style={wide ? { viewTransitionName: 'game-pane' } : undefined}
      className={cn(
        'pb-16',
        'lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-border lg:pb-8 lg:pl-4',
      )}
    >
      {/* Phones: the thread starts under the pinned top, like the feed. */}
      <div
        aria-hidden="true"
        className="mb-3 lg:hidden"
        style={{ height: topHeight }}
      />
      {lead && <div className="lg:hidden">{lead}</div>}
      {wide && (
        <div className="hidden lg:block">
          <PaneHeader game={game} />
          <div className="mt-3 mb-4">
            {game ? (
              <PaneBox game={game} box={box} />
            ) : detailError ? (
              <InlineError
                what="this game"
                error={detailError}
                onRetry={onDetailRetry}
              />
            ) : (
              <DetailHeaderSkeleton label="Loading game" />
            )}
          </div>
        </div>
      )}
      {/*
        Beside the feed, the same Play can be on screen twice: only the
        feed names its messages (the pane is one layer of its own).
      */}
      <FeedNames.Provider value={!wide}>
        <TimelineFeed
          entries={entries}
          typing={typing}
          gameId={gameId}
          dimmed={!wide && dimmed}
          loading={loading}
          recap={null}
          readAt={null}
          dividerAt={-1}
          newCount={0}
          onRecap={noop}
          onLive={noop}
        />
      </FeedNames.Provider>
      <FeedFooter
        error={feedError}
        onRetry={onFeedRetry}
        empty={entries.length === 0 && typing.length === 0}
        loading={loading}
        emptyText="No plays in this game yet."
        hasMore={false}
        loadingMore={false}
        onMore={noop}
      />
    </section>
  )
}

function noop() {}

/** The pane's top, pinned while its thread scrolls: the score and Close. */
function PaneHeader({ game }: { game: GameSummary | null }) {
  const timeZone = useTimeZone()
  const live = game?.status === 'live' || game?.status === 'delayed'
  const started = live || game?.status === 'final'
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
      <div className="flex min-h-9 items-center gap-2">
        {game && <LeagueLogo league={game.league} size={16} />}
        {game && (
          <span
            className={cn(
              'text-2xs font-semibold',
              live ? 'text-live' : 'text-muted',
            )}
          >
            {gameStatusLabel(game, timeZone)}
          </span>
        )}
        <Link
          to="/"
          search={(prev) => ({ ...prev, game: undefined })}
          viewTransition
          resetScroll={false}
          aria-label="Close game"
          title="Close (Esc)"
          className="ml-auto flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </div>
      {game && (
        <div className="mt-1 flex items-center gap-3 tabular-nums">
          {(['away', 'home'] as const).map((side, i) => {
            const team = side === 'away' ? game.awayTeam : game.homeTeam
            const trailing =
              game.score[side] < game.score[side === 'away' ? 'home' : 'away']
            return (
              <Fragment key={side}>
                {i === 1 && started && (
                  <span aria-hidden="true" className="text-muted">
                    –
                  </span>
                )}
                <div
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2',
                    i === 1 && 'flex-row-reverse',
                  )}
                >
                  <TeamLogo team={team} size={28} />
                  <span
                    className={cn(
                      'flex min-w-0 flex-col',
                      i === 1 && 'items-end text-right',
                    )}
                  >
                    <span className="text-sm font-semibold">
                      {team.rank && (
                        <span className="mr-0.5 text-3xs font-bold text-muted">
                          {team.rank}
                        </span>
                      )}
                      {team.abbreviation}
                    </span>
                    <span className="truncate text-3xs text-muted">
                      {team.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'text-2xl',
                      trailing
                        ? 'font-semibold text-foreground/60'
                        : 'font-bold',
                      i === 1 ? 'mr-auto' : 'ml-auto',
                    )}
                  >
                    {started ? game.score[side] : ''}
                  </span>
                </div>
              </Fragment>
            )
          })}
        </div>
      )}
    </header>
  )
}

/**
 * The box score inline, folded by default so the live thread stays near
 * the top; it wears both teams' colors as its sheet does on phones.
 */
function PaneBox({ game, box }: { game: GameSummary; box: GameBox | null }) {
  return (
    <details className="group rounded-card border border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        Box score
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-muted transition-transform group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div
        className="subject flex flex-col gap-4 border-t border-border bg-background px-3 pt-3 pb-4"
        style={subjectStyle(
          pairSubject(
            teamSubject(game.awayTeam.colors),
            teamSubject(game.homeTeam.colors),
          ),
        )}
      >
        <BoxBody game={game} box={box} />
      </div>
    </details>
  )
}
