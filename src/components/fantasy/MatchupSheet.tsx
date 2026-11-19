/**
 * A Fantasy Matchup in full (CONTEXT.md, "Matchup"): both sides' scores,
 * the categories in a category league (or the race in a points league),
 * and both Lineups. A category Matchup steps through its days: the
 * categories show the Matchup's totals or, toggled, the day's, and the
 * Lineups are that day's. Another Matchup in the league ("League
 * Matchups") opens the same way, read when it opens, without the race
 * (only the Viewer's own is recorded). Where the Timeline's cards (and
 * the League Matchups under them) aren't shown, on a phone, the sheet
 * lists the league's Matchups itself, to move between them.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { CategoryBars } from './CategoryBars'
import { CategoryLineup } from './CategoryLineup'
import { LineupRows } from './Lineup'
import { MatchupDays } from './MatchupDays'
import { dayLabel, daySportsDay, pts, scoreText, sideRecord } from './format'
import type { MatchupPart } from './MatchupDays'
import type { CategoryDay } from './CategoryBars'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type {
  LeagueMatchup,
  LeagueMatchupSide,
  LineupPlayer,
  MatchupSide,
  MatchupView,
} from '@/lib/fantasy/matchup'
import type { GameSummary } from '@/lib/model/timeline'
import type { SheetFrame } from '@/components/chat/Sheet'
import { MatchupRace } from '@/components/charts/lazy'
import { Sheet } from '@/components/chat/Sheet'
import { InlineError } from '@/components/layout/RouteStates'
import { RowsSkeleton } from '@/components/layout/Skeleton'
import {
  leagueMatchupQuery,
  matchupDayQuery,
  matchupGamesQuery,
} from '@/lib/fantasy/queries'
import { matchupColors, matchupSubject } from '@/lib/brand/subject'
import { SPORTS } from '@/lib/fantasy/sports'
import { cn } from '@/lib/utils'

/**
 * Another Matchup's scoreboard as a Matchup with no Lineups yet, so its
 * sheet opens on the scores while the rest is read.
 */
function previewOf(own: MatchupView, other: LeagueMatchup): MatchupView {
  const side = (s: LeagueMatchupSide): MatchupSide => ({
    ...s,
    projected: null,
    lineup: [],
  })
  return {
    ...own,
    mine: side(other.left),
    opponent: other.right ? side(other.right) : null,
    categories: own.categories ? [] : null,
    ties: other.ties,
    today: null,
  }
}

/** A Matchup in full, as a bottom sheet (MatchupDetail). */
export function MatchupSheet({
  onClose,
  ...props
}: Omit<MatchupDetailProps, 'frame'> & { onClose: () => void }) {
  return (
    <MatchupDetail
      {...props}
      frame={(parts) => <Sheet {...parts} onClose={onClose} />}
    />
  )
}

interface MatchupDetailProps {
  league: FantasyLeagueView
  /** Another Matchup in the league, in place of the Viewer's. */
  other?: LeagueMatchup
  /** Today's Games, for each Player's game state. */
  games?: ReadonlyArray<GameSummary>
  /** Link to the league's page (not when it's open there). */
  leagueLink?: boolean
  /** Lays it out: a Sheet, or the wide Timeline's pane. */
  frame: SheetFrame
  /**
   * List the league's Matchups at the end, each opening in this one's
   * place (undefined: the Viewer's own). Left out, it isn't listed.
   */
  onOther?: (other: LeagueMatchup | undefined) => void
}

/**
 * A Matchup in full: the score pinned, then the categories or the race,
 * and both Lineups, in whichever frame holds it.
 */
