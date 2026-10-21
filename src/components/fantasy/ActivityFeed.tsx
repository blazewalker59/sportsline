/**
 * A Fantasy league's Activity (CONTEXT.md, "League activity"), newest
 * first, by day: each move's team, what it was, and the Players added
 * (+) and dropped (−); a trade lists each team's haul together, and a
 * contested waiver claim opens to every team's claim.
 */

import { headshotOf } from './format'
import type {
  ActivityEntry,
  ActivityItem,
  ActivityKind,
  LeagueActivity,
} from '@/lib/fantasy/activity'
import type { FantasySport } from '@/lib/fantasy/sports'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { clockTime, dateLabel } from '@/lib/time/format'
import { cn } from '@/lib/utils'

const KIND: Record<ActivityKind, string> = {
  add: 'Added',
  drop: 'Dropped',
  add_drop: 'Added & dropped',
  waiver: 'Waiver claim',
  trade: 'Trade',
}

/** Entries by the day they went through, newest day first. */
export function activityDays(
  entries: ReadonlyArray<ActivityEntry>,
  timeZone: string | null,
): Array<{ day: string; entries: Array<ActivityEntry> }> {
  const days: Array<{ day: string; entries: Array<ActivityEntry> }> = []
  for (const e of entries) {
    const day = dateLabel(e.at, timeZone)
    const last = days.at(-1)
    if (last?.day === day) last.entries.push(e)
    else days.push({ day, entries: [e] })
  }
  return days
}

/**
 * A trade by who it sends Players to: each team (in the trade's order)
 * with everyone it gets, so one side's haul reads together.
 */
export function tradeSides(
  e: ActivityEntry,
): Array<{ teamId: number | null; items: Array<ActivityItem> }> {
  const order = [
    ...e.teamIds,
    ...e.items.flatMap((i) =>
      i.toTeamId !== null && !e.teamIds.includes(i.toTeamId)
        ? [i.toTeamId]
        : [],
    ),
  ]
  const sides = order.map((teamId) => ({
    teamId: teamId as number | null,
    items: e.items.filter((i) => i.toTeamId === teamId),
  }))
  const nowhere = e.items.filter((i) => i.toTeamId === null)
  return [
    ...sides.filter((s) => s.items.length > 0),
    ...(nowhere.length > 0 ? [{ teamId: null, items: nowhere }] : []),
  ]
}

function ItemRow({
  sport,
  item: i,
  marked = false,
}: {
  sport: FantasySport
  item: ActivityItem
  /** An add or drop, marked + or −. */
  marked?: boolean
}) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {marked && (
        <span
          aria-label={i.action === 'add' ? 'Added' : 'Dropped'}
          className={cn(
            'w-3 shrink-0 text-center font-bold',
            i.action === 'add' ? 'text-scoring' : 'text-live',
          )}
        >
          {i.action === 'add' ? '+' : '−'}
        </span>
      )}
      <PlayerAvatar
        name={i.player.name}
        headshotUrl={headshotOf(sport, i.player)}
        size={24}
      />
      <span className="min-w-0 flex-1 truncate">
        {i.player.name}
        {i.player.teamAbbrev && (
          <span className="text-xs text-muted"> {i.player.teamAbbrev}</span>
        )}
      </span>
    </li>
  )
}

export function ActivityFeed({
  sport,
  activity,
  mine,
  timeZone,
}: {
  sport: FantasySport
  activity: LeagueActivity
  /** The Viewer's team. */
  mine: number | null
  timeZone: string | null
}) {
  if (activity.entries.length === 0)
    return <p className="text-sm text-muted">No moves in this league yet.</p>
  const teamName = (id: number | null) =>
    id === null
      ? 'Free agency'
      : (activity.teams.find((t) => t.teamId === id)?.name ?? `Team ${id}`)
  return (
    <div className="flex flex-col gap-5">
      {activityDays(activity.entries, timeZone).map(({ day, entries }) => (
        <section key={day}>
          {day && (
            <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
              {day}
            </h2>
          )}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {entries.map((e) => (
              <li
                key={e.id}
                className={cn(
                  'flex flex-col gap-1.5 px-3 py-2.5',
                  e.teamIds.includes(mine ?? NaN) && 'bg-notice',
                )}
              >
                <span className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {e.kind === 'trade'
                      ? e.teamIds.map(teamName).join(' ⇄ ')
                      : teamName(e.teamIds[0] ?? null)}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {KIND[e.kind]}
                    {e.bid ? ` · $${e.bid}` : ''}
                    {timeZone && ` · ${clockTime(e.at, timeZone)}`}
                  </span>
                </span>
                {e.kind === 'trade' ? (
                  tradeSides(e).map((side) => (
                    <div
                      key={side.teamId ?? 'none'}
                      className="flex flex-col gap-1"
                    >
                      <span className="text-xs font-semibold text-muted">
                        To {teamName(side.teamId)}
                      </span>
                      <ul className="flex flex-col gap-1">
                        {side.items.map((i) => (
                          <ItemRow
                            key={i.player.espnId}
                            sport={sport}
                            item={i}
                          />
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <ul className="flex flex-col gap-1">
                    {e.items.map((i) => (
                      <ItemRow
                        key={`${i.action}-${i.player.espnId}`}
                        sport={sport}
                        item={i}
                        marked
                      />
                    ))}
                  </ul>
                )}
                {e.claims && (
                  <details className="group text-sm">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-accent [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">
                        {e.claims.length - 1} other{' '}
                        {e.claims.length === 2 ? 'claim' : 'claims'} ›
                      </span>
                      <span className="hidden group-open:inline">
                        Every claim
                      </span>
                    </summary>
                    <ol className="mt-1.5 flex flex-col gap-1 rounded-lg bg-background px-2.5 py-2">
                      {e.claims.map((c) => (
                        <li
                          key={c.teamId}
                          className={cn(
                            'flex items-center gap-2',
                            c.won ? 'font-semibold' : 'text-muted',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {teamName(c.teamId)}
                          </span>
                          {c.bid !== null && (
                            <span className="tabular-nums">${c.bid}</span>
                          )}
                          <span
                            className={cn(
                              'w-12 text-right text-xs',
                              c.won ? 'text-scoring' : 'text-muted',
                            )}
                          >
                            {c.won ? 'Won' : 'Lost'}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
