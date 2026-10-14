/**
 * A Fantasy Matchup in full (CONTEXT.md, "Matchup"): both sides' scores,
 * the categories in a category league (or the race in a points league),
 * and both Lineups. A category Matchup steps through its days: the
 * categories keep the Matchup's totals with the day's figures under them,
 * and the Lineups are that day's.
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { CategoryBars } from './CategoryBars'
import { LineupRows } from './Lineup'
import { dayLabel, pts, scoreText } from './format'
import type { CategoryDay } from './CategoryBars'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer, MatchupSide } from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'
import { MatchupRace } from '@/components/charts/lazy'
import { Sheet } from '@/components/chat/Sheet'
import { getMatchupGames } from '@/lib/fantasy/schedule'
import { getMatchupDay } from '@/lib/fantasy/server'
import { SPORTS } from '@/lib/fantasy/sports'
import { cn } from '@/lib/utils'

export function MatchupSheet({
  league,
  games = [],
  onClose,
}: {
  league: FantasyLeagueView
  /** Today's Games, for each Player's game state. */
  games?: ReadonlyArray<GameSummary>
  onClose: () => void
}) {
  const m = league.matchup!
  // Every Lineup Team's Game this matchup (a Thursday Final, a Monday
  // night kickoff), behind today's live ones.
  const lineup = [...m.mine.lineup, ...(m.opponent?.lineup ?? [])]
  const teamIds = [
    ...new Set(lineup.flatMap((p) => (p.teamId ? [p.teamId] : []))),
  ]
  const abbrevs = [
    ...new Set(lineup.flatMap((p) => (p.teamAbbrev ? [p.teamAbbrev] : []))),
  ]
  const week = useQuery({
    queryKey: [
      'matchup-games',
      league.id,
      [...teamIds].sort().join(),
      [...abbrevs].sort().join(),
    ],
    queryFn: () =>
      getMatchupGames({
        data: { league: SPORTS[m.sport].league, teamIds, abbrevs },
      }),
    staleTime: 5 * 60_000,
  })
  const allGames = useMemo(
    () => [...games, ...(week.data ?? [])],
    [games, week.data],
  )
  const byeWeeks = m.sport === 'football' && week.isSuccess
  // The Matchup's days so far (a category league), today last.
  const days = m.categories
    ? (m.days ?? [m.scoringPeriod]).filter((d) => d <= m.scoringPeriod)
    : [m.scoringPeriod]
  const [day, setDay] = useState(m.scoringPeriod)
  const today = day === m.scoringPeriod
  const at = days.indexOf(day)
  // An earlier day is final, so it's read once.
  const past = useQuery({
    queryKey: ['matchup-day', league.id, day],
    queryFn: () =>
      getMatchupDay({ data: { leagueId: league.id, scoringPeriod: day } }),
    enabled: !today,
    staleTime: Infinity,
  })
  const label = dayLabel(m, day)
  const categoryDay: CategoryDay | undefined = today
    ? m.today
      ? { label, categories: m.today }
      : undefined
    : { label, categories: past.data?.categories ?? null }
  const lineups: { mine: Array<LineupPlayer>; theirs: Array<LineupPlayer> } =
    today
      ? { mine: m.mine.lineup, theirs: m.opponent?.lineup ?? [] }
      : { mine: past.data?.mine ?? [], theirs: past.data?.opponent ?? [] }
  const starters = (l: Array<LineupPlayer>) => l.filter((p) => p.starter)
  const bench = (l: Array<LineupPlayer>) => l.filter((p) => !p.starter)
  // Today's Games tell each Player's state; an earlier day's are over.
  const dayGames = today ? allGames : []
  const side = (s: MatchupSide, align: 'left' | 'right') => (
    <span
      className={cn(
        'flex min-w-0 flex-1 flex-col',
        align === 'right' && 'items-end text-right',
      )}
    >
      <span className="truncate text-sm font-semibold">{s.name}</span>
      {s.record && <span className="text-[11px] text-muted">{s.record}</span>}
      <span className="text-3xl leading-tight font-bold tabular-nums">
        {scoreText(m, s.score)}
      </span>
      {s.projected !== null && (
        <span className="text-xs text-muted tabular-nums">
          proj {pts(s.projected)}
        </span>
      )}
    </span>
  )
  return (
    <Sheet title={m.leagueName} onClose={onClose}>
      <header className="flex items-start gap-3">
        {side(m.mine, 'left')}
        <span className="pt-6 text-sm text-muted">vs</span>
        {m.opponent ? (
          side(m.opponent, 'right')
        ) : (
          <span className="flex-1 pt-6 text-right text-sm text-muted">
            Bye week
          </span>
        )}
      </header>
      {days.length > 1 && (
        <nav
          aria-label="Matchup day"
          className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
        >
          <button
            type="button"
            aria-label="Previous day"
            disabled={at <= 0}
            onClick={() => setDay(days[at - 1])}
            className="size-9 rounded-lg text-xl leading-none font-semibold hover:bg-notice disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ‹
          </button>
          <span className="flex flex-1 flex-col items-center leading-tight">
            <span className="text-sm font-semibold" aria-live="polite">
              {label}
            </span>
            <span className="text-[10.5px] text-muted tabular-nums">
              Day {at + 1} of {m.days?.length ?? days.length}
            </span>
          </span>
          <button
            type="button"
            aria-label="Next day"
            disabled={at >= days.length - 1}
            onClick={() => setDay(days[at + 1])}
            className="size-9 rounded-lg text-xl leading-none font-semibold hover:bg-notice disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ›
          </button>
        </nav>
      )}
      {m.categories && m.categories.length > 0 ? (
        <CategoryBars m={m} categories={m.categories} day={categoryDay} />
      ) : (
        <MatchupRace leagueId={league.id} m={m} />
      )}
      {!today && !past.data ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-4 text-center text-sm text-muted">
          {past.isError
            ? 'Couldn’t read that day from ESPN.'
            : `Loading ${label === 'Yesterday' ? 'yesterday' : label}’s lineups…`}
        </p>
      ) : (
        <>
          <section>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
              Starters
            </h3>
            <LineupRows
              sport={m.sport}
              mine={starters(lineups.mine)}
              theirs={starters(lineups.theirs)}
              games={dayGames}
              byes={byeWeeks}
            />
          </section>
          <section>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
              Bench
            </h3>
            <LineupRows
              sport={m.sport}
              mine={bench(lineups.mine)}
              theirs={bench(lineups.theirs)}
              games={dayGames}
              byes={byeWeeks}
            />
          </section>
        </>
      )}
      <p className="text-[11px] text-muted">
        {m.categories
          ? 'Read from ESPN Fantasy: categories through yesterday plus today’s starters, refreshed every couple of minutes; the figure under each total is the day’s. Step through the matchup’s days with ‹ ›, and tap a player’s figure for their line that day.'
          : 'Read from ESPN Fantasy. Points refresh every couple of minutes; tap a player’s points for the breakdown.'}
      </p>
    </Sheet>
  )
}
