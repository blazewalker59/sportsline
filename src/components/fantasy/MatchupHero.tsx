/**
 * A Matchup as Signal's hero (CONTEXT.md, "Matchup"): a label row (the
 * league, its provider and period, a pulsing light while the Viewer has
 * Starters in play), both sides' scores as two dot numerals facing each
 * other, and a meter under them: the Viewer's points against their
 * projection (or, without one, their share of the points or categories),
 * with a label row beneath it.
 */

import { pts, scoreText } from './format'
import { gameState } from './gameState'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { MatchupView } from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'
import { Meter } from '@/components/signal/Meter'
import { Num } from '@/components/signal/Num'
import { SPORTS } from '@/lib/fantasy/sports'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { cn } from '@/lib/utils'

/** "Week 12" (football) or "Matchup 6". */
export function periodLabel(m: Pick<MatchupView, 'sport' | 'matchupPeriod'>) {
  return `${m.sport === 'football' ? 'Week' : 'Matchup'} ${m.matchupPeriod}`
}

/**
 * The Viewer's Starters whose Game is live now, and those whose Game is
 * still to come, from the Games we have.
 */
export function startersInPlay(
  m: MatchupView,
  games: ReadonlyArray<GameSummary>,
  timeZone: string | null,
): { live: number; toGo: number } {
  let live = 0
  let toGo = 0
  for (const p of m.mine.lineup) {
    if (!p.starter) continue
    const state = gameState(p, games, timeZone)
    if (state?.live) live += 1
    else if (state?.upcoming) toGo += 1
  }
  return { live, toGo }
}

/** The meter's share and what its label row says at each end. */
function meterReading(m: MatchupView, own: boolean) {
  const mine = m.mine.score
  const theirs = m.opponent?.score ?? 0
  if (!m.categories && m.mine.projected !== null && m.mine.projected > 0)
    return {
      value: mine / m.mine.projected,
      label: `${own ? 'Your' : `${m.mine.name}’s`} points against the projection`,
      left: `Projected ${pts(m.mine.projected)}`,
      right: m.opponent?.projected != null ? pts(m.opponent.projected) : '',
    }
  const total = mine + theirs + (m.categories ? (m.ties ?? 0) : 0)
  return {
    value: total > 0 ? mine / total : 0.5,
    label: m.categories
      ? `${m.mine.name}’s share of the categories`
      : `${m.mine.name}’s share of the points`,
    left: m.mine.abbrev,
    right: m.opponent?.abbrev ?? '',
  }
}

/**
 * Both sides' scores in dots and the meter, framed by whoever holds it
 * (the hero's panel, or the Matchup sheet's pinned header).
 */
export function MatchupScoreboard({
  m,
  own,
  inPlay,
  names,
  compact = false,
}: {
  m: MatchupView
  /** The Viewer's own Matchup: their side may light up. */
  own: boolean
  /** The Viewer's Starters in play and to go, when known. */
  inPlay?: { live: number; toGo: number }
  /** Each side's name, as its holder draws it (the sheet's in the Subject's ink). */
  names?: { mine: React.ReactNode; opponent: React.ReactNode }
  /** Smaller numerals, for a pinned header. */
  compact?: boolean
}) {
  const theirs = m.opponent
  const leading = theirs !== null && m.mine.score > theirs.score
  const reading = meterReading(m, own)
  const size = compact ? 'text-[34px]' : 'text-[44px]'
  const middle = m.categories
    ? `${m.mine.score}–${theirs?.score ?? 0}${m.ties ? `–${m.ties}` : ''} categories`
    : inPlay && (inPlay.live > 0 || inPlay.toGo > 0)
      ? [
          inPlay.live > 0 && `${inPlay.live} in play`,
          inPlay.toGo > 0 && `${inPlay.toGo} to go`,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end">
        <div className="min-w-0">
          <div className="truncate text-3xs text-muted uppercase">
            {names?.mine ?? m.mine.name}
            {own && ' · you'}
          </div>
          {m.mine.record && (
            <div className="text-3xs text-muted tabular-nums">
              {m.mine.record}
            </div>
          )}
          <Num
            className={cn(
              'mt-1.5 block',
              size,
              own && leading && 'text-scoring',
            )}
          >
            {scoreText(m, m.mine.score)}
          </Num>
        </div>
        <span className="px-1.5 pb-2 text-3xs text-muted uppercase">vs</span>
        <div className="min-w-0 text-right">
          {theirs ? (
            <>
              <div className="truncate text-3xs text-muted uppercase">
                {names?.opponent ?? theirs.name}
              </div>
              {theirs.record && (
                <div className="text-3xs text-muted tabular-nums">
                  {theirs.record}
                </div>
              )}
              <Num className={cn('mt-1.5 block', size)}>
                {scoreText(m, theirs.score)}
              </Num>
            </>
          ) : (
            <span className="block pb-2 text-3xs text-muted uppercase">
              Bye week
            </span>
          )}
        </div>
      </div>
      {theirs && (
        <>
          <Meter
            value={reading.value}
            label={reading.label}
            thin={compact}
            className={compact ? 'mt-2.5' : 'mt-3.5'}
          />
          <div className="mt-1.5 flex justify-between gap-2 text-3xs text-muted tabular-nums uppercase">
            <span className="truncate">{reading.left}</span>
            {middle && <span className="truncate">{middle}</span>}
            <span className="truncate">{reading.right}</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The Viewer's Matchup in a league as the screen's hero: a panel that
 * opens the Matchup in full.
 */
export function MatchupHero({
  league,
  games = [],
  onOpen,
  showLeague = true,
}: {
  league: FantasyLeagueView
  games?: ReadonlyArray<GameSummary>
  onOpen: () => void
  /** Name the league in the label row (not on its own page). */
  showLeague?: boolean
}) {
  const timeZone = useTimeZone()
  const m = league.matchup!
  const inPlay = startersInPlay(m, games, timeZone)
  const source = league.provider === 'sleeper' ? 'Sleeper' : 'ESPN'
  const theirs = m.opponent
  return (
    <button
      type="button"
      onClick={onOpen}
      data-matchup-hero=""
      aria-label={
        theirs
          ? `${league.name}: ${m.mine.name} ${scoreText(m, m.mine.score)}, ${theirs.name} ${scoreText(m, theirs.score)}. Open the matchup`
          : `${league.name}: ${m.mine.name}, bye week. Open the matchup`
      }
      className="panel flex w-full flex-col rounded-card bg-surface p-4 text-left"
    >
      <span className="mb-3.5 flex w-full items-center justify-between gap-2 text-3xs text-muted uppercase">
        <span className="flex min-w-0 items-center gap-2">
          {inPlay.live > 0 && (
            <span className="led led-pulse" aria-hidden="true" />
          )}
          <span className="truncate">
            {showLeague
              ? `${league.name} · ${source} ${SPORTS[m.sport].league}`
              : `${source} ${SPORTS[m.sport].league}`}
          </span>
        </span>
        <span className="shrink-0">{periodLabel(m)}</span>
      </span>
      <span className="block w-full">
        <MatchupScoreboard m={m} own inPlay={inPlay} />
      </span>
    </button>
  )
}
