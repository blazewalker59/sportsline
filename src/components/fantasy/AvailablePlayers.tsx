/**
 * A Fantasy league's Available players (CONTEXT.md, "Available players"):
 * searched by name or Team, narrowed to a position, in a stat table
 * (AvailableTable) of their stats this season or ESPN's last 15 days and
 * what says they're worth a look (ESPN: how rostered, and the week's
 * move; Sleeper: this week's projection), waiver Players marked; with
 * roster moves on, each one Add or Claim.
 */

import { useState } from 'react'
import { POSITIONS } from './format'
import { Picker } from './Picker'
import { AvailableTable, availableTables } from './AvailableTable'
import type {
  AvailablePlayers as Available,
  AvailablePlayer,
} from '@/lib/fantasy/freeAgents'
import type { FantasySport } from '@/lib/fantasy/sports'
import { searchAvailable } from '@/lib/fantasy/freeAgents'

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
  const [span, setSpan] = useState<'season' | 'recent'>('season')
  const groups = availablePositions(sport, available.players)
  const chosen = groups.find((g) => g.label === position)
  const found = searchAvailable(available.players, query, chosen?.ids ?? null)
  const source = provider === 'sleeper' ? 'Sleeper' : 'ESPN'
  // Each table shows its first `shown`; what's left across them all.
  const more = availableTables(sport, available, found).reduce(
    (n, t) => n + Math.max(0, t.players.length - shown),
    0,
  )
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
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
        <div className="flex items-center gap-1">
          <span className="mr-auto pl-1 text-xs text-muted tabular-nums">
            {found.length} {found.length === 1 ? 'player' : 'players'}
          </span>
          {groups.length > 1 && (
            <Picker
              label="Position"
              options={[
                { key: 'All', label: 'All positions' },
                ...groups.map((g) => ({ key: g.label, label: g.label })),
              ]}
              value={chosen ? position : 'All'}
              onChange={(key) => {
                setPosition(key)
                setShown(SHOWN)
              }}
            />
          )}
          {available.recentLabel && (
            <Picker
              label="Stats over"
              options={[
                { key: 'season', label: 'Season' },
                { key: 'recent', label: available.recentLabel },
              ]}
              value={span}
              onChange={setSpan}
            />
          )}
        </div>
      </div>
      {found.length === 0 ? (
        <p className="text-sm text-muted">
          {available.players.length === 0
            ? 'No available players right now.'
            : 'No available player matches that.'}
        </p>
      ) : (
        availableTables(sport, available, found).map((t) => (
          <section key={t.title ?? 'players'} className="flex flex-col gap-1">
            <AvailableTable
              sport={sport}
              title={t.title}
              players={t.players}
              columns={t.columns}
              span={span}
              limit={shown}
              onMove={onMove}
            />
          </section>
        ))
      )}
      {more > 0 && (
        <button
          type="button"
          onClick={() => setShown((n) => n + SHOWN)}
          className="min-h-10 rounded-xl bg-notice text-sm font-semibold"
        >
          Show more ({more})
        </button>
      )}
      <p className="text-[11px] text-muted">
        {available.order === 'owned'
          ? `Read from ${source} now: the ${available.players.length} most rostered free agents and waiver players, with their stats${available.perGame ? ' per game' : ''}, the share of ${source} leagues that roster each (Rost%) and how it moved this week (+/−). Tap a header to sort by it, a player for their page; scroll the table sideways for every column.`
          : `Read from ${source} now: the ${available.players.length} players no team has, most projected this week first, with their season’s points under the league’s scoring. Tap a header to sort by it, a player for their page.`}
      </p>
    </section>
  )
}
