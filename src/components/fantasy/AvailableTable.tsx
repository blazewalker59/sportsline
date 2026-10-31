/**
 * Available players as a stat table, laid out like a category Matchup's
 * Lineup (CategoryLineup): a row per Player, a column per stat under its
 * header, the Player column staying put while the stats scroll sideways.
 * A category league's columns are its Categories (per game in basketball,
 * shooting as a percentage; baseball's totals, batters and pitchers in
 * tables of their own); a points league's its Fantasy points. Tapping a
 * header sorts by it, best first, then the other way.
 */

import { useState } from 'react'
import {
  INJURY_ABBREV,
  POSITIONS,
  headshotOf,
  injuryLabel,
  injuryTone,
  nextGameLabel,
  pts,
  shortName,
} from './format'
import type { NextGame } from '@/lib/fantasy/proSchedule'
import type { BoxColumn } from '@/lib/fantasy/boxScore'
import type { LeagueCategory } from '@/lib/fantasy/categories'
import type {
  AvailablePlayer,
  AvailablePlayers,
  SpanStats,
} from '@/lib/fantasy/freeAgents'
import type { FantasySport } from '@/lib/fantasy/sports'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { boxCell, boxColumns, boxValue } from '@/lib/fantasy/boxScore'
import { categoryValue, formatCategory, isRate } from '@/lib/fantasy/categories'
import { isPitcher, isPitching } from '@/lib/fantasy/freeAgents'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { PlayerButton } from '@/components/players/playerSheet'
import { cn } from '@/lib/utils'

/** One of the table's columns: its header, its cell, and what it sorts by. */
export interface StatColumn {
  key: string
  label: string
  /** Lower is better (turnovers, ERA): sorted lowest first. */
  reverse?: boolean
  cell: (p: AvailablePlayer, span: SpanStats | null) => string
  value: (p: AvailablePlayer, span: SpanStats | null) => number | null
}

const DASH = '–'

/** A Category's column: per game (basketball) or a box score's (totals). */
function categoryColumn(
  sport: FantasySport,
  c: LeagueCategory,
  box: BoxColumn,
  perGame: boolean,
): StatColumn {
  if (!perGame)
    return {
      key: String(c.statId),
      label: box.label,
      reverse: c.reverse,
      cell: (_p, s) => (s?.stats ? boxCell(sport, box, s.stats) : DASH),
      value: (_p, s) => (s?.stats ? boxValue(sport, box, s.stats) : null),
    }
  const value = (s: SpanStats | null) => {
    const n = s?.stats ? categoryValue(sport, c.statId, s.stats) : null
    return n !== null && Number.isFinite(n) ? n : null
  }
  return {
    key: String(c.statId),
    label: c.label,
    reverse: c.reverse,
    cell: (_p, s) => {
      const n = value(s)
      if (n === null) return DASH
      return isRate(sport, c.statId)
        ? formatCategory(sport, c.statId, n)
        : n.toFixed(1)
    },
    value: (_p, s) => value(s),
  }
}

/** What a list's Players are weighed by besides their stats. */
function standingColumns(available: AvailablePlayers): Array<StatColumn> {
  if (available.order === 'projected')
    return [
      {
        key: 'proj',
        label: 'Proj',
        cell: (p) => pts(p.projected),
        value: (p) => p.projected,
      },
    ]
  return [
    {
      key: 'owned',
      label: 'Rost%',
      cell: (p) => (p.owned === null ? DASH : p.owned.toFixed(1)),
      value: (p) => p.owned,
    },
    {
      key: 'change',
      label: '+/−',
      cell: (p) =>
        p.ownedChange === null
          ? DASH
          : `${p.ownedChange > 0 ? '+' : ''}${p.ownedChange.toFixed(1)}`,
      value: (p) => p.ownedChange,
    },
  ]
}

/**
 * The tables a list shows: one in basketball and points leagues, a
 * batters' and a pitchers' in baseball, each with its own columns.
 */
