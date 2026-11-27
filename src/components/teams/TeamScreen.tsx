/**
 * A Team's page: logo, record and Follow; its season (what's next, then
 * results, each opening the Game's thread) and its roster (each opening
 * the Player). Opponents link to their own pages.
 */

import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { RosterPlayer, TeamGame, TeamPage } from '@/lib/teams/server'
import { TeamResults } from '@/components/charts/lazy'
import { AppHeader } from '@/components/layout/AppHeader'
import { NotFoundState, ScreenError } from '@/components/layout/RouteStates'
import {
  DetailHeaderSkeleton,
  RowsSkeleton,
} from '@/components/layout/Skeleton'
import { SubjectPage } from '@/components/brand/SubjectPage'
import { teamSubject } from '@/lib/brand/subject'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { ConferenceMark, conferenceName } from '@/components/brand/RowItemMark'
import { TeamLogo } from '@/components/brand/TeamMark'
import { FollowButton } from '@/components/follows/FollowButton'
import { Num } from '@/components/signal/Num'
import { SectionLabel } from '@/components/signal/Section'
import { gameSearch } from '@/lib/timeline/gameLink'
import { openTeamGame } from '@/lib/teams/server'
import { useTeamPage } from '@/lib/teams/queries'
import { rosterGroups } from '@/lib/teams/positions'
import { useViewer } from '@/lib/viewer/useViewer'
import { PlayerButton } from '@/components/players/playerSheet'
import { PredictionsSection } from '@/components/players/PredictionsSection'
import { cn } from '@/lib/utils'
import { clockTime, dateLabel } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

const RESULTS_SHOWN = 10
const UPCOMING_SHOWN = 5

