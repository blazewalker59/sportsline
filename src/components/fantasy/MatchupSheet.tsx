/**
 * A Fantasy Matchup in full (CONTEXT.md, "Matchup"): both sides' scores,
 * the categories in a category league (or the race in a points league),
 * and both Lineups.
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { CategoryBars } from './CategoryBars'
import { LineupRows } from './Lineup'
import { MatchupRace } from './MatchupRace'
import { pts, scoreText } from './format'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { MatchupSide } from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'
import { Sheet } from '@/components/chat/Sheet'
import { getMatchupGames } from '@/lib/fantasy/schedule'
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
  const teamIds = [...m.mine.lineup, ...(m.opponent?.lineup ?? [])].flatMap(
    (p) => (p.teamId ? [p.teamId] : []),
  )
  const week = useQuery({
    queryKey: ['matchup-games', league.id, [...new Set(teamIds)].sort().join()],
    queryFn: () =>
      getMatchupGames({
        data: { league: SPORTS[m.sport].league, teamIds },
      }),
    staleTime: 5 * 60_000,
  })
  const allGames = useMemo(
    () => [...games, ...(week.data ?? [])],
    [games, week.data],
  )
  const byeWeeks = m.sport === 'football' && week.isSuccess
  const starters = (s: MatchupSide | null) =>
    (s?.lineup ?? []).filter((p) => p.starter)
  const bench = (s: MatchupSide | null) =>
    (s?.lineup ?? []).filter((p) => !p.starter)
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
      {m.categories && m.categories.length > 0 ? (
        <CategoryBars m={m} categories={m.categories} />
      ) : (
        <MatchupRace leagueId={league.id} m={m} />
      )}
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Starters
        </h3>
        <LineupRows
          sport={m.sport}
          mine={starters(m.mine)}
          theirs={starters(m.opponent)}
          games={allGames}
          byes={byeWeeks}
        />
      </section>
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Bench
        </h3>
        <LineupRows
          sport={m.sport}
          mine={bench(m.mine)}
          theirs={bench(m.opponent)}
          games={allGames}
          byes={byeWeeks}
        />
      </section>
      <p className="text-[11px] text-muted">
        {m.categories
          ? 'Read from ESPN Fantasy: categories through yesterday plus today’s starters, refreshed every couple of minutes. Tap a player’s figure for their line today.'
          : 'Read from ESPN Fantasy. Points refresh every couple of minutes; tap a player’s points for the breakdown.'}
      </p>
    </Sheet>
  )
}