export function availableTables(
  sport: FantasySport,
  available: AvailablePlayers,
  players: ReadonlyArray<AvailablePlayer>,
): Array<{
  title: string | null
  players: Array<AvailablePlayer>
  columns: Array<StatColumn>
}> {
  const standing = standingColumns(available)
  const categories = available.categories
  if (!categories) {
    const points: Array<StatColumn> = [
      {
        key: 'fpts',
        label: 'FPTS',
        cell: (_p, s) => pts(s?.points ?? null),
        value: (_p, s) => s?.points ?? null,
      },
      {
        key: 'avg',
        label: 'Avg',
        cell: (_p, s) => pts(s?.average ?? null),
        value: (_p, s) => s?.average ?? null,
      },
    ]
    return [
      { title: null, players: [...players], columns: [...points, ...standing] },
    ]
  }
  const perGame = available.perGame === true
  const columnsOf = (cats: ReadonlyArray<LeagueCategory>) => {
    const boxes = boxColumns(sport, cats)
    return [
      ...cats.map((c, i) => categoryColumn(sport, c, boxes[i], perGame)),
      ...standing,
    ]
  }
  if (sport !== 'baseball')
    return [
      { title: null, players: [...players], columns: columnsOf(categories) },
    ]
  const tables = [
    {
      title: 'Batters',
      players: players.filter((p) => !isPitcher(sport, p.positionId)),
      columns: columnsOf(categories.filter((c) => !isPitching(c.statId))),
    },
    {
      title: 'Pitchers',
      players: players.filter((p) => isPitcher(sport, p.positionId)),
      columns: columnsOf(categories.filter((c) => isPitching(c.statId))),
    },
  ]
  return tables.filter((t) => t.players.length > 0)
}

/** Players by a column, best first (lowest first where lower is better). */
export function sortedBy(
  players: ReadonlyArray<AvailablePlayer>,
  column: StatColumn,
  span: 'season' | 'recent',
  flipped: boolean,
): Array<AvailablePlayer> {
  const lowFirst = Boolean(column.reverse) !== flipped
  return [...players]
    .map((p, i) => ({ p, i, n: column.value(p, p.stats?.[span] ?? null) }))
    .sort((a, b) => {
      // Nothing to compare goes last, either way.
      if (a.n === null || b.n === null)
        return a.n === b.n ? a.i - b.i : a.n === null ? 1 : -1
      return (lowFirst ? a.n - b.n : b.n - a.n) || a.i - b.i
    })
    .map((x) => x.p)
}