export function TeamScreen({ teamId }: { teamId: string }) {
  const { data: viewerState } = useViewer()
  const page = useTeamPage(teamId)
  const [tab, setTab] = useState<'schedule' | 'roster'>('schedule')
  const data = page.data

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      {page.isPending ? (
        <>
          <DetailHeaderSkeleton className="mt-2 mb-6" />
          <RowsSkeleton />
        </>
      ) : page.isError && data === undefined ? (
        // Failed with nothing to show: not the same as no such Team.
        <ScreenError error={page.error} onRetry={() => page.refetch()} />
      ) : !data ? (
        <NotFoundState what="team" />
      ) : (
        <SubjectPage subject={teamSubject(data.team.colors)}>
          <TeamHeader page={data} canFollow={Boolean(viewerState?.viewer)} />
          <TeamResults page={data} />
          <div className="mb-5 empty:hidden">
            <PredictionsSection teamId={data.team.id} />
          </div>
          <div
            role="tablist"
            aria-label="Team"
            className="well mb-4 flex gap-1 rounded-[13px] p-1"
          >
            {(['schedule', 'roster'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                // The current tab is the raised key in the well.
                className={cn(
                  'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-control text-3xs font-bold uppercase',
                  tab === t ? 'key' : 'text-muted hover:text-foreground',
                )}
              >
                {t}
                {t === 'roster' && data.roster.length > 0 && (
                  <span className="font-normal text-muted">
                    {data.roster.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          {tab === 'schedule' ? (
            <Schedule page={data} />
          ) : (
            <Roster roster={data.roster} league={data.team.league} />
          )}
        </SubjectPage>
      )}
    </div>
  )
}

function TeamHeader({
  page,
  canFollow,
}: {
  page: TeamPage
  canFollow: boolean
}) {
  const { team } = page
  return (
    <header className="mb-5 flex items-center gap-4">
      {/* The logo on a panel, the team's color as its bottom edge. */}
      <span className="relative flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-surface">
        <TeamLogo team={team} size={60} />
        {team.colors && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1"
            style={{ background: team.colors.primary }}
          />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-xl leading-tight font-bold tracking-tight">
          {team.rank && (
            <span className="mr-1.5 text-base font-bold text-muted">
              #{team.rank}
            </span>
          )}
          {team.name}
        </h1>
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <LeagueLogo league={team.league} size={16} />
          {team.conference && (
            <>
              <ConferenceMark conference={team.conference} size={16} />
              {conferenceName(team.conference)}
            </>
          )}
        </span>
        {team.record && (
          <span className="mt-1 flex items-baseline gap-2">
            <Num className="text-4xl">{team.record}</Num>
            <span className="text-3xs text-muted uppercase">Record</span>
          </span>
        )}
        <RecentForm page={page} />
        {canFollow && (
          <div className="mt-1.5">
            <FollowButton follow={{ kind: 'team', teamId: team.id }} />
          </div>
        )}
      </div>
    </header>
  )
}

function Schedule({ page }: { page: TeamPage }) {
  const [allResults, setAllResults] = useState(false)
  const [allUpcoming, setAllUpcoming] = useState(false)
  if (page.scheduleError && page.games.length === 0) {
    return (
      <p className="mt-10 text-center text-sm text-muted">
        Couldn’t load the schedule right now.
      </p>
    )
  }
  const live = page.games.filter(
    (g) => g.status === 'live' || g.status === 'delayed',
  )
  // A postponed Game whose date has passed is played as another Game, if
  // at all: it isn't "up next".
  const now = Date.now()
  const upcoming = page.games.filter(
    (g) =>
      g.status === 'scheduled' ||
      (g.status === 'postponed' && Date.parse(g.startsAt) > now),
  )
  const results = page.games.filter((g) => g.status === 'final').reverse()
  return (
    <div className="flex flex-col gap-6">
      {live.length > 0 && (
        <GameSection title="Live" games={live} league={page.team.league} />
      )}
      {upcoming.length > 0 && (
        <GameSection
          title="Up next"
          games={allUpcoming ? upcoming : upcoming.slice(0, UPCOMING_SHOWN)}
          league={page.team.league}
          more={
            !allUpcoming && upcoming.length > UPCOMING_SHOWN
              ? () => setAllUpcoming(true)
              : undefined
          }
          moreLabel={`All ${upcoming.length} to come`}
        />
      )}
      {results.length > 0 && (
        <GameSection
          title="Results"
          games={allResults ? results : results.slice(0, RESULTS_SHOWN)}
          league={page.team.league}
          more={
            !allResults && results.length > RESULTS_SHOWN
              ? () => setAllResults(true)
              : undefined
          }
          moreLabel={`All ${results.length} results`}
        />
      )}
      {page.games.length === 0 && (
        <p className="mt-10 text-center text-sm text-muted">
          No games on the schedule.
        </p>
      )}
    </div>
  )
}

function GameSection({
  title,
  games,
  league,
  more,
  moreLabel,
}: {
  title: string
  games: Array<TeamGame>
  league: TeamPage['team']['league']
  more?: () => void
  moreLabel?: string
}) {
  return (
    <section>
      <SectionLabel title={title}>{games.length}</SectionLabel>
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {games.map((g) => (
          <GameRow key={g.sourceGameId} game={g} league={league} />
        ))}
      </ul>
      {more && (
        <button
          type="button"
          onClick={more}
          className="key mt-3 flex h-10 w-full items-center justify-center rounded-control text-3xs font-bold uppercase"
        >
          {moreLabel}
        </button>
      )}
    </section>
  )
}

function GameRow({
  game,
  league,
}: {
  game: TeamGame
  league: TeamPage['team']['league']
}) {
  const navigate = useNavigate()
  const timeZone = useTimeZone()
  const open = useMutation({
    mutationFn: () =>
      openTeamGame({
        data: {
          league,
          sourceGameId: game.sourceGameId,
          sportsDay: game.sportsDay,
        },
      }),
    onSuccess: (r) => {
      if (r) void goTo(r.gameId)
    },
  })
  const goTo = (gameId: string) =>
    navigate({ to: '/', search: gameSearch(gameId, game.sportsDay) })
  // A stored Game opens straight away; a played one not stored yet is
  // fetched first. Games to come open once stored (on their day).
  const playable =
    game.gameId !== null || game.status === 'final' || game.status === 'live'
  const opponent = (
    <>
      <span className="w-6 text-xs text-muted">{game.home ? 'vs' : '@'}</span>
      <TeamLogo team={game.opponent} size={24} />
      <span className="truncate font-medium">
        {game.opponent.rank && (
          <span className="mr-1 text-2xs font-bold text-muted">
            {game.opponent.rank}
          </span>
        )}
        {game.opponent.abbreviation}
      </span>
    </>
  )
  return (
    <li className="flex min-h-14 items-center gap-2 px-3">
      <span className="w-[5.5rem] shrink-0 text-3xs whitespace-nowrap text-muted uppercase">
        {dateLabel(game.startsAt, timeZone)}
      </span>
      {game.opponent.id ? (
        <Link
          to="/teams/$teamId"
          params={{ teamId: game.opponent.id }}
          className="flex min-w-0 flex-1 items-center gap-2"
          aria-label={`${game.opponent.name} team page`}
        >
          {opponent}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {opponent}
        </span>
      )}
      <button
        type="button"
        disabled={!playable || open.isPending}
        onClick={() => (game.gameId ? void goTo(game.gameId) : open.mutate())}
        aria-label={playable ? 'Open this game' : undefined}
        className={cn(
          'flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-sm tabular-nums',
          playable && 'hover:bg-notice',
        )}
      >
        <Outcome game={game} />
        {playable && (
          <span aria-hidden="true" className="text-muted">
            {open.isPending ? '…' : '›'}
          </span>
        )}
      </button>
    </li>
  )
}

function Outcome({ game }: { game: TeamGame }) {
  const timeZone = useTimeZone()
  if (game.status === 'scheduled') {
    return (
      <span className="text-muted">{clockTime(game.startsAt, timeZone)}</span>
    )
  }
  if (game.status === 'postponed')
    return <span className="text-muted">Postponed</span>
  const live = game.status === 'live' || game.status === 'delayed'
  // Fixed-width columns, so results line up down the list whatever the
  // scores (4–3 or 112–108).
  return (
    <span className="flex items-center gap-1">
      <span className="flex w-10 justify-center">
        {live ? (
          <span className="flex items-center gap-1.5 text-3xs font-bold text-live uppercase">
            <span aria-hidden="true" className="led led-pulse size-1.5" />
            Live
          </span>
        ) : (
          <ResultMark result={game.result} />
        )}
      </span>
      <span className="w-[4.5rem] text-right font-semibold">
        {game.score.team}–{game.score.opponent}
      </span>
    </span>
  )
}

function ResultMark({ result }: { result: TeamGame['result'] }) {
  return (
    <span
      className={cn(
        'text-[13px] font-bold',
        result === 'W' ? 'text-foreground' : 'text-muted',
      )}
    >
      {result}
    </span>
  )
}

/** Football looks back 5 Games; everything else, 10. */
function recentCount(league: TeamPage['team']['league']): number {
  return league === 'nfl' || league === 'cfb' ? 5 : 10
}

/**
 * "Last 5 · 3–2" with the results as chips, oldest to newest. NHL records
 * keep overtime losses apart, as the season record does.
 */
function RecentForm({ page }: { page: TeamPage }) {
  const n = recentCount(page.team.league)
  const recent = page.games.filter((g) => g.status === 'final').slice(-n)
  if (recent.length === 0) return null
  const count = (r: TeamGame['result']) =>
    recent.filter((g) => g.result === r).length
  const [w, l, t, otl] = [count('W'), count('L'), count('T'), count('OTL')]
  const record =
    page.team.league === 'nhl'
      ? `${w}–${l}–${otl}`
      : t > 0
        ? `${w}–${l + otl}–${t}`
        : `${w}–${l + otl}`
  return (
    <span className="flex flex-col gap-1 text-sm">
      <span className="text-3xs whitespace-nowrap text-muted uppercase">
        Last {recent.length}{' '}
        <span className="text-foreground/80 tabular-nums">{record}</span>
      </span>
      <span className="flex flex-wrap gap-0.5" aria-hidden="true">
        {recent.map((g) => (
          <span
            key={g.sourceGameId}
            title={`${g.result} ${g.score.team}–${g.score.opponent} ${g.home ? 'vs' : '@'} ${g.opponent.abbreviation}`}
            // Wins in ink, the rest recessed.
            className={cn(
              'flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1 font-label text-3xs font-bold',
              g.result === 'W'
                ? 'bg-foreground text-background'
                : 'well text-muted',
            )}
          >
            {g.result}
          </span>
        ))}
      </span>
    </span>
  )
}

function Roster({
  roster,
  league,
}: {
  roster: Array<RosterPlayer>
  league: TeamPage['team']['league']
}) {
  if (roster.length === 0) {
    return (
      <p className="mt-10 text-center text-sm text-muted">
        The roster isn’t synced yet.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {rosterGroups(league, roster).map(({ label, players }) => (
        <section key={label}>
          <SectionLabel title={label}>{players.length}</SectionLabel>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {players.map((p) => (
              <li key={p.id}>
                <PlayerButton
                  playerId={p.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <PlayerAvatar
                    name={p.name}
                    headshotUrl={p.headshotUrl}
                    size={40}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {p.name}
                  </span>
                  {p.position && (
                    <span className="text-3xs text-muted uppercase">
                      {p.position}
                    </span>
                  )}
                  <span aria-hidden="true" className="text-muted">
                    ›
                  </span>
                </PlayerButton>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
