/**
 * A Player in full: their Team's Game now or next with their line in it,
 * the Viewer's Predictions and Fantasy teams they're in, their season,
 * recent games and news. Opens as a sheet over wherever the Viewer is
 * (`usePlayerSheet`), so closing it lands exactly where they were.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { OpenPlayer } from './playerSheet'
import { PlayerForm } from './PlayerForm'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer } from '@/lib/fantasy/matchup'
import type { PlayerLine } from '@/lib/players/detail'
import type { PlayerProfile } from '@/lib/players/server'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { PlayerOverview } from '@/lib/model/types'
import { LeagueLogo, leagueLabel } from '@/components/brand/LeagueLogo'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { TeamLogo } from '@/components/brand/TeamMark'
import { Sheet } from '@/components/chat/Sheet'
import {
  Breakdown,
  injuryLabel,
  injuryTone,
} from '@/components/fantasy/FantasyParts'
import { FollowButton } from '@/components/follows/FollowButton'
import { PlaySheet } from '@/components/games/PlayDetailScreen'
import {
  PredictionCard,
  PredictionSheet,
} from '@/components/predictions/PredictionParts'
import { startTime } from '@/components/timeline/format'
import { SPORTS } from '@/lib/fantasy/sports'
import { useFantasy } from '@/lib/fantasy/useFantasy'
import {
  useKalshiConnection,
  usePredictions,
} from '@/lib/kalshi/usePredictions'
import { getPlayerDetail } from '@/lib/players/detail'
import { getPlayerPage } from '@/lib/players/server'
import { cn } from '@/lib/utils'
import { useViewer } from '@/lib/viewer/useViewer'

// ─── The sheet, from anywhere ───────────────────────────────────────────────

export function PlayerSheetProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const close = useCallback(() => setPlayerId(null), [])
  return (
    <OpenPlayer.Provider value={setPlayerId}>
      {children}
      {playerId && (
        <PlayerSheet key={playerId} playerId={playerId} onClose={close} />
      )}
    </OpenPlayer.Provider>
  )
}

const RECENT_PLAYS = 5

function PlayerSheet({
  playerId,
  onClose,
}: {
  playerId: string
  onClose: () => void
}) {
  const page = useQuery({
    queryKey: ['player', playerId, 'first'],
    queryFn: () => getPlayerPage({ data: { playerId } }),
  })
  const [playId, setPlayId] = useState<string | null>(null)
  const player = page.data?.player
  return (
    <Sheet title="Player" onClose={onClose}>
      {page.isPending ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : !player ? (
        <p className="py-10 text-center text-sm text-muted">
          Player not found.
        </p>
      ) : (
        <>
          <PlayerHeader player={player} onNavigate={onClose} />
          <PlayerDetailSections player={player} onNavigate={onClose} />
          {page.data && page.data.items.length > 0 && (
            <Section title="Recent plays">
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {page.data.items.slice(0, RECENT_PLAYS).map((item) => (
                  <PlayRow
                    key={item.id}
                    item={item}
                    onOpen={() => setPlayId(item.id)}
                  />
                ))}
              </ul>
              <Link
                to="/players/$playerId"
                params={{ playerId }}
                onClick={onClose}
                className="mt-2 block text-center text-sm font-semibold text-accent"
              >
                Every play
              </Link>
            </Section>
          )}
          {playId && (
            <PlaySheet playId={playId} onClose={() => setPlayId(null)} />
          )}
        </>
      )}
    </Sheet>
  )
}

function PlayRow({ item, onOpen }: { item: TimelineItem; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left"
      >
        <span className="text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {item.awayTeam.abbreviation} {item.score.away} – {item.score.home}{' '}
            {item.homeTeam.abbreviation}
          </span>{' '}
          · {item.segmentLabel}
        </span>
        <span
          className={cn(
            'text-sm leading-snug',
            item.significance === 'scoring' && 'font-semibold',
          )}
        >
          {item.description}
        </span>
      </button>
    </li>
  )
}

// ─── Shared by the sheet and the Player page ────────────────────────────────

export function PlayerHeader({
  player,
  onNavigate,
}: {
  player: PlayerProfile
  /** Leaving for another screen (the sheet closes first). */
  onNavigate?: () => void
}) {
  const { data: viewerState } = useViewer()
  return (
    <header className="flex items-center gap-4">
      <PlayerAvatar
        name={player.name}
        headshotUrl={player.headshotUrl}
        team={player.team}
        size={88}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-xl leading-tight font-bold tracking-tight">
          {player.name}
        </h1>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <LeagueLogo league={player.league} size={16} />
          {player.team ? (
            <Link
              to="/teams/$teamId"
              params={{ teamId: player.team.id }}
              onClick={onNavigate}
              className="flex items-center gap-1.5 font-medium text-foreground/80 underline-offset-2 hover:underline"
            >
              <TeamLogo team={player.team} size={16} />
              {player.team.name}
            </Link>
          ) : (
            leagueLabel(player.league)
          )}
          {player.position && ` · ${player.position}`}
        </span>
        {viewerState?.viewer && (
          <div className="mt-1">
            <FollowButton follow={{ kind: 'player', playerId: player.id }} />
          </div>
        )}
      </div>
    </header>
  )
}

