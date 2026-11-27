/**
 * The Games a Prediction depends on, live, inside its sheet: score and
 * situation, the linescore, its Players' box lines, and the latest plays.
 * One Game opens at a time (each open Game listens live).
 */

import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { LegView, PredictionView } from '@/lib/kalshi/predictionViews'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { PlayText } from '@/components/chat/PlayText'
import { Linescore } from '@/components/games/GameView'
import { InlineError } from '@/components/layout/RouteStates'
import { Skeleton, SkeletonStatus } from '@/components/layout/Skeleton'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { typingFor } from '@/lib/timeline/chat'
import { gameSearch } from '@/lib/timeline/gameLink'
import { SectionLabel } from '@/components/signal/Section'
import { cn } from '@/lib/utils'
import { PlayerButton } from '@/components/players/playerSheet'
import { weekdayTime } from '@/lib/time/format'
import { useTimeZone } from '@/lib/time/useTimeZone'

const PLAYS_SHOWN = 5

function statusLabel(game: GameSummary, timeZone: string | null): string {
  if (game.status === 'live' || game.status === 'delayed')
    return game.situation?.segmentLabel ?? 'Live'
  if (game.status === 'final') return 'Final'
  if (game.status === 'postponed') return 'Postponed'
  return weekdayTime(game.startsAt, timeZone)
}

export function PredictionGames({
  prediction,
  onNavigate,
}: {
  prediction: PredictionView
  onNavigate: () => void
}) {
  const games = [
    ...new Map(
      prediction.legs.flatMap((l) => (l.game ? [[l.game.id, l.game]] : [])),
    ).values(),
  ] as Array<GameSummary>
  // Start on a Game being played, else the first.
  const [open, setOpen] = useState<string | null>(
    () =>
      games.find((g) => g.status === 'live' || g.status === 'delayed')?.id ??
      games[0]?.id ??
      null,
  )
  const timeZone = useTimeZone()
  if (games.length === 0) return null
  return (
    <section>
      <SectionLabel
        as="h3"
        title={games.length === 1 ? 'The game' : `${games.length} games`}
      />
      <ul className="flex flex-col gap-2">
        {games.map((g) => {
          const expanded = g.id === open
          const live = g.status === 'live' || g.status === 'delayed'
          return (
            <li key={g.id} className="overflow-hidden rounded-card bg-surface">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : g.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <LeagueLogo league={g.league} size={16} />
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold tabular-nums">
                  <TeamLogo team={g.awayTeam} size={20} />
                  {g.awayTeam.abbreviation}
                  {g.status !== 'scheduled' && ` ${g.score.away}`}
                  <span className="text-muted">–</span>
                  {g.status !== 'scheduled' && `${g.score.home} `}
                  {g.homeTeam.abbreviation}
                  <TeamLogo team={g.homeTeam} size={20} />
                </span>
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-3xs uppercase',
                    live ? 'font-bold text-live' : 'text-muted',
                  )}
                >
                  {live && (
                    <span className="led led-pulse" aria-hidden="true" />
                  )}
                  {statusLabel(g, timeZone)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'text-muted transition-transform',
                    expanded && 'rotate-90',
                  )}
                >
                  ›
                </span>
              </button>
              {expanded && (
                <GamePanel
                  gameId={g.id}
                  legs={prediction.legs.filter((l) => l.game?.id === g.id)}
                  onNavigate={onNavigate}
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** A Player's lines in the box score: "Receiving: 5 REC · 72 YDS · 1 TD". */
function playerLines(
  box: GameBox | null,
  playerId: string,
): Array<{ id: string; name: string; line: string }> {
  if (!box) return []
  return box.tables.flatMap((t) =>
    t.rows
      .filter((r) => r.player.id === playerId)
      .map((r) => ({
        id: playerId,
        name: r.player.name,
        line: `${t.title.replace(/^\S+\s/, '')}: ${t.columns
          .map((c, i) => `${r.values[i]} ${c}`)
          .join(' · ')}`,
      })),
  )
}

function GamePanel({
  gameId,
  legs,
  onNavigate,
}: {
  gameId: string
  legs: ReadonlyArray<LegView>
  onNavigate: () => void
}) {
  const game = useLiveGame(gameId)
  const { data } = game
  if (!data && game.isError) {
    return (
      <div className="px-3 pb-3">
        <InlineError
          what="the game"
          error={game.error}
          onRetry={() => game.refetch()}
        />
      </div>
    )
  }
  if (data === null) {
    return (
      <p className="px-3 pb-3 text-xs text-muted">This game isn’t available.</p>
    )
  }
  if (!data) {
    // The panel's own lines (situation, linescore, plays) while it loads.
    return (
      <SkeletonStatus
        label="Loading the game"
        className="flex flex-col gap-3 border-t border-border px-4 py-3"
      >
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
      </SkeletonStatus>
    )
  }
  const situation = typingFor(data.game)?.text
  const plays = data.items
    .filter((i) => i.kind !== 'milestone')
    .slice(-PLAYS_SHOWN)
    .reverse()
  const players = [
    ...new Set(legs.flatMap((l) => (l.playerId ? [l.playerId] : []))),
  ].flatMap((id) => playerLines(data.box, id))
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
      {situation && (
        <p className="text-sm font-semibold text-live">{situation}</p>
      )}
      {data.box && <Linescore box={data.box} game={data.game} />}
      {players.length > 0 && (
        <div>
          <h4 className="subject-ink mb-1 text-3xs font-bold text-muted uppercase">
            Your players
          </h4>
          <ul className="flex flex-col gap-1 text-xs">
            {players.map((p, i) => (
              <li key={i}>
                <PlayerButton playerId={p.id} className="font-semibold">
                  {p.name}
                </PlayerButton>{' '}
                <span className="text-muted tabular-nums">{p.line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plays.length > 0 && (
        <div>
          <h4 className="subject-ink mb-1 text-3xs font-bold text-muted uppercase">
            Latest
          </h4>
          <ul className="flex flex-col gap-1.5">
            {plays.map((item) => (
              <li key={item.id} className="text-[13px] leading-snug">
                <span className="mr-1.5 font-label text-3xs text-muted tabular-nums">
                  {item.segmentLabel}
                </span>
                <PlayText item={item} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link
        to="/"
        search={gameSearch(data.game.id, data.game.sportsDay)}
        onClick={onNavigate}
        className="key inline-flex h-9 items-center self-start rounded-control px-3 text-3xs font-bold uppercase"
      >
        Open the game thread ›
      </Link>
    </div>
  )
}
