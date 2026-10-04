import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { ZonePitch } from '@/components/mlb/StrikeZone'
import type { PlayDetail } from '@/lib/games/server'
import { Sheet } from '@/components/chat/Sheet'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamMark } from '@/components/brand/TeamMark'
import { PlayText } from '@/components/chat/PlayText'
import { FollowButton } from '@/components/follows/FollowButton'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { AppHeader } from '@/components/layout/AppHeader'
import { Bases } from '@/components/mlb/Bases'
import { StrikeZone, pitchColor } from '@/components/mlb/StrikeZone'
import { Rink } from '@/components/nhl/Rink'
import { getPlayDetail } from '@/lib/games/server'
import { gameSearch } from '@/lib/timeline/gameLink'
import { PlayerButton } from '@/components/players/playerSheet'
import { cn } from '@/lib/utils'

interface MlbPitch extends ZonePitch {
  type: string | null
  mph: number | null
  call: string | null
  balls: number | null
  strikes: number | null
}

interface MlbDetail {
  outs?: number | null
  rbi?: number
  reviewed?: boolean
  basesBefore?: {
    first: string | null
    second: string | null
    third: string | null
  }
  basesAfter?: {
    first: string | null
    second: string | null
    third: string | null
  }
  pitches?: Array<MlbPitch>
  hit?: {
    exitVelocity: number | null
    launchAngle: number | null
    distance: number | null
    trajectory: string | null
  } | null
}

interface NflDetail {
  yards?: number | null
  before?: string | null
  after?: string | null
  drive?: {
    number: number
    description: string | null
    result: string | null
  } | null
}

function NflContext({ detail }: { detail: NflDetail }) {
  return (
    <>
      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Before" value={detail.before ?? '–'} />
        <Stat
          label="Yards"
          value={detail.yards != null ? String(detail.yards) : '–'}
        />
        <Stat label="After" value={detail.after ?? '–'} />
      </section>
      {detail.drive && (
        <p className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-muted">
          Drive {detail.drive.number}
          {detail.drive.description && ` · ${detail.drive.description}`}
          {detail.drive.result && ` · ${detail.drive.result}`}
        </p>
      )}
    </>
  )
}

interface NhlDetail {
  shotType?: string | null
  strength?: string | null
  reason?: string | null
  x?: number | null
  y?: number | null
  penalty?: { infraction: string; minutes: number | null } | null
}

function NhlContext({
  detail,
  scoring,
}: {
  detail: NhlDetail
  scoring: boolean
}) {
  const facts = [
    detail.strength && ['Strength', detail.strength],
    detail.shotType && ['Shot', detail.shotType.replaceAll('-', ' ')],
    detail.reason && ['Result', detail.reason],
    detail.penalty && [
      'Penalty',
      `${detail.penalty.infraction}${detail.penalty.minutes ? ` · ${detail.penalty.minutes} min` : ''}`,
    ],
  ].filter(Boolean) as Array<[string, string]>
  return (
    <>
      {facts.length > 0 && (
        <section className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <Stat key={label} label={label} value={value} />
          ))}
        </section>
      )}
      {detail.x != null && detail.y != null && (
        <section className="rounded-xl border border-border bg-surface p-3">
          <Rink
            x={detail.x}
            y={detail.y}
            color={scoring ? 'var(--scoring)' : 'var(--notable)'}
          />
        </section>
      )}
    </>
  )
}

const ROLE_LABELS: Record<string, string> = {
  steal: 'Steal',
  'sub in': 'Checked in',
  'sub out': 'Checked out',
  scorer: 'Goal',
  assist: 'Assist',
  goalie: 'Goalie',
  shooter: 'Shooter',
  blocker: 'Blocked shot',
  hitter: 'Hit',
  hittee: 'Hit by',
  winner: 'Won faceoff',
  loser: 'Lost faceoff',
  'drew penalty': 'Drew penalty',
  passer: 'Passer',
  receiver: 'Receiver',
  rusher: 'Rusher',
  tackler: 'Tackler',
  penalized: 'Penalized',
  kicker: 'Kicker',
  punter: 'Punter',
  returner: 'Returner',
  batter: 'Batter',
  pitcher: 'Pitcher',
  runner: 'Runner',
  fielder: 'Fielder',
  substitute: 'Substitute',
}