export function PlayerDetailSections({
  player,
  onNavigate,
}: {
  player: PlayerProfile
  onNavigate?: () => void
}) {
  const detail = useQuery({
    queryKey: ['player-detail', player.id],
    queryFn: () => getPlayerDetail({ data: { playerId: player.id } }),
    staleTime: 60_000,
    // A live Game's line keeps moving.
    refetchInterval: (q) =>
      q.state.data?.game?.status === 'live' ? 30_000 : false,
  })
  const overview = detail.data?.overview ?? null
  return (
    <div className="flex flex-col gap-5">
      <FantasySection playerId={player.id} />
      <PredictionsSection playerId={player.id} />
      {detail.isPending ? (
        <p className="py-6 text-center text-sm text-muted">
          Loading their season…
        </p>
      ) : (
        <>
          <GameSection
            game={detail.data?.game ?? null}
            line={detail.data?.line ?? []}
            next={overview?.next ?? null}
            onNavigate={onNavigate}
          />
          {overview?.note && (
            <Section title="Latest">
              <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <p className="text-sm font-semibold">
                  {overview.note.headline}
                </p>
                {overview.note.story && (
                  <p className="mt-1 text-[13px] leading-snug text-muted">
                    {overview.note.story}
                  </p>
                )}
              </div>
            </Section>
          )}
          {overview?.season && <SeasonSection season={overview.season} />}
          {overview && overview.recent.length > 0 && (
            <RecentSection recent={overview.recent} form={overview.form} />
          )}
          {overview && overview.news.length > 0 && (
            <NewsSection news={overview.news} />
          )}
          {!overview && !detail.data?.game && (
            <p className="text-center text-sm text-muted">
              No season stats available.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

// ─── The Game now or next ───────────────────────────────────────────────────

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

function GameSection({
  game,
  line,
  next,
  onNavigate,
}: {
  game: GameSummary | null
  line: ReadonlyArray<PlayerLine>
  next: PlayerOverview['next']
  onNavigate?: () => void
}) {
  if (!game) {
    if (!next) return null
    return (
      <Section title="Next game">
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
          <span className="font-semibold">
            {next.home ? 'vs' : '@'} {next.opponent}
          </span>
          <span className="text-muted">
            {' '}
            · {dateLabel(next.date)} {startTime(next.date)}
          </span>
        </div>
      </Section>
    )
  }
  const live = game.status === 'live' || game.status === 'delayed'
  const started = live || game.status === 'final'
  return (
    <Section title={live ? 'Live now' : started ? 'Today' : 'Next game'}>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <Link
          to="/games/$gameId"
          params={{ gameId: game.id }}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5"
        >
          <GameSide
            team={game.awayTeam}
            score={started ? game.score.away : null}
          />
          <span className="flex-1 text-center text-xs text-muted">
            {live ? (
              <span className="font-semibold text-live">
                {game.situation?.segmentLabel ?? 'Live'}
              </span>
            ) : game.status === 'final' ? (
              'Final'
            ) : (
              <>
                {dateLabel(game.startsAt)}
                <br />
                {startTime(game.startsAt)}
              </>
            )}
          </span>
          <GameSide
            team={game.homeTeam}
            score={started ? game.score.home : null}
            right
          />
        </Link>
        {line.map((l) => (
          <LineTable key={l.title} line={l} />
        ))}
        {started && line.length === 0 && (
          <p className="border-t border-border px-3 py-2 text-xs text-muted">
            Not in the box score yet.
          </p>
        )}
      </div>
    </Section>
  )
}

function GameSide({
  team,
  score,
  right,
}: {
  team: GameSummary['awayTeam']
  score: number | null
  right?: boolean
}) {
  return (
    <span
      className={cn('flex items-center gap-2', right && 'flex-row-reverse')}
    >
      <TeamLogo team={team} size={28} />
      <span className="text-sm font-semibold">{team.abbreviation}</span>
      {score !== null && (
        <span className="text-lg font-bold tabular-nums">{score}</span>
      )}
    </span>
  )
}

function LineTable({ line }: { line: PlayerLine }) {
  return (
    <div className="border-t border-border px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold text-muted">{line.title}</p>
      <div className="overflow-x-auto [scrollbar-width:none]">
        <table className="w-full text-center text-xs tabular-nums">
          <thead>
            <tr className="text-muted">
              {line.columns.map((c, i) => (
                <th key={i} className="px-1.5 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              {line.values.map((v, i) => (
                <td key={i} className="px-1.5 pt-0.5">
                  {v}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── The season, recent games, news ─────────────────────────────────────────

function SeasonSection({
  season,
}: {
  season: NonNullable<PlayerOverview['season']>
}) {
  // Consecutive stats of a group (Passing, then Rushing) share a grid.
  const groups: Array<{ name: string | null; stats: typeof season.stats }> = []
  for (const stat of season.stats) {
    const last = groups.at(-1)
    if (last && last.name === (stat.group ?? null)) last.stats.push(stat)
    else groups.push({ name: stat.group ?? null, stats: [stat] })
  }
  return (
    <Section title={season.title}>
      <div className="flex flex-col gap-2">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.name && (
              <p className="mb-1 text-[11px] font-semibold text-muted">
                {g.name}
              </p>
            )}
            <ul className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {g.stats.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-col items-center bg-surface px-1 py-2"
                >
                  <span className="text-base font-bold tabular-nums">
                    {s.value}
                  </span>
                  <span className="text-[10px] font-semibold text-muted uppercase">
                    {s.label}
                  </span>
                </li>
              ))}
              {/* Fill the last row so the grid's lines stay even. */}
              {Array.from(
                { length: (4 - (g.stats.length % 4)) % 4 },
                (_, i) => (
                  <li
                    key={`pad${i}`}
                    className="bg-surface"
                    aria-hidden="true"
                  />
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}

function RecentSection({
  recent,
  form,
}: {
  recent: PlayerOverview['recent']
  form: PlayerOverview['form']
}) {
  return (
    <Section title="Recent games">
      {form && <PlayerForm form={form} recent={recent} />}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {recent.map((g, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-14 shrink-0 text-xs text-muted">
              {g.date ? shortDate(g.date) : ''}
            </span>
            <span className="w-16 shrink-0 font-medium">
              {g.home ? 'vs' : '@'} {g.opponent}
            </span>
            <span className="flex w-14 shrink-0 gap-1 text-xs tabular-nums">
              {g.result && (
                <span
                  className={cn(
                    'font-bold',
                    g.result === 'W' ? 'text-scoring' : 'text-live',
                  )}
                >
                  {g.result}
                </span>
              )}
              {g.score && <span className="text-muted">{g.score}</span>}
            </span>
            <span className="min-w-0 flex-1 text-right text-xs leading-snug tabular-nums">
              {g.line}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function shortDate(date: string): string {
  // Plain dates ("2026-09-28") are calendar days, not instants.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date(date)
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
}

function NewsSection({ news }: { news: PlayerOverview['news'] }) {
  return (
    <Section title="News">
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {news.map((n, i) => (
          <li key={i}>
            <a
              href={n.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-0.5 px-3 py-2.5"
            >
              <span className="text-sm leading-snug font-medium">
                {n.headline}
              </span>
              {n.published && (
                <span className="text-[11px] text-muted">
                  {dateLabel(n.published)}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ─── The Viewer's stake in them ─────────────────────────────────────────────

/** The Viewer's Fantasy teams this Player is on, or is facing them on. */
function FantasySection({ playerId }: { playerId: string }) {
  const { data: leagues } = useFantasy()
  const [open, setOpen] = useState<string | null>(null)
  const entries = useMemo(
    () => fantasyEntries(leagues ?? [], playerId),
    [leagues, playerId],
  )
  if (entries.length === 0) return null
  return (
    <Section title="Fantasy">
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {entries.map((e) => {
          const key = `${e.league.id}~${e.side}`
          const tone = injuryTone(e.player.injury)
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpen((o) => (o === key ? null : key))}
                aria-expanded={open === key}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <LeagueLogo league={SPORTS[e.league.sport].league} size={20} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {e.side === 'mine'
                      ? (e.league.teamName ?? 'Your team')
                      : `Facing you: ${e.team}`}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {e.league.name} ·{' '}
                    {e.player.starter ? e.player.slot : 'Bench'}
                    {e.player.injury && (
                      <span
                        className={cn(
                          'font-semibold',
                          tone === 'red'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-yellow-700 dark:text-yellow-400',
                        )}
                      >
                        {' '}
                        · {injuryLabel(e.player.injury)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex flex-col items-end tabular-nums">
                  <span className="text-base font-bold">
                    {e.player.points === null
                      ? '—'
                      : e.player.points.toFixed(1)}
                  </span>
                  {e.player.projected !== null && (
                    <span className="text-[11px] text-muted">
                      proj {e.player.projected.toFixed(1)}
                    </span>
                  )}
                </span>
              </button>
              {open === key && (
                <Breakdown sport={e.league.sport} player={e.player} />
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function fantasyEntries(
  leagues: ReadonlyArray<FantasyLeagueView>,
  playerId: string,
): Array<{
  league: FantasyLeagueView
  side: 'mine' | 'opponent'
  team: string
  player: LineupPlayer
}> {
  return leagues.flatMap((league) => {
    const m = league.matchup
    if (!league.enabled || !m) return []
    return (
      [
        ['mine', m.mine],
        ['opponent', m.opponent],
      ] as const
    ).flatMap(([side, team]) => {
      const player = team?.lineup.find((p) => p.playerId === playerId)
      return player && team ? [{ league, side, team: team.name, player }] : []
    })
  })
}

/** The Viewer's open Predictions with a Leg on this Player (or Team). */
export function PredictionsSection({
  playerId,
  teamId,
}: {
  playerId?: string
  teamId?: string
}) {
  const { data: predictions } = usePredictions()
  const { data: connection } = useKalshiConnection()
  const [selected, setSelected] = useState<string | null>(null)
  const mine = (predictions ?? []).filter(
    (p) =>
      p.status === 'open' &&
      p.legs.some((l) =>
        playerId ? l.playerId === playerId : teamId && l.teamId === teamId,
      ),
  )
  if (mine.length === 0) return null
  const open = mine.find((p) => p.id === selected)
  return (
    <Section title="Your predictions">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex gap-2">
          {mine.map((p) => (
            <li key={p.id} className="flex shrink-0">
              <PredictionCard
                prediction={p}
                display={connection?.changeDisplay}
                onSelect={() => setSelected(p.id)}
              />
            </li>
          ))}
        </ul>
      </div>
      {open && (
        <PredictionSheet prediction={open} onClose={() => setSelected(null)} />
      )}
    </Section>
  )
}
