/**
 * The phone's Scope bar: a strip of glass over the tab bar, on every tab,
 * holding a row of small cards that scrolls freely sideways (two or three
 * in view): what the Scope covers (scopePages), the Scope as a whole first,
 * then its Games, open Predictions or Matchups. Tapping a card narrows the
 * Timeline to it and opens it in full at once (the Game's box score, the
 * Prediction's or Matchup's sheet). The first card, with nothing narrowed,
 * opens everything as a list (the Games, the Matchups, or the portfolio);
 * with something narrowed, it goes back to the whole Scope. The selection
 * lives in the address, so the bar only follows it: the chosen card is
 * marked, and one chosen anywhere else (a link, Back) scrolls into view.
 *
 * Only below `md`, where the navigation is the tab bar it sits on; from
 * `md` the cards at the top of the Timeline do this (TimelineTop).
 */

import { useEffect, useLayoutEffect, useRef } from 'react'
import { gameStatusLabel } from './GameStrip'
import { pageKey } from './scopePages'
import type { ScopePage } from './scopePages'
import type { Scope } from '@/lib/model/scope'
import type { GameSummary } from '@/lib/model/timeline'
import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { rowItemName } from '@/components/brand/RowItemMark'
import {
  leadGame,
  money,
  pct,
  profitOf,
  profitText,
  toneOf,
} from '@/components/predictions/PredictionParts'
import { portfolioTotals } from '@/components/predictions/PredictionPortfolio'
import { pts, scoreText } from '@/components/fantasy/format'
import { SPORTS } from '@/lib/fantasy/sports'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { cn } from '@/lib/utils'

/** The first card: the Scope as a whole. */
export interface PagerSummary {
  kicker: string
  title: string
  /** On the right: the portfolio's cash-out, or that Games are live. */
  figure: React.ReactNode
  /**
   * What tapping it opens, in words ("Open your portfolio"): a sheet of
   * everything the bar pages through. Null with nothing to list.
   */
  opens: string | null
}

/** A scroll this soon after a touch is still the Viewer's (a flick). */
const MOMENTUM_MS = 1500

/** Scroll the row the least that shows its chosen card whole. */
function showCurrent(el: HTMLElement | null) {
  const card = el?.querySelector<HTMLElement>('[aria-current="true"]')
  if (!el || !card) return
  const left = card.offsetLeft - el.offsetLeft
  const right = left + card.offsetWidth
  const pad = 12
  if (left - pad < el.scrollLeft)
    el.scrollTo({ left: Math.max(0, left - pad), behavior: 'instant' })
  else if (right + pad > el.scrollLeft + el.clientWidth)
    el.scrollTo({ left: right + pad - el.clientWidth, behavior: 'instant' })
}

const isLive = (g: GameSummary) => g.status === 'live' || g.status === 'delayed'

/** The first card's words for the Scope, from what's in it. */
export function pagerSummary({
  scope,
  gameId,
  games,
  predictions,
  leagues,
  display = 'dollars',
}: {
  scope: Scope
  gameId: string | null
  games: ReadonlyArray<GameSummary>
  predictions: ReadonlyArray<PredictionView>
  leagues: ReadonlyArray<FantasyLeagueView>
  display?: ChangeDisplay
}): PagerSummary {
  if (!gameId && scope === 'predictions') {
    const totals = portfolioTotals(predictions)
    return {
      kicker: 'Your Predictions',
      title:
        predictions.length === 0
          ? 'None open'
          : `${predictions.length} open · Staked ${money(totals.staked)}`,
      figure: totals.profit && (
        <>
          <b className="text-[17px] leading-tight">{money(totals.cashout)}</b>
          <span className={cn('font-semibold', toneOf(totals.profit.dollars))}>
            {profitText(totals.profit, display)}
          </span>
        </>
      ),
      opens: predictions.length > 0 ? 'Open your portfolio' : null,
    }
  }
  if (!gameId && scope === 'fantasy') {
    const leading = leagues.filter(
      (l) => l.matchup!.mine.score > (l.matchup!.opponent?.score ?? Infinity),
    ).length
    return {
      kicker: 'Your Matchups',
      title: `${leagues.length} this week${leagues.length ? ` · leading ${leading}` : ''}`,
      figure: null,
      opens: leagues.length > 0 ? 'See all your matchups' : null,
    }
  }
  const live = games.filter(isLive).length
  return {
    kicker:
      scope === 'following'
        ? 'Following'
        : scope === 'all'
          ? 'All Leagues'
          : scope === 'predictions'
            ? 'Your Predictions’ games'
            : scope === 'fantasy'
              ? 'Your Starters’ games'
              : rowItemName(scope),
    title:
      games.length === 0
        ? 'No games yet'
        : `${games.length} game${games.length === 1 ? '' : 's'}${live ? ` · ${live} live` : ''}`,
    figure: live > 0 && <span className="font-bold text-live">● Live</span>,
    opens: games.length > 0 ? 'See all the games' : null,
  }
}

