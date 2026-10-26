/**
 * A Fantasy league's Scoring leaders (CONTEXT.md, "Scoring leaders").
 * Points leagues: its top Players, overall or at a position, or every
 * team's score this matchup. Category leagues: each Category's leader,
 * or one Category's top Players, today or over the whole matchup.
 * Football's scoring period is the week; the other sports' is the day.
 */

import { useState } from 'react'
import { POSITIONS, headshotOf, pts } from './format'
import { Segmented } from './Segmented'
import type {
  CategoryLeaders,
  CategoryPlace,
  LeaderPlayer,
  ScoringLeaders,
} from '@/lib/fantasy/leaders'
import type { FantasySport } from '@/lib/fantasy/sports'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { cn } from '@/lib/utils'

const HEADING = 'mb-2 text-xs font-bold tracking-wide text-muted uppercase'
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
  const [chosen, setChosen] = useState('All')
  const lists: Array<CategoryLeaders> =
    span === 'today' ? leaders.categories : (leaders.matchupCategories ?? [])
  // Every Category either span ranks, in the league's order.
  const offered = [...leaders.categories, ...(leaders.matchupCategories ?? [])]
    .filter((c, i, all) => all.findIndex((d) => d.statId === c.statId) === i)
    .sort((a, b) => order(leaders, a.statId) - order(leaders, b.statId))
  const one = lists.find((c) => String(c.statId) === chosen)
  const picked = offered.find((c) => String(c.statId) === chosen)
  const when = span === 'today' ? 'today' : 'this matchup'
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className={cn(HEADING, 'mb-0')}>Category leaders</h2>
        {leaders.matchupCategories && (
          <Segmented
            label="Category leaders over"
            options={[
              { key: 'today', label: 'Today' },
              { key: 'matchup', label: 'Matchup' },
            ]}
            value={span}
            onChange={setSpan}
          />
        )}
      </div>
      {offered.length > 1 && (
        <Segmented
          label="Category"
          options={[
            { key: 'All', label: 'All' },
            ...offered.map((c) => ({ key: String(c.statId), label: c.label })),
          ]}
          value={picked ? chosen : 'All'}
          onChange={setChosen}
        />
      )}
      {picked ? (
        <>
          {(picked.minimum || picked.reverse) && (
            <p className="text-[11px] text-muted">
              {picked.minimum
                ? `${picked.minimum} to rank${picked.reverse ? ', lowest first' : ''}.`
                : `Most first: fewer wins ${picked.label}.`}
            </p>
          )}
          {one ? (
            <ol className={LIST}>
              {one.players.map((p, i) => (
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
                  <CategoryFigure p={p} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">
              No {picked.label} yet {when}.
            </p>
          )}
        </>
      ) : lists.length === 0 ? (
        <p className="text-sm text-muted">No stats yet {when}.</p>
      ) : (
        <ul className={LIST}>
          {lists.map((c) => (
            <li key={c.statId}>
              <button
                type="button"
                onClick={() => setChosen(String(c.statId))}
                aria-label={`${c.label}: top ${c.players.length}`}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-notice',
                  c.players[0].mine && 'bg-notice',
                )}
              >
                <span className="w-10 shrink-0 text-xs font-bold text-muted">
                  {c.label}
                  {c.reverse && !c.minimum && (
                    <span className="block text-[10px] font-normal">most</span>
                  )}
                </span>
                <LeaderName sport={sport} p={c.players[0]} />
                <CategoryFigure p={c.players[0]} />
                <span aria-hidden="true" className="shrink-0 text-muted">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Where a Category sits in the league's order (today's, then the matchup's). */
function order(leaders: ScoringLeaders, statId: number): number {
  const today = leaders.categories.findIndex((c) => c.statId === statId)
  if (today !== -1) return today
  const matchup = (leaders.matchupCategories ?? []).findIndex(
    (c) => c.statId === statId,
  )
  return leaders.categories.length + matchup
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
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className={cn(HEADING, 'mb-0')}>Scoring leaders {when}</h2>
        <Segmented
          label="Scoring leaders"
          options={[
            { key: 'players', label: 'Players' },
            { key: 'teams', label: 'Teams' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'players' ? (
        <>
          {groups.length > 1 && (
            <Segmented
              label="Position"
              options={[
                { key: 'All', label: 'All' },
                ...groups.map((g) => ({ key: g.label, label: g.label })),
              ]}
              value={chosen ? position : 'All'}
              onChange={setPosition}
            />
          )}
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
    <>
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
    </>
  )
}
