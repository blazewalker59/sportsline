/**
 * Fantasy (CONTEXT.md, "Matchup") in the Timeline: a strip of Matchup
 * cards, a sheet with both Lineups, and the tag that marks a play as one
 * of the Viewer's Starters' or their opponent's.
 */

import { useQuery } from '@tanstack/react-query'
import { Fragment, createContext, useContext, useMemo, useState } from 'react'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type {
  LineupPlayer,
  MatchupSide,
  MatchupView,
} from '@/lib/fantasy/matchup'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { Sheet } from '@/components/chat/Sheet'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { TeamLogo } from '@/components/brand/TeamMark'
import { statName, statValue } from '@/lib/fantasy/stats'
import { SPORTS } from '@/lib/fantasy/sports'
import { getMatchupGames } from '@/lib/fantasy/schedule'
import { PlayerButton } from '@/components/players/playerSheet'
import { CornerButton } from '@/components/timeline/GameStrip'
import { cn } from '@/lib/utils'

const pts = (n: number | null) => (n === null ? '—' : n.toFixed(1))

/** A Matchup side's score: points, or categories led (a whole number). */
const scoreText = (m: MatchupView, n: number | null) =>
  m.categories ? (n === null ? '—' : String(n)) : pts(n)

/** "6–3–1": categories won, lost and tied (from the Viewer's side). */
const categoryRecord = (m: MatchupView) =>
  `${m.mine.score}–${m.opponent?.score ?? 0}${m.ties ? `–${m.ties}` : ''}`

/**
 * A Player's figure beside their name: points, or in a category league
 * their day's headline (2-4 at the plate, 6.0 IP, 24 PTS).
 */
function playerFigure(p: LineupPlayer): string {
  if (p.dayLine == null) return pts(p.points)
  const lead =
    p.dayLine.find((l) => l.label === 'PTS') ??
    p.dayLine.find((l) => l.label === 'H/AB' || l.label === 'IP')
  return lead?.value ?? '—'
}

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

