/**
 * A Fantasy league's Scoring leaders (CONTEXT.md, "Scoring leaders").
 * Points leagues: its top Players, overall or at a position, or every
 * team's score this matchup. Category leagues: each Category's leading
 * Player or team, opening in place to the rest, today or over the whole
 * matchup.
 * Football's scoring period is the week; the other sports' is the day.
 */

import { useState } from 'react'
import { POSITIONS, headshotOf, pts } from './format'
import { Picker, SectionHead } from './Picker'
import type {
  CategoryLeaders,
  CategoryPlace,
  LeaderPlayer,
  ScoringLeaders,
  TeamCategoryLeaders,
} from '@/lib/fantasy/leaders'
import type { FantasySport } from '@/lib/fantasy/sports'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { PlayerButton } from '@/components/players/playerSheet'
import { cn } from '@/lib/utils'

const LIST =
  'divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface'

/** Each position's leaders under its name, positions sharing one merged. */
export function positionGroups(
  sport: FantasySport,
  leaders: ScoringLeaders,
): Array<{ label: string; players: Array<LeaderPlayer> }> {
  const groups: Array<{ label: string; players: Array<LeaderPlayer> }> = []
  for (const p of leaders.positions ?? []) {
    const label = POSITIONS[sport][p.positionId] ?? `Pos ${p.positionId}`
    const group = groups.find((g) => g.label === label)
    if (group) group.players.push(...p.players)
    else groups.push({ label, players: [...p.players] })
  }
  for (const g of groups) g.players.sort((a, b) => b.points - a.points)
  return groups
}

export function LeadersView({
  sport,
  leaders,
}: {
  sport: FantasySport
  leaders: ScoringLeaders
}) {
  return leaders.categories.length > 0 ||
    (leaders.matchupCategories?.length ?? 0) > 0 ? (
    <CategoryBoard sport={sport} leaders={leaders} />
  ) : (
    <PointsLeaders sport={sport} leaders={leaders} />
  )
}

function CategoryBoard({
  sport,
  leaders,
}: {
  sport: FantasySport
  leaders: ScoringLeaders
}) {
  const [span, setSpan] = useState<'today' | 'matchup'>('today')
  const [who, setWho] = useState<'players' | 'teams'>('players')
  // The Category opened to its whole list, one at a time.
  const [open, setOpen] = useState<number | null>(null)
  const toggle = (statId: number) =>
    setOpen((o) => (o === statId ? null : statId))
  const when = span === 'today' ? 'today' : 'this matchup'
  return (
    <section>
      <SectionHead title="Category leaders">
        {leaders.teamCategories !== undefined && (
          <Picker
            label="Leaders among"
            options={[
              { key: 'players', label: 'Players' },
              { key: 'teams', label: 'Teams' },
            ]}
            value={who}
            onChange={setWho}
          />
        )}
        {leaders.matchupCategories && (
          <Picker
            label="Leaders over"
            options={[
              { key: 'today', label: 'Today' },
              { key: 'matchup', label: 'Matchup' },
            ]}
            value={span}
            onChange={setSpan}
          />
        )}
      </SectionHead>
      {who === 'teams' ? (
        <TeamBoard
          lists={
            (span === 'today'
              ? leaders.teamCategories
              : leaders.matchupTeamCategories) ?? []
          }
          open={open}
          onToggle={toggle}
          when={when}
        />
      ) : (
        <PlayerBoard
          sport={sport}
          lists={
            span === 'today'
              ? leaders.categories
              : (leaders.matchupCategories ?? [])
          }
          open={open}
          onToggle={toggle}
          when={when}
        />
      )}
    </section>
  )
}

/**
 * A Category's row: its label, its leader and their figure; tapped, it
 * opens to everyone after them, ranked, and closes again.
 */
function CategoryRow({
  statId,
  label,
  most,
  mine,
  open,
  onToggle,
  count,
  lead,
  children,
}: {
  statId: number
  label: string
  /** Most first though lower wins (turnovers): who's costing their side. */
  most: boolean
  mine: boolean
  open: boolean
  onToggle: (statId: number) => void
  /** How many the whole list has. */
  count: number
  lead: React.ReactNode
  /** The whole list, shown when open. */
  children: React.ReactNode
}) {
  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2',
          mine && !open && 'bg-notice',
        )}
      >
        <button
          type="button"
          onClick={() => onToggle(statId)}
          className="w-10 shrink-0 self-stretch text-left text-xs font-bold text-muted"
        >
          {label}
          {most && <span className="block text-[10px] font-normal">most</span>}
        </button>
        {lead}
        {count > 1 && (
          <button
            type="button"
            onClick={() => onToggle(statId)}
            aria-expanded={open}
            aria-label={`${label}: ${open ? 'close' : `top ${count}`}`}
            className="-mr-1 min-h-8 shrink-0 px-1 text-muted hover:text-foreground"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className={cn(
                'size-3 transition-transform',
                open && 'rotate-180',
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 4.5 6 7.5 9 4.5" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-border bg-notice/40 pb-1">
          {children}
        </div>
      )}
    </li>
  )
}

/** A ranked row inside an open Category. */
function RankRow({
  rank,
  mine,
  children,
}: {
  rank: number
  mine: boolean
  children: React.ReactNode
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 py-1.5 pr-3 pl-3',
        mine && 'bg-notice font-semibold',
      )}
    >
      <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">
        {rank}
      </span>
      {children}
    </li>
  )
}

