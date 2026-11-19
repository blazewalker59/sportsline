/**
 * The phone's Scope bar: one wide card of glass over the tab bar, on every
 * tab, paging sideways through what the Scope covers (scopePages): the
 * Scope as a whole, then its Games, open Predictions or Matchups. Swiping
 * to a page narrows the Timeline to it, there and then; tapping the page
 * in view opens it in full (the Game's box score, the Prediction's or
 * Matchup's sheet, or from the first page the portfolio). The selection
 * lives in the address, so the bar only follows it: a page chosen anywhere
 * else (a link, Back) scrolls into view here. It goes round: past the last
 * page is the first again, and before the first the last (a copy of each
 * sits at the far ends, swapped for the real one once the swipe stops).
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

/** Up to this many pages show as dots; past it, a count ("3 / 14"). */
const MAX_DOTS = 9
/** A scroll that stops moving this long has come to rest (no scrollend). */
const SETTLE_MS = 140

/** The first page: the Scope as a whole. */
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

const isLive = (g: GameSummary) => g.status === 'live' || g.status === 'delayed'

/** The first page's words for the Scope, from what's in it. */
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
  onSelect,
  onOpen,
  className,
}: {
  pages: ReadonlyArray<ScopePage>
  /** The current page's key (currentPageKey). */
  current: string
  summary: PagerSummary
  display?: ChangeDisplay
  /** Narrow the Timeline to a page (the first page: to the whole Scope). */
  onSelect: (page: ScopePage) => void
  /** Open the page in view in full. */
  onOpen: (page: ScopePage) => void
  className?: string
}) {
  const strip = useRef<HTMLDivElement>(null)
  const found = pages.findIndex((p) => pageKey(p) === current)
  const index = Math.max(found, 0)
  const keys = pages.map(pageKey).join('|')
  // With two pages or more it goes round: a copy of the last page before
  // the first and of the first after the last, so every page is one swipe
  // from the next. `slot` is where a page sits in the strip.
  const loop = pages.length > 1
  const offset = loop ? 1 : 0
  // The page shown last, to tell a step round the end from a jump.
  const shown = useRef(index)
  // A finger on the strip: the selection waits until it lets go.
  const touching = useRef(false)
  // The Viewer moved the strip (a finger, a wheel, focus) since it last
  // came to rest: where it stops is their pick. Anything else that moves
  // it (the router restoring scroll positions on Back) is put right.
  const byViewer = useRef(false)
  // A page picked here that the address hasn't caught up with yet.
  const picked = useRef<string | null>(null)
  // The next scroll into view is a step (an arrow), not a jump.
  const glide = useRef(false)
  // The latest of everything the scroll listeners read.
  const latest = useRef({ pages, index, onSelect, loop, offset })
  latest.current = { pages, index, onSelect, loop, offset }

  // Keep the current page in view: on first paint, and whenever the
  // selection changes or the pages move (a Game going live moves up).
  useLayoutEffect(() => {
    picked.current = null
    const was = shown.current
    shown.current = index
    const el = strip.current
    if (!el || touching.current || !el.clientWidth) return
    const last = pages.length - 1
    // An arrow stepping round the end glides on to the copy beyond it
    // (then settles on the real page), rather than back across them all.
    const slot =
      glide.current && loop && was === last && index === 0
        ? last + 2
        : glide.current && loop && was === 0 && index === last
          ? 0
          : index + offset
    const left = slot * el.clientWidth
    if (Math.abs(el.scrollLeft - left) > 1)
      el.scrollTo({ left, behavior: glide.current ? 'smooth' : 'instant' })
    glide.current = false
    // Only on a selection or new pages: not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, keys])

  // A swipe that comes to rest on another page selects it.
  useEffect(() => {
    const el = strip.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      clearTimeout(timer)
      if (touching.current || !el.clientWidth) return
      const viewer = byViewer.current
      byViewer.current = false
      const now = latest.current
      const width = el.clientWidth
      let slot = Math.round(el.scrollLeft / width)
      // Resting on a copy at either end: swap it for the real page.
      if (now.loop && (slot === 0 || slot === now.pages.length + 1)) {
        slot = slot === 0 ? now.pages.length : 1
        el.scrollTo({ left: slot * width, behavior: 'instant' })
      }
      const at = slot - now.offset
      if (at === now.index) {
        picked.current = null
        return
      }
      const page = now.pages[at] as ScopePage | undefined
      if (viewer && page) {
        picked.current = pageKey(page)
        now.onSelect(page)
      } else if (!picked.current) {
        // Not theirs, and nothing on its way: back to the current page.
        el.scrollTo({
          left: (now.index + now.offset) * width,
          behavior: 'instant',
        })
      }
    }
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(settle, SETTLE_MS)
    }
    const arm = () => {
      byViewer.current = true
      onScroll()
    }
    const onDown = () => {
      touching.current = true
      byViewer.current = true
    }
    const onUp = () => {
      touching.current = false
      onScroll()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', settle)
    el.addEventListener('touchstart', onDown, { passive: true })
    el.addEventListener('touchend', onUp, { passive: true })
    el.addEventListener('touchcancel', onUp, { passive: true })
    el.addEventListener('wheel', arm, { passive: true })
    el.addEventListener('focusin', arm)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', settle)
      el.removeEventListener('touchstart', onDown)
      el.removeEventListener('touchend', onUp)
      el.removeEventListener('touchcancel', onUp)
      el.removeEventListener('wheel', arm)
      el.removeEventListener('focusin', arm)
    }
  }, [])

  /** The page `by` along, going round the ends (null: no other page). */
  const along = (by: number) =>
    loop ? pages[(index + by + pages.length) % pages.length] : null
  const step = (by: number) => {
    const next = along(by)
    if (!next) return
    glide.current = true
    onSelect(next)
  }
  const name = (p: ScopePage) => pageName(p, summary)

  return (
    <section
      aria-label="Pick from this tab"
      aria-roledescription="carousel"
      // Not a Scope swipe (it pages its own), and its own View Transition
      // layer: it holds still, like the tab bar, while the feed changes.
      data-no-swipe
      data-scope-pager=""
      style={{ viewTransitionName: 'scope-pager' }}
      className={cn(
        'glass-nav fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+4.5rem)] z-20 mx-auto h-15 max-w-md overflow-hidden rounded-sheet',
        className,
      )}
    >
      <div
        ref={strip}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
      >
        {loop && (
          <EndCopy
            page={pages[pages.length - 1]}
            summary={summary}
            display={display}
          />
        )}
        {pages.map((page, i) => {
          const here = i === index
          const opens = page.kind !== 'all' || summary.opens !== null
          const body = (
            <PageBody
              page={page}
              summary={summary}
              display={display}
              here={here}
            />
          )
          const pageClass =
            'flex h-full w-full shrink-0 snap-center snap-always items-center gap-3 px-10 pb-2 text-left'
          return opens ? (
            <button
              key={pageKey(page)}
              type="button"
              // Off to the side (mid-swipe): bring it here first.
              onClick={() => (here ? onOpen(page) : onSelect(page))}
              aria-current={here ? 'true' : undefined}
              aria-label={`${name(page)}${here ? `. ${openLabel(page, summary)}` : ''}`}
              className={pageClass}
            >
              {body}
            </button>
          ) : (
            <div
              key={pageKey(page)}
              aria-current={here ? 'true' : undefined}
              aria-label={name(page)}
              role="group"
              className={pageClass}
            >
              {body}
            </div>
          )
        })}
        {loop && (
          <EndCopy page={pages[0]} summary={summary} display={display} />
        )}
      </div>
      <Arrow
        side="left"
        label={loop ? `Previous: ${name(along(-1)!)}` : 'Previous'}
        disabled={!loop}
        onClick={() => step(-1)}
      />
      <Arrow
        side="right"
        label={loop ? `Next: ${name(along(1)!)}` : 'Next'}
        disabled={!loop}
        onClick={() => step(1)}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1"
      >
        {pages.length <= MAX_DOTS ? (
          pages.map((p, i) => (
            <i
              key={pageKey(p)}
              className={cn(
                'block h-1 rounded-full bg-glass-ink transition-all duration-200',
                i === index ? 'w-3 opacity-90' : 'w-1 opacity-25',
              )}
            />
          ))
        ) : (
          <span className="text-3xs leading-none font-semibold text-glass-ink-muted tabular-nums">
            {index + 1} / {pages.length}
          </span>
        )}
      </div>
    </section>
  )
}

