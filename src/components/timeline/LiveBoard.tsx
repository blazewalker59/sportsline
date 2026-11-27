/**
 * The phone's home board (only below `md`): the one place a phone picks
 * what the Timeline shows. Over the feed, whether or not it's narrowed:
 *
 * - The tab's hero (TabHero): its headline in its own color, and under
 *   All the League row.
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
import { gameStatusLabel } from './gameStatus'
import { pageKey } from './scopePages'
import {
  CHIP,
  CHIP_ON,
  KEY,
  LABEL,
  LED_LIVE,
  SEGMENT,
  SEGMENTS,
  SEGMENT_ON,
} from './signalClasses'
import type { ScopePage } from './scopePages'
import type { GameSummary } from '@/lib/model/timeline'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { GameStake } from '@/lib/timeline/stakes'
import type { IconName } from '@/components/layout/NavIcon'
import { isLiveGame } from '@/lib/timeline/stakes'
import { LeagueLogo, leagueLabel } from '@/components/brand/LeagueLogo'
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
import { NavGlyph } from '@/components/layout/NavIcon'
import { Meter } from '@/components/signal/Meter'
import { Num } from '@/components/signal/Num'
import { SectionLabel } from '@/components/signal/Section'
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

/** The Viewer's stakes in a Game: orange, since they're theirs. */
function StakeLine({ stakes }: { stakes: Array<GameStake> }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-3xs leading-tight text-live uppercase">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-signal"
      />
      <span className="truncate">
        {stakes.map((s) => STAKE_LABEL[s]).join(' · ')}
      </span>
    </span>
  )
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
  opensOnPick = false,
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
  /**
   * A tile opens what it narrows to at once (the wide Timeline's pane),
   * and tapped again closes it, rather than opening on a second tap.
   */
  opensOnPick?: boolean
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
      ? // The count is on the Predictions card above; Portfolio needs the room.
        'Predictions'
      : kind === 'matchup'
        ? `Matchups · ${pages.length}`
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
      opensOnPick={opensOnPick}
      onPick={onPick}
    />
  )
  return (
    <section
      ref={boardRef}
      aria-label={
        kind === 'game'
          ? 'Games'
          : kind === 'prediction'
            ? 'Your Predictions'
            : 'Your Matchups'
      }
      className="mb-3 flex flex-col gap-2"
    >
      <SectionLabel
        index="A1"
        className="mb-0"
        title={
          <span className="flex items-center gap-2">
            {live.length > 0 && (
              <span aria-hidden="true" className={LED_LIVE} />
            )}
            {title}
          </span>
        }
      >
        <span className="flex items-center gap-2">
          {kind === 'prediction' && onPortfolio && (
            <button
              type="button"
              onClick={onPortfolio}
              className={cn(KEY, 'h-8 px-2.5')}
            >
              Portfolio ›
            </button>
          )}
          <LayoutToggle layout={layout} onLayout={onLayout} />
        </span>
      </SectionLabel>
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
    <span role="group" aria-label="Board layout" className={SEGMENTS}>
      {(['grid', 'row'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={layout === value}
          aria-label={value === 'grid' ? 'Grid' : 'One row'}
          onClick={() => onLayout(value)}
          className={cn(SEGMENT, 'h-7 w-8', layout === value && SEGMENT_ON)}
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
  opensOnPick,
  onPick,
}: {
  page: Tiled
  here: boolean
  opensOnPick: boolean
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
      aria-label={`${label}. ${
        opensOnPick
          ? here
            ? 'Close it'
            : 'Show it in full'
          : here
            ? `Open the ${openLabel(page).toLowerCase()}`
            : 'Show only this'
      }`}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-card border bg-surface p-3 text-left tabular-nums transition-transform active:translate-y-px',
        // The chosen tile ringed in ink, as a selected module is.
        here ? 'border-foreground ring-1 ring-foreground' : 'border-border',
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
      <span className={cn('flex items-center gap-1.5', LABEL)}>
        {live && <span aria-hidden="true" className={LED_LIVE} />}
        <span className="shrink-0">{leagueLabel(g.league)}</span>
        <span className="min-w-0 flex-1 truncate text-right">
          {gameStatusLabel(g, timeZone)}
        </span>
        {dots &&
          stakes.map((s) => (
            <span
              key={s}
              title={STAKE_LABEL[s]}
              className="size-1.5 shrink-0 rounded-full bg-signal"
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
            <TeamLogo team={team} size={18} />
            <span className="min-w-0 flex-1 truncate">
              {team.rank && (
                <span className="mr-0.5 text-3xs font-bold text-muted">
                  {team.rank}
                </span>
              )}
              {team.abbreviation}
            </span>
            {started && <Num className="text-[26px]">{g.score[side]}</Num>}
          </span>
        )
      })}
      {!dots && stakes.length > 0 && <StakeLine stakes={stakes} />}
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
      <span className={cn('truncate', LABEL)}>
        {p.kind === 'combo' ? `Combo · ${hit}/${p.legs.length} hit` : 'Single'}
      </span>
      <span className="line-clamp-2 text-xs leading-tight font-semibold">
        {p.side === 'no' ? 'Not: ' : ''}
        {p.title}
      </span>
      <span className="mt-auto flex items-baseline gap-1.5">
        {p.chance === null ? (
          <Num className="text-[26px]">—</Num>
        ) : (
          <Num className="text-[26px]" unit="%" title={pct(p.chance)}>
            {Math.round(p.chance * 100)}
          </Num>
        )}
        {profit && (
          <span
            className={cn(
              'ml-auto text-3xs font-semibold',
              toneOf(profit.dollars),
            )}
          >
            {profitText(profit, display)}
          </span>
        )}
      </span>
      {p.chance !== null && (
        <Meter value={p.chance} segments={16} thin label="Odds" />
      )}
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
      <Num className="text-[22px]">{m.categories ? s.score : pts(s.score)}</Num>
    </span>
  )
  return (
    <>
      <span className={cn('flex items-center gap-1.5 truncate', LABEL)}>
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
        'flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-2xs font-semibold whitespace-nowrap tabular-nums',
        CHIP,
        here && CHIP_ON,
      )}
    >
      <TeamLogo team={g.awayTeam} size={14} />
      <span>
        {final
          ? `${g.awayTeam.abbreviation} ${g.score.away} · ${g.homeTeam.abbreviation} ${g.score.home}`
          : `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`}
      </span>
      <TeamLogo team={g.homeTeam} size={14} />
      <span className={cn('font-label', here ? 'opacity-75' : 'text-muted')}>
        {gameStatusLabel(g, timeZone)}
      </span>
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
  /** Open it in full; none when it's already open (the wide pane). */
  onOpen?: () => void
  onClear: () => void
}) {
  return (
    <div
      role="status"
      data-narrowed=""
      className="well mb-3 flex items-center gap-2 rounded-card py-1.5 pr-1.5 pl-3"
    >
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">
        <span className={LABEL}>Showing </span>
        {pageName(page)}
      </span>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className={cn(KEY, 'h-9 shrink-0 px-2.5')}
        >
          {openLabel(page)} ›
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label="Show everything"
        className={cn(KEY, 'size-9 shrink-0 px-0 text-sm')}
      >
        ✕
      </button>
    </div>
  )
}