/** Each Category's leading Player, opening to its top ten. */
function PlayerBoard({
  sport,
  lists,
  open,
  onToggle,
  when,
}: {
  sport: FantasySport
  lists: ReadonlyArray<CategoryLeaders>
  open: number | null
  onToggle: (statId: number) => void
  when: string
}) {
  if (lists.length === 0)
    return <p className="text-sm text-muted">No stats yet {when}.</p>
  return (
    <ul className={LIST}>
      {lists.map((c) => (
        <CategoryRow
          key={c.statId}
          statId={c.statId}
          label={c.label}
          most={c.reverse && !c.minimum}
          mine={c.players[0].mine}
          open={open === c.statId}
          onToggle={onToggle}
          count={c.players.length}
          lead={
            <>
              <LeaderName sport={sport} p={c.players[0]} />
              <CategoryFigure p={c.players[0]} />
            </>
          }
        >
          {(c.minimum || c.reverse) && (
            <p className="px-3 pt-1.5 text-[11px] text-muted">
              {c.minimum
                ? `${c.minimum} to rank${c.reverse ? ', lowest first' : ''}.`
                : `Most first: fewer wins ${c.label}.`}
            </p>
          )}
          <ol>
            {c.players.slice(1).map((p, i) => (
              <RankRow
                key={`${p.fantasyTeamId}-${p.espnId}`}
                rank={i + 2}
                mine={p.mine}
              >
                <LeaderName sport={sport} p={p} />
                <CategoryFigure p={p} />
              </RankRow>
            ))}
          </ol>
        </CategoryRow>
      ))}
    </ul>
  )
}

/** Each Category's leading team, opening to every team in it. */
export function TeamBoard({
  lists,
  open,
  onToggle,
  when,
}: {
  lists: ReadonlyArray<TeamCategoryLeaders>
  open: number | null
  onToggle: (statId: number) => void
  when: string
}) {
  if (lists.length === 0)
    return <p className="text-sm text-muted">No stats yet {when}.</p>
  return (
    <ul className={LIST}>
      {lists.map((c) => {
        const top = c.teams[0]
        return (
          <CategoryRow
            key={c.statId}
            statId={c.statId}
            label={c.label}
            most={false}
            mine={top.mine}
            open={open === c.statId}
            onToggle={onToggle}
            count={c.teams.length}
            lead={
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {top.name}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {top.value}
                </span>
              </>
            }
          >
            {c.reverse && (
              <p className="px-3 pt-1.5 text-[11px] text-muted">
                Lowest first: fewer wins {c.label}.
              </p>
            )}
            <ol>
              {c.teams.slice(1).map((t, i) => (
                <RankRow key={t.teamId} rank={i + 2} mine={t.mine}>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {t.value}
                  </span>
                </RankRow>
              ))}
            </ol>
          </CategoryRow>
        )
      })}
    </ul>
  )
}

/** A Player's value in a Category, a rate's parts under it. */
function CategoryFigure({ p }: { p: CategoryPlace }) {
  return (
    <span className="shrink-0 text-right tabular-nums">
      <span className="block text-sm font-bold">{p.value}</span>
      {p.parts && (
        <span className="block text-[11px] text-muted">{p.parts}</span>
      )}
    </span>
  )
}

function PointsLeaders({
  sport,
  leaders,
}: {
  sport: FantasySport
  leaders: ScoringLeaders
}) {
  const [view, setView] = useState<'players' | 'teams'>('players')
  const [position, setPosition] = useState('All')
  const groups = positionGroups(sport, leaders)
  const chosen = groups.find((g) => g.label === position)
  const players = chosen ? chosen.players : leaders.players
  const when = sport === 'football' ? 'this week' : 'today'
  if (leaders.players.length === 0 && leaders.teams.length === 0)
    return <p className="text-sm text-muted">No points scored yet {when}.</p>
  return (
    <section>
      <SectionHead title={`Scoring leaders ${when}`}>
        {view === 'players' && groups.length > 1 && (
          <Picker
            label="Position"
            options={[
              { key: 'All', label: 'All positions' },
              ...groups.map((g) => ({ key: g.label, label: g.label })),
            ]}
            value={chosen ? position : 'All'}
            onChange={setPosition}
          />
        )}
        <Picker
          label="Scoring leaders"
          options={[
            { key: 'players', label: 'Players' },
            { key: 'teams', label: 'Teams' },
          ]}
          value={view}
          onChange={setView}
        />
      </SectionHead>
      {view === 'players' ? (
        <>
          <ol className={LIST}>
            {players.map((p, i) => (
              <li
                key={`${p.fantasyTeamId}-${p.espnId}`}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2',
                  p.mine && 'bg-notice',
                )}
              >
                <span className="w-5 shrink-0 text-xs text-muted tabular-nums">
                  {i + 1}
                </span>
                <LeaderName sport={sport} p={p} />
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {pts(p.points)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <ol className={LIST}>
          {leaders.teams.map((t, i) => (
            <li
              key={t.teamId}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 text-sm',
                t.mine && 'bg-notice font-semibold',
              )}
            >
              <span className="w-5 shrink-0 text-xs text-muted tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="shrink-0 font-bold tabular-nums">
                {pts(t.score)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** A leader's headshot and name, with their Team and Fantasy team. */
function LeaderName({ sport, p }: { sport: FantasySport; p: LeaderPlayer }) {
  return (
    <PlayerButton
      playerId={p.playerId}
      className="flex min-w-0 flex-1 items-center gap-2.5"
    >
      <PlayerAvatar
        name={p.name}
        headshotUrl={headshotOf(sport, p)}
        size={28}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.name}</span>
        <span className="block truncate text-[11px] text-muted">
          {[p.teamAbbrev, p.fantasyTeam, p.starter ? null : 'bench']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </PlayerButton>
  )
}
