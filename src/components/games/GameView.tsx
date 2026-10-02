/**
 * One Game inside the Timeline (design direction "Watch Party"). Selecting
 * a Game only filters the feed; its box score opens as a sheet over it,
 * so it never feels like a new screen.
 */

import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { Sheet } from '@/components/chat/Sheet'
import { TeamLogo, TeamMark } from '@/components/brand/TeamMark'
import { FollowButton } from '@/components/follows/FollowButton'
import { cn } from '@/lib/utils'

/** The box score over the feed, so closing it lands exactly where you were. */
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
    <Sheet title="Box score" onClose={onClose}>
      <div className="flex justify-between gap-2">
        {[game.awayTeam, game.homeTeam].map((team) => (
          <div key={team.id} className="flex items-center gap-2">
            <TeamMark team={team} size={20} bold />
            <FollowButton follow={{ kind: 'team', teamId: team.id }} />
          </div>
        ))}
      </div>
      {box && <Linescore box={box} game={game} />}
      <BoxTables box={box} game={game} />
    </Sheet>
  )
}

/**
 * Score by segment. With 9+ innings it is wider than a phone, so the team
 * column and the totals stay pinned and only the segments scroll.
 */
function Linescore({ box, game }: { box: GameBox; game: GameSummary }) {
  const ls = box.linescore
  if (ls.segments.length === 0) return null
  const pinnedLeft = 'sticky left-0 z-[1] bg-surface'
  const pinnedRight = 'sticky right-0 z-[1] bg-surface'
  const row = (
    team: GameSummary['awayTeam'],
    runs: Array<number | null>,
    totals: Array<number>,
  ) => (
    <tr>
      <th
        className={cn(pinnedLeft, 'py-1.5 pr-2 pl-3 text-left font-semibold')}
      >
        <TeamMark team={team} size={18} />
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
          {row(game.homeTeam, ls.home, ls.homeTotals)}
        </tbody>
      </table>
    </div>
  )
}

function BoxTables({ box, game }: { box: GameBox | null; game: GameSummary }) {
  if (!box || box.tables.length === 0) {
    return (
      <p className="mt-10 text-center text-sm text-muted">No box score yet.</p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {box.tables.map((t) => (
        <div
          key={t.title}
          className="overflow-x-auto rounded-xl border border-border bg-surface"
        >
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-3 py-2 text-left font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <TeamLogo
                      team={t.side === 'away' ? game.awayTeam : game.homeTeam}
                      size={16}
                    />
                    {t.title}
                  </span>
                </th>
                {t.columns.map((c) => (
                  <th key={c} className="px-2 py-2 text-right font-normal">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr
                  key={`${r.player.name}-${i}`}
                  className="border-b border-border/50 last:border-0"
                >
                  <td
                    className={cn(
                      'py-1.5 pr-2',
                      r.sub ? 'pl-6 text-foreground/80' : 'pl-3',
                    )}
                  >
                    {r.player.name}
                    {r.note && (
                      <span className="ml-1.5 text-muted">{r.note}</span>
                    )}
                  </td>
                  {r.values.map((v, j) => (
                    <td key={j} className="px-2 text-right">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
