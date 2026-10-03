/**
 * Roster groups as each sport lists them ("Quarterbacks", "Defense"), in
 * their usual order, from a Source's position abbreviation. Pure.
 */

import type { League } from '@/lib/model/types'

interface Group {
  label: string
  positions: ReadonlyArray<string>
}

const FOOTBALL: ReadonlyArray<Group> = [
  { label: 'Quarterbacks', positions: ['QB'] },
  { label: 'Running backs', positions: ['RB', 'FB', 'HB'] },
  { label: 'Wide receivers', positions: ['WR'] },
  { label: 'Tight ends', positions: ['TE'] },
  {
    label: 'Offensive line',
    positions: ['OL', 'OT', 'OG', 'T', 'G', 'C', 'IOL'],
  },
  { label: 'Defensive line', positions: ['DL', 'DE', 'DT', 'NT', 'EDGE'] },
  { label: 'Linebackers', positions: ['LB', 'OLB', 'ILB', 'MLB'] },
  { label: 'Defensive backs', positions: ['DB', 'CB', 'S', 'FS', 'SS'] },
  { label: 'Special teams', positions: ['K', 'PK', 'P', 'LS', 'PR', 'KR'] },
]

const GROUPS: Record<League, ReadonlyArray<Group>> = {
  nfl: FOOTBALL,
  cfb: FOOTBALL,
  mlb: [
    { label: 'Pitchers', positions: ['P', 'SP', 'RP', 'TWP'] },
    { label: 'Catchers', positions: ['C'] },
    { label: 'Infielders', positions: ['1B', '2B', '3B', 'SS', 'IF'] },
    { label: 'Outfielders', positions: ['LF', 'CF', 'RF', 'OF'] },
    { label: 'Designated hitters', positions: ['DH'] },
  ],
  nba: [
    { label: 'Guards', positions: ['G', 'PG', 'SG'] },
    { label: 'Forwards', positions: ['F', 'SF', 'PF'] },
    { label: 'Centers', positions: ['C'] },
  ],
  nhl: [
    { label: 'Centers', positions: ['C'] },
    { label: 'Left wings', positions: ['L', 'LW'] },
    { label: 'Right wings', positions: ['R', 'RW'] },
    { label: 'Defense', positions: ['D'] },
    { label: 'Goalies', positions: ['G'] },
  ],
}

/** Players grouped by position, groups in the sport's order, names A–Z. */
export function rosterGroups<
  T extends { name: string; position: string | null },
>(
  league: League,
  players: ReadonlyArray<T>,
): Array<{ label: string; players: Array<T> }> {
  const groups = GROUPS[league].map((g) => ({
    label: g.label,
    positions: g.positions,
    players: [] as Array<T>,
  }))
  const other: Array<T> = []
  for (const p of players) {
    const pos = p.position?.toUpperCase() ?? ''
    const group = groups.find((g) => g.positions.includes(pos))
    ;(group ? group.players : other).push(p)
  }
  return [...groups, { label: 'Other', positions: [], players: other }]
    .filter((g) => g.players.length > 0)
    .map((g) => ({
      label: g.label,
      players: [...g.players].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