/**
 * A copy of the page at the other end, so a swipe past either end goes
 * round: only to be seen in passing, never picked or read out.
 */
function EndCopy({
  page,
  summary,
  display,
}: {
  page: ScopePage
  summary: PagerSummary
  display?: ChangeDisplay
}) {
  return (
    <div
      aria-hidden="true"
      inert
      data-end-copy=""
      className="flex h-full w-full shrink-0 snap-center snap-always items-center gap-3 px-10 pb-2 text-left"
    >
      <PageBody page={page} summary={summary} display={display} here={false} />
    </div>
  )
}

function Arrow({
  side,
  label,
  disabled,
  onClick,
}: {
  side: 'left' | 'right'
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'absolute top-0 bottom-2 flex w-9 items-center justify-center text-lg text-glass-ink-muted transition-opacity disabled:opacity-20',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <span aria-hidden="true">{side === 'left' ? '‹' : '›'}</span>
    </button>
  )
}

/** What a page is, in words (for its label and the arrows'). */
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

function openLabel(page: ScopePage, summary: PagerSummary): string {
  switch (page.kind) {
    case 'all':
      return summary.opens ?? ''
    case 'game':
      return 'Open the box score'
    case 'prediction':
      return 'Open the prediction'
    case 'matchup':
      return 'Open the matchup'
  }
}