export function ScopePager({
  pages,
  current,
  summary,
  display,
  onPick,
  onSummary,
  className,
}: {
  pages: ReadonlyArray<ScopePage>
  /** The current page's key (currentPageKey). */
  current: string
  summary: PagerSummary
  display?: ChangeDisplay
  /** A card tapped: narrow the Timeline to it and open it in full. */
  onPick: (page: ScopePage) => void
  /**
   * The first card tapped: back to the whole Scope, or with nothing
   * narrowed, everything as a list.
   */
  onSummary: () => void
  className?: string
}) {
  const strip = useRef<HTMLUListElement>(null)
  const narrowed = current !== 'all'

  // The chosen card in view, when the choice changes (from here or
  // anywhere else): the least scroll that shows it whole, never a jump
  // the Viewer didn't ask for otherwise.
  useLayoutEffect(() => showCurrent(strip.current), [current])

  // The Viewer's own scrolling is theirs to leave anywhere. Anything else
  // that moves the row (the router restoring an old position on Back)
  // mustn't hide the chosen card, so it's brought back into view.
  useEffect(() => {
    const el = strip.current
    if (!el) return
    let touching = false
    let dragged = false
    let lastTouch = Number.NEGATIVE_INFINITY
    const theirs = () => {
      lastTouch = performance.now()
    }
    // A tap on a card isn't scrolling: only a finger that moves is.
    const onDown = () => {
      touching = true
      dragged = false
      // A finger down stops any coasting from the last flick.
      lastTouch = Number.NEGATIVE_INFINITY
    }
    const onMove = () => {
      dragged = true
      theirs()
    }
    const onUp = () => {
      touching = false
      if (dragged) theirs()
    }
    const onScroll = () => {
      // A flick keeps scrolling a while after the finger lifts.
      if (touching || performance.now() - lastTouch < MOMENTUM_MS) return
      showCurrent(el)
    }
    el.addEventListener('touchstart', onDown, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onUp, { passive: true })
    el.addEventListener('touchcancel', onUp, { passive: true })
    el.addEventListener('wheel', theirs, { passive: true })
    el.addEventListener('keydown', theirs)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onDown)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onUp)
      el.removeEventListener('touchcancel', onUp)
      el.removeEventListener('wheel', theirs)
      el.removeEventListener('keydown', theirs)
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  const summaryAction = narrowed ? 'Show everything' : summary.opens
  return (
    <section
      aria-label="Pick from this tab"
      // Not a Scope swipe (it scrolls its own), and its own View
      // Transition layer: it holds still, like the tab bar, while the
      // feed changes.
      data-no-swipe
      data-scope-pager=""
      style={{ viewTransitionName: 'scope-pager' }}
      className={cn(
        'glass-nav fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+4.5rem)] z-20 mx-auto max-w-md overflow-hidden rounded-sheet',
        className,
      )}
    >
      <ul
        ref={strip}
        className="flex snap-x snap-proximity scroll-px-2 gap-1.5 overflow-x-auto overscroll-x-contain p-1.5 [scrollbar-width:none]"
      >
        {pages.map((page) => {
          const key = pageKey(page)
          const here = key === current
          const first = page.kind === 'all'
          const name = pageName(page, summary)
          const action = first ? summaryAction : openLabel(page)
          return (
            <li key={key} className="flex shrink-0 snap-start">
              <button
                type="button"
                onClick={() => (first ? onSummary() : onPick(page))}
                // Nothing to list and nothing narrowed: nothing to do.
                disabled={first && !action}
                aria-current={here ? 'true' : undefined}
                aria-label={action ? `${name}. ${action}` : name}
                className={cn(
                  'flex h-16 w-34 flex-col justify-center gap-0.5 rounded-card border px-2.5 text-left text-glass-ink tabular-nums transition-colors',
                  here
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface/60',
                  first && 'w-38',
                )}
              >
                {first ? (
                  <SummaryCard summary={summary} narrowed={narrowed} />
                ) : (
                  <PageCard page={page} display={display} />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** What a page is, in words (for its label). */
function pageName(page: ScopePage, summary: PagerSummary): string {
  switch (page.kind) {
    case 'all':
      return `${summary.kicker}: ${summary.title}`
    case 'game': {
      const g = page.game
      return `${g.awayTeam.abbreviation} ${g.score.away}, ${g.homeTeam.abbreviation} ${g.score.home}`
    }
    case 'prediction':
      return page.prediction.title
    case 'matchup':
      return page.league.matchup!.leagueName
  }
}

function openLabel(page: ScopePage): string {
  switch (page.kind) {
    case 'all':
      return ''
    case 'game':
      return 'Show this game and its box score'
    case 'prediction':
      return 'Show this prediction in full'
    case 'matchup':
      return 'Show this matchup in full'
  }
}

/** A card's small first line. */
function Kicker({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1 truncate text-3xs leading-tight font-semibold text-glass-ink-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** The Scope as a whole: what's in it, and the way back to it all. */
function SummaryCard({
  summary,
  narrowed,
}: {
  summary: PagerSummary
  narrowed: boolean
}) {
  return (
    <>
      <Kicker>{summary.kicker}</Kicker>
      <span className="line-clamp-2 text-xs leading-tight font-semibold">
        {summary.title}
      </span>
      {narrowed ? (
        <span className="text-3xs font-semibold text-accent">
          Show everything ›
        </span>
      ) : (
        summary.figure && (
          <span className="flex items-baseline gap-1.5 text-3xs [&_b]:text-xs">
            {summary.figure}
          </span>
        )
      )}
    </>
  )
}

function PageCard({
  page,
  display,
}: {
  page: ScopePage
  display?: ChangeDisplay
}) {
  switch (page.kind) {
    case 'all':
      return null
    case 'game':
      return <GameCard game={page.game} />
    case 'prediction':
      return <PredictionCard prediction={page.prediction} display={display} />
    case 'matchup':
      return <MatchupCard league={page.league} />
  }
}

/** A Game: its state, then each team with its logo and score. */
function GameCard({ game: g }: { game: GameSummary }) {
  const timeZone = useTimeZone()
  const live = isLive(g)
  const started = live || g.status === 'final'
  const leader =
    g.score.away === g.score.home
      ? null
      : g.score.away > g.score.home
        ? 'away'
        : 'home'
  return (
    <>
      <Kicker className={live ? 'text-live' : undefined}>
        <LeagueLogo league={g.league} size={12} />
        {gameStatusLabel(g, timeZone)}
      </Kicker>
      {(['away', 'home'] as const).map((side) => {
        const team = side === 'away' ? g.awayTeam : g.homeTeam
        return (
          <span
            key={side}
            className={cn(
              'flex items-center gap-1.5 text-[13px] leading-tight',
              leader === side
                ? 'font-bold'
                : started
                  ? 'opacity-70'
                  : undefined,
            )}
          >
            <TeamLogo team={team} size={16} />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {team.rank && (
                <span className="mr-0.5 text-3xs font-bold text-glass-ink-muted">
                  {team.rank}
                </span>
              )}
              {team.abbreviation}
            </span>
            {started && <span>{g.score[side]}</span>}
          </span>
        )
      })}
    </>
  )
}

/** A Prediction: where it's from, what it is, its Odds and money. */
function PredictionCard({
  prediction: p,
  display = 'dollars',
}: {
  prediction: PredictionView
  display?: ChangeDisplay
}) {
  const profit = profitOf(p)
  const game = leadGame(p)
  return (
    <>
      <Kicker>
        {p.kind === 'combo' ? (
          `Combo · ${p.legs.filter((l) => l.status === 'won').length}/${p.legs.length} hit`
        ) : game ? (
          <>
            <LeagueLogo league={game.league} size={12} />
            {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
          </>
        ) : (
          'Prediction'
        )}
      </Kicker>
      <span className="truncate text-xs leading-tight font-semibold">
        {p.side === 'no' ? 'Not: ' : ''}
        {p.title}
      </span>
      <span className="flex items-baseline gap-1.5">
        <b className="text-[15px] leading-tight">
          {p.chance === null ? '—' : pct(p.chance)}
        </b>
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

/** A Matchup: its league, then each side with its projection and score. */
function MatchupCard({ league }: { league: FantasyLeagueView }) {
  const m = league.matchup!
  const theirs = m.opponent
  const lead =
    theirs && m.mine.score !== theirs.score
      ? m.mine.score > theirs.score
        ? 'mine'
        : 'theirs'
      : null
  const side = (
    s: { abbrev: string; score: number; projected: number | null },
    who: 'mine' | 'theirs',
  ) => (
    <span
      className={cn(
        'flex items-baseline gap-1 text-[13px] leading-tight',
        lead === who ? 'font-bold' : lead ? 'opacity-70' : undefined,
      )}
    >
      <span className="min-w-0 flex-1 truncate font-semibold">{s.abbrev}</span>
      {!m.categories && s.projected !== null && (
        <span className="text-3xs font-normal text-glass-ink-muted">
          {pts(s.projected)}
        </span>
      )}
      <span>{scoreText(m, s.score)}</span>
    </span>
  )
  return (
    <>
      <Kicker>
        <LeagueLogo league={SPORTS[m.sport].league} size={12} />
        {m.leagueName}
      </Kicker>
      {side(m.mine, 'mine')}
      {theirs ? (
        side(theirs, 'theirs')
      ) : (
        <span className="text-xs text-glass-ink-muted">Bye week</span>
      )}
    </>
  )
}
