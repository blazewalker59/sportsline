/**
 * A Fantasy league's page (CONTEXT.md, "Fantasy league"), in tabs: its
 * Overview (the Viewer's Matchup this scoring period, opening in full, and
 * the league's Scoring leaders) and its Standings, kept with each sync,
 * and its Activity, read from its provider while that tab is open.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ActivityFeed } from './ActivityFeed'
import { MatchupSheet } from './FantasyParts'
import { headshotOf, pts, scoreText, sideRecord } from './format'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LeaderPlayer, ScoringLeaders } from '@/lib/fantasy/leaders'
import type { FantasySport } from '@/lib/fantasy/sports'
import type { Standings } from '@/lib/fantasy/standings'
import { AppHeader } from '@/components/layout/AppHeader'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { leagueActivityQuery } from '@/lib/fantasy/queries'
import { SPORTS } from '@/lib/fantasy/sports'
import { useFantasyLeague } from '@/lib/fantasy/useFantasy'
import { gamesQuery } from '@/lib/timeline/queries'
import { useToday } from '@/lib/timeline/useToday'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'standings' | 'activity'

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'standings', label: 'Standings' },
  { key: 'activity', label: 'Activity' },
]

export function LeagueScreen({ leagueId }: { leagueId: string }) {
  const { data: viewerState, isPending } = useViewer()
  const page = useFantasyLeague(leagueId)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const league = page.data?.league
  // Today's Games, for each Player's game state in the Matchup sheet.
  const today = useToday()
  const games = useQuery({
    ...gamesQuery(today),
    enabled: open,
    refetchInterval: 30_000,
  })
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      <Link
        to="/fantasy"
        className="mb-3 inline-block text-sm font-semibold text-accent"
      >
        ← Fantasy
      </Link>
      {isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to see your fantasy leagues.
        </p>
      ) : page.isPending ? (
        <p className="mt-16 text-center text-sm text-muted">Loading…</p>
      ) : !league ? (
        <p className="mt-16 text-center text-sm text-muted">
          League not found.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <LeagueLogo league={SPORTS[league.sport].league} size={28} />
            <span className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold tracking-tight">
                {league.name}
              </h1>
              <span
                className={cn(
                  'block truncate text-xs',
                  league.lastError ? 'text-live' : 'text-muted',
                )}
              >
                {league.lastError ??
                  [
                    league.teamName,
                    league.provider === 'sleeper' ? 'Sleeper' : 'ESPN',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
              </span>
            </span>
          </header>
          <div
            role="tablist"
            aria-label="League"
            className="flex gap-1 rounded-full bg-notice p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'min-h-9 flex-1 rounded-full text-sm font-semibold transition-colors',
                  tab === t.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'overview' ? (
            <>
              {league.matchup && (
                <ThisMatchup league={league} onOpen={() => setOpen(true)} />
              )}
              {page.data?.leaders ? (
                <LeadersView sport={league.sport} leaders={page.data.leaders} />
              ) : (
                <p className="text-sm text-muted">
                  Scoring leaders show after the league’s next sync.
                </p>
              )}
            </>
          ) : tab === 'activity' ? (
            <ActivityTab league={league} />
          ) : page.data?.standings ? (
            <StandingsTable standings={page.data.standings} />
          ) : (
            <p className="text-sm text-muted">
              Standings show after the league’s next sync.
            </p>
          )}
          {open && league.matchup && (
            <MatchupSheet
              league={league}
              games={games.data ?? []}
              leagueLink={false}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** The league's Activity, read from its provider while the tab is open. */
function ActivityTab({ league }: { league: FantasyLeagueView }) {
  const activity = useQuery(leagueActivityQuery(league.id))
  const timeZone = useTimeZone()
  if (activity.isPending)
    return <p className="text-sm text-muted">Loading activity…</p>
  if (activity.isError)
    return <p className="text-sm text-live">{activity.error.message}</p>
  if (!activity.data)
    return <p className="text-sm text-muted">League not found.</p>
  return (
    <ActivityFeed
      sport={league.sport}
      activity={activity.data}
      mine={league.matchup?.mine.teamId ?? null}
      timeZone={timeZone}
    />
  )
}

/** The Viewer's Matchup as a scoreboard row that opens it in full. */
function ThisMatchup({
  league,
  onOpen,
}: {
  league: FantasyLeagueView
  onOpen: () => void
}) {
  const m = league.matchup!
  const score = (side: 'mine' | 'opponent') =>
    m.categories
      ? sideRecord(m, side)
      : scoreText(m, (side === 'mine' ? m.mine : m.opponent)?.score ?? null)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:bg-notice"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">This matchup</span>
        <span className="block truncate text-sm font-semibold">
          {m.mine.name}
          <span className="font-normal text-muted">
            {m.opponent ? ` vs ${m.opponent.name}` : ' · Bye week'}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {score('mine')}
        {m.opponent && (
          <>
            <span className="font-normal text-muted"> – </span>
            {score('opponent')}
          </>
        )}
      </span>
    </button>
  )
}

