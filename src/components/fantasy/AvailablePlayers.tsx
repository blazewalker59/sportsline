/**
 * A Fantasy league's Available players (CONTEXT.md, "Available players"):
 * searched by name or Team, narrowed to a position, each with what says
 * they're worth a look (ESPN: how rostered, and the week's move; Sleeper:
 * this week's projection), waiver Players marked; with roster moves on,
 * each one Add or Claim.
 */

import { useState } from 'react'
import { POSITIONS, headshotOf, injuryLabel, injuryTone, pts } from './format'
import { Segmented } from './Segmented'
import type {
  AvailablePlayers as Available,
  AvailablePlayer,
} from '@/lib/fantasy/freeAgents'
import type { FantasySport } from '@/lib/fantasy/sports'
import { searchAvailable } from '@/lib/fantasy/freeAgents'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { cn } from '@/lib/utils'

/** How many rows show at a time; the rest one tap away. */
export const SHOWN = 50

/** Each position among the Players, those sharing a name merged (OF). */
export function availablePositions(
  sport: FantasySport,
  players: ReadonlyArray<AvailablePlayer>,
): Array<{ label: string; ids: Array<number> }> {
  const groups: Array<{ label: string; ids: Array<number> }> = []
  const ids = [
    ...new Set(
      players.flatMap((p) => (p.positionId === null ? [] : [p.positionId])),
    ),
  ].sort((a, b) => a - b)
  for (const id of ids) {
    const label = POSITIONS[sport][id] ?? `Pos ${id}`
    const group = groups.find((g) => g.label === label)
    if (group) group.ids.push(id)
    else groups.push({ label, ids: [id] })
  }
  return groups
}

export function AvailablePlayers({
  sport,
  available,
  provider,
  onMove,
}: {
  sport: FantasySport
  available: Available
  provider: 'espn' | 'sleeper'
  /** Add or claim a Player, when roster moves are on (docs/adr/0010). */
  onMove?: (p: AvailablePlayer) => void
}) {
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('All')
  const [shown, setShown] = useState(SHOWN)
  const groups = availablePositions(sport, available.players)
  const chosen = groups.find((g) => g.label === position)
  const found = searchAvailable(available.players, query, chosen?.ids ?? null)
  const source = provider === 'sleeper' ? 'Sleeper' : 'ESPN'
  return (
    <section className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setShown(SHOWN)
        }}
        placeholder="Search players or teams"
        aria-label="Search available players"
        className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm placeholder:text-muted"
      />
      {groups.length > 1 && (
        <Segmented
          label="Position"
          options={[
            { key: 'All', label: 'All' },
            ...groups.map((g) => ({ key: g.label, label: g.label })),
          ]}
          value={chosen ? position : 'All'}
          onChange={(key) => {
            setPosition(key)
            setShown(SHOWN)
          }}
        />
      )}
      {found.length === 0 ? (
        <p className="text-sm text-muted">
          {available.players.length === 0
            ? 'No available players right now.'
            : 'No available player matches that.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {found.slice(0, shown).map((p) => (
            <Row
              key={p.sourcePlayerId ?? p.espnId}
              sport={sport}
              p={p}
              onMove={onMove}
            />
          ))}
        </ul>
      )}
      {found.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + SHOWN)}
          className="min-h-10 rounded-xl bg-notice text-sm font-semibold"
        >
          Show more ({found.length - shown})
        </button>
      )}
      <p className="text-[11px] text-muted">
        {available.order === 'owned'
          ? `Read from ${source} now: the ${available.players.length} most rostered free agents and waiver players, with the share of ${source} leagues that roster each and how it moved this week.`
          : `Read from ${source} now: the ${available.players.length} players no team has, most projected this week first under the league’s scoring.`}
      </p>
    </section>
  )
}

function Row({
  sport,
  p,
  onMove,
}: {
  sport: FantasySport
  p: AvailablePlayer
  onMove?: (p: AvailablePlayer) => void
}) {
  const tone = injuryTone(p.injury)
  const position =
    p.positionId === null ? null : (POSITIONS[sport][p.positionId] ?? null)
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <PlayerAvatar
        name={p.name}
        headshotUrl={headshotOf(sport, p)}
        size={28}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{p.name}</span>
          {p.injury && (
            <span
              className={cn(
                'shrink-0 text-[11px] font-semibold',
                tone === 'yellow'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-live',
              )}
            >
              {injuryLabel(p.injury)}
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-muted">
          {[p.teamAbbrev, position, p.waivers ? 'Waivers' : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {p.owned !== null ? (
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-sm font-bold">{p.owned.toFixed(1)}%</span>
          {p.ownedChange !== null && p.ownedChange !== 0 && (
            <span
              className={cn(
                'block text-[11px]',
                p.ownedChange > 0 ? 'text-scoring' : 'text-live',
              )}
            >
              {p.ownedChange > 0 ? '+' : ''}
              {p.ownedChange.toFixed(1)}
            </span>
          )}
        </span>
      ) : (
        p.projected !== null && (
          <span className="shrink-0 text-right tabular-nums">
            <span className="block text-sm font-bold">{pts(p.projected)}</span>
            <span className="block text-[11px] text-muted">proj</span>
          </span>
        )
      )}
      {onMove && (
        <button
          type="button"
          onClick={() => onMove(p)}
          aria-label={`${p.waivers ? 'Claim' : 'Add'} ${p.name}`}
          className="min-h-8 shrink-0 rounded-full bg-notice px-3 text-xs font-semibold hover:bg-accent hover:text-background"
        >
          {p.waivers ? 'Claim' : 'Add'}
        </button>
      )}
    </li>
  )
}
