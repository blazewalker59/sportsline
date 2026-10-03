/**
 * A Team's page: logo, record and Follow; its season (what's next, then
 * results, each opening the Game's thread) and its roster (each opening
 * the Player). Opponents link to their own pages.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { RosterPlayer, TeamGame, TeamPage } from '@/lib/teams/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { RowItemMark, rowItemLabel } from '@/components/brand/RowItemMark'
import { TeamLogo } from '@/components/brand/TeamMark'
import { FollowButton } from '@/components/follows/FollowButton'
import { gameSearch } from '@/lib/timeline/gameLink'
import { getTeamPage, openTeamGame } from '@/lib/teams/server'
import { rosterGroups } from '@/lib/teams/positions'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

const RESULTS_SHOWN = 10
const UPCOMING_SHOWN = 5

export function TeamScreen({ teamId }: { teamId: string }) {
  const { data: viewerState } = useViewer()
  const page = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeamPage({ data: { teamId } }),
    staleTime: 60_000,
  })
  const [tab, setTab] = useState<'schedule' | 'roster'>('schedule')
  const data = page.data

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      {page.isPending ? (
        <p className="mt-16 text-center text-sm text-muted">Loading…</p>
      ) : !data ? (
        <p className="mt-16 text-center text-sm text-muted">Team not found.</p>
      ) : (
        <>
          <TeamHeader page={data} canFollow={Boolean(viewerState?.viewer)} />
          <div
            role="tablist"
            aria-label="Team"
            className="mb-4 flex gap-1 rounded-full bg-notice p-1"
          >
            {(['schedule', 'roster'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'min-h-9 flex-1 rounded-full text-sm font-semibold capitalize transition-colors',
                  tab === t
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted',
                )}
              >
                {t}
                {t === 'roster' && data.roster.length > 0 && (
                  <span className="ml-1 font-normal text-muted">
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
        </>
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
      <span
        className="flex size-[88px] shrink-0 items-center justify-center rounded-full border border-bubble-border bg-surface"
        style={
          team.colors
            ? {
                boxShadow: `inset 0 0 0 4px color-mix(in srgb, ${team.colors.primary} 35%, transparent)`,
              }
            : undefined
        }
      >
        <TeamLogo team={team} size={60} />
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
              <RowItemMark item={team.conference} size={16} />
              {rowItemLabel(team.conference)}
            </>
          )}
          {team.record && (
            <span className="font-semibold text-foreground/80 tabular-nums">
              {team.conference && '· '}
              {team.record}
            </span>
          )}
        </span>
        {canFollow && (
          <div className="mt-1">
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
  const upcoming = page.games.filter(
    (g) => g.status === 'scheduled' || g.status === 'postponed',
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
      <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {games.map((g) => (
          <GameRow key={g.sourceGameId} game={g} league={league} />
        ))}
      </ul>
      {more && (
        <button
          type="button"
          onClick={more}
          className="mt-2 w-full rounded-full py-2 text-sm font-semibold text-accent"
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
          <span className="mr-1 text-[11px] font-bold text-muted">
            {game.opponent.rank}
          </span>
        )}
        {game.opponent.abbreviation}
      </span>
    </>
  )
  return (
    <li className="flex min-h-14 items-center gap-2 px-3">
      <span className="w-[4.5rem] shrink-0 text-xs text-muted">
        {dateLabel(game.startsAt)}
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
          'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm tabular-nums',
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
  if (game.status === 'scheduled') {
    return (
      <span className="text-muted">
        {new Date(game.startsAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </span>
    )
  }
  if (game.status === 'postponed')
    return <span className="text-muted">Postponed</span>
  const live = game.status === 'live' || game.status === 'delayed'
  return (
    <span className="flex items-center gap-1.5">
      {live ? (
        <span className="rounded-full bg-live/15 px-1.5 text-[11px] font-bold text-live">
          LIVE
        </span>
      ) : (
        <span
          className={cn(
            'w-7 text-center text-[13px] font-bold',
            game.result === 'W' ? 'text-scoring' : 'text-muted',
          )}
        >
          {game.result}
        </span>
      )}
      <span className="font-semibold">
        {game.score.team}–{game.score.opponent}
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
          <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {label}
            <span className="ml-1 font-normal">{players.length}</span>
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {players.map((p) => (
              <li key={p.id}>
                <Link
                  to="/players/$playerId"
                  params={{ playerId: p.id }}
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
                    <span className="text-xs font-semibold text-muted">
                      {p.position}
                    </span>
                  )}
                  <span aria-hidden="true" className="text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
