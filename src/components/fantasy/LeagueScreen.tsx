/**
 * A Fantasy league's page (CONTEXT.md, "Fantasy league"), in tabs: its
 * Overview (every Matchup this scoring period, the Viewer's first, each
 * opening in full, and the league's Scoring leaders) and its Standings,
 * kept with each sync, and its Activity, read from its provider while
 * that tab is open.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ActivityFeed } from './ActivityFeed'
import { MatchupSheet } from './FantasyParts'
import { LeadersView } from './LeadersView'
import { Segmented } from './Segmented'
import { WhatIfTable } from './WhatIfTable'
import { scoreText } from './format'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LeagueMatchup, LeagueMatchupSide } from '@/lib/fantasy/matchup'
import type { Standings } from '@/lib/fantasy/standings'
import { AppHeader } from '@/components/layout/AppHeader'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { leagueActivityQuery, whatIfQuery } from '@/lib/fantasy/queries'
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
  // The Matchup open in full: the Viewer's, or another in the league.
  const [open, setOpen] = useState<'mine' | LeagueMatchup | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const league = page.data?.league
  // Today's Games, for each Player's game state in the Matchup sheet.
  const today = useToday()
  const games = useQuery({
    ...gamesQuery(today),
    enabled: open !== null,
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
              {league.matchup && <Slate league={league} onOpen={setOpen} />}
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
          ) : (
            <StandingsTab
              league={league}
              standings={page.data?.standings ?? null}
            />
          )}
          {open !== null && league.matchup && (
            <MatchupSheet
              // A fresh sheet per Matchup, so each opens on its own today.
              key={open === 'mine' ? 'mine' : open.left.teamId}
              league={league}
              {...(open === 'mine' ? {} : { other: open })}
              games={games.data ?? []}
              leagueLink={false}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The Standings, and in a football points league a choice of its
 * What-if standings, read when chosen.
 */
function StandingsTab({
  league,
  standings,
}: {
  league: FantasyLeagueView
  standings: Standings | null
}) {
  const whatIfs = league.sport === 'football' && !league.matchup?.categories
  const [view, setView] = useState<'real' | 'whatIf'>('real')
  const whatIf = useQuery({
    ...whatIfQuery(league.id),
    enabled: whatIfs && view === 'whatIf',
  })
  return (
    <div className="flex flex-col gap-3">
      {whatIfs && (
        <Segmented
          label="Standings"
          options={[
            { key: 'real', label: 'Standings' },
            { key: 'whatIf', label: 'What if' },
          ]}
          value={view}
          onChange={setView}
        />
      )}
      {view === 'whatIf' ? (
        whatIf.isPending ? (
          <p className="text-sm text-muted">Reading past weeks…</p>
        ) : whatIf.isError ? (
          <p className="text-sm text-live">{whatIf.error.message}</p>
        ) : whatIf.data ? (
          <WhatIfTable
            whatIf={whatIf.data}
            mine={league.matchup?.mine.teamId ?? null}
          />
        ) : (
          <p className="text-sm text-muted">No What-if standings here.</p>
        )
      ) : standings ? (
        <StandingsTable standings={standings} />
      ) : (
        <p className="text-sm text-muted">
          Standings show after the league’s next sync.
        </p>
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

/**
 * Every Matchup in the league this scoring period, the Viewer's first:
 * each a two-row scoreboard, the leader bold, opening in full.
 */
function Slate({
  league,
  onOpen,
}: {
  league: FantasyLeagueView
  onOpen: (matchup: 'mine' | LeagueMatchup) => void
}) {
  const m = league.matchup!
  const own: LeagueMatchup = {
    left: m.mine,
    right: m.opponent,
    ...(m.ties ? { ties: m.ties } : {}),
  }
  const all = [own, ...(m.others ?? [])]
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {all.length > 1 ? 'Matchups' : 'This matchup'}
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {all.map((o, i) => {
          const mine = i === 0
          const { left, right } = o
          const lead =
            !right || left.score === right.score
              ? null
              : left.score > right.score
                ? 'left'
                : 'right'
          const row = (s: LeagueMatchupSide, leading: boolean) => (
            <span
              className={cn(
                'flex items-baseline justify-between gap-2 tabular-nums',
                leading ? 'font-bold' : 'text-foreground/75',
              )}
            >
              <span className="min-w-0 truncate text-[13px] font-semibold">
                {s.name}
              </span>
              <span className="shrink-0 text-[15px]">
                {scoreText(m, s.score)}
              </span>
            </span>
          )
          return (
            <li key={left.teamId} className="flex">
              <button
                type="button"
                onClick={() => onOpen(mine ? 'mine' : o)}
                aria-current={mine || undefined}
                aria-label={
                  right
                    ? `${left.name} ${scoreText(m, left.score)}, ${right.name} ${scoreText(m, right.score)}`
                    : `${left.name}, bye week`
                }
                className={cn(
                  'flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border px-2.5 py-2 text-left hover:bg-notice',
                  mine
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface',
                )}
              >
                {row(left, lead === 'left')}
                {right ? (
                  row(right, lead === 'right')
                ) : (
                  <span className="text-[13px] text-muted">Bye week</span>
                )}
                {(mine || (o.ties ?? 0) > 0) && (
                  <span className="text-[11px] text-muted">
                    {[mine && 'Your matchup', o.ties && `${o.ties} tied`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
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
