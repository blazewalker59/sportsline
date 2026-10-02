import { Link } from '@tanstack/react-router'
import { startTime } from './format'
import type { GameSummary } from '@/lib/model/timeline'
import { Bases, Outs } from '@/components/mlb/Bases'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamMark } from '@/components/brand/TeamMark'
import { cn } from '@/lib/utils'

interface MlbSituation {
  outs?: number
  onFirst?: boolean
  onSecond?: boolean
  onThird?: boolean
}

/** Today's Games, live first, each showing its Situation. */
export function GameStrip({ games }: { games: Array<GameSummary> }) {
  if (games.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <ul className="flex gap-2">
        {games.map((game) => (
          <li key={game.id}>
            <Link
              to="/games/$gameId"
              params={{ gameId: game.id }}
              className="block"
            >
              <GameChip game={game} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GameChip({ game }: { game: GameSummary }) {
  const live = game.status === 'live' || game.status === 'delayed'
  const started = live || game.status === 'final'
  const leader =
    game.score.away === game.score.home
      ? null
      : game.score.away > game.score.home
        ? 'away'
        : 'home'
  return (
    <div
      className={cn(
        'min-w-[9.5rem] rounded-xl border bg-surface px-3 py-2 text-sm',
        live ? 'border-live/40' : 'border-border',
      )}
    >
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
        <LeagueLogo league={game.league} size={16} />
        <StatusLabel game={game} />
      </div>
      {(['away', 'home'] as const).map((side) => (
        <div
          key={side}
          className="flex items-center justify-between tabular-nums"
        >
          <TeamMark
            team={side === 'away' ? game.awayTeam : game.homeTeam}
            bold={leader === side}
            className={leader === side ? undefined : 'text-foreground/80'}
          />
          {started && (
            <span
              className={cn(
                leader === side ? 'font-semibold' : 'text-foreground/80',
              )}
            >
              {game.score[side]}
            </span>
          )}
        </div>
      ))}
      {live && game.league === 'mlb' && game.situation && (
        <MlbSituationLine detail={game.situation.detail as MlbSituation} />
      )}
      {live &&
        game.league === 'nhl' &&
        (game.situation?.detail as { strength?: string | null } | undefined)
          ?.strength && (
          <div className="mt-1.5 truncate text-[11px] text-muted">
            {(game.situation?.detail as { strength: string }).strength}
          </div>
        )}
      {live && game.league === 'nfl' && game.situation && (
        <NflSituationLine detail={game.situation.detail as NflSituation} />
      )}
    </div>
  )
}

function StatusLabel({ game }: { game: GameSummary }) {
  switch (game.status) {
    case 'live':
      return (
        <span className="flex items-center gap-1 text-live">
          <span className="size-1.5 animate-pulse rounded-full bg-live" />
          {game.situation?.segmentLabel ?? 'Live'}
        </span>
      )
    case 'delayed':
      return <span className="text-scoring">Delayed</span>
    case 'final':
      return <span>Final</span>
    case 'postponed':
      return <span>Ppd</span>
    default:
      return <span>{startTime(game.startsAt)}</span>
  }
}

interface NflSituation {
  downDistance?: string | null
  possession?: string | null
}

function NflSituationLine({ detail }: { detail: NflSituation }) {
  if (!detail.downDistance) return null
  return (
    <div className="mt-1.5 truncate text-[11px] text-muted">
      {detail.possession && (
        <span className="mr-1 font-semibold text-foreground/80">
          {detail.possession}
        </span>
      )}
      {detail.downDistance}
    </div>
  )
}

function MlbSituationLine({ detail }: { detail: MlbSituation }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
      <Bases
        first={detail.onFirst}
        second={detail.onSecond}
        third={detail.onThird}
      />
      <Outs outs={detail.outs ?? 0} />
    </div>
  )
}