export function MatchupCard({
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
  // Another provider's Player: the headshot we matched them to, if any.
  if (p.sourcePlayerId !== undefined) return p.headshot ?? null
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
  // Baseball: catchers, infield, outfield, utility, pitching.
  C: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  '1B': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  '2B': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  '3B': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  SS: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  MI: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  CI: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  IF: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  OF: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  DH: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  UTIL: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  SP: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  RP: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  P: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  // Basketball: guards, forwards, bigs.
  PG: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  SG: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  G: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  SF: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  PF: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  F: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'SG/SF': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'G/F': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'PF/C': 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  'F/C': 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
}

interface GameState {
  game: GameSummary
  home: boolean
  /** "Sun 4:25 PM", "Q2 0:03", "Final". */
  status: string
  live: boolean
  upcoming: boolean
  onField: boolean
  redZone: boolean
}

/**
 * A Player's Game from the Games we have: its state, and in football
 * whether their unit is on the field (their team has the ball, or for a
 * defense, doesn't) and in the red zone (inside the 20).
 */
function gameState(
  p: LineupPlayer,
  games: ReadonlyArray<GameSummary>,
): GameState | null {
  if (!p.teamId) return null
  const g = games.find(
    (x) => x.awayTeam.id === p.teamId || x.homeTeam.id === p.teamId,
  )
  if (!g) return null
  const home = g.homeTeam.id === p.teamId
  const live = g.status === 'live' || g.status === 'delayed'
  const upcoming = !live && g.status !== 'final'
  const status = live
    ? (g.situation?.segmentLabel ?? 'Live')
    : g.status === 'final'
      ? 'Final'
      : new Date(g.startsAt).toLocaleString([], {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
  const base = { game: g, home, status, live, upcoming }
  const detail = (g.situation?.detail ?? {}) as {
    possession?: string | null
    downDistance?: string | null
  }
  if (!live || g.league !== 'nfl' || !detail.possession)
    return { ...base, onField: false, redZone: false }
  const ours = home ? g.homeTeam.abbreviation : g.awayTeam.abbreviation
  const hasBall = detail.possession === (p.teamAbbrev ?? ours)
  const defense = p.positionId === 16
  const spot = /at ([A-Z]{2,4}) (\d{1,2})/.exec(detail.downDistance ?? '')
  // Inside the 20 on the defending team's side.
  const redZone =
    spot !== null && spot[1] !== detail.possession && Number(spot[2]) <= 20
  const onField = defense ? !hasBall : hasBall
  return { ...base, onField, redZone: onField && redZone }
}

/** ESPN's default position ids, per sport. */
const POSITIONS: Record<
  FantasyLeagueView['sport'],
  Readonly<Record<number, string>>
> = {
  football: { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' },
  basketball: { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' },
  baseball: {
    1: 'SP',
    2: 'C',
    3: '1B',
    4: '2B',
    5: '3B',
    6: 'SS',
    7: 'OF',
    8: 'OF',
    9: 'OF',
    10: 'DH',
    11: 'RP',
  },
}

/** Sleeper's position colors, so a position reads without reading it. */
const POSITION_COLOR: Record<string, string> = {
  QB: 'text-[#e0245e] dark:text-[#ff2a6d]',
  RB: 'text-[#00a594] dark:text-[#00ceb8]',
  WR: 'text-[#2f86e8] dark:text-[#58a7ff]',
  TE: 'text-[#e08a1e] dark:text-[#ffae58]',
  K: 'text-[#9b4ae0] dark:text-[#bd66ff]',
  'D/ST': 'text-[#a65f48] dark:text-[#bf755d]',
}

/** Injury statuses as the letters Sleeper shows: Q, D, O, IR. */
const INJURY_ABBREV: Record<string, string> = {
  QUESTIONABLE: 'Q',
  DOUBTFUL: 'D',
  OUT: 'O',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'SUSP',
  DAY_TO_DAY: 'DTD',
  PROBABLE: 'P',
}

/**
 * One side of a Lineup row (dreamteam's football layout): name and figure
 * abreast on the top line, position · team · injury under the name, the
 * projection under the figure, and the Game as a strip across the bottom.
 * On the field shows as an edge bar and tint, not a label.
 */
function PlayerCell({
  sport,
  player,
  align,
  games,
  open,
  onToggle,
  byes = false,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer | undefined
  align: 'left' | 'right'
  games: ReadonlyArray<GameSummary>
  open: boolean
  onToggle: () => void
  byes?: boolean
}) {
  if (!player) return <div className="min-h-14" />
  const right = align === 'right'
  const state = gameState(player, games)
  const position = player.positionId
    ? POSITIONS[sport][player.positionId]
    : undefined
  const injury = player.injury
    ? (INJURY_ABBREV[player.injury] ?? player.injury.slice(0, 4))
    : null
  const tone = injuryTone(player.injury)
  // One line, never split inside a word: longer names step down a size
  // to fit, and only then trail off.
  const short = shortName(player)
  const name = (
    <span
      title={player.name}
      className={cn(
        'block truncate leading-tight font-semibold whitespace-nowrap',
        short.length > 14
          ? 'text-[11px] tracking-tight'
          : short.length > 11
            ? 'text-[12px] tracking-tight'
            : 'text-[12.5px]',
      )}
    >
      {short}
    </span>
  )
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg px-1 py-1.5',
        state?.onField && 'field-state',
        state?.onField && right && 'field-state--right',
        state?.redZone && 'field-state--red-zone',
      )}
      aria-label={
        state?.onField
          ? `${player.name}: ${state.redZone ? 'in the red zone' : 'on the field'}`
          : undefined
      }
    >
      <div
        className={cn('flex items-start gap-1', right && 'flex-row-reverse')}
      >
        <Avatar sport={sport} player={player} />
        <div className={cn('min-w-0 flex-1', right && 'text-right')}>
          {player.playerId ? (
            <PlayerButton
              playerId={player.playerId}
              className={cn('w-full', right && 'text-right')}
            >
              {name}
            </PlayerButton>
          ) : (
            name
          )}
          <span
            className={cn(
              'mt-0.5 flex flex-wrap items-center gap-x-1 text-[10px] leading-tight font-medium',
              right && 'justify-end',
            )}
          >
            {position && (
              <span
                className={cn(
                  'font-bold',
                  POSITION_COLOR[position] ?? 'text-muted',
                )}
              >
                {position}
              </span>
            )}
            {position && player.teamAbbrev && (
              <span className="text-muted/60" aria-hidden="true">
                ·
              </span>
            )}
            {player.teamAbbrev && (
              <span className="text-muted">{player.teamAbbrev}</span>
            )}
            {injury && (
              <span
                className={cn(
                  'font-bold',
                  tone === 'yellow'
                    ? 'text-yellow-700 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400',
                )}
                title={injuryLabel(player.injury!)}
              >
                {injury}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={
            player.dayLine == null
              ? `${shortName(player)}: ${pts(player.points)} points. Show breakdown`
              : `${shortName(player)}: today's line`
          }
          className={cn(
            'flex shrink-0 flex-col rounded-md px-0.5 py-0.5 tabular-nums transition-colors',
            right ? 'items-start' : 'items-end',
            open ? 'bg-accent-soft' : 'hover:bg-notice',
          )}
        >
          <span className="text-[14px] leading-tight font-bold">
            {playerFigure(player)}
          </span>
          {player.dayLine == null && player.projected !== null && (
            <span className="text-[10px] leading-tight text-muted">
              {pts(player.projected)}
            </span>
          )}
        </button>
      </div>
      {state ? (
        <GameStrip player={player} state={state} />
      ) : (
        byes &&
        player.teamId && (
          <span className="block rounded-md border border-border/60 px-1.5 py-1 text-center text-[9px] leading-none font-semibold tracking-wide text-muted uppercase">
            Bye week
          </span>
        )
      )}
    </div>
  )
}

/**
 * The Player's Game across the bottom of their cell: their team and score,
 * the opponent's, and its state; quieter before kickoff, warm while live.
 */
function GameStrip({
  player,
  state,
}: {
  player: LineupPlayer
  state: GameState
}) {
  const g = state.game
  const ours = state.home ? g.homeTeam : g.awayTeam
  const theirs = state.home ? g.awayTeam : g.homeTeam
  const ourScore = state.home ? g.score.home : g.score.away
  const theirScore = state.home ? g.score.away : g.score.home
  const started = !state.upcoming
  return (
    <span
      className={cn(
        'block rounded-md border px-1.5 py-1 tabular-nums',
        state.upcoming
          ? 'border-border/70 bg-background/40'
          : state.live
            ? 'border-amber-500/25 bg-amber-500/10'
            : 'border-border/40 bg-notice/60',
      )}
    >
      <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 text-[10px] leading-none font-semibold">
        <span className="flex min-w-0 items-center gap-1">
          <TeamLogo team={ours} size={13} />
          <span className="truncate">
            {player.teamAbbrev ?? ours.abbreviation}
          </span>
          {started && <span>{ourScore}</span>}
        </span>
        <span className="text-muted" aria-hidden="true">
          {started ? '-' : state.home ? 'vs' : '@'}
        </span>
        <span className="flex min-w-0 items-center justify-end gap-1">
          {started && <span>{theirScore}</span>}
          <span className="truncate">{theirs.abbreviation}</span>
          <TeamLogo team={theirs} size={13} />
        </span>
      </span>
      <span
        className={cn(
          'mt-1 block text-center text-[9px] leading-none font-semibold tracking-wide uppercase',
          state.live ? 'text-amber-700 dark:text-amber-300' : 'text-muted',
        )}
      >
        {state.status}
      </span>
    </span>
  )
}

function Avatar({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  // Injury reads as its letter (Q, O) on the meta line, not a dot here.
  return (
    <PlayerAvatar
      name={player.name}
      headshotUrl={headshotOf(sport, player)}
      size={22}
    />
  )
}

export function Breakdown({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  const tone = injuryTone(player.injury)
  return (
    <div className="mx-2 mb-2 rounded-lg bg-notice px-3 py-2.5 text-xs">
      <p className="mb-2 flex items-baseline gap-2">
        <span className="font-semibold">{player.name}</span>
        {player.injury && (
          <span
            className={cn(
              'font-semibold',
              tone === 'red'
                ? 'text-red-600 dark:text-red-400'
                : 'text-yellow-700 dark:text-yellow-400',
            )}
          >
            {injuryLabel(player.injury)}
          </span>
        )}
      </p>
      {player.dayLine != null ? (
        <DayLine line={player.dayLine} />
      ) : (
        <PointsTable sport={sport} player={player} />
      )}
    </div>
  )
}

/**
 * A points league's breakdown as a table without rules: each stat, its
 * value and its points in aligned columns, then the total and projection.
 */
function PointsTable({
  sport,
  player,
}: {
  sport: FantasyLeagueView['sport']
  player: LineupPlayer
}) {
  if (player.breakdown.length === 0)
    return (
      <p className="text-muted">
        No points yet
        {player.projected !== null && ` · projected ${pts(player.projected)}`}
      </p>
    )
  const cell = 'text-right tabular-nums'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] gap-x-3 gap-y-1">
      <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        Stat
      </span>
      <span
        className={cn(
          cell,
          'text-[10px] font-semibold tracking-wide text-muted uppercase',
        )}
      >
        Value
      </span>
      <span
        className={cn(
          cell,
          'text-[10px] font-semibold tracking-wide text-muted uppercase',
        )}
      >
        Pts
      </span>
      {player.breakdown.map((b) => (
        <Fragment key={b.statId}>
          <span className="truncate text-foreground/80">
            {b.label ?? statName(sport, b.statId)}
          </span>
          <span className={cn(cell, 'text-muted')}>
            {b.value === 0 ? '—' : statValue(b.value)}
          </span>
          <span
            className={cn(
              cell,
              'font-semibold',
              b.points < 0 && 'text-red-600 dark:text-red-400',
            )}
          >
            {b.points > 0 ? '+' : ''}
            {pts(b.points)}
          </span>
        </Fragment>
      ))}
      <span className="mt-1.5 font-semibold">Total</span>
      <span className="mt-1.5" />
      <span className={cn(cell, 'mt-1.5 font-bold')}>{pts(player.points)}</span>
      {player.projected !== null && (
        <>
          <span className="text-muted">Projected</span>
          <span />
          <span className={cn(cell, 'text-muted')}>
            {pts(player.projected)}
          </span>
        </>
      )}
    </div>
  )
}

/** A category league's day as a box-score line: values over their labels. */
function DayLine({ line }: { line: NonNullable<LineupPlayer['dayLine']> }) {
  if (line.length === 0) return <p className="text-muted">No stats today.</p>
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-x-2 gap-y-2">
      {line.map((l) => (
        <span key={l.label} className="flex flex-col items-center">
          <span className="text-sm font-bold tabular-nums">{l.value}</span>
          <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
            {l.label}
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * Both Lineups slot by slot: the Viewer's Player left, their opponent's
 * right, the slot as a small chip on the top line between them.
 */
function LineupRows({
  sport,
  mine,
  theirs,
  games,
  byes = false,
}: {
  sport: FantasyLeagueView['sport']
  mine: Array<LineupPlayer>
  theirs: Array<LineupPlayer>
  games: ReadonlyArray<GameSummary>
  /** The week's Games are all here: a Team without one is on a bye. */
  byes?: boolean
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
            <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-start gap-x-0.5 px-0.5 py-1">
              <PlayerCell
                sport={sport}
                player={mine[i]}
                align="left"
                games={games}
                byes={byes}
                open={open === `m${i}`}
                onToggle={toggle('m')}
              />
              <span
                className={cn(
                  'mt-2 flex h-6 items-center justify-center rounded-md text-[9px] leading-none font-bold uppercase',
                  SLOT_TONES[slot] ?? 'bg-notice text-muted',
                )}
              >
                {slot === 'Bench' ? 'BN' : slot}
              </span>
              <PlayerCell
                sport={sport}
                player={theirs[i]}
                align="right"
                games={games}
                byes={byes}
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

/** Each category, both sides' totals, the leader's side in bold. */
function CategoryTable({
  m,
  categories,
}: {
  m: MatchupView
  categories: NonNullable<MatchupView['categories']>
}) {
  const tone = (leading: boolean, trailing: boolean) =>
    cn(
      'w-20 tabular-nums',
      leading
        ? 'font-bold text-scoring'
        : trailing
          ? 'text-foreground/60'
          : 'font-medium',
    )
  return (
    <section>
      <h3 className="mb-2 flex justify-between text-xs font-bold tracking-wide text-muted uppercase">
        <span>Categories</span>
        <span className="tabular-nums">{categoryRecord(m)}</span>
      </h3>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {categories.map((c) => (
          <li key={c.statId} className="flex items-center px-3 py-1.5 text-sm">
            <span
              className={cn(
                'text-left',
                tone(c.leader === 'mine', c.leader === 'opponent'),
              )}
            >
              {c.mine}
            </span>
            <span className="flex-1 text-center text-xs font-semibold text-muted">
              {c.label}
              {c.reverse && <span className="sr-only"> (lower is better)</span>}
              {c.leader === 'tie' && (
                <span className="ml-1 font-normal">· tied</span>
              )}
            </span>
            <span
              className={cn(
                'text-right',
                tone(c.leader === 'opponent', c.leader === 'mine'),
              )}
            >
              {c.opponent}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
  // Every Lineup Team's Game this matchup (a Thursday Final, a Monday
  // night kickoff), behind today's live ones.
  const teamIds = [...m.mine.lineup, ...(m.opponent?.lineup ?? [])].flatMap(
    (p) => (p.teamId ? [p.teamId] : []),
  )
  const week = useQuery({
    queryKey: ['matchup-games', league.id, [...new Set(teamIds)].sort().join()],
    queryFn: () =>
      getMatchupGames({
        data: { league: SPORTS[m.sport].league, teamIds },
      }),
    staleTime: 5 * 60_000,
  })
  const allGames = useMemo(
    () => [...games, ...(week.data ?? [])],
    [games, week.data],
  )
  const byeWeeks = m.sport === 'football' && week.isSuccess
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
        {scoreText(m, s.score)}
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
      {m.categories && m.categories.length > 0 && (
        <CategoryTable m={m} categories={m.categories} />
      )}
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Starters
        </h3>
        <LineupRows
          sport={m.sport}
          mine={starters(m.mine)}
          theirs={starters(m.opponent)}
          games={allGames}
          byes={byeWeeks}
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
          games={allGames}
          byes={byeWeeks}
        />
      </section>
      <p className="text-[11px] text-muted">
        {m.categories
          ? 'Read from ESPN Fantasy: categories through yesterday plus today’s starters, refreshed every couple of minutes. Tap a player’s figure for their line today.'
          : 'Read from ESPN Fantasy. Points refresh every couple of minutes; tap a player’s points for the breakdown.'}
      </p>
    </Sheet>
  )
}
