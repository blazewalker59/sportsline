/**
 * Fantasy Matchups as cards (CONTEXT.md, "Matchup"): the strip across the
 * top of the Timeline, one card per league.
 */

import { categoryRecord, pts, scoreText } from './format'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { MatchupSide, MatchupView } from '@/lib/fantasy/matchup'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { CornerButton } from '@/components/timeline/GameStrip'
import { SPORTS } from '@/lib/fantasy/sports'
import { cn } from '@/lib/utils'

function SideRow({
  m,
  side,
  leading,
}: {
  m: MatchupView
  side: MatchupSide
  leading: boolean
}) {
  return (
    <span
      className={cn(
        'flex items-baseline justify-between gap-2 tabular-nums',
        leading ? 'font-bold' : 'text-foreground/75',
      )}
    >
      <span className="truncate text-[13px] font-semibold">{side.abbrev}</span>
      <span className="text-[17px]">{scoreText(m, side.score)}</span>
    </span>
  )
}

function MatchupCard({
  league,
  selected,
  onSelect,
}: {
  league: FantasyLeagueView
  selected?: boolean
  onSelect: () => void
}) {
  const m = league.matchup!
  const lead =
    m.opponent && m.mine.score !== m.opponent.score
      ? m.mine.score > m.opponent.score
        ? 'mine'
        : 'opponent'
      : null
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex h-full w-[150px] flex-col gap-0.5 rounded-2xl border px-2.5 py-1.5 text-left transition-colors',
        selected
          ? 'border-accent bg-accent-soft'
          : lead === 'mine'
            ? 'border-scoring/40 bg-surface'
            : lead === 'opponent'
              ? 'border-live/40 bg-surface'
              : 'border-border bg-surface',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        <LeagueLogo league={SPORTS[m.sport].league} size={14} />
        <span className="truncate">{m.leagueName}</span>
      </span>
      <SideRow m={m} side={m.mine} leading={lead === 'mine'} />
      {m.opponent ? (
        <SideRow m={m} side={m.opponent} leading={lead === 'opponent'} />
      ) : (
        <span className="text-[13px] text-muted">Bye week</span>
      )}
      {m.categories ? (
        <span className="mt-auto text-[11px] text-muted tabular-nums">
          Categories {categoryRecord(m)}
        </span>
      ) : (
        (m.mine.projected !== null || m.opponent?.projected != null) && (
          <span className="mt-auto text-[11px] text-muted tabular-nums">
            Proj {pts(m.mine.projected)}
            {m.opponent && ` – ${pts(m.opponent.projected)}`}
          </span>
        )
      )}
    </button>
  )
}

/**
 * Matchups as a strip of cards, like the score cards: tapping one narrows
 * the Timeline to its Starters (tap again to clear), and the selected
 * card's corner badge opens its sheet.
 */
export function FantasyStrip({
  leagues,
  selected,
  onSelect,
  onDetails,
}: {
  leagues: ReadonlyArray<FantasyLeagueView>
  selected?: string
  onSelect: (id: string | null) => void
  onDetails: (id: string) => void
}) {
  const shown = leagues.filter((l) => l.enabled && l.matchup)
  if (shown.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2 pt-2 pb-0.5" aria-label="Your Matchups">
        {shown.map((l) => (
          <li key={l.id} className="relative flex shrink-0">
            <MatchupCard
              league={l}
              selected={l.id === selected}
              onSelect={() => onSelect(l.id === selected ? null : l.id)}
            />
            {l.id === selected && (
              <CornerButton label="Matchup" onClick={() => onDetails(l.id)}>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </CornerButton>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
