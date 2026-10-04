/**
 * Fantasy (CONTEXT.md, "Matchup") in the Timeline: a strip of Matchup
 * cards, a sheet with both Lineups, and the tag that marks a play as one
 * of the Viewer's Starters' or their opponent's.
 */

import { Link } from '@tanstack/react-router'
import { createContext, useContext } from 'react'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer, MatchupSide } from '@/lib/fantasy/matchup'
import type { TimelineItem } from '@/lib/model/timeline'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { Sheet } from '@/components/chat/Sheet'
import { SPORTS } from '@/lib/fantasy/sports'
import { cn } from '@/lib/utils'

const pts = (n: number | null) => (n === null ? '—' : n.toFixed(1))

// ─── Feed tags ──────────────────────────────────────────────────────────────

export type FantasySide = 'mine' | 'opponent'

/** Our Player id → whose Starter they are, in the Viewer's Matchups. */
const FantasyTags = createContext<ReadonlyMap<string, FantasySide> | null>(null)

export function FantasyTagsProvider({
  leagues,
  children,
}: {
  leagues: ReadonlyArray<FantasyLeagueView>
  children: React.ReactNode
}) {
  const tags = new Map<string, FantasySide>()
  for (const l of leagues) {
    if (!l.enabled || !l.matchup) continue
    for (const p of l.matchup.opponent?.lineup ?? [])
      if (p.starter && p.playerId) tags.set(p.playerId, 'opponent')
    // The Viewer's own Starters win when a Player is on both sides.
    for (const p of l.matchup.mine.lineup)
      if (p.starter && p.playerId) tags.set(p.playerId, 'mine')
  }
  return <FantasyTags.Provider value={tags}>{children}</FantasyTags.Provider>
}

/** Under a bubble: whose Starter the play is about, if anyone's. */
export function FantasyTag({
  item,
  align,
}: {
  item: TimelineItem
  align: 'left' | 'right'
}) {
  const tags = useContext(FantasyTags)
  if (!tags || item.kind === 'milestone') return null
  const hits = item.players.flatMap((p) => {
    const side = tags.get(p.id)
    return side
      ? [{ side, name: p.name.split(' ').slice(1).join(' ') || p.name }]
      : []
  })
  if (hits.length === 0) return null
  const side = hits.some((h) => h.side === 'mine') ? 'mine' : 'opponent'
  const names = hits.filter((h) => h.side === side).map((h) => h.name)
  return (
    <span
      className={cn(
        'flex px-2 text-[11px] font-semibold',
        align === 'right' ? 'justify-end' : 'justify-start',
        side === 'mine' ? 'text-scoring' : 'text-live',
      )}
    >
      {side === 'mine' ? '★ Yours' : 'Opponent'} · {names.join(', ')}
    </span>
  )
}

// ─── Strip ──────────────────────────────────────────────────────────────────

function SideRow({ side, leading }: { side: MatchupSide; leading: boolean }) {
  return (
    <span
      className={cn(
        'flex items-baseline justify-between gap-2 tabular-nums',
        leading ? 'font-bold' : 'text-foreground/75',
      )}
    >
      <span className="truncate text-[13px] font-semibold">{side.abbrev}</span>
      <span className="text-[17px]">{pts(side.score)}</span>
    </span>
  )
}

