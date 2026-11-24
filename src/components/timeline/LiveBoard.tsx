/**
 * The phone's home board (only below `md`): the one place a phone picks
 * what the Timeline shows. Over the feed, whether or not it's narrowed:
 *
 * - "Your night": at most three cards summing up the Viewer's stakes
 *   (their Matchups, their Predictions, the Games they follow), each
 *   switching to its tab.
 * - The board: what the tab can be narrowed to (scopePages): its Games, or
 *   under Predictions the open Predictions, under Fantasy the Matchups. A
 *   grid (live Games as tiles, the rest as chips) or collapsed to one row
 *   that scrolls sideways, the Viewer's choice on the device
 *   (useBoardLayout). Tapping a tile narrows the Timeline to it and marks
 *   it; tapping it again opens it in full.
 * - Narrowed, a strip over the feed says to what, opens it in full, and
 *   goes back to everything (NarrowedBar).
 *
 * Once the board scrolls away, the Timeline's top pins its scores
 * (LiveTicker).
 */

import { useCallback } from 'react'
import { gameStatusLabel } from './GameStrip'
import { pageKey } from './scopePages'
import type { ScopePage } from './scopePages'
import type { Scope } from '@/lib/model/scope'
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

type Tiled = Exclude<ScopePage, { kind: 'all' }>

/** A page in words: "BOS @ NYK", a Prediction's title, a league's name. */
export function pageName(page: Tiled): string {
  switch (page.kind) {
    case 'game':
      return `${page.game.awayTeam.abbreviation} @ ${page.game.homeTeam.abbreviation}`
    case 'prediction':
      return `${page.prediction.side === 'no' ? 'Not: ' : ''}${page.prediction.title}`
    case 'matchup':
      return page.league.matchup!.leagueName
  }
}

/** What opening a page in full shows. */
const openLabel = (page: Tiled) =>
  page.kind === 'game'
    ? 'Box score'
    : page.kind === 'prediction'
      ? 'Prediction'
      : 'Matchup'