/**
 * The top of every tab on a phone: one panel with a label row (a pulsing
 * light while something is live, the tab's context in the label face),
 * the tab's headline as the one dot numeral (live Games, the portfolio's
 * worth, the Matchup's score), and a line or a control under it (under
 * All, the League row). The same shape on every tab.
 */
export function TabHero({
  icon,
  kicker,
  figure,
  aside,
  live = false,
  children,
}: {
  icon: IconName
  /** No longer drawn: Signal's heroes are ink, not the tab's color. */
  tone?: string
  kicker: string
  /** The headline: "4 live", "$37.80", "5–3–1". */
  figure: string
  /** Beside the headline, smaller: "8 games", "+$22.40", "leading GG". */
  aside?: React.ReactNode
  /** Something in it is live now: the label row's light pulses. */
  live?: boolean
  /** Under it: a line, or a control (the League row). */
  children?: React.ReactNode
}) {
  return (
    <section
      aria-label={kicker}
      data-tab-hero=""
      className="mb-3 flex flex-col gap-3 rounded-card border border-border bg-surface px-4 pt-3.5 pb-4"
    >
      <span className={cn('flex items-center gap-2', LABEL)}>
        {live ? (
          <span aria-hidden="true" className={LED_LIVE} />
        ) : (
          <NavGlyph name={icon} className="size-3.5" />
        )}
        <span className="truncate">{kicker}</span>
      </span>
      <span className="flex min-w-0 items-baseline gap-3">
        <HeroFigure figure={figure} />
        {aside && (
          <span className="min-w-0 truncate text-sm font-semibold text-muted">
            {aside}
          </span>
        )}
      </span>
      {children}
    </section>
  )
}

