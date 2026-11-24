/**
 * The phone's home board, over the Scope's feed (only below `md`, with
 * nothing narrowed): what the Viewer has riding on the night ("Your
 * night": their Matchups, their Predictions, the Teams they follow), then
 * the Scope's Games. The Games show as a grid of live tiles (the rest as
 * a row of chips under them) or, collapsed, one row of tiles that scrolls
 * sideways: the Viewer's choice, kept on the device (useBoardLayout).
 * Once the board scrolls away, the Timeline's top pins a ticker of the
 * same scores (LiveTicker). A tile or card narrows the Timeline to it, as
 * the Scope bar's cards do; the Scope bar returns once narrowed, to go
 * back or open it in full.
 */

import { useCallback } from 'react'
import { gameStatusLabel } from './GameStrip'
import type { GameSummary } from '@/lib/model/timeline'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { GameStake } from '@/lib/timeline/stakes'
import { isLiveGame } from '@/lib/timeline/stakes'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { portfolioTotals } from '@/components/predictions/PredictionPortfolio'
import {
  money,
  pct,
  profitOf,
  profitText,
  toneOf,
} from '@/components/predictions/PredictionParts'
import { pts, sideRecord } from '@/components/fantasy/format'
import { SPORTS } from '@/lib/fantasy/sports'
import { notifyDeviceValue, useDeviceValue } from '@/lib/useDeviceValue'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { cn } from '@/lib/utils'

export type BoardLayout = 'grid' | 'row'

const LAYOUT_KEY = 'sportsline:board-layout'

/** The board's layout on this device: the grid unless collapsed to a row. */
export function useBoardLayout(): [BoardLayout, (next: BoardLayout) => void] {
  const layout = useDeviceValue<BoardLayout>(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === 'row' ? 'row' : 'grid'
    } catch {
      return 'grid'
    }
  }, 'grid')
  const set = useCallback((next: BoardLayout) => {
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Private mode: it lasts this visit only.
    }
    notifyDeviceValue()
  }, [])
  return [layout, set]
}

/** Without a live Game, the grid shows this many of what's next. */
const GRID_UPCOMING = 4

const STAKE_LABEL: Record<GameStake, string> = {
  following: 'Following',
  prediction: 'Prediction',
  fantasy: 'Fantasy',
}
const STAKE_TONE: Record<GameStake, string> = {
  following: 'bg-accent/15 text-accent',
  prediction: 'bg-positive/15 text-positive',
  fantasy: 'bg-scoring/15 text-scoring',
}