export function LiveBoard({
  pages,
  current,
  stakesOf,
  layout,
  onLayout,
  onPick,
  onPortfolio,
  display = 'dollars',
  boardRef,
}: {
  /** What the tab narrows to, in the board's order (no 'all'). */
  pages: ReadonlyArray<Tiled>
  /** The current page's key (currentPageKey). */
  current: string
  stakesOf: (g: GameSummary) => Array<GameStake>
  layout: BoardLayout
  onLayout: (next: BoardLayout) => void
  /** A tile tapped: narrow to it, or (already narrowed to it) open it. */
  onPick: (page: Tiled) => void
  /** Every open Prediction at once (the portfolio). */
  onPortfolio?: () => void
  display?: ChangeDisplay
  /** The board, watched for when it scrolls away (the ticker's cue). */
  boardRef?: React.Ref<HTMLElement>
}) {
  if (pages.length === 0) return null
  const kind = pages[0].kind
  const live = pages.filter((p) => p.kind === 'game' && isLiveGame(p.game))
  // The grid's tiles: under Games what's live (or, with nothing live,
  // what's next), with the rest as chips; anything else all as tiles.
  const tiles =
    layout === 'row' || kind !== 'game'
      ? pages
      : live.length > 0
        ? live
        : pages
            .filter((p) => p.kind === 'game' && p.game.status !== 'final')
            .slice(0, GRID_UPCOMING)
  const chips = layout === 'row' ? [] : pages.filter((p) => !tiles.includes(p))
  const title =
    kind === 'prediction'
      ? `Your Predictions · ${pages.length} open`
      : kind === 'matchup'
        ? `Your Matchups · ${pages.length}`
        : live.length > 0
          ? `Live now · ${live.length}`
          : `Games · ${pages.length}`
  const tile = (page: Tiled) => (
    <Tile
      page={page}
      here={pageKey(page) === current}
      stakes={page.kind === 'game' ? stakesOf(page.game) : []}
      narrow={layout === 'row'}
      display={display}
      onPick={onPick}
    />
  )
  return (
    <section
      ref={boardRef}
      aria-label={kind === 'game' ? 'Games' : title.split(' · ')[0]}
      className="mb-3 flex flex-col gap-2"
    >
      <div className="flex min-h-8 items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-3xs font-bold tracking-wide text-muted uppercase">
          {live.length > 0 && (
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-live"
            />
          )}
          {title}
        </h2>
        <span className="flex-1" />
        {kind === 'prediction' && onPortfolio && (
          <button
            type="button"
            onClick={onPortfolio}
            className="min-h-8 px-1 text-2xs font-semibold text-accent"
          >
            Portfolio ›
          </button>
        )}
        <LayoutToggle layout={layout} onLayout={onLayout} />
      </div>
      {layout === 'grid' ? (
        tiles.length > 0 && (
          <ul className="grid grid-cols-2 gap-2">
            {tiles.map((p) => (
              <li key={pageKey(p)} className="flex">
                {tile(p)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul
          data-no-swipe=""
          className="-mx-4 flex snap-x snap-proximity scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]"
        >
          {tiles.map((p) => (
            <li key={pageKey(p)} className="flex w-36 shrink-0 snap-start">
              {tile(p)}
            </li>
          ))}
        </ul>
      )}
      {chips.length > 0 && (
        <ul
          data-no-swipe=""
          className="-mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]"
        >
          {chips.map((p) =>
            p.kind === 'game' ? (
              <li key={pageKey(p)} className="shrink-0">
                <GameChip
                  page={p}
                  here={pageKey(p) === current}
                  onPick={onPick}
                />
              </li>
            ) : null,
          )}
        </ul>
      )}
    </section>
  )
}

/** Grid or Row: how the board lays its tiles out. */
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
      aria-label="Board layout"
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

/** One of the board's tiles: a Game, a Prediction or a Matchup. */
function Tile({
  page,
  here,
  stakes,
  narrow,
  display,
  onPick,
}: {
  page: Tiled
  here: boolean
  stakes: Array<GameStake>
  /** In the one row: stakes as dots, not labels. */
  narrow: boolean
  display: ChangeDisplay
  onPick: (page: Tiled) => void
}) {
  const timeZone = useTimeZone()
  const label =
    page.kind === 'game'
      ? `${page.game.awayTeam.abbreviation} ${page.game.score.away}, ${page.game.homeTeam.abbreviation} ${page.game.score.home}, ${gameStatusLabel(page.game, timeZone)}`
      : pageName(page)
  return (
    <button
      type="button"
      onClick={() => onPick(page)}
      aria-current={here ? 'true' : undefined}
      aria-label={`${label}. ${here ? `Open the ${openLabel(page).toLowerCase()}` : 'Show only this'}`}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-card border p-2.5 text-left tabular-nums transition-[transform,background-color] active:scale-[0.98]',
        // The chosen tile a shade deeper, as the cards are, not outlined.
        here ? 'border-transparent bg-accent/15' : 'border-border bg-surface',
      )}
    >
      {page.kind === 'game' ? (
        <GameTileBody game={page.game} stakes={stakes} dots={narrow} />
      ) : page.kind === 'prediction' ? (
        <PredictionTileBody prediction={page.prediction} display={display} />
      ) : (
        <MatchupTileBody league={page.league} />
      )}
    </button>
  )
}

const leaderOf = (g: GameSummary) =>
  g.score.away === g.score.home
    ? null
    : g.score.away > g.score.home
      ? 'away'
      : 'home'

function GameTileBody({
  game: g,
  stakes,
  dots,
}: {
  game: GameSummary
  stakes: Array<GameStake>
  dots: boolean
}) {
  const timeZone = useTimeZone()
  const live = isLiveGame(g)
  const started = live || g.status === 'final'
  const leader = leaderOf(g)
  return (
    <>
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
              className={cn('size-1.5 rounded-full bg-current', STAKE_TONE[s])}
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
    </>
  )
}

function PredictionTileBody({
  prediction: p,
  display,
}: {
  prediction: PredictionView
  display: ChangeDisplay
}) {
  const profit = profitOf(p)
  const hit = p.legs.filter((l) => l.status === 'won').length
  return (
    <>
      <span className="truncate text-3xs font-semibold text-muted">
        {p.kind === 'combo' ? `Combo · ${hit}/${p.legs.length} hit` : 'Single'}
      </span>
      <span className="line-clamp-2 text-xs leading-tight font-semibold">
        {p.side === 'no' ? 'Not: ' : ''}
        {p.title}
      </span>
      <span className="mt-auto flex items-baseline gap-1.5">
        <span className="text-lg leading-tight font-bold">
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
    </>
  )
}

function MatchupTileBody({ league }: { league: FantasyLeagueView }) {
  const m = league.matchup!
  const theirs = m.opponent
  const lead =
    theirs && m.mine.score !== theirs.score
      ? m.mine.score > theirs.score
        ? 'mine'
        : 'theirs'
      : null
  const side = (
    s: { abbrev: string; score: number },
    who: 'mine' | 'theirs',
  ) => (
    <span
      className={cn(
        'flex items-baseline gap-1 text-sm leading-tight font-semibold',
        lead && lead !== who && 'text-muted',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{s.abbrev}</span>
      <span className="text-lg leading-none font-bold">
        {m.categories ? s.score : pts(s.score)}
      </span>
    </span>
  )
  return (
    <>
      <span className="flex items-center gap-1 truncate text-3xs font-semibold text-muted">
        <LeagueLogo league={SPORTS[m.sport].league} size={12} />
        <span className="truncate">{m.leagueName}</span>
      </span>
      {side(m.mine, 'mine')}
      {theirs ? (
        side(theirs, 'theirs')
      ) : (
        <span className="text-xs text-muted">Bye week</span>
      )}
    </>
  )
}

/** A Game not on now, small: "LAL @ DEN 9:30 PM", or its final score. */
function GameChip({
  page,
  here,
  onPick,
}: {
  page: Extract<Tiled, { kind: 'game' }>
  here: boolean
  onPick: (page: Tiled) => void
}) {
  const timeZone = useTimeZone()
  const g = page.game
  const final = g.status === 'final'
  return (
    <button
      type="button"
      onClick={() => onPick(page)}
      aria-current={here ? 'true' : undefined}
      className={cn(
        'flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-2xs font-semibold whitespace-nowrap text-muted tabular-nums',
        here ? 'bg-accent/15' : 'bg-notice',
      )}
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

/**
 * Over the feed while it's narrowed: to what, a way to open it in full,
 * and the way back to everything.
 */
export function NarrowedBar({
  page,
  onOpen,
  onClear,
}: {
  page: Tiled
  onOpen: () => void
  onClear: () => void
}) {
  return (
    <div
      role="status"
      data-narrowed=""
      className="mb-3 flex items-center gap-2 rounded-card bg-accent/10 py-1 pr-1 pl-3"
    >
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">
        <span className="text-muted">Showing </span>
        {pageName(page)}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="min-h-9 shrink-0 rounded-full px-2.5 text-2xs font-semibold text-accent"
      >
        {openLabel(page)} ›
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Show everything"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-sm text-muted"
      >
        ✕
      </button>
    </div>
  )
}

/**
 * "Your night": the Viewer's stakes summed up, a card each (Fantasy,
 * Predictions, Following) and only those they have. Each switches to its
 * tab, the current one marked.
 */
export function YourNight({
  leagues,
  predictions,
  display = 'dollars',
  following,
  scope,
  onScope,
}: {
  /** Fantasy leagues with a Matchup this period. */
  leagues: ReadonlyArray<FantasyLeagueView>
  /** Open Predictions. */
  predictions: ReadonlyArray<PredictionView>
  display?: ChangeDisplay
  /** The followed Teams' Games today; null without Follows. */
  following: ReadonlyArray<GameSummary> | null
  scope: Scope
  onScope: (scope: 'fantasy' | 'predictions' | 'following') => void
}) {
  const showFollowing = following !== null && following.length > 0
  const cards = Number(leagues.length > 0) + Number(predictions.length > 0)
  // Following alone says nothing the Following tab doesn't.
  if (cards === 0) return null
  return (
    <section aria-label="Your night" className="mb-3 flex flex-col gap-2">
      <h2 className="text-3xs font-bold tracking-wide text-muted uppercase">
        Your night
      </h2>
      <ul className="grid auto-cols-fr grid-flow-col gap-2">
        {leagues.length > 0 && (
          <li className="flex min-w-0">
            <FantasySum
              leagues={leagues}
              current={scope === 'fantasy'}
              onPick={() => onScope('fantasy')}
            />
          </li>
        )}
        {predictions.length > 0 && (
          <li className="flex min-w-0">
            <PredictionsSum
              predictions={predictions}
              display={display}
              current={scope === 'predictions'}
              onPick={() => onScope('predictions')}
            />
          </li>
        )}
        {showFollowing && (
          <li className="flex min-w-0">
            <FollowingSum
              games={following}
              current={scope === 'following'}
              onPick={() => onScope('following')}
            />
          </li>
        )}
      </ul>
    </section>
  )
}

function SumCard({
  kicker,
  tone,
  current,
  label,
  onPick,
  children,
}: {
  kicker: string
  tone: string
  current: boolean
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
        'flex w-full min-w-0 flex-col gap-0.5 rounded-card border p-2.5 text-left tabular-nums transition-colors',
        current
          ? 'border-transparent bg-accent/15'
          : 'border-border bg-surface',
      )}
    >
      <span
        className={cn(
          'truncate text-3xs font-bold tracking-wide uppercase',
          tone,
        )}
      >
        {kicker}
      </span>
      {children}
    </button>
  )
}

function FantasySum({
  leagues,
  current,
  onPick,
}: {
  leagues: ReadonlyArray<FantasyLeagueView>
  current: boolean
  onPick: () => void
}) {
  const one = leagues.length === 1 ? leagues[0].matchup! : null
  const leading = leagues.filter(
    (l) => l.matchup!.mine.score > (l.matchup!.opponent?.score ?? Infinity),
  ).length
  const figure = one
    ? one.categories
      ? sideRecord(one, 'mine')
      : `${pts(one.mine.score)}–${one.opponent ? pts(one.opponent.score) : '—'}`
    : `${leading} of ${leagues.length}`
  const sub = one
    ? one.opponent
      ? `vs ${one.opponent.abbrev}`
      : 'Bye week'
    : 'leading'
  return (
    <SumCard
      kicker={one ? one.leagueName : 'Fantasy'}
      tone="text-scoring"
      current={current}
      label={`Fantasy: ${figure} ${sub}. Your Matchups`}
      onPick={onPick}
    >
      <span className="truncate text-base leading-tight font-bold">
        {figure}
      </span>
      <span className="truncate text-3xs font-semibold text-muted">{sub}</span>
    </SumCard>
  )
}

function PredictionsSum({
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
  const figure = totals.profit ? money(totals.cashout) : money(totals.staked)
  return (
    <SumCard
      kicker={`Predictions · ${predictions.length}`}
      tone="text-positive"
      current={current}
      label={`Predictions: ${predictions.length} open, worth ${figure}. Your Predictions`}
      onPick={onPick}
    >
      <span className="truncate text-base leading-tight font-bold">
        {figure}
      </span>
      <span
        className={cn(
          'truncate text-3xs font-semibold',
          totals.profit ? toneOf(totals.profit.dollars) : 'text-muted',
        )}
      >
        {totals.profit ? profitText(totals.profit, display) : 'staked'}
      </span>
    </SumCard>
  )
}

function FollowingSum({
  games,
  current,
  onPick,
}: {
  games: ReadonlyArray<GameSummary>
  current: boolean
  onPick: () => void
}) {
  const live = games.filter(isLiveGame).length
  return (
    <SumCard
      kicker="Following"
      tone="text-accent"
      current={current}
      label={`Following: ${games.length} games, ${live} live. Your Following`}
      onPick={onPick}
    >
      <span className="truncate text-base leading-tight font-bold">
        {live > 0 ? `${live} live` : `${games.length} today`}
      </span>
      <span className="truncate text-3xs font-semibold text-muted">
        {games.length} game{games.length === 1 ? '' : 's'}
      </span>
    </SumCard>
  )
}

/**
 * The board's scores, pinned under the Timeline's header once the board
 * has scrolled away: what's live (or, with nothing live, the tab's
 * Games), the one narrowed to marked.
 */
export function LiveTicker({
  games,
  current,
  onPick,
}: {
  games: ReadonlyArray<GameSummary>
  /** The current page's key (currentPageKey). */
  current: string
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
            aria-current={current === `game:${g.id}` ? 'true' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-control px-2 py-1 text-2xs font-bold whitespace-nowrap tabular-nums',
              current === `game:${g.id}` ? 'bg-accent/15' : 'bg-surface',
            )}
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
