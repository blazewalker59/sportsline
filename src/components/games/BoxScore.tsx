/**
 * A Game's box score as one card, with one filter: the away team, the two
 * teams' totals side by side, or the home team (Signal: keys in a well,
 * the chosen one raised). A team shows every stat table it has, one
 * section after another (Passing, Rushing, Receiving, Defense), to scroll
 * through. Team stats shows each total with a meter leaning toward the
 * team ahead in it, as a Fantasy Matchup's categories do. The card wears
 * the chosen team's color (`subject-b` for the home team).
 */

import { useState } from 'react'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox, TeamStat } from '@/lib/model/types'
import type { BoxCategory } from '@/lib/games/boxSides'
import { TeamLogo } from '@/components/brand/TeamMark'
import { LeanMeter } from '@/components/charts/LeanMeter'
import { PlayerButton } from '@/components/players/playerSheet'
import { SectionLabel } from '@/components/signal/Section'
import { boxSides } from '@/lib/games/boxSides'
import {
  teamStatLeader,
  teamStatLean,
  teamStatsOf,
} from '@/lib/games/teamStats'
import { cn } from '@/lib/utils'

type View = 'away' | 'teams' | 'home'

/** Each team's color in the totals: its ink inside the Game's Subject. */
const AWAY = 'var(--subject-line-a, var(--color-accent))'
const HOME = 'var(--subject-line-b, var(--manager-1))'

export function BoxScore({ box, game }: { box: GameBox; game: GameSummary }) {
  const sides = boxSides(box, game)
  const totals = teamStatsOf(box, game)
  // Start on the totals, else a team with stats (the away team's first).
  const [view, setView] = useState<View>(
    totals.length > 0
      ? 'teams'
      : sides.away.length === 0 && sides.home.length > 0
        ? 'home'
        : 'away',
  )
  const tab = (v: View) => {
    const selected = v === view
    const t = v === 'away' ? game.awayTeam : v === 'home' ? game.homeTeam : null
    return (
      <button
        key={v}
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => setView(v)}
        // The chosen view is the raised key in the well.
        className={cn(
          'flex h-10 flex-1 items-center justify-center gap-2 rounded-control text-3xs font-bold whitespace-nowrap uppercase',
          v === 'home' ? 'subject-b' : 'subject-a',
          selected ? 'key' : 'text-muted hover:text-foreground',
        )}
      >
        {t ? (
          <>
            <TeamLogo team={t} size={20} />
            {t.abbreviation}
          </>
        ) : (
          'Team stats'
        )}
      </button>
    )
  }
  return (
    <section
      aria-label="Box score"
      className={cn(
        'subject-cards overflow-hidden rounded-card border border-border bg-surface',
        view === 'home' && 'subject-b',
      )}
    >
      <div
        role="tablist"
        aria-label="Show"
        className="well m-3 mb-0 flex gap-1 rounded-[13px] p-1"
      >
        {tab('away')}
        {totals.length > 0 && tab('teams')}
        {tab('home')}
      </div>
      {view === 'teams' ? (
        <TeamTotals
          stats={totals}
          summed={!box.teamStats?.length}
          game={game}
        />
      ) : (
        <TeamTables
          categories={sides[view]}
          team={view === 'away' ? game.awayTeam : game.homeTeam}
        />
      )}
    </section>
  )
}

/** One team's tables, each its own section, to scroll through. */
function TeamTables({
  categories,
  team,
}: {
  categories: Array<BoxCategory>
  team: GameSummary['awayTeam']
}) {
  if (categories.length === 0)
    return (
      <p className="px-3 py-6 text-center text-sm text-muted">
        No stats for {team.abbreviation} yet.
      </p>
    )
  return (
    <div className="pb-1">
      {categories.map((c) => (
        <section key={c.name} aria-label={`${team.abbreviation} ${c.name}`}>
          <SectionLabel as="h3" title={c.name} className="mx-3 mt-4 mb-0" />
          <StatTable category={c} />
        </section>
      ))}
    </div>
  )
}

function StatTable({ category }: { category: BoxCategory }) {
  const t = category.table
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] tabular-nums">
        <caption className="sr-only">{category.name}</caption>
        <thead>
          <tr className="border-b border-border text-3xs text-muted uppercase">
            <th scope="col" className="px-3 py-2 text-left font-normal">
              <span className="sr-only">Player</span>
            </th>
            {t.columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="px-2 py-2 text-right font-normal whitespace-nowrap"
              >
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
              <th
                scope="row"
                className={cn(
                  'py-1.5 pr-2 text-left font-medium',
                  r.sub ? 'pl-6 text-foreground/80' : 'pl-3',
                )}
              >
                <PlayerButton
                  playerId={r.player.id}
                  className="hover:underline"
                >
                  {r.player.name}
                </PlayerButton>
                {r.note && (
                  <span className="ml-1.5 font-normal text-muted">
                    {r.note}
                  </span>
                )}
              </th>
              {r.values.map((v, j) => (
                <td key={j} className="px-2 text-right whitespace-nowrap">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The teams' totals: each with the away team's figure left of its name and
 * the home team's right, the leader's bold in their color, and under them
 * a meter leaning toward whoever's ahead (fewer, where fewer is better).
 */
function TeamTotals({
  stats,
  summed,
  game,
}: {
  stats: Array<TeamStat>
  /** Summed from the players' lines, not the Source's own totals. */
  summed: boolean
  game: GameSummary
}) {
  const figure = (leading: boolean, trailing: boolean) =>
    cn(
      'text-lg leading-none tabular-nums',
      leading ? 'font-bold' : trailing ? 'text-foreground/55' : 'font-medium',
    )
  return (
    <div className="px-1.5 pt-2 pb-2">
      <ul aria-label="Team stats" className="flex flex-col gap-1">
        {stats.map((s) => {
          const leader = teamStatLeader(s)
          const away = leader === 'away'
          const home = leader === 'home'
          return (
            <li key={s.label} className="flex flex-col gap-1.5 px-1.5 py-1.5">
              <span className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)_minmax(0,1fr)] items-baseline gap-2">
                <span
                  className={cn(figure(away, home), 'text-right')}
                  style={away ? { color: AWAY } : undefined}
                >
                  <span className="sr-only">{game.awayTeam.abbreviation} </span>
                  {s.away}
                </span>
                <span className="text-center text-3xs leading-none text-muted uppercase">
                  {s.label}
                  {s.lower && (
                    <span className="sr-only"> (fewer is better)</span>
                  )}
                </span>
                <span
                  className={figure(home, away)}
                  style={home ? { color: HOME } : undefined}
                >
                  <span className="sr-only">{game.homeTeam.abbreviation} </span>
                  {s.home}
                </span>
              </span>
              <LeanMeter lean={teamStatLean(s)} left={AWAY} right={HOME} />
            </li>
          )
        })}
      </ul>
      {summed && (
        <p className="px-1.5 pt-2 text-3xs text-muted">
          Added up from the players’ lines.
        </p>
      )}
    </div>
  )
}