export function LiveBoard({
  games,
  stakesOf,
  layout,
  onLayout,
  onPick,
  boardRef,
}: {
  /** The Scope's Games, in the board's order (boardOrder). */
  games: ReadonlyArray<GameSummary>
  stakesOf: (g: GameSummary) => Array<GameStake>
  layout: BoardLayout
  onLayout: (next: BoardLayout) => void
  /** A Game tapped: narrow the Timeline to it. */
  onPick: (g: GameSummary) => void
  /** The board, watched for when it scrolls away (the ticker's cue). */
  boardRef?: React.Ref<HTMLElement>
}) {
  if (games.length === 0) return null
  const live = games.filter(isLiveGame)
  // The grid's tiles: what's live, or with nothing live, what's next.
  const tiles =
    layout === 'row'
      ? games
      : live.length > 0
        ? live
        : games.filter((g) => g.status !== 'final').slice(0, GRID_UPCOMING)
  const chips = layout === 'row' ? [] : games.filter((g) => !tiles.includes(g))
  return (
    <section
      ref={boardRef}
      aria-label="Games"
      data-no-swipe={layout === 'row' ? '' : undefined}
      className="mb-4 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-3xs font-bold tracking-wide text-muted uppercase">
          {live.length > 0 && (
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-live"
            />
          )}
          {live.length > 0
            ? `Live now · ${live.length}`
            : `Games · ${games.length}`}
        </h2>
        <span className="flex-1" />
        <LayoutToggle layout={layout} onLayout={onLayout} />
      </div>
      {layout === 'grid' ? (
        tiles.length > 0 && (
          <ul className="grid grid-cols-2 gap-2">
            {tiles.map((g) => (
              <li key={g.id} className="flex">
                <GameTile game={g} stakes={stakesOf(g)} onPick={onPick} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="-mx-4 flex snap-x snap-proximity scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]">
          {tiles.map((g) => (
            <li key={g.id} className="flex w-36 shrink-0 snap-start">
              <GameTile game={g} stakes={stakesOf(g)} onPick={onPick} dots />
            </li>
          ))}
        </ul>
      )}
      {chips.length > 0 && (
        <ul
          data-no-swipe=""
          className="-mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]"
        >
          {chips.map((g) => (
            <li key={g.id} className="shrink-0">
              <GameChip game={g} onPick={onPick} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Grid or Row: how the board lays its Games out. */
function LayoutToggle({
  layout,
  onLayout,
}: {
  layout: BoardLayout
  onLayout: (next: BoardLayout) => void
}) {
  return (
    <span
      role="group"
      aria-label="Games layout"
      className="flex rounded-full bg-notice p-0.5"
    >
      {(['grid', 'row'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={layout === value}
          aria-label={value === 'grid' ? 'Grid' : 'One row'}
          onClick={() => onLayout(value)}
          className={cn(
            'flex h-7 w-8 items-center justify-center rounded-full text-muted transition-colors',
            layout === value && 'bg-surface text-foreground shadow-sm',
          )}
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            {value === 'grid' ? (
              <path
                d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"
                fill="currentColor"
              />
            ) : (
              <path
                d="M1 5h4v6H1zM6 5h4v6H6zM11 5h4v6h-4z"
                fill="currentColor"
              />
            )}
          </svg>
        </button>
      ))}
    </span>
  )
}

const leaderOf = (g: GameSummary) =>
  g.score.away === g.score.home
    ? null
    : g.score.away > g.score.home
      ? 'away'
      : 'home'

/** A Game: its state, both teams and scores, and what the Viewer has on it. */
function GameTile({
  game: g,
  stakes,
  onPick,
  dots = false,
}: {
  game: GameSummary
  stakes: Array<GameStake>
  onPick: (g: GameSummary) => void
  /** Stakes as dots (a narrow tile), not labels. */
  dots?: boolean
}) {
  const timeZone = useTimeZone()
  const live = isLiveGame(g)
  const started = live || g.status === 'final'
  const leader = leaderOf(g)
  const name = `${g.awayTeam.abbreviation} ${g.score.away}, ${g.homeTeam.abbreviation} ${g.score.home}, ${gameStatusLabel(g, timeZone)}`
  return (
    <button
      type="button"
      onClick={() => onPick(g)}
      aria-label={`${name}. Show this game`}
      className="flex w-full flex-col gap-1.5 rounded-card border border-border bg-surface p-2.5 text-left tabular-nums transition-transform active:scale-[0.98]"
    >
      <span
        className={cn(
          'flex items-center gap-1 text-3xs font-semibold text-muted',
          live && 'text-live',
        )}
      >
        <LeagueLogo league={g.league} size={12} />
        <span className="min-w-0 flex-1 truncate">
          {gameStatusLabel(g, timeZone)}
        </span>
        {dots &&
          stakes.map((s) => (
            <span
              key={s}
              title={STAKE_LABEL[s]}
              className={cn('size-1.5 rounded-full', STAKE_TONE[s])}
              style={{ backgroundColor: 'currentColor' }}
            />
          ))}
      </span>
      {(['away', 'home'] as const).map((side) => {
        const team = side === 'away' ? g.awayTeam : g.homeTeam
        return (
          <span
            key={side}
            className={cn(
              'flex items-center gap-1.5 text-sm leading-tight font-semibold',
              started && leader !== side && 'text-muted',
            )}
          >
            <TeamLogo team={team} size={20} />
            <span className="min-w-0 flex-1 truncate">
              {team.rank && (
                <span className="mr-0.5 text-3xs font-bold text-muted">
                  {team.rank}
                </span>
              )}
              {team.abbreviation}
            </span>
            {started && (
              <span
                className={cn(
                  'text-lg leading-none font-bold',
                  leader === side && 'text-foreground',
                )}
              >
                {g.score[side]}
              </span>
            )}
          </span>
        )
      })}
      {!dots && stakes.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {stakes.map((s) => (
            <span
              key={s}
              className={cn(
                'rounded-full px-1.5 py-px text-3xs font-bold',
                STAKE_TONE[s],
              )}
            >
              {STAKE_LABEL[s]}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

/** A Game not on now, small: "LAL @ DEN 9:30 PM", or its final score. */
function GameChip({
  game: g,
  onPick,
}: {
  game: GameSummary
  onPick: (g: GameSummary) => void
}) {
  const timeZone = useTimeZone()
  const final = g.status === 'final'
  return (
    <button
      type="button"
      onClick={() => onPick(g)}
      className="flex items-center gap-1.5 rounded-control bg-notice px-2.5 py-1.5 text-2xs font-semibold whitespace-nowrap text-muted tabular-nums"
    >
      <TeamLogo team={g.awayTeam} size={14} />
      <span className="text-foreground">
        {final
          ? `${g.awayTeam.abbreviation} ${g.score.away} · ${g.homeTeam.abbreviation} ${g.score.home}`
          : `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`}
      </span>
      <TeamLogo team={g.homeTeam} size={14} />
      {gameStatusLabel(g, timeZone)}
    </button>
  )
}

/** "Your night": the Viewer's Matchups, Predictions and Follows, live. */
export function YourNight({
  leagues,
  predictions,
  display = 'dollars',
  following,
  current,
  onMatchup,
  onPortfolio,
  onPrediction,
  onFollowing,
}: {
  /** Fantasy leagues with a Matchup this period. */
  leagues: ReadonlyArray<FantasyLeagueView>
  /** Open Predictions. */
  predictions: ReadonlyArray<PredictionView>
  display?: ChangeDisplay
  /** The followed Teams' Games today; null without Follows. */
  following: ReadonlyArray<GameSummary> | null
  /** Which card is the Scope now, if any. */
  current: 'predictions' | 'following' | null
  /** A Matchup tapped: narrow the Timeline to its Starters. */
  onMatchup: (league: FantasyLeagueView) => void
  /** The Predictions' card tapped: every open one (the portfolio). */
  onPortfolio: () => void
  /** One Prediction tapped: narrow the Timeline to it. */
  onPrediction: (prediction: PredictionView) => void
  onFollowing: () => void
}) {
  const showFollowing = following !== null && following.length > 0
  if (leagues.length === 0 && predictions.length === 0 && !showFollowing)
    return null
  return (
    <section aria-label="Your night" className="mb-4 flex flex-col gap-2">
      <h2 className="text-3xs font-bold tracking-wide text-muted uppercase">
        Your night
      </h2>
      <ul
        data-no-swipe=""
        className="-mx-4 flex snap-x snap-proximity scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]"
      >
        {leagues.map((l) => (
          <li key={l.id} className="flex shrink-0 snap-start">
            <MatchupStake league={l} onPick={() => onMatchup(l)} />
          </li>
        ))}
        {showFollowing && (
          <li className="flex shrink-0 snap-start">
            <FollowingStake
              games={following}
              current={current === 'following'}
              onPick={onFollowing}
            />
          </li>
        )}
        {predictions.length > 0 && (
          <li className="flex shrink-0 snap-start">
            <PredictionsStake
              predictions={predictions}
              display={display}
              current={current === 'predictions'}
              onPick={onPortfolio}
            />
          </li>
        )}
        {predictions.map((p) => (
          <li key={p.id} className="flex shrink-0 snap-start">
            <PredictionStake
              prediction={p}
              display={display}
              onPick={() => onPrediction(p)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function StakeCard({
  kicker,
  tone,
  current = false,
  label,
  onPick,
  children,
}: {
  kicker: React.ReactNode
  tone: string
  current?: boolean
  label: string
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex w-40 flex-col gap-1 rounded-card border p-2.5 text-left tabular-nums transition-colors',
        current
          ? 'border-transparent bg-accent/15'
          : 'border-border bg-surface',
      )}
    >
      <span
        className={cn(
          'flex min-w-0 items-center gap-1 truncate text-3xs font-bold tracking-wide uppercase',
          tone,
        )}
      >
        {kicker}
      </span>
      {children}
    </button>
  )
}

function MatchupStake({
  league,
  onPick,
}: {
  league: FantasyLeagueView
  onPick: () => void
}) {
  const m = league.matchup!
  const theirs = m.opponent
  const lead =
    theirs && m.mine.score !== theirs.score ? m.mine.score > theirs.score : null
  const figure = m.categories
    ? sideRecord(m, 'mine')
    : `${pts(m.mine.score)}–${theirs ? pts(theirs.score) : '—'}`
  return (
    <StakeCard
      kicker={
        <>
          <LeagueLogo league={SPORTS[m.sport].league} size={12} />
          <span className="truncate">{m.leagueName}</span>
        </>
      }
      tone="text-scoring"
      label={`${m.leagueName}: ${figure}${theirs ? ` against ${theirs.name}` : ''}. Show this matchup’s plays`}
      onPick={onPick}
    >
      <span className="text-xl leading-tight font-bold whitespace-nowrap">
        {figure}
      </span>
      <span className="truncate text-2xs font-semibold text-muted">
        {!theirs
          ? 'Bye week'
          : `${lead === null ? 'Tied with' : lead ? 'Leading' : 'Trailing'} ${theirs.abbrev}`}
      </span>
    </StakeCard>
  )
}

function PredictionsStake({
  predictions,
  display,
  current,
  onPick,
}: {
  predictions: ReadonlyArray<PredictionView>
  display: ChangeDisplay
  current: boolean
  onPick: () => void
}) {
  const totals = portfolioTotals(predictions)
  return (
    <StakeCard
      kicker={`Predictions · ${predictions.length} open`}
      tone="text-positive"
      current={current}
      label={`${predictions.length} open prediction${predictions.length === 1 ? '' : 's'}, worth ${money(totals.cashout)}. Open your portfolio`}
      onPick={onPick}
    >
      <span className="text-xl leading-tight font-bold">
        {totals.profit ? money(totals.cashout) : money(totals.staked)}
      </span>
      <span
        className={cn(
          'truncate text-2xs font-semibold',
          totals.profit ? toneOf(totals.profit.dollars) : 'text-muted',
        )}
      >
        {totals.profit
          ? profitText(totals.profit, display)
          : `Staked ${money(totals.staked)}`}
      </span>
    </StakeCard>
  )
}

/** One open Prediction: its chance now, and how it's moved for the Viewer. */
function PredictionStake({
  prediction: p,
  display,
  onPick,
}: {
  prediction: PredictionView
  display: ChangeDisplay
  onPick: () => void
}) {
  const profit = profitOf(p)
  const hit = p.legs.filter((l) => l.status === 'won').length
  return (
    <StakeCard
      kicker={
        p.kind === 'combo'
          ? `Combo · ${hit}/${p.legs.length} hit`
          : 'Prediction'
      }
      tone="text-positive"
      label={`${p.side === 'no' ? 'Not: ' : ''}${p.title}, ${p.chance === null ? 'unpriced' : pct(p.chance)}. Show its plays`}
      onPick={onPick}
    >
      <span className="truncate text-2xs leading-tight font-semibold">
        {p.side === 'no' ? 'Not: ' : ''}
        {p.title}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-xl leading-tight font-bold">
          {p.chance === null ? '—' : pct(p.chance)}
        </span>
        {profit && (
          <span
            className={cn('text-3xs font-semibold', toneOf(profit.dollars))}
          >
            {profitText(profit, display)}
          </span>
        )}
      </span>
    </StakeCard>
  )
}

function FollowingStake({
  games,
  current,
  onPick,
}: {
  games: ReadonlyArray<GameSummary>
  current: boolean
  onPick: () => void
}) {
  const timeZone = useTimeZone()
  const live = games.filter(isLiveGame)
  const shown = (live.length > 0 ? live : games).slice(0, 2)
  return (
    <StakeCard
      kicker="Following"
      tone="text-accent"
      current={current}
      label={`Following: ${games.length} games, ${live.length} live. Show their plays`}
      onPick={onPick}
    >
      {shown.map((g) => (
        <span
          key={g.id}
          className="flex items-center gap-1 text-2xs leading-tight font-semibold"
        >
          <TeamLogo team={g.awayTeam} size={14} />
          <span className="min-w-0 flex-1 truncate">
            {isLiveGame(g) || g.status === 'final'
              ? `${g.score.away}–${g.score.home}`
              : `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`}
          </span>
          <TeamLogo team={g.homeTeam} size={14} />
          <span
            className={cn(
              'text-3xs',
              isLiveGame(g) ? 'text-live' : 'text-muted',
            )}
          >
            {gameStatusLabel(g, timeZone)}
          </span>
        </span>
      ))}
      {games.length > shown.length && (
        <span className="text-3xs font-semibold text-muted">
          +{games.length - shown.length} more
        </span>
      )}
    </StakeCard>
  )
}

/**
 * The board's scores, pinned under the Timeline's header once the board
 * has scrolled away: what's live (or, with nothing live, the board's
 * Games), each narrowing the Timeline to it.
 */
export function LiveTicker({
  games,
  onPick,
}: {
  games: ReadonlyArray<GameSummary>
  onPick: (g: GameSummary) => void
}) {
  const timeZone = useTimeZone()
  const live = games.filter(isLiveGame)
  const shown = live.length > 0 ? live : games
  if (shown.length === 0) return null
  return (
    <ul
      aria-label="Scores"
      data-no-swipe=""
      className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 py-1.5 [scrollbar-width:none]"
    >
      {shown.map((g) => (
        <li key={g.id} className="shrink-0">
          <button
            type="button"
            onClick={() => onPick(g)}
            className="flex items-center gap-1.5 rounded-control bg-surface px-2 py-1 text-2xs font-bold whitespace-nowrap tabular-nums"
          >
            <TeamLogo team={g.awayTeam} size={16} />
            {isLiveGame(g) || g.status === 'final'
              ? `${g.score.away}–${g.score.home}`
              : `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`}
            <TeamLogo team={g.homeTeam} size={16} />
            <span
              className={cn(
                'font-semibold',
                isLiveGame(g) ? 'text-live' : 'text-muted',
              )}
            >
              {gameStatusLabel(g, timeZone)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Over the feed: every play, or only those that move the Viewer's stakes. */
export function FeedFilter({
  mine,
  onMine,
}: {
  mine: boolean
  onMine: (mine: boolean) => void
}) {
  return (
    <div
      role="group"
      aria-label="Which plays"
      className="mb-3 flex self-start rounded-full bg-notice p-0.5"
    >
      {[
        { value: false, label: 'Everything' },
        { value: true, label: 'Affects me' },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={mine === o.value}
          onClick={() => onMine(o.value)}
          className={cn(
            'min-h-8 rounded-full px-3 text-2xs font-semibold text-muted transition-colors',
            mine === o.value && 'bg-surface text-foreground shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