export function AvailableTable({
  sport,
  title,
  players,
  columns,
  span,
  limit,
  onMove,
}: {
  sport: FantasySport
  title: string | null
  /** Every Player the table has, sorted before `limit` shows the first. */
  players: ReadonlyArray<AvailablePlayer>
  columns: ReadonlyArray<StatColumn>
  span: 'season' | 'recent'
  limit: number
  onMove?: (p: AvailablePlayer) => void
}) {
  const [sort, setSort] = useState<{ key: string; flipped: boolean } | null>(
    null,
  )
  const by = sort && columns.find((c) => c.key === sort.key)
  const rows = (by ? sortedBy(players, by, span, sort.flipped) : players).slice(
    0,
    limit,
  )
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-max min-w-full border-separate border-spacing-0 text-xs tabular-nums">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-[12rem] border-r border-b border-border bg-surface px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-muted uppercase">
              {title ?? 'Player'}
            </th>
            {columns.map((c) => {
              const on = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  aria-sort={
                    on
                      ? Boolean(c.reverse) !== sort.flipped
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className="min-w-[2.75rem] border-b border-border p-0 text-center"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort(
                        on
                          ? { key: c.key, flipped: !sort.flipped }
                          : { key: c.key, flipped: false },
                      )
                    }
                    className={cn(
                      'w-full px-1 py-1.5 text-[10px] font-semibold tracking-wide uppercase',
                      on ? 'text-foreground' : 'text-muted',
                    )}
                  >
                    {c.label}
                    {on && (
                      <span aria-hidden="true">
                        {sort.flipped ? ' ↑' : ' ↓'}
                      </span>
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const s = p.stats?.[span] ?? null
            // Every other row a shade off the table's, so a row reads
            // straight across; opaque, as the Player column is sticky.
            const shade = i % 2 === 1 ? 'bg-background' : 'bg-surface'
            return (
              <tr key={p.sourcePlayerId ?? p.espnId}>
                <th
                  scope="row"
                  className={cn(
                    'sticky left-0 z-10 border-r border-b border-border px-2 py-2.5 text-left font-normal',
                    shade,
                  )}
                >
                  <PlayerCell sport={sport} p={p} onMove={onMove} />
                </th>
                {columns.map((c) => {
                  const cell = c.cell(p, s)
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        'border-b border-border px-1 py-2.5 text-center',
                        shade,
                        cell === DASH
                          ? 'text-muted/50'
                          : sort?.key === c.key
                            ? 'font-semibold'
                            : 'text-foreground/80',
                      )}
                    >
                      {cell}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * When a Player's Team plays next, a pill under their name: live in the
 * live color, today in the accent, later quieter.
 */
function NextGamePill({ game }: { game: NextGame }) {
  const label = nextGameLabel(game, useTimeZone())
  if (!label) return null
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 self-start truncate rounded-full px-1.5 py-px text-[10px] leading-tight font-semibold',
        label.soon === 'now'
          ? 'bg-live/15 text-live'
          : label.soon === 'today'
            ? 'bg-accent-soft text-accent'
            : 'bg-notice text-foreground/80',
      )}
    >
      <span>{label.when}</span>
      {label.versus && (
        <span className="font-normal opacity-80">{label.versus}</span>
      )}
    </span>
  )
}

/**
 * The Player column: avatar and name (opening their page), injury and
 * waivers marked, position and Team under it, and Add or Claim (a shade
 * deeper).
 */
function PlayerCell({
  sport,
  p,
  onMove,
}: {
  sport: FantasySport
  p: AvailablePlayer
  onMove?: (p: AvailablePlayer) => void
}) {
  const position =
    p.positionId === null ? null : (POSITIONS[sport][p.positionId] ?? null)
  const injury = p.injury
    ? (INJURY_ABBREV[p.injury] ?? p.injury.slice(0, 4))
    : null
  return (
    <span className="flex max-w-[14rem] items-center gap-2">
      <PlayerButton
        playerId={p.playerId}
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        <PlayerAvatar
          name={p.name}
          headshotUrl={headshotOf(sport, p)}
          team={
            p.teamLogo
              ? { abbreviation: p.teamAbbrev ?? '', logoUrl: p.teamLogo }
              : null
          }
          size={40}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1">
            <span className="truncate text-[13px] leading-tight font-semibold">
              {shortName(p)}
            </span>
            {injury && (
              <span
                title={injuryLabel(p.injury!)}
                className={cn(
                  'shrink-0 text-[9px] font-bold',
                  injuryTone(p.injury) === 'yellow'
                    ? 'text-yellow-700 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {injury}
              </span>
            )}
          </span>
          <span className="block truncate text-[10px] leading-tight text-muted">
            {/* With moves on, the Claim button says it. */}
            {[position, p.teamAbbrev, p.waivers && !onMove ? 'Waivers' : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {p.nextGame && <NextGamePill game={p.nextGame} />}
        </span>
      </PlayerButton>
      {onMove && (
        <button
          type="button"
          onClick={() => onMove(p)}
          aria-label={`${p.waivers ? 'Claim' : 'Add'} ${p.name}`}
          className={cn(
            'min-h-7 shrink-0 rounded-full px-2 text-[11px] font-semibold hover:bg-accent hover:text-background',
            // A claim a shade deeper than an add.
            p.waivers ? 'bg-foreground/15' : 'bg-notice',
          )}
        >
          {p.waivers ? 'Claim' : 'Add'}
        </button>
      )}
    </span>
  )
}
