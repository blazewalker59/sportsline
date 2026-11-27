/**
 * A Fantasy league's page (CONTEXT.md, "Fantasy league"), in tabs: its
 * Overview (every Matchup this scoring period, the Viewer's first, each
 * opening in full, the league's Scoring leaders, and its Who Has?
 * switch) and its Standings,
 * kept with each sync, its Players (who's available) and Activity,
 * read from its provider while that tab is open, and its History, its
 * past seasons kept once read.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ActivityFeed } from './ActivityFeed'
import { AvailablePlayers } from './AvailablePlayers'
import { MoveSheet } from './MoveSheet'
import { MatchupSheet } from './FantasyParts'
import { LeadersView } from './LeadersView'
import { Picker, SectionHead } from './Picker'
import { WhatIfTable } from './WhatIfTable'
import { WhoHasSwitch } from './WhoHasSwitch'
import { HistoryView } from './HistoryView'
import { MatchupHero } from './MatchupHero'
import { scoreText } from './format'
import type { MoveIntent } from './MoveSheet'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LeagueMatchup, LeagueMatchupSide } from '@/lib/fantasy/matchup'
import type { FantasyMove } from '@/lib/fantasy/moves'
import type { Standings } from '@/lib/fantasy/standings'
import type { GameSummary } from '@/lib/model/timeline'
import { AppHeader } from '@/components/layout/AppHeader'
import {
  InlineError,
  NotFoundState,
  ScreenError,
} from '@/components/layout/RouteStates'
import {
  RowsSkeleton,
  Skeleton,
  SkeletonStatus,
} from '@/components/layout/Skeleton'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import {
  availablePlayersQuery,
  leagueActivityQuery,
  leagueHistoryQuery,
  moveOptionsQuery,
  whatIfQuery,
} from '@/lib/fantasy/queries'
import { MOVE_STATUS, moveSummary } from '@/lib/fantasy/moves'
import { timeAgo, useNow } from '@/components/timeline/format'
import { SPORTS } from '@/lib/fantasy/sports'
import { useFantasyLeague } from '@/lib/fantasy/useFantasy'
import { gamesQuery } from '@/lib/timeline/queries'
import { useToday } from '@/lib/timeline/useToday'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'standings' | 'players' | 'activity' | 'history'

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'standings', label: 'Standings' },
  { key: 'players', label: 'Players' },
  { key: 'activity', label: 'Activity' },
  { key: 'history', label: 'History' },
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
        className="mb-3 inline-flex min-h-8 items-center text-3xs font-bold text-foreground/80 uppercase hover:text-foreground"
      >
        ← Fantasy
      </Link>
      {isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to see your fantasy leagues.
        </p>
      ) : page.isPending ? (
        <LeagueSkeleton />
      ) : page.isError && page.data === undefined ? (
        // Failed with nothing to show: not the same as no such league.
        <ScreenError error={page.error} onRetry={() => page.refetch()} />
      ) : !league ? (
        <NotFoundState what="fantasy league" />
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
                  'mt-0.5 block truncate text-3xs uppercase',
                  league.lastError ? 'text-negative' : 'text-muted',
                )}
              >
                {league.lastError ??
                  [
                    league.provider === 'sleeper' ? 'Sleeper' : 'ESPN',
                    league.teamName,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
              </span>
            </span>
          </header>
          <div
            role="tablist"
            aria-label="League"
            className="well -mt-2 flex gap-1 overflow-x-auto rounded-[13px] p-[3px] [scrollbar-width:none]"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'min-h-9 flex-[1_0_auto] rounded-[10px] px-2 text-3xs whitespace-nowrap uppercase transition-colors',
                  tab === t.key
                    ? 'panel bg-surface font-bold text-foreground'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'overview' ? (
            <>
              {league.matchup && (
                <Slate league={league} games={games.data} onOpen={setOpen} />
              )}
              {page.data?.leaders ? (
                <LeadersView sport={league.sport} leaders={page.data.leaders} />
              ) : (
                <p className="text-sm text-muted">
                  Scoring leaders show after the league’s next sync.
                </p>
              )}
              <WhoHasSwitch leagueId={league.id} on={league.whoHasEnabled} />
            </>
          ) : tab === 'activity' ? (
            <ActivityTab league={league} />
          ) : tab === 'history' ? (
            <HistoryTab league={league} />
          ) : tab === 'players' ? (
            <PlayersTab league={league} />
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

/** The league page's shape while it loads: header, tabs, the Matchups. */
function LeagueSkeleton() {
  return (
    <SkeletonStatus className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <div className="well -mt-2 flex gap-1 rounded-[13px] p-[3px]">
        {TABS.map((t) => (
          <Skeleton key={t.key} className="h-9 flex-1 rounded-[10px]" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))}
        </div>
      </div>
      <Skeleton className="h-40 rounded-card" />
    </SkeletonStatus>
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
    <section>
      <SectionHead
        title={view === 'whatIf' ? 'What-if standings' : 'Standings'}
        index="H1"
      >
        {whatIfs && (
          <Picker
            label="Standings"
            options={[
              { key: 'real', label: 'Actual' },
              { key: 'whatIf', label: 'What if' },
            ]}
            value={view}
            onChange={setView}
          />
        )}
      </SectionHead>
      {view === 'whatIf' ? (
        whatIf.isPending ? (
          <p className="text-sm text-muted">Reading past weeks…</p>
        ) : whatIf.isError && whatIf.data === undefined ? (
          <InlineError
            what="the What-if standings"
            error={whatIf.error}
            onRetry={() => whatIf.refetch()}
          />
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
    </section>
  )
}

/**
 * Who's available, read from the league's provider while the tab is
 * open; in an ESPN league with roster moves on, each one a move away.
 */
function PlayersTab({ league }: { league: FantasyLeagueView }) {
  const available = useQuery(availablePlayersQuery(league.id))
  const espn = league.provider === 'espn'
  const options = useQuery({ ...moveOptionsQuery(league.id), enabled: espn })
  const [intent, setIntent] = useState<MoveIntent | null>(null)
  const moves = options.data?.enabled ? options.data : null
  return (
    <div className="flex flex-col gap-4">
      {espn && options.data && !options.data.enabled && (
        <p className="text-xs text-muted">
          Turn on roster moves for ESPN on the{' '}
          <Link
            to="/fantasy"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Fantasy page
          </Link>{' '}
          to add, drop and claim players here.
        </p>
      )}
      {moves && (
        <YourMoves
          moves={moves.moves}
          canDrop={moves.roster.length > 0}
          onDrop={() => setIntent({ kind: 'drop' })}
        />
      )}
      {available.isPending ? (
        <RowsSkeleton rows={6} label="Loading available players" />
      ) : available.isError && available.data === undefined ? (
        <InlineError
          what="available players"
          error={available.error}
          onRetry={() => available.refetch()}
        />
      ) : !available.data ? (
        <p className="text-sm text-muted">League not found.</p>
      ) : (
        <AvailablePlayers
          sport={league.sport}
          available={available.data}
          provider={league.provider}
          onMove={
            moves
              ? (p) =>
                  setIntent({ kind: p.waivers ? 'claim' : 'add', player: p })
              : undefined
          }
        />
      )}
      {intent && moves && (
        <MoveSheet
          leagueId={league.id}
          sport={league.sport}
          options={moves}
          intent={intent}
          onClose={() => setIntent(null)}
        />
      )}
    </div>
  )
}

/** The Viewer's latest moves in the league with how each came out, and Drop. */
function YourMoves({
  moves,
  canDrop,
  onDrop,
}: {
  moves: ReadonlyArray<FantasyMove>
  canDrop: boolean
  onDrop: () => void
}) {
  const now = useNow()
  return (
    <section>
      <SectionHead title="Your moves" index="H1">
        {canDrop && (
          <button
            type="button"
            onClick={onDrop}
            className="key inline-flex h-8 items-center rounded-control px-2.5 text-3xs font-bold text-foreground uppercase"
          >
            Drop a player
          </button>
        )}
      </SectionHead>
      {moves.length === 0 ? (
        <p className="text-xs text-muted">
          None yet. Tap Add or Claim on a player below.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {moves.map((m) => (
            <li key={m.id} className="flex items-start gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {moveSummary(m)}
                </span>
                {m.reason && (
                  <span className="block text-2xs text-muted">{m.reason}</span>
                )}
              </span>
              <span className="shrink-0 text-right text-2xs">
                <span
                  className={cn(
                    'block font-semibold',
                    m.status === 'done'
                      ? 'text-foreground'
                      : m.status === 'refused' || m.status === 'lost'
                        ? 'text-negative'
                        : 'text-muted',
                  )}
                >
                  {MOVE_STATUS[m.status]}
                </span>
                {now !== null && (
                  <span className="block text-3xs text-muted uppercase">
                    {timeAgo(m.createdAt, now)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The league's Activity, read from its provider while the tab is open. */
function ActivityTab({ league }: { league: FantasyLeagueView }) {
  const activity = useQuery(leagueActivityQuery(league.id))
  const timeZone = useTimeZone()
  if (activity.isPending)
    return <RowsSkeleton rows={4} label="Loading activity" />
  if (activity.isError && activity.data === undefined)
    return (
      <InlineError
        what="the league’s activity"
        error={activity.error}
        onRetry={() => activity.refetch()}
      />
    )
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
 * The league's History: the first look reads every past season from the
 * provider (a few seconds); later ones read only the season being played.
 */
function HistoryTab({ league }: { league: FantasyLeagueView }) {
  const history = useQuery(leagueHistoryQuery(league.id))
  if (history.isPending)
    return <RowsSkeleton rows={5} label="Reading past seasons" />
  if (history.isError && history.data === undefined)
    return (
      <InlineError
        what="the league’s history"
        error={history.error}
        onRetry={() => history.refetch()}
      />
    )
  if (!history.data)
    return <p className="text-sm text-muted">League not found.</p>
  return <HistoryView sport={league.sport} history={history.data} />
}

/**
 * Every Matchup in the league this scoring period: the Viewer's as the
 * hero (two dot numerals and the projection meter), the rest as compact
 * panels, each a two-row scoreboard with the leader bold, opening in full.
 */
function Slate({
  league,
  games,
  onOpen,
}: {
  league: FantasyLeagueView
  games?: ReadonlyArray<GameSummary>
  onOpen: (matchup: 'mine' | LeagueMatchup) => void
}) {
  const m = league.matchup!
  const others = m.others ?? []
  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title={others.length > 0 ? 'Matchups' : 'This matchup'}
        index="H1"
      >
        {others.length > 0 && <span>{others.length + 1}</span>}
      </SectionHead>
      <MatchupHero
        league={league}
        games={games}
        showLeague={false}
        onOpen={() => onOpen('mine')}
      />
      {others.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {others.map((o) => {
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
                  leading ? 'font-bold' : 'text-muted',
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
                  onClick={() => onOpen(o)}
                  aria-label={
                    right
                      ? `${left.name} ${scoreText(m, left.score)}, ${right.name} ${scoreText(m, right.score)}`
                      : `${left.name}, bye week`
                  }
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded-card border border-border bg-surface px-3 py-2.5 text-left hover:bg-notice"
                >
                  {row(left, lead === 'left')}
                  {right ? (
                    row(right, lead === 'right')
                  ) : (
                    <span className="text-3xs text-muted uppercase">
                      Bye week
                    </span>
                  )}
                  {(o.ties ?? 0) > 0 && (
                    <span className="text-3xs text-muted uppercase">
                      {o.ties} tied
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
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
    <div className="overflow-x-auto rounded-card border border-border bg-surface px-3 py-2">
      <table className="w-full text-[13px] whitespace-nowrap tabular-nums">
        <thead>
          <tr className="border-b border-border text-3xs text-muted uppercase">
            <th className="py-1.5 pr-1 text-left font-normal">#</th>
            <th className="px-1 text-left font-normal">Team</th>
            <th className="px-1 text-right font-normal">
              {ties ? 'W-L-T' : 'W-L'}
            </th>
            {points && (
              <>
                <th className="px-1 text-right font-normal">PF</th>
                <th className="px-1 text-right font-normal">PA</th>
              </>
            )}
            <th className="pl-1 text-right font-normal">Strk</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r) => (
            <tr
              key={r.teamId}
              aria-current={r.mine || undefined}
              data-playoff-cut={
                cut !== null && r.rank === cut && r.rank < standings.rows.length
                  ? ''
                  : undefined
              }
              className={cn(
                'border-b border-border last:border-b-0',
                r.mine && 'font-bold',
                cut !== null &&
                  r.rank === cut &&
                  r.rank < standings.rows.length &&
                  'border-b-[1.5px] border-dashed border-b-muted',
              )}
            >
              <td className="py-2 pr-1 text-muted">{r.rank}</td>
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
                  'pl-1 text-right',
                  !r.streak?.startsWith('W') && 'text-muted',
                )}
              >
                {r.streak ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cut !== null && cut < standings.rows.length && (
        <p className="mt-1.5 text-3xs text-muted uppercase">
          Top {cut} make the playoffs.
        </p>
      )}
    </div>
  )
}
