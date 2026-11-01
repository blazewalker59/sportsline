/**
 * A Game's box score as one card: a tab per team, a chip per stat table
 * (Passing, Rushing…), and the one table chosen. The card wears the
 * chosen team's color in a sheet with both teams' (`subject-b` for the
 * home team), so switching teams switches the color with it.
 */

import { useState } from 'react'
import type { GameSummary } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import type { BoxCategory } from '@/lib/games/boxSides'
import { TeamLogo } from '@/components/brand/TeamMark'
import { PlayerButton } from '@/components/players/playerSheet'
import { boxSides } from '@/lib/games/boxSides'
import { cn } from '@/lib/utils'

type Side = 'away' | 'home'

export function BoxScore({ box, game }: { box: GameBox; game: GameSummary }) {
  const sides = boxSides(box, game)
  // Start on a team with stats (the away team's, when both have them).
  const [side, setSide] = useState<Side>(
    sides.away.length === 0 && sides.home.length > 0 ? 'home' : 'away',
  )
  // The chosen table by name, so switching teams keeps you on Passing.
  const [name, setName] = useState<string | null>(null)
  const categories = sides[side]
  const category =
    categories.find((c) => c.name === name) ?? categories[0] ?? null
  const team = side === 'away' ? game.awayTeam : game.homeTeam
  return (
    <section
      aria-label="Box score"
      className={cn(
        'subject-cards overflow-hidden rounded-xl border border-border bg-surface',
        side === 'home' && 'subject-b',
      )}
    >
      <div
        role="tablist"
        aria-label="Team"
        className="flex border-b border-border"
      >
        {(['away', 'home'] as const).map((s) => {
          const t = s === 'away' ? game.awayTeam : game.homeTeam
          const selected = s === side
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSide(s)}
              // Each tab in its own team's color, whichever is chosen.
              className={cn(
                'relative flex min-h-11 flex-1 items-center justify-center gap-2 text-sm font-semibold transition-colors',
                s === 'home' ? 'subject-b' : 'subject-a',
                selected
                  ? 'text-foreground'
                  : 'text-muted hover:text-foreground',
              )}
            >
              <TeamLogo team={t} size={20} />
              <span className={cn(selected && 'subject-ink')}>
                {t.abbreviation}
              </span>
              {selected && (
                <span
                  aria-hidden="true"
                  className="subject-fill absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-foreground"
                />
              )}
            </button>
          )
        })}
      </div>
      {categories.length > 1 && (
        <div
          role="group"
          aria-label={`${team.abbreviation} stats`}
          className="flex gap-1.5 overflow-x-auto px-3 pt-3 [scrollbar-width:none]"
        >
          {categories.map((c) => (
            <button
              key={c.name}
              type="button"
              aria-pressed={c === category}
              onClick={() => setName(c.name)}
              className={cn(
                'min-h-8 shrink-0 rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors',
                c === category
                  ? 'bg-foreground text-background'
                  : 'bg-notice text-muted hover:text-foreground',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {category ? (
        <StatTable category={category} />
      ) : (
        <p className="px-3 py-6 text-center text-sm text-muted">
          No stats for {team.abbreviation} yet.
        </p>
      )}
    </section>
  )
}

function StatTable({ category }: { category: BoxCategory }) {
  const t = category.table
  return (
    <div className="overflow-x-auto pt-1">
      <table className="w-full text-xs tabular-nums">
        <caption className="sr-only">{category.name}</caption>
        <thead>
          <tr className="border-b border-border text-muted">
            <th scope="col" className="px-3 py-2 text-left font-normal">
              <span className="sr-only">Player</span>
            </th>
            {t.columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="subject-ink px-2 py-2 text-right font-semibold whitespace-nowrap"
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