/**
 * The headline in dots: its figure ("4", "$37.80", "88.4–71.2"), and any
 * words after it ("live", "of 3") small beside it in the label face.
 */
function HeroFigure({ figure }: { figure: string }) {
  const [, digits, words] = /^([^a-z]*?\d[^a-z ]*)(.*)$/i.exec(figure) ?? [
    '',
    '',
    figure,
  ]
  if (!digits) {
    return (
      <span className="text-3xl leading-none font-bold tracking-tight whitespace-nowrap">
        {figure}
      </span>
    )
  }
  return (
    <span className="whitespace-nowrap">
      <Num className="text-[56px]">{digits}</Num>
      {words.trim() && (
        <>
          {' '}
          <span className="ml-1 font-label text-sm font-bold text-muted uppercase">
            {words.trim()}
          </span>
        </>
      )}
    </span>
  )
}

type HeroTab = 'following' | 'all' | 'predictions' | 'fantasy'

/** Each tab's icon, as the main navigation draws it. */
const HERO_LOOK: Record<HeroTab, { icon: IconName }> = {
  following: { icon: 'follows' },
  all: { icon: 'all' },
  predictions: { icon: 'predictions' },
  fantasy: { icon: 'fantasy' },
}

/** A tab's headline, in words and figures, for its hero and pinned bar. */
export function heroHeadline({
  tab,
  games,
  predictions,
  leagues,
  display = 'dollars',
  allKicker,
}: {
  tab: HeroTab
  /** The tab's Games (the board's, under Following and All). */
  games: ReadonlyArray<GameSummary>
  predictions: ReadonlyArray<PredictionView>
  leagues: ReadonlyArray<FantasyLeagueView>
  display?: ChangeDisplay
  /** All's kicker: "Tonight", or the League's name. */
  allKicker: string
}): {
  kicker: string
  figure: string
  aside: string | null
  /** The aside's color class, for money up or down. */
  asideTone?: string
  line: string | null
  /** A Game in it is live now (its light pulses). */
  live?: boolean
} {
  if (tab === 'predictions') {
    const totals = portfolioTotals(predictions)
    return {
      kicker: 'Predictions',
      figure: money(totals.profit ? totals.cashout : totals.staked),
      aside: totals.profit ? profitText(totals.profit, display) : 'staked',
      asideTone: totals.profit ? toneOf(totals.profit.dollars) : undefined,
      line: `${predictions.length} open · staked ${money(totals.staked)}`,
    }
  }
  if (tab === 'fantasy') {
    const one = leagues.length === 1 ? leagues[0].matchup! : null
    if (one) {
      const theirs = one.opponent
      const lead = theirs ? one.mine.score - theirs.score : 0
      return {
        kicker: 'Fantasy',
        figure: one.categories
          ? sideRecord(one, 'mine')
          : `${pts(one.mine.score)}–${theirs ? pts(theirs.score) : '—'}`,
        aside: theirs
          ? `${lead > 0 ? 'leading' : lead < 0 ? 'trailing' : 'tied with'} ${theirs.abbrev}`
          : 'bye week',
        line: one.leagueName,
      }
    }
    const leading = leagues.filter(
      (l) => l.matchup!.mine.score > (l.matchup!.opponent?.score ?? Infinity),
    ).length
    return {
      kicker: 'Fantasy',
      figure: `${leading} of ${leagues.length}`,
      aside: 'leading',
      line: null,
    }
  }
  const live = games.filter(isLiveGame)
  const count = `${games.length} game${games.length === 1 ? '' : 's'}`
  return {
    kicker: tab === 'following' ? 'Following' : allKicker,
    figure: live.length > 0 ? `${live.length} live` : count,
    aside: live.length > 0 ? count : null,
    live: live.length > 0,
    line:
      tab === 'following' && live.length > 0
        ? live
            .slice(0, 2)
            .map(
              (g) =>
                `${g.awayTeam.abbreviation} ${g.score.away}–${g.score.home} ${g.homeTeam.abbreviation}`,
            )
            .join(' · ')
        : null,
  }
}