/**
 * Old Play Detail links (/plays/:id) open the Play as a sheet over the
 * Timeline, on the Play's Sports Day.
 */
export function PlayDetailScreen({ playId }: { playId: string }) {
  const navigate = useNavigate()
  const { data, isPending } = useQuery(playQuery(playId))
  useEffect(() => {
    if (!data) return
    const day = gameSearch(data.game.id, data.item.sportsDay).day
    void navigate({
      to: '/',
      search: { play: playId, ...(day ? { day } : {}) },
      replace: true,
    })
  }, [data, playId, navigate])
  return (
    <div className="mx-auto max-w-xl px-4">
      <AppHeader />
      {!isPending && !data && (
        <p className="mt-16 text-center text-sm text-muted">Play not found.</p>
      )}
    </div>
  )
}

function playQuery(playId: string) {
  return {
    queryKey: ['play', playId] as const,
    queryFn: () => getPlayDetail({ data: { playId } }),
    staleTime: 60_000,
  }
}

/** A Play's detail in a sheet over the Timeline. */
export function PlaySheet({
  playId,
  onClose,
}: {
  playId: string
  onClose: () => void
}) {
  const { data, isPending } = useQuery(playQuery(playId))
  return (
    <Sheet title="Play" onClose={onClose}>
      {isPending ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : !data ? (
        <p className="py-10 text-center text-sm text-muted">Play not found.</p>
      ) : (
        <Play detail={data} />
      )}
    </Sheet>
  )
}

