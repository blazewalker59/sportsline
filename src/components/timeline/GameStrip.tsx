import { Link } from '@tanstack/react-router'
import { startTime } from './format'
import type { GameSummary } from '@/lib/model/timeline'
import { TeamLogo } from '@/components/brand/TeamMark'
import { cn } from '@/lib/utils'

/** Today's Games as pills, live first; the live Situation lives in the feed's typing indicators. */
export function GameStrip({ games }: { games: Array<GameSummary> }) {
  if (games.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <ul className="flex gap-2">
        {games.map((game) => (
          <li key={game.id}>
            <GamePill game={game} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function GamePill({ game }: { game: GameSummary }) {
  const live = game.status === 'live' || game.status === 'delayed'
  const started = live || game.status === 'final'
  return (
    <Link
      to="/games/$gameId"
      params={{ gameId: game.id }}
      className={cn(
        'flex min-h-11 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1.5 whitespace-nowrap',
        live ? 'border-live/50 bg-surface' : 'border-border bg-surface',
        game.status === 'final' && 'text-muted',
      )}
      aria-label={`${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}`}
    >
      <TeamLogo team={game.awayTeam} size={22} />
      <span className="flex flex-col items-center leading-none">
        <span className="text-sm font-bold tabular-nums">
          {started ? `${game.score.away}–${game.score.home}` : '@'}
        </span>
        <span
          className={cn(
            'mt-0.5 text-[10px] font-semibold',
            live ? 'text-live' : 'text-muted',
          )}
        >
          {status(game)}
        </span>
      </span>
      <TeamLogo team={game.homeTeam} size={22} />
    </Link>
  )
}

function status(game: GameSummary): string {
  switch (game.status) {
    case 'live':
      return game.situation?.segmentLabel.split(' ')[0] ?? 'Live'
    case 'delayed':
      return 'Delayed'
    case 'final':
      return 'Final'
    case 'postponed':
      return 'Ppd'
    default:
      return startTime(game.startsAt)
  }
}