/**
 * The league's Scoring leaders: its top Players and every team's score
 * (points leagues), or each counting Category's leader today. Football's
 * scoring period is the week; the other sports' is the day.
 */
export function LeadersView({
  sport,
  leaders,
}: {
  sport: FantasySport
  leaders: ScoringLeaders
}) {
  const when = sport === 'football' ? 'this week' : 'today'
  const heading = 'mb-2 text-xs font-bold tracking-wide text-muted uppercase'
  const list =
    'divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface'
  if (leaders.categories.length > 0)
    return (
      <section>
        <h2 className={heading}>Category leaders {when}</h2>
        <ul className={list}>
          {leaders.categories.map((c) => (
            <li
              key={c.statId}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2',
                c.player.mine && 'bg-notice',
              )}
            >
              <span className="w-10 shrink-0 text-xs font-bold text-muted">
                {c.label}
              </span>
              <LeaderName sport={sport} p={c.player} />
              <span className="shrink-0 text-sm font-bold tabular-nums">
                {c.value}
              </span>
            </li>
          ))}
        </ul>
      </section>
    )
  return (
    <>
      {leaders.players.length > 0 && (
        <section>
          <h2 className={heading}>Top scorers {when}</h2>
          <ol className={list}>
            {leaders.players.map((p, i) => (
              <li
                key={`${p.fantasyTeamId}-${p.espnId}`}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2',
                  p.mine && 'bg-notice',
                )}
              >
                <span className="w-4 shrink-0 text-xs text-muted tabular-nums">
                  {i + 1}
                </span>
                <LeaderName sport={sport} p={p} />
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {pts(p.points)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {leaders.teams.length > 0 && (
        <section>
          <h2 className={heading}>Team scores this matchup</h2>
          <ol className={list}>
            {leaders.teams.map((t, i) => (
              <li
                key={t.teamId}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 text-sm',
                  t.mine && 'bg-notice font-semibold',
                )}
              >
                <span className="w-4 shrink-0 text-xs text-muted tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="shrink-0 font-bold tabular-nums">
                  {pts(t.score)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}

/** A leader's headshot and name, with their Team and Fantasy team. */
function LeaderName({ sport, p }: { sport: FantasySport; p: LeaderPlayer }) {
  return (
    <>
      <PlayerAvatar
        name={p.name}
        headshotUrl={headshotOf(sport, p)}
        size={28}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.name}</span>
        <span className="block truncate text-[11px] text-muted">
          {[p.teamAbbrev, p.fantasyTeam, p.starter ? null : 'bench']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </>
  )
}

/**
 * Every team first to last: record, points for and against (points
 * leagues) and streak, the Viewer's team marked, and a line under the
 * last playoff place.
 */
export function StandingsTable({ standings }: { standings: Standings }) {
  const points = standings.rows.some((r) => r.pointsFor !== null)
  const ties = standings.rows.some((r) => r.ties > 0)
  const cut = standings.playoffTeams
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm whitespace-nowrap tabular-nums">
        <thead className="text-[11px] text-muted uppercase">
          <tr className="border-b border-border">
            <th className="py-2 pr-1 pl-3 text-left font-semibold">#</th>
            <th className="px-1 text-left font-semibold">Team</th>
            <th className="px-1 text-right font-semibold">
              {ties ? 'W-L-T' : 'W-L'}
            </th>
            {points && (
              <>
                <th className="px-1 text-right font-semibold">PF</th>
                <th className="px-1 text-right font-semibold">PA</th>
              </>
            )}
            <th className="pr-3 pl-1 text-right font-semibold">Strk</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r) => (
            <tr
              key={r.teamId}
              aria-current={r.mine || undefined}
              className={cn(
                'border-b border-border last:border-b-0',
                r.mine && 'bg-notice font-semibold',
                cut !== null &&
                  r.rank === cut &&
                  r.rank < standings.rows.length &&
                  'border-b-2 border-b-muted/50',
              )}
            >
              <td className="py-2 pr-1 pl-3 text-muted">{r.rank}</td>
              <td className="max-w-40 truncate px-1">{r.name}</td>
              <td className="px-1 text-right">
                {r.wins}-{r.losses}
                {ties && `-${r.ties}`}
              </td>
              {points && (
                <>
                  <td className="px-1 text-right">
                    {r.pointsFor?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-1 text-right text-muted">
                    {r.pointsAgainst?.toFixed(1) ?? '—'}
                  </td>
                </>
              )}
              <td
                className={cn(
                  'pr-3 pl-1 text-right',
                  r.streak?.startsWith('W')
                    ? 'text-scoring'
                    : r.streak?.startsWith('L')
                      ? 'text-live'
                      : 'text-muted',
                )}
              >
                {r.streak ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cut !== null && cut < standings.rows.length && (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
          Top {cut} make the playoffs.
        </p>
      )}
    </div>
  )
}
