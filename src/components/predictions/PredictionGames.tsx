/**
 * The Games a Prediction depends on, live, inside its sheet: score and
 * situation, the linescore, its Players' box lines, and the latest plays.
 * One Game opens at a time (each open Game listens live).
 */

import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { LegView, PredictionView } from '@/lib/kalshi/server'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { PlayText } from '@/components/chat/PlayText'
import { Linescore } from '@/components/games/GameView'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { typingFor } from '@/lib/timeline/chat'
import { gameSearch } from '@/lib/timeline/gameLink'
import { cn } from '@/lib/utils'

const PLAYS_SHOWN = 5

function statusLabel(game: GameSummary): string {
  if (game.status === 'live' || game.status === 'delayed')
    return game.situation?.segmentLabel ?? 'Live'
  if (game.status === 'final') return 'Final'
  if (game.status === 'postponed') return 'Postponed'
  return new Date(game.startsAt).toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
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
  if (games.length === 0) return null
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {games.length === 1 ? 'The game' : `${games.length} games`}
      </h3>
      <ul className="flex flex-col gap-2">
        {games.map((g) => {
          const expanded = g.id === open
          const live = g.status === 'live' || g.status === 'delayed'
          return (
            <li
              key={g.id}
              className="overflow-hidden rounded-xl border border-border bg-surface"
            >
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : g.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
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
                    'text-xs font-semibold',
                    live ? 'text-live' : 'text-muted',
                  )}
                >
                  {statusLabel(g)}
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
): Array<{ name: string; line: string }> {
  if (!box) return []
  return box.tables.flatMap((t) =>
    t.rows
      .filter((r) => r.player.id === playerId)
      .map((r) => ({
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
  const { data, isPending } = useLiveGame(gameId)
  if (isPending || !data) {
    return <p className="px-3 pb-3 text-xs text-muted">Loading the game…</p>
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
    <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
      {situation && (
        <p className="text-sm font-semibold text-live">{situation}</p>
      )}
      {data.box && <Linescore box={data.box} game={data.game} />}
      {players.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">
            Your players
          </h4>
          <ul className="flex flex-col gap-1 text-xs">
            {players.map((p, i) => (
              <li key={i}>
                <span className="font-semibold">{p.name}</span>{' '}
                <span className="text-muted tabular-nums">{p.line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plays.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">
            Latest
          </h4>
          <ul className="flex flex-col gap-1.5">
            {plays.map((item) => (
              <li key={item.id} className="text-[13px] leading-snug">
                <span className="mr-1.5 text-[11px] font-semibold text-muted tabular-nums">
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
        className="self-start text-sm font-semibold text-accent"
      >
        Open the game thread ›
      </Link>
    </div>
  )
}
