/**
 * Fantasy (CONTEXT.md, "Matchup") in the Timeline: a strip of Matchup
 * cards, a sheet with both Lineups, and the tag that marks a play as one
 * of the Viewer's Starters' or their opponent's.
 */

import { createContext, useContext, useState } from 'react'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LineupPlayer, MatchupSide } from '@/lib/fantasy/matchup'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { Sheet } from '@/components/chat/Sheet'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { statName, statValue } from '@/lib/fantasy/stats'
import { SPORTS } from '@/lib/fantasy/sports'
import { PlayerButton } from '@/components/players/playerSheet'
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

/** "Jaxon Smith-Njigba" → "J. Smith-Njigba"; team defenses as they are. */
export function shortName(p: Pick<LineupPlayer, 'name' | 'espnId'>): string {
  if (p.espnId < 0 || /D\/ST$/.test(p.name)) return p.name
  const [first, ...rest] = p.name.trim().split(/\s+/)
  return rest.length > 0 ? `${first[0]}. ${rest.join(' ')}` : p.name
}

const HEADSHOT_LEAGUE: Record<FantasyLeagueView['sport'], string> = {
  football: 'nfl',
  basketball: 'nba',
  baseball: 'mlb',
}

function headshotOf(
  sport: FantasyLeagueView['sport'],
  p: LineupPlayer,
): string | null {
  if (p.espnId < 0) return p.teamLogo ?? null
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/${HEADSHOT_LEAGUE[sport]}/players/full/${p.espnId}.png&w=96&h=70`
}

/** Red for out (or close to it), yellow for maybe. */
export function injuryTone(status: string | null): 'red' | 'yellow' | null {
  if (!status) return null
  if (/QUESTIONABLE|DAY_TO_DAY|PROBABLE/.test(status)) return 'yellow'
  return 'red'
}

export function injuryLabel(status: string): string {
  return status
    .replace('INJURY_RESERVE', 'IR')
    .replace('DAY_TO_DAY', 'Day-to-day')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** Position groups, colored (Sleeper-style). */
const SLOT_TONES: Record<string, string> = {
  QB: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  RB: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  WR: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  TE: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  FLEX: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  'RB/WR': 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  'WR/TE': 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  OP: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  'D/ST': 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  K: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
}

interface FieldState {
  /** "Sun 1:00 PM", "Q2 4:31", "Final". */
  status: string
  live: boolean
  onField: boolean
  redZone: boolean
}

/**
 * A Player's Game right now, from today's Games: when it is, and in
 * football whether their unit is on the field (their team has the ball, or
 * for a defense, doesn't) and in the red zone (inside the 20).
 */
function fieldState(
  p: LineupPlayer,
  games: ReadonlyArray<GameSummary>,
): FieldState | null {
  if (!p.teamId) return null
  const g = games.find(
    (x) => x.awayTeam.id === p.teamId || x.homeTeam.id === p.teamId,
  )
  if (!g) return null
  const live = g.status === 'live' || g.status === 'delayed'
  const status = live
    ? (g.situation?.segmentLabel ?? 'Live')
    : g.status === 'final'
      ? 'Final'
      : new Date(g.startsAt).toLocaleString([], {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
  const detail = (g.situation?.detail ?? {}) as {
    possession?: string | null
    downDistance?: string | null
  }
  if (!live || g.league !== 'nfl' || !detail.possession)
    return { status, live, onField: false, redZone: false }
  const hasBall = detail.possession === p.teamAbbrev
  const defense = p.positionId === 16
  const spot = /at ([A-Z]{2,4}) (\d{1,2})/.exec(detail.downDistance ?? '')
  // Inside the 20 on the defending team's side.
  const redZone =
    spot !== null && spot[1] !== detail.possession && Number(spot[2]) <= 20
  const onField = defense ? !hasBall : hasBall
  return { status, live, onField, redZone: onField && redZone }
}

function Avatar({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  const tone = injuryTone(player.injury)
  return (
    <span className="relative shrink-0">
      <PlayerAvatar
        name={player.name}
        headshotUrl={headshotOf(sport, player)}
        size={32}
      />
      {tone && (
        <span
          aria-label={injuryLabel(player.injury!)}
          className={cn(
            'absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2 ring-surface',
            tone === 'red' ? 'bg-red-500' : 'bg-yellow-400',
          )}
        />
      )}
    </span>
  )
}

function PlayerCell({
  sport,
  player,
  align,
  games,
  open,
  onToggle,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer | undefined
  align: 'left' | 'right'
  games: ReadonlyArray<GameSummary>
  open: boolean
  onToggle: () => void
}) {
  if (!player) return <span className="flex-1" />
  const state = fieldState(player, games)
  const name = player.playerId ? (
    <PlayerButton
      playerId={player.playerId}
      className="truncate hover:underline"
    >
      {shortName(player)}
    </PlayerButton>
  ) : (
    <span className="truncate">{shortName(player)}</span>
  )
  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2',
        align === 'right' && 'flex-row-reverse text-right',
      )}
    >
      <Avatar sport={sport} player={player} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] leading-tight font-medium">
          {name}
        </span>
        <span
          className={cn(
            'flex items-center gap-1 text-[11px] text-muted',
            align === 'right' && 'justify-end',
          )}
        >
          {/* On the field (or in the red zone) says more than the clock. */}
          {state?.redZone ? (
            <span className="rounded bg-red-500/15 px-1 text-[10px] leading-4 font-bold whitespace-nowrap text-red-600 dark:text-red-400">
              Red zone
            </span>
          ) : state?.onField ? (
            <span className="rounded bg-scoring/15 px-1 text-[10px] leading-4 font-bold whitespace-nowrap text-scoring">
              On field
            </span>
          ) : (
            <span className={cn('truncate', state?.live && 'text-live')}>
              {state?.status ??
                (player.projected !== null
                  ? `proj ${pts(player.projected)}`
                  : '')}
            </span>
          )}
        </span>
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${shortName(player)}: ${pts(player.points)} points. Show breakdown`}
        className={cn(
          'flex min-w-9 shrink-0 flex-col rounded-lg px-1 py-0.5 tabular-nums transition-colors',
          align === 'right' ? 'items-start' : 'items-end',
          open ? 'bg-accent-soft' : 'hover:bg-notice',
        )}
      >
        <span className="text-sm font-bold">{pts(player.points)}</span>
      </button>
    </span>
  )
}