export function MatchupDetail({
  league,
  other,
  games = [],
  leagueLink = true,
  frame,
  onOther,
}: MatchupDetailProps) {
  const otherTeam = other?.left.teamId
  const read = useQuery({
    ...leagueMatchupQuery(league.id, otherTeam ?? 0),
    enabled: otherTeam !== undefined,
  })
  // The Viewer's own Matchup, or the other one once it's read.
  const m =
    other === undefined
      ? league.matchup!
      : (read.data ?? previewOf(league.matchup!, other))
  const reading = other !== undefined && !read.data
  const source = league.provider === 'sleeper' ? 'Sleeper' : 'ESPN Fantasy'
  // Every Lineup Team's Game this matchup (a Thursday Final, a Monday
  // night kickoff), behind today's live ones.
  const lineup = [...m.mine.lineup, ...(m.opponent?.lineup ?? [])]
  const teamIds = [
    ...new Set(lineup.flatMap((p) => (p.teamId ? [p.teamId] : []))),
  ]
  const abbrevs = [
    ...new Set(lineup.flatMap((p) => (p.teamAbbrev ? [p.teamAbbrev] : []))),
  ]
  // Only the Matchup's sport: today's Games span every League, and a
  // Celtic off tonight would otherwise match the Bruins' "BOS".
  const sportLeague = SPORTS[m.sport].league
  const week = useQuery({
    ...matchupGamesQuery(league.id, sportLeague, teamIds, abbrevs),
    enabled: !reading,
  })
  const allGames = useMemo(
    () =>
      [...games, ...(week.data ?? [])].filter((g) => g.league === sportLeague),
    [games, week.data, sportLeague],
  )
  const byeWeeks = m.sport === 'football' && week.isSuccess
  // Every day of the Matchup (a category league), first to last: today
  // among them even before the first (ESPN's preseason day 0).
  const days = [...new Set([...(m.days ?? []), m.scoringPeriod])].sort(
    (a, b) => a - b,
  )
  const [part, setPart] = useState<MatchupPart>(m.scoringPeriod)
  const summary = part === 'summary'
  // The day in view; the summary keeps today's Games and lookups.
  const day = summary ? m.scoringPeriod : part
  const today = day === m.scoringPeriod
  const past = useQuery({
    ...matchupDayQuery(league.id, day, m.scoringPeriod, otherTeam),
    enabled: !today && !summary && !reading,
  })
  const label = dayLabel(m, day)
  const categoryDay: CategoryDay | undefined = summary
    ? undefined
    : today
      ? m.today
        ? { label, categories: m.today }
        : undefined
      : { label, categories: past.data?.categories ?? null }
  const lineups: { mine: Array<LineupPlayer>; theirs: Array<LineupPlayer> } =
    summary
      ? { mine: m.mine.summary ?? [], theirs: m.opponent?.summary ?? [] }
      : today
        ? { mine: m.mine.lineup, theirs: m.opponent?.lineup ?? [] }
        : { mine: past.data?.mine ?? [], theirs: past.data?.opponent ?? [] }
  const starters = (l: Array<LineupPlayer>) => l.filter((p) => p.starter)
  const bench = (l: Array<LineupPlayer>) => l.filter((p) => !p.starter)
  // Each Player's Game that day: today's and the days ahead are loaded.
  // Football's is the week's; elsewhere only that day's, so a Player off
  // today shows no Game rather than their next one.
  const sportsDay = daySportsDay(m, day)
  const dayGames = summary
    ? []
    : m.sport === 'football' && today
      ? allGames
      : allGames.filter((g) => g.sportsDay === sportsDay)
  // The Viewer's side in the accent, every other manager in their hue:
  // the crown, the names, the bars and the race all agree.
  const colors = matchupColors(
    m.mine.teamId,
    m.opponent?.teamId ?? null,
    other === undefined,
  )
  const side = (s: MatchupSide, align: 'left' | 'right') => (
    <span
      className={cn(
        'flex min-w-0 flex-1 flex-col',
        align === 'right' && 'subject-b items-end text-right',
      )}
    >
      <span className="subject-ink truncate text-sm font-semibold">
        {s.name}
      </span>
      {s.record && <span className="text-2xs text-muted">{s.record}</span>}
      <span className="text-3xl leading-tight font-bold tabular-nums">
        {m.categories
          ? sideRecord(m, align === 'left' ? 'mine' : 'opponent')
          : scoreText(m, s.score)}
      </span>
      {s.projected !== null && (
        <span className="text-xs text-muted tabular-nums">
          proj {pts(s.projected)}
        </span>
      )}
    </span>
  )
  return frame({
    title: m.leagueName,
    action: leagueLink && (
      <Link
        to="/fantasy/$leagueId"
        params={{ leagueId: league.id }}
        className="shrink-0 text-[13px] font-semibold text-muted hover:text-foreground"
      >
        League ›
      </Link>
    ),
    subject: matchupSubject(colors),
    // The score stays in view however far down the Lineups go.
    pinned: (
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
    ),
    children: (
      <div
        // The charts read each side's color from here (CHART_COLORS).
        className="contents [&>*]:shrink-0"
        style={
          {
            '--matchup-left': colors.left,
            ...(colors.right && { '--matchup-right': colors.right }),
          } as React.CSSProperties
        }
      >
        {m.categories && !reading && (
          <MatchupDays
            m={m}
            days={days}
            part={part}
            onPart={setPart}
            summary={m.mine.summary != null}
          />
        )}
        {m.categories && m.categories.length > 0 ? (
          <CategoryBars m={m} categories={m.categories} day={categoryDay} />
        ) : (
          other === undefined && <MatchupRace leagueId={league.id} m={m} />
        )}
        {reading ? (
          read.isError ? (
            <InlineError
              what="this matchup"
              error={read.error}
              onRetry={() => read.refetch()}
            />
          ) : read.isSuccess ? (
            <p className="rounded-card border border-border bg-surface px-3 py-4 text-center text-sm text-muted">
              This matchup isn’t in the league’s schedule any more.
            </p>
          ) : (
            <RowsSkeleton rows={9} label="Loading lineups" />
          )
        ) : !today && !summary && !past.data ? (
          past.isError ? (
            <InlineError
              what="that day’s lineups"
              error={past.error}
              onRetry={() => past.refetch()}
            />
          ) : (
            <RowsSkeleton
              rows={9}
              label={`Loading ${label === 'Yesterday' || label === 'Tomorrow' ? label.toLowerCase() : label}’s lineups`}
            />
          )
        ) : m.categories ? (
          <CategoryLineup
            sport={m.sport}
            categories={m.categories}
            mine={m.mine}
            opponent={m.opponent}
            lineups={lineups}
            games={dayGames}
            knowsGames={!summary && day >= m.scoringPeriod && week.isSuccess}
            summary={summary}
          />
        ) : (
          <>
            <section>
              <h3 className="subject-ink mb-2 text-xs font-bold tracking-wide text-muted uppercase">
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
              <h3 className="subject-ink mb-2 text-xs font-bold tracking-wide text-muted uppercase">
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
        {onOther && (league.matchup?.others?.length ?? 0) > 0 && (
          <LeagueMatchupList
            own={league.matchup!}
            current={otherTeam}
            onOpen={onOther}
          />
        )}
        <p className="text-2xs text-muted">
          {m.categories
            ? `Read from ${source}: categories through yesterday plus today’s starters, refreshed every couple of minutes; toggle above the categories between the whole matchup and the day. Step through the matchup’s days with ‹ ›, or tap the day for any day or the whole matchup’s summary; switch sides above the lineup, and scroll it sideways for every category.`
            : `Read from ${source}. Points refresh every couple of minutes; tap a player’s points for the breakdown.`}
        </p>
      </div>
    ),
  })
}

/**
 * The league's Matchups this period ("League Matchups"), the Viewer's
 * first: each opens in the sheet's place; the one showing is marked.
 */
function LeagueMatchupList({
  own,
  current,
  onOpen,
}: {
  own: MatchupView
  /** The other Matchup showing, by its first team; undefined: the Viewer's. */
  current: number | undefined
  onOpen: (other: LeagueMatchup | undefined) => void
}) {
  const row = (
    key: string | number,
    here: boolean,
    left: { abbrev: string; name: string; score: number },
    right: { abbrev: string; name: string; score: number } | null,
    open: () => void,
  ) => {
    const lead =
      !right || left.score === right.score
        ? null
        : left.score > right.score
          ? 'left'
          : 'right'
    return (
      <li key={key}>
        <button
          type="button"
          onClick={open}
          disabled={here}
          aria-current={here ? 'true' : undefined}
          aria-label={
            right
              ? `${left.name} ${scoreText(own, left.score)}, ${right.name} ${scoreText(own, right.score)}`
              : `${left.name}, bye week`
          }
          className={cn(
            'flex w-full items-center gap-2 rounded-card border px-3 py-2 text-sm tabular-nums',
            here
              ? 'border-accent bg-accent-soft'
              : 'border-border bg-surface hover:bg-notice',
          )}
        >
          <span
            className={cn(
              'flex-1 truncate text-left',
              lead === 'left' ? 'font-bold' : 'text-foreground/75',
            )}
          >
            {left.name}
          </span>
          <span className={cn(lead === 'left' && 'font-bold')}>
            {scoreText(own, left.score)}
          </span>
          <span className="text-muted">–</span>
          {right ? (
            <>
              <span className={cn(lead === 'right' && 'font-bold')}>
                {scoreText(own, right.score)}
              </span>
              <span
                className={cn(
                  'flex-1 truncate text-right',
                  lead === 'right' ? 'font-bold' : 'text-foreground/75',
                )}
              >
                {right.name}
              </span>
            </>
          ) : (
            <span className="flex-1 text-right text-muted">Bye</span>
          )}
        </button>
      </li>
    )
  }
  return (
    <section>
      <h3 className="subject-ink mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        League matchups
      </h3>
      <ul className="flex flex-col gap-1.5">
        {row('mine', current === undefined, own.mine, own.opponent, () =>
          onOpen(undefined),
        )}
        {(own.others ?? []).map((o) =>
          row(o.left.teamId, current === o.left.teamId, o.left, o.right, () =>
            onOpen(o),
          ),
        )}
      </ul>
    </section>
  )
}