/** A page's two lines on the left and its figure on the right. */
function PageBody({
  page,
  summary,
  display = 'dollars',
  here,
}: {
  page: ScopePage
  summary: PagerSummary
  display?: ChangeDisplay
  here: boolean
}) {
  switch (page.kind) {
    case 'all':
      return (
        <Lines
          kicker={summary.kicker}
          title={summary.title}
          figure={summary.figure}
        />
      )
    case 'game':
      return <GameLines game={page.game} here={here} />
    case 'prediction': {
      const p = page.prediction
      const profit = profitOf(p)
      const game = leadGame(p)
      return (
        <Lines
          kicker={
            p.kind === 'combo' ? (
              `Combo · ${p.legs.filter((l) => l.status === 'won').length}/${p.legs.length} hit`
            ) : game ? (
              <>
                <LeagueLogo league={game.league} size={14} />
                {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
              </>
            ) : (
              'Prediction'
            )
          }
          title={`${p.side === 'no' ? 'Not: ' : ''}${p.title}`}
          figure={
            <>
              <b className="text-[19px] leading-tight">
                {p.chance === null ? '—' : pct(p.chance)}
              </b>
              {profit && (
                <span className={cn('font-semibold', toneOf(profit.dollars))}>
                  {profitText(profit, display)}
                </span>
              )}
            </>
          }
        />
      )
    }
    case 'matchup': {
      const m = page.league.matchup!
      const theirs = m.opponent
      const lead =
        theirs && m.mine.score !== theirs.score
          ? m.mine.score > theirs.score
            ? 'scoring'
            : 'live'
          : null
      return (
        <Lines
          kicker={
            <>
              <LeagueLogo league={SPORTS[m.sport].league} size={14} />
              {m.leagueName}
            </>
          }
          title={theirs ? `${m.mine.abbrev} vs ${theirs.abbrev}` : 'Bye week'}
          figure={
            theirs && (
              <>
                <b className="text-[17px] leading-tight">
                  {scoreText(m, m.mine.score)}–{scoreText(m, theirs.score)}
                </b>
                <span
                  className={cn(
                    'font-semibold',
                    lead === 'scoring'
                      ? 'text-scoring'
                      : lead === 'live'
                        ? 'text-live'
                        : 'text-muted',
                  )}
                >
                  {m.categories
                    ? 'categories'
                    : m.mine.projected !== null
                      ? `proj ${pts(m.mine.projected)}`
                      : lead === 'scoring'
                        ? 'leading'
                        : lead === 'live'
                          ? 'trailing'
                          : 'level'}
                </span>
              </>
            )
          }
        />
      )
    }
  }
}

function Lines({
  kicker,
  title,
  figure,
}: {
  kicker: React.ReactNode
  title: string
  figure: React.ReactNode
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-2xs font-semibold text-glass-ink-muted">
          {kicker}
        </span>
        <span className="truncate text-[15px] leading-snug font-semibold text-glass-ink">
          {title}
        </span>
      </span>
      {figure && (
        <span className="flex shrink-0 flex-col items-end text-2xs text-glass-ink tabular-nums">
          {figure}
        </span>
      )}
    </>
  )
}

/** A Game's page: its state, and the two teams with their scores. */
function GameLines({ game: g, here }: { game: GameSummary; here: boolean }) {
  const timeZone = useTimeZone()
  const live = isLive(g)
  const started = live || g.status === 'final'
  const leader =
    g.score.away === g.score.home
      ? null
      : g.score.away > g.score.home
        ? 'away'
        : 'home'
  const side = (s: 'away' | 'home') => {
    const team = s === 'away' ? g.awayTeam : g.homeTeam
    return (
      <span
        className={cn(
          'flex items-center gap-1',
          s === 'home' && 'flex-row-reverse',
          started && leader !== s && 'opacity-60',
          leader === s && 'font-bold',
        )}
      >
        <TeamLogo team={team} size={18} />
        <span className="text-[13px] font-semibold">
          {team.rank && (
            <span className="mr-0.5 text-3xs font-bold text-muted">
              {team.rank}
            </span>
          )}
          {team.abbreviation}
        </span>
        {started && <span className="text-[16px]">{g.score[s]}</span>}
      </span>
    )
  }
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-2xs font-semibold">
          <LeagueLogo league={g.league} size={14} />
          <span className={live ? 'text-live' : 'text-glass-ink-muted'}>
            {gameStatusLabel(g, timeZone)}
          </span>
        </span>
        <span className="flex items-center gap-2 leading-snug text-glass-ink tabular-nums">
          {side('away')}
          <span className="text-glass-ink-muted">{started ? '–' : '@'}</span>
          {side('home')}
        </span>
      </span>
      {here && (
        <span className="shrink-0 text-2xs font-semibold text-glass-ink-muted">
          Box score ›
        </span>
      )}
    </>
  )
}