export function Breakdown({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  return (
    <div className="mx-3 mb-2 rounded-lg bg-notice px-3 py-2 text-xs">
      <div className="mb-1 flex justify-between font-semibold">
        <span>{player.name}</span>
        <span className="tabular-nums">{pts(player.points)} pts</span>
      </div>
      {player.injury && (
        <p
          className={cn(
            'mb-1 font-semibold',
            injuryTone(player.injury) === 'red'
              ? 'text-red-600 dark:text-red-400'
              : 'text-yellow-700 dark:text-yellow-400',
          )}
        >
          {injuryLabel(player.injury)}
        </p>
      )}
      {player.breakdown.length === 0 ? (
        <p className="text-muted">No points yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 tabular-nums">
          {player.breakdown.map((b) => (
            <li key={b.statId} className="flex justify-between gap-3">
              <span className="text-muted">
                {statName(sport, b.statId)}
                {b.value !== 0 && (
                  <span className="text-foreground/80">
                    {' '}
                    {statValue(b.value)}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'font-semibold',
                  b.points < 0 && 'text-red-600 dark:text-red-400',
                )}
              >
                {b.points > 0 ? '+' : ''}
                {pts(b.points)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {player.projected !== null && (
        <p className="mt-1 text-muted">Projected {pts(player.projected)}</p>
      )}
    </div>
  )
}

function LineupRows({
  sport,
  mine,
  theirs,
  games,
}: {
  sport: FantasyLeagueView['sport']
  mine: Array<LineupPlayer>
  theirs: Array<LineupPlayer>
  games: ReadonlyArray<GameSummary>
}) {
  const [open, setOpen] = useState<string | null>(null)
  const rows = Math.max(mine.length, theirs.length)
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {Array.from({ length: rows }, (_, i) => {
        const slot = (mine[i] ?? theirs[i])?.slot ?? ''
        const toggle = (side: 'm' | 't') => () =>
          setOpen((o) => (o === `${side}${i}` ? null : `${side}${i}`))
        const expanded =
          open === `m${i}` ? mine[i] : open === `t${i}` ? theirs[i] : undefined
        return (
          <li key={i}>
            <div className="flex items-center gap-1.5 px-2 py-2">
              <PlayerCell
                sport={sport}
                player={mine[i]}
                align="left"
                games={games}
                open={open === `m${i}`}
                onToggle={toggle('m')}
              />
              <span
                className={cn(
                  'w-10 shrink-0 rounded-md py-0.5 text-center text-[10px] font-bold uppercase',
                  SLOT_TONES[slot] ?? 'bg-notice text-muted',
                )}
              >
                {slot}
              </span>
              <PlayerCell
                sport={sport}
                player={theirs[i]}
                align="right"
                games={games}
                open={open === `t${i}`}
                onToggle={toggle('t')}
              />
            </div>
            {expanded && <Breakdown sport={sport} player={expanded} />}
          </li>
        )
      })}
    </ul>
  )
}

export function MatchupSheet({
  league,
  games = [],
  onClose,
}: {
  league: FantasyLeagueView
  /** Today's Games, for each Player's game state. */
  games?: ReadonlyArray<GameSummary>
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
          sport={m.sport}
          mine={starters(m.mine)}
          theirs={starters(m.opponent)}
          games={games}
        />
      </section>
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Bench
        </h3>
        <LineupRows
          sport={m.sport}
          mine={bench(m.mine)}
          theirs={bench(m.opponent)}
          games={games}
        />
      </section>
      <p className="text-[11px] text-muted">
        Read from ESPN Fantasy. Points refresh every couple of minutes; tap a
        player’s points for the breakdown.
      </p>
    </Sheet>
  )
}
