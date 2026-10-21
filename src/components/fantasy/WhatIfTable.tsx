/**
 * What-if standings (CONTEXT.md, "What-if standings"): each team's record
 * had it started its best lineup every week, against its opponents as
 * they played, next to its real one; the points it left on the bench,
 * and the losses a best lineup would have won.
 */

import type { LeagueWhatIf } from '@/lib/fantasy/whatIfRead'
import { cn } from '@/lib/utils'

const record = (w: number, l: number, t: number) =>
  `${w}-${l}${t ? `-${t}` : ''}`

export function WhatIfTable({
  whatIf,
  mine,
}: {
  whatIf: LeagueWhatIf
  /** The Viewer's team. */
  mine: number | null
}) {
  if (whatIf.rows.length === 0)
    return (
      <p className="text-sm text-muted">
        What-if standings show once a week of the season is finished.
      </p>
    )
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm whitespace-nowrap tabular-nums">
          <thead className="text-[11px] text-muted uppercase">
            <tr className="border-b border-border">
              <th className="py-2 pr-1 pl-3 text-left font-semibold">#</th>
              <th className="px-1 text-left font-semibold">Team</th>
              <th className="px-1 text-right font-semibold">What if</th>
              <th className="px-1 text-right font-semibold">Actual</th>
              <th className="px-1 text-right font-semibold">Bench</th>
              <th className="pr-3 pl-1 text-right font-semibold">Flips</th>
            </tr>
          </thead>
          <tbody>
            {whatIf.rows.map((r, i) => {
              const gained = r.whatIfWins - r.wins
              return (
                <tr
                  key={r.teamId}
                  aria-current={r.teamId === mine || undefined}
                  className={cn(
                    'border-b border-border last:border-b-0',
                    r.teamId === mine && 'bg-notice font-semibold',
                  )}
                >
                  <td className="py-2 pr-1 pl-3 text-muted">{i + 1}</td>
                  <td className="max-w-36 truncate px-1">{r.name}</td>
                  <td className="px-1 text-right font-semibold">
                    {record(r.whatIfWins, r.whatIfLosses, r.whatIfTies)}
                    {gained > 0 && (
                      <span className="ml-1 text-[11px] text-scoring">
                        +{gained}
                      </span>
                    )}
                  </td>
                  <td className="px-1 text-right text-muted">
                    {record(r.wins, r.losses, r.ties)}
                  </td>
                  <td className="px-1 text-right">{r.benchLeft.toFixed(1)}</td>
                  <td className="pr-3 pl-1 text-right">
                    {r.flips}
                    {r.oneMoveFlips > 0 && (
                      <span className="text-[11px] text-muted">
                        {' '}
                        ({r.oneMoveFlips} by one swap)
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        Over {whatIf.weeks} finished {whatIf.weeks === 1 ? 'week' : 'weeks'}:
        each team’s record had it started its best lineup every week, against
        its opponents’ real scores. Bench: points its best lineups would have
        added. Flips: losses a best lineup would have won.
      </p>
    </div>
  )
}