/** A tab's hero, from its headline (heroHeadline). */
export function ScopeHero({
  tab,
  headline: h,
  children,
}: {
  tab: HeroTab
  headline: ReturnType<typeof heroHeadline>
  /** Under the headline instead of its line: a control (the League row). */
  children?: React.ReactNode
}) {
  return (
    <TabHero
      {...HERO_LOOK[tab]}
      kicker={h.kicker}
      figure={h.figure}
      live={h.live}
      aside={h.aside && <span className={h.asideTone}>{h.aside}</span>}
    >
      {children ??
        (h.line && <span className={cn('truncate', LABEL)}>{h.line}</span>)}
    </TabHero>
  )
}

/** The pinned bar's first item: the tab and its headline, in its color. */
export function HeroLead({
  tab,
  headline: h,
}: {
  tab: HeroTab
  headline: ReturnType<typeof heroHeadline>
}) {
  const look = HERO_LOOK[tab]
  return (
    <span className="flex items-center gap-1.5 text-2xs font-bold whitespace-nowrap tabular-nums">
      {h.live ? (
        <span aria-hidden="true" className={LED_LIVE} />
      ) : (
        <NavGlyph name={look.icon} className="size-3.5 text-muted" />
      )}
      <span className={LABEL}>{h.kicker}</span>
      <span>{h.figure}</span>
    </span>
  )
}

/**
 * The board's scores, pinned under the Timeline's header once the board
 * has scrolled away: what's live (or, with nothing live, the tab's
 * Games), the one narrowed to marked.
 */
export function LiveTicker({
  lead,
  games,
  current,
  onPick,
}: {
  /** First, the tab and its headline, so the pinned bar says where you are. */
  lead?: React.ReactNode
  games: ReadonlyArray<GameSummary>
  /** The current page's key (currentPageKey). */
  current: string
  onPick: (g: GameSummary) => void
}) {
  const timeZone = useTimeZone()
  const live = games.filter(isLiveGame)
  const shown = live.length > 0 ? live : games
  if (shown.length === 0 && !lead) return null
  return (
    <ul
      aria-label="Scores"
      data-no-swipe=""
      className="flex items-center gap-1 overflow-x-auto overscroll-x-contain px-4 py-1.5 [scrollbar-width:none]"
    >
      {lead && <li className="shrink-0 pr-1">{lead}</li>}
      {shown.map((g) => (
        <li key={g.id} className="shrink-0">
          <button
            type="button"
            onClick={() => onPick(g)}
            aria-current={current === `game:${g.id}` ? 'true' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-control px-2 py-1 text-2xs font-bold whitespace-nowrap tabular-nums',
              CHIP,
              current === `game:${g.id}` && CHIP_ON,
            )}
          >
            <TeamLogo team={g.awayTeam} size={16} />
            {isLiveGame(g) || g.status === 'final'
              ? `${g.score.away}–${g.score.home}`
              : `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`}
            <TeamLogo team={g.homeTeam} size={16} />
            <span
              className={cn(
                'font-label font-normal',
                current === `game:${g.id}`
                  ? 'opacity-75'
                  : isLiveGame(g)
                    ? 'text-live'
                    : 'text-muted',
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
      className={cn(SEGMENTS, 'mb-3 self-start')}
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
            SEGMENT,
            'min-h-8 px-3 text-3xs font-bold uppercase',
            mine === o.value && SEGMENT_ON,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