function Play({ detail }: { detail: PlayDetail }) {
  const { item, game } = detail
  const mlb = item.league === 'mlb' ? (item.detail as MlbDetail | null) : null
  const overturn = item.kind === 'overturn'
  return (
    <article className="flex flex-col gap-4">
      <Link
        to="/"
        search={(prev) => ({
          ...prev,
          play: undefined,
          ...gameSearch(game.id, game.sportsDay),
        })}
        className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
      >
        <span className="flex items-center gap-2 tabular-nums">
          <LeagueLogo league={item.league} size={18} />
          <TeamMark team={game.awayTeam} />
          {item.score.away} – {item.score.home}
          <TeamMark team={game.homeTeam} />
        </span>
        <span className="text-xs text-muted">{item.segmentLabel} · Game →</span>
      </Link>

      <header>
        <div className="mb-1 flex flex-wrap gap-2 text-xs">
          {item.significance && !overturn && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 capitalize',
                item.significance === 'scoring' && 'bg-scoring/15 text-scoring',
                item.significance === 'notable' && 'bg-notable/15 text-notable',
                item.significance === 'routine' && 'bg-surface text-muted',
              )}
            >
              {item.significance}
            </span>
          )}
          {overturn && (
            <span className="rounded-full bg-live/15 px-2 py-0.5 text-live">
              Overturned
            </span>
          )}
          {item.status === 'overturned' && (
            <span className="rounded-full bg-live/15 px-2 py-0.5 text-live">
              Later overturned
            </span>
          )}
          {item.revisedAt && item.status === 'active' && (
            <span className="rounded-full border border-border px-2 py-0.5 text-muted">
              Updated by the scorer
            </span>
          )}
          {mlb?.reviewed && (
            <span className="rounded-full border border-border px-2 py-0.5 text-muted">
              Reviewed
            </span>
          )}
        </div>
        <h1
          className={cn(
            'text-xl leading-snug font-semibold',
            item.status === 'overturned' && 'line-through',
          )}
        >
          <PlayText item={item} />
        </h1>
        <p className="mt-1 text-xs text-muted">
          {new Date(item.occurredAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </header>

      {mlb && <MlbContext detail={mlb} />}
      {(item.league === 'nfl' || item.league === 'cfb') && item.detail && (
        <NflContext detail={item.detail as NflDetail} />
      )}
      {item.league === 'nhl' && item.detail && (
        <NhlContext
          detail={item.detail as NhlDetail}
          scoring={item.significance === 'scoring'}
        />
      )}

      {detail.players.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Players</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {detail.players.map(({ player, lines, headshotUrl, team }) => (
              <li
                key={player.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <PlayerButton
                  playerId={player.id}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <PlayerAvatar
                    name={player.name}
                    headshotUrl={headshotUrl}
                    team={team}
                    size={44}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {player.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {ROLE_LABELS[player.role] ?? player.role}
                      {lines.length > 0 && ` · ${lines.join(' · ')}`}
                    </span>
                  </span>
                </PlayerButton>
                <FollowButton
                  follow={{ kind: 'player', playerId: player.id }}
                />
              </li>
            ))}
          </ul>
          {item.league === 'mlb' && (
            <p className="mt-1.5 px-1 text-[11px] text-muted">
              Stats are for this game, through this play.
            </p>
          )}
        </section>
      )}
    </article>
  )
}

function MlbContext({ detail }: { detail: MlbDetail }) {
  const pitches = detail.pitches ?? []
  const hit = detail.hit
  return (
    <>
      {(detail.basesBefore || detail.outs != null) && (
        <section className="flex items-center justify-around rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted">
          {detail.basesBefore && (
            <BaseState label="Before" bases={detail.basesBefore} />
          )}
          {detail.basesAfter && (
            <BaseState label="After" bases={detail.basesAfter} />
          )}
          {detail.outs != null && (
            <span className="flex flex-col items-center gap-1">
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {detail.outs}
              </span>
              {detail.outs === 1 ? 'out' : 'outs'}
            </span>
          )}
          {detail.rbi ? (
            <span className="flex flex-col items-center gap-1">
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {detail.rbi}
              </span>
              RBI
            </span>
          ) : null}
        </section>
      )}

      {hit && (hit.exitVelocity || hit.distance) && (
        <section className="grid grid-cols-3 gap-2 text-center">
          <Stat
            label="Exit velo"
            value={
              hit.exitVelocity ? `${hit.exitVelocity.toFixed(1)} mph` : '–'
            }
          />
          <Stat
            label="Launch angle"
            value={hit.launchAngle != null ? `${hit.launchAngle}°` : '–'}
          />
          <Stat
            label="Distance"
            value={hit.distance ? `${hit.distance} ft` : '–'}
          />
        </section>
      )}

      {pitches.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">
            {pitches.length} {pitches.length === 1 ? 'pitch' : 'pitches'}
          </h2>
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-start">
            <StrikeZone pitches={pitches} />
            <ol className="w-full flex-1 text-sm">
              {pitches.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 border-b border-border/50 py-1.5 last:border-0"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-background"
                    style={{ background: pitchColor(p) }}
                  >
                    {p.number ?? i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {p.call}
                    <span className="block text-xs text-muted">
                      {[p.type, p.mph ? `${p.mph.toFixed(1)} mph` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {p.balls != null && (
                    <span className="text-xs tabular-nums text-muted">
                      {p.balls}-{p.strikes}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted">
            Catcher’s view. Count shown after each pitch.
          </p>
        </section>
      )}
    </>
  )
}

function BaseState({
  label,
  bases,
}: {
  label: string
  bases: { first: string | null; second: string | null; third: string | null }
}) {
  const names = [
    bases.first && `1B ${bases.first}`,
    bases.second && `2B ${bases.second}`,
    bases.third && `3B ${bases.third}`,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <span
      className="flex flex-col items-center gap-1"
      title={names || 'Bases empty'}
    >
      <Bases
        first={Boolean(bases.first)}
        second={Boolean(bases.second)}
        third={Boolean(bases.third)}
        size={30}
      />
      {label}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2 py-2.5">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  )
}