export function MatchupCard({
  league,
  onOpen,
}: {
  league: FantasyLeagueView
  onOpen: () => void
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
      onClick={onOpen}
      className={cn(
        'flex h-full w-[150px] flex-col gap-0.5 rounded-2xl border bg-surface px-2.5 py-1.5 text-left',
        lead === 'mine'
          ? 'border-scoring/40'
          : lead === 'opponent'
            ? 'border-live/40'
            : 'border-border',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        <LeagueLogo league={SPORTS[m.sport].league} size={14} />
        <span className="truncate">{m.leagueName}</span>
      </span>
      <SideRow side={m.mine} leading={lead === 'mine'} />
      {m.opponent ? (
        <SideRow side={m.opponent} leading={lead === 'opponent'} />
      ) : (
        <span className="text-[13px] text-muted">Bye week</span>
      )}
      {(m.mine.projected !== null || m.opponent?.projected != null) && (
        <span className="mt-auto text-[11px] text-muted tabular-nums">
          Proj {pts(m.mine.projected)}
          {m.opponent && ` – ${pts(m.opponent.projected)}`}
        </span>
      )}
    </button>
  )
}

export function FantasyStrip({
  leagues,
  onOpen,
}: {
  leagues: ReadonlyArray<FantasyLeagueView>
  onOpen: (id: string) => void
}) {
  const shown = leagues.filter((l) => l.enabled && l.matchup)
  if (shown.length === 0) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2 pt-2 pb-0.5" aria-label="Your Matchups">
        {shown.map((l) => (
          <li key={l.id} className="flex shrink-0">
            <MatchupCard league={l} onOpen={() => onOpen(l.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Sheet ──────────────────────────────────────────────────────────────────

function PlayerCell({
  player,
  align,
  onNavigate,
}: {
  player: LineupPlayer | undefined
  align: 'left' | 'right'
  onNavigate: () => void
}) {
  if (!player) return <span className="flex-1" />
  const name = player.playerId ? (
    <Link
      to="/players/$playerId"
      params={{ playerId: player.playerId }}
      onClick={onNavigate}
      className="truncate hover:underline"
    >
      {player.name}
    </Link>
  ) : (
    <span className="truncate">{player.name}</span>
  )
  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2',
        align === 'right' && 'flex-row-reverse text-right',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-[11px] text-muted tabular-nums">
          {player.projected !== null && `proj ${pts(player.projected)}`}
          {player.injury && ` · ${player.injury.toLowerCase()}`}
        </span>
      </span>
      <span className="text-sm font-bold tabular-nums">
        {pts(player.points)}
      </span>
    </span>
  )
}

function LineupRows({
  mine,
  theirs,
  onNavigate,
}: {
  mine: Array<LineupPlayer>
  theirs: Array<LineupPlayer>
  onNavigate: () => void
}) {
  const rows = Math.max(mine.length, theirs.length)
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-2 px-3 py-2">
          <PlayerCell player={mine[i]} align="left" onNavigate={onNavigate} />
          <span className="w-12 shrink-0 text-center text-[10px] font-bold tracking-wide text-muted uppercase">
            {(mine[i] ?? theirs[i])?.slot}
          </span>
          <PlayerCell
            player={theirs[i]}
            align="right"
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  )
}

export function MatchupSheet({
  league,
  onClose,
}: {
  league: FantasyLeagueView
  onClose: () => void
}) {
  const m = league.matchup!
  const starters = (s: MatchupSide | null) =>
    (s?.lineup ?? []).filter((p) => p.starter)
  const bench = (s: MatchupSide | null) =>
    (s?.lineup ?? []).filter((p) => !p.starter)
  const side = (s: MatchupSide, align: 'left' | 'right') => (
    <span
      className={cn(
        'flex min-w-0 flex-1 flex-col',
        align === 'right' && 'items-end text-right',
      )}
    >
      <span className="truncate text-sm font-semibold">{s.name}</span>
      {s.record && <span className="text-[11px] text-muted">{s.record}</span>}
      <span className="text-3xl leading-tight font-bold tabular-nums">
        {pts(s.score)}
      </span>
      {s.projected !== null && (
        <span className="text-xs text-muted tabular-nums">
          proj {pts(s.projected)}
        </span>
      )}
    </span>
  )
  return (
    <Sheet title={m.leagueName} onClose={onClose}>
      <header className="flex items-start gap-3">
        {side(m.mine, 'left')}
        <span className="pt-6 text-sm text-muted">vs</span>
        {m.opponent ? (
          side(m.opponent, 'right')
        ) : (
          <span className="flex-1 pt-6 text-right text-sm text-muted">
            Bye week
          </span>
        )}
      </header>
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Starters
        </h3>
        <LineupRows
          mine={starters(m.mine)}
          theirs={starters(m.opponent)}
          onNavigate={onClose}
        />
      </section>
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Bench
        </h3>
        <LineupRows
          mine={bench(m.mine)}
          theirs={bench(m.opponent)}
          onNavigate={onClose}
        />
      </section>
      <p className="text-[11px] text-muted">
        Read from ESPN Fantasy. Points refresh every couple of minutes.
      </p>
    </Sheet>
  )
}
