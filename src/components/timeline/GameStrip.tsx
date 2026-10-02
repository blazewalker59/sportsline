import { startTime } from './format'
import type { GameSummary } from '@/lib/model/timeline'
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
            <GameChip game={game} />
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
        <span>{game.league}</span>
        <StatusLabel game={game} />
      </div>
      {(['away', 'home'] as const).map((side) => (
        <div
          key={side}
          className="flex items-center justify-between tabular-nums"
        >
          <span
            className={cn(
              leader === side ? 'font-semibold' : 'text-foreground/80',
            )}
          >
            {side === 'away'
              ? game.awayTeam.abbreviation
              : game.homeTeam.abbreviation}
          </span>
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

function MlbSituationLine({ detail }: { detail: MlbSituation }) {
  const outs = detail.outs ?? 0
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
      <Bases
        first={detail.onFirst}
        second={detail.onSecond}
        third={detail.onThird}
      />
      <span className="flex gap-0.5" aria-label={`${outs} out`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'size-1.5 rounded-full',
              i < outs ? 'bg-foreground/80' : 'bg-border',
            )}
          />
        ))}
      </span>
    </div>
  )
}

function Bases({
  first,
  second,
  third,
}: {
  first?: boolean
  second?: boolean
  third?: boolean
}) {
  const base = (on: boolean | undefined, x: number, y: number) => (
    <rect
      x={x}
      y={y}
      width="5"
      height="5"
      transform={`rotate(45 ${x + 2.5} ${y + 2.5})`}
      className={on ? 'fill-scoring' : 'fill-none stroke-muted'}
      strokeWidth="1"
    />
  )
  return (
    <svg
      width="18"
      height="13"
      viewBox="0 0 18 13"
      aria-label="Runners on base"
    >
      {base(third, 2, 6)}
      {base(second, 6.5, 1.5)}
      {base(first, 11, 6)}
    </svg>
  )
}
