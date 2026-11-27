/**
 * A Player in full: their Team's Game now or next with their line in it,
 * the Viewer's Predictions and Fantasy teams they're in, their season,
 * recent games and news. Opens as a sheet over wherever the Viewer is
 * (`usePlayerSheet`), so closing it lands exactly where they were.
 */

import { Link } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { PredictionsSection } from './PredictionsSection'
import { Section } from './Section'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer } from '@/lib/fantasy/matchup'
import type { PlayerLine } from '@/lib/players/detail'
import type { PlayerProfile } from '@/lib/players/server'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { PlayerOverview } from '@/lib/model/types'
import { PlayerForm } from '@/components/charts/lazy'
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
import { Num } from '@/components/signal/Num'
import { PlaySheet } from '@/components/games/PlayDetailScreen'
import { InlineError } from '@/components/layout/RouteStates'
import {
  CardSkeleton,
  DetailHeaderSkeleton,
  RowsSkeleton,
} from '@/components/layout/Skeleton'
import { teamSubject } from '@/lib/brand/subject'
import { SPORTS } from '@/lib/fantasy/sports'
import { useFantasy } from '@/lib/fantasy/useFantasy'
import { usePlayerDetail, usePlayerFirstPage } from '@/lib/players/usePlayer'
import { cn } from '@/lib/utils'
import { useViewer } from '@/lib/viewer/useViewer'
import { clockTime, dateLabel, formatDate } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

// ─── The sheet, from anywhere (opened by PlayerSheetProvider) ───────────────

const RECENT_PLAYS = 5

