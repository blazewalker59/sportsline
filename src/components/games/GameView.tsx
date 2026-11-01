/**
 * One Game inside the Timeline (design direction "Watch Party"). Selecting
 * a Game only filters the feed; its box score opens as a sheet over it,
 * so it never feels like a new screen.
 */

import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { GameFlow } from '@/components/charts/lazy'
import { Sheet } from '@/components/chat/Sheet'
import { TeamMark } from '@/components/brand/TeamMark'
import { BoxScore } from '@/components/games/BoxScore'
import { FollowButton } from '@/components/follows/FollowButton'
import { pairSubject, teamSubject } from '@/lib/brand/subject'
import { cn } from '@/lib/utils'

/**
 * The box score over the feed, so closing it lands exactly where you were.
 * It wears both teams' colors, away on the left and home on the right;
 * the stats card wears the team it shows.
 */
export function BoxSheet({
  game,
  box,
  onClose,
}: {
  game: GameSummary
  box: GameBox | null
  onClose: () => void
}) {
  return (
    <Sheet
      title="Box score"
      subject={pairSubject(
        teamSubject(game.awayTeam.colors),
        teamSubject(game.homeTeam.colors),
      )}
      onClose={onClose}
    >
      <div className="flex justify-between gap-2">
        {[game.awayTeam, game.homeTeam].map((team, i) => (
          <div
            key={team.id}
            className={cn('flex items-center gap-2', i === 1 && 'subject-b')}
          >
            <TeamMark team={team} size={20} bold className="subject-ink" />
            <FollowButton follow={{ kind: 'team', teamId: team.id }} />
          </div>
        ))}
      </div>
      {box && <Linescore box={box} game={game} />}
      <GameFlow game={game} />
      {box && box.tables.length > 0 ? (
        <BoxScore box={box} game={game} />
      ) : (
        <p className="mt-10 text-center text-sm text-muted">
          No box score yet.
        </p>
      )}
    </Sheet>
  )
}

/**
 * Score by segment. With 9+ innings it is wider than a phone, so the team
 * column and the totals stay pinned and only the segments scroll.
 */
export function Linescore({ box, game }: { box: GameBox; game: GameSummary }) {
  const ls = box.linescore
  if (ls.segments.length === 0) return null
  const pinnedLeft = 'sticky left-0 z-[1] bg-surface'
  const pinnedRight = 'sticky right-0 z-[1] bg-surface'
  // Each team's mark in its own ink (no row tint: the rows read as one).
  const row = (
    team: GameSummary['awayTeam'],
    runs: Array<number | null>,
    totals: Array<number>,
    home = false,
  ) => (
    <tr className={cn(home && 'subject-b')}>
      <th
        className={cn(pinnedLeft, 'py-1.5 pr-2 pl-3 text-left font-semibold')}
      >
        <TeamMark team={team} size={18} className="subject-ink" />
      </th>
      {runs.map((r, i) => (
        <td key={i} className="min-w-6 px-1 text-center text-muted">
          {r ?? '–'}
        </td>
      ))}
      <td className={cn(pinnedRight, 'pr-3 pl-2')}>
        <span className="flex gap-3 border-l border-border pl-2.5">
          {totals.map((t, i) => (
            <span
              key={i}
              className={cn(
                'min-w-5 text-center',
                i === 0 ? 'font-extrabold' : 'font-semibold',
              )}
            >
              {t}
            </span>
          ))}
        </span>
      </td>
    </tr>
  )
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface py-1.5">
      <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
        <thead>
          <tr className="text-[11px] text-muted">
            <th className={pinnedLeft} />
            {ls.segments.map((seg) => (
              <th key={seg} className="min-w-6 px-1 font-normal">
                {seg}
              </th>
            ))}
            <th className={cn(pinnedRight, 'pr-3 pl-2 font-normal')}>
              <span className="flex gap-3 border-l border-border pl-2.5">
                {ls.totalColumns.map((c) => (
                  <span key={c} className="min-w-5 text-center">
                    {c}
                  </span>
                ))}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {row(game.awayTeam, ls.away, ls.awayTotals)}
          {row(game.homeTeam, ls.home, ls.homeTotals, true)}
        </tbody>
      </table>
    </div>
  )
}