export function PlayerSheet({
  playerId,
  onClose,
}: {
  playerId: string
  onClose: () => void
}) {
  const page = usePlayerFirstPage(playerId)
  const [playId, setPlayId] = useState<string | null>(null)
  const player = page.data?.player
  return (
    <Sheet
      title="Player"
      subject={teamSubject(player?.team?.colors)}
      onClose={onClose}
    >
      {page.isPending ? (
        <div className="flex flex-col gap-5">
          <DetailHeaderSkeleton />
          <RowsSkeleton rows={3} />
        </div>
      ) : page.isError && page.data === undefined ? (
        <InlineError
          what="this player"
          error={page.error}
          onRetry={() => page.refetch()}
          className="my-6"
        />
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
              <ul className="divide-y divide-border rounded-card border border-border bg-surface">
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
                className="key mt-3 flex h-10 w-full items-center justify-center rounded-control text-3xs font-bold uppercase"
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
        className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5 text-left"
      >
        <span className="text-3xs text-muted uppercase tabular-nums">
          {item.awayTeam.abbreviation} {item.score.away}–{item.score.home}{' '}
          {item.homeTeam.abbreviation} · {item.segmentLabel}
        </span>
        <PlayGlyph significance={item.significance} />
        <span
          className={cn(
            'col-span-2 text-sm leading-snug',
            item.significance === 'scoring'
              ? 'font-semibold'
              : item.significance === 'routine' && 'text-muted',
          )}
        >
          {item.description}
        </span>
      </button>
    </li>
  )
}

/** ● scored, ◐ notable, ○ routine (Signal's state glyphs). */
function PlayGlyph({
  significance,
}: {
  significance: TimelineItem['significance']
}) {
  if (!significance) return <span />
  return (
    <span
      aria-hidden="true"
      className={cn(
        'w-3.5 text-center text-xs',
        significance === 'scoring' ? 'text-scoring' : 'text-muted',
      )}
    >
      {significance === 'scoring'
        ? '●'
        : significance === 'notable'
          ? '◐'
          : '○'}
    </span>
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
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
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
          <div className="mt-1.5">
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
  const detail = usePlayerDetail(player.id)
  const overview = detail.data?.overview ?? null
  return (
    <div className="flex flex-col gap-5">
      <FantasySection playerId={player.id} />
      <PredictionsSection playerId={player.id} />
      {detail.isPending ? (
        <CardSkeleton label="Loading their season" />
      ) : detail.isError && detail.data === undefined ? (
        <InlineError
          what="their season"
          error={detail.error}
          onRetry={() => detail.refetch()}
        />
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
              <div className="well rounded-card px-3 py-2.5">
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

// ─── The Game now or next ───────────────────────────────────────────────────

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
  const timeZone = useTimeZone()
  if (!game) {
    if (!next) return null
    return (
      <Section title="Next game">
        <div className="flex items-baseline justify-between gap-3 rounded-card border border-border bg-surface px-3 py-2.5 text-sm">
          <span className="font-semibold">
            {next.home ? 'vs' : '@'} {next.opponent}
          </span>
          <span className="text-3xs text-muted uppercase">
            {dateLabel(next.date, timeZone)} · {clockTime(next.date, timeZone)}
          </span>
        </div>
      </Section>
    )
  }
  const live = game.status === 'live' || game.status === 'delayed'
  const started = live || game.status === 'final'
  // The leader's score is lit only while the Game is live.
  const leader = !live
    ? null
    : game.score.away > game.score.home
      ? 'away'
      : game.score.home > game.score.away
        ? 'home'
        : null
  return (
    <Section title={live ? 'Live now' : started ? 'Today' : 'Next game'}>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <Link
          to="/games/$gameId"
          params={{ gameId: game.id }}
          onClick={onNavigate}
          className="block px-3 pt-2.5 pb-3"
        >
          <span className="flex items-center justify-between gap-2 text-3xs text-muted uppercase">
            <span className="flex items-center gap-2">
              {live && <span aria-hidden="true" className="led led-pulse" />}
              {live ? (
                <span className="text-live">
                  {game.situation?.segmentLabel ?? 'Live'}
                </span>
              ) : game.status === 'final' ? (
                'Final'
              ) : (
                <>
                  {dateLabel(game.startsAt, timeZone)} ·{' '}
                  {clockTime(game.startsAt, timeZone)}
                </>
              )}
            </span>
            <span aria-hidden="true">Game →</span>
          </span>
          <span className="mt-2 grid grid-cols-2 items-end gap-3">
            <GameSide
              team={game.awayTeam}
              score={started ? game.score.away : null}
              lit={leader === 'away'}
            />
            <GameSide
              team={game.homeTeam}
              score={started ? game.score.home : null}
              lit={leader === 'home'}
              right
            />
          </span>
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
  lit,
  right,
}: {
  team: GameSummary['awayTeam']
  score: number | null
  /** Leading a live Game. */
  lit?: boolean
  right?: boolean
}) {
  return (
    <span className={cn('flex flex-col gap-1.5', right && 'items-end')}>
      <span
        className={cn(
          'flex items-center gap-1.5 text-sm font-semibold',
          right && 'flex-row-reverse',
        )}
      >
        <TeamLogo team={team} size={22} />
        {team.abbreviation}
      </span>
      {score !== null && (
        <Num className={cn('text-5xl', lit && 'text-live')}>{score}</Num>
      )}
    </span>
  )
}

function LineTable({ line }: { line: PlayerLine }) {
  return (
    <div className="border-t border-border px-3 py-2">
      <p className="mb-1 text-3xs text-muted uppercase">{line.title}</p>
      <div className="overflow-x-auto [scrollbar-width:none]">
        <table className="w-full text-center text-[13px] whitespace-nowrap tabular-nums">
          <thead>
            <tr className="text-muted">
              {line.columns.map((c, i) => (
                <th
                  key={i}
                  className="border-b border-border px-1.5 pb-1 text-3xs font-normal uppercase"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              {line.values.map((v, i) => (
                <td key={i} className="px-1.5 pt-1">
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
              <p className="mb-1 text-3xs text-muted uppercase">{g.name}</p>
            )}
            <ul className="grid grid-cols-4 gap-px overflow-hidden rounded-card border border-border bg-border">
              {g.stats.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-col items-center gap-0.5 bg-surface px-1 py-2"
                >
                  <span className="text-base font-semibold tabular-nums">
                    {s.value}
                  </span>
                  <span className="text-3xs text-muted uppercase">
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
  const timeZone = useTimeZone()
  return (
    <Section title="Recent games">
      {form && <PlayerForm form={form} recent={recent} />}
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {recent.map((g, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-14 shrink-0 text-3xs text-muted uppercase tabular-nums">
              {g.date ? numericDate(g.date, timeZone) : ''}
            </span>
            <span className="w-16 shrink-0 font-medium">
              {g.home ? 'vs' : '@'} {g.opponent}
            </span>
            <span className="flex w-14 shrink-0 gap-1 text-xs tabular-nums">
              {g.result && (
                <span
                  className={cn(
                    'font-bold',
                    g.result === 'W' ? 'text-foreground' : 'text-muted',
                  )}
                >
                  {g.result}
                </span>
              )}
              {g.score && <span className="text-muted">{g.score}</span>}
            </span>
            <span className="min-w-0 flex-1 text-right text-xs leading-snug tabular-nums">
              <StatLine line={g.line} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/**
 * "5-13 FG · 2-2 FT · …", wrapping only between stats: left alone, a
 * browser breaks after the hyphen in "5-13".
 */
function StatLine({ line }: { line: string }) {
  const stats = line.split(' · ')
  return stats.map((stat, i) => (
    <Fragment key={i}>
      <span className="whitespace-nowrap">
        {stat}
        {i < stats.length - 1 && ' ·'}
      </span>{' '}
    </Fragment>
  ))
}

/** "9/28": plain dates are calendar days, the rest instants. */
const numericDate = (date: string, timeZone: string | null) =>
  formatDate(date, timeZone, { month: 'numeric', day: 'numeric' })

function NewsSection({ news }: { news: PlayerOverview['news'] }) {
  const timeZone = useTimeZone()
  return (
    <Section title="News">
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
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
                <span className="text-2xs text-muted">
                  {dateLabel(n.published, timeZone)}
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
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
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
                  {/* Orange is the Viewer's own: their starter. */}
                  <span
                    className={cn(
                      'flex items-center gap-1.5 truncate text-sm font-semibold',
                      e.side === 'mine' && e.player.starter && 'text-live',
                    )}
                  >
                    {e.side === 'mine' && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'led size-1.5',
                          !e.player.starter && 'led-off',
                        )}
                      />
                    )}
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
                          tone === 'red' ? 'text-negative' : 'text-warning',
                        )}
                      >
                        {' '}
                        · {injuryLabel(e.player.injury)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 tabular-nums">
                  <Num className="text-2xl">
                    {e.player.points === null
                      ? '—'
                      : e.player.points.toFixed(1)}
                  </Num>
                  {e.player.projected !== null && (
                    <span className="text-2xs text-muted">
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
