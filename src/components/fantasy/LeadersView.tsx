/**
 * A Fantasy league's Scoring leaders (CONTEXT.md, "Scoring leaders").
 * Points leagues: its top Players, overall or at a position, or every
 * team's score this matchup. Category leagues: each counting Category's
 * leader, today or over the whole matchup. Football's scoring period is
 * the week; the other sports' is the day.
 */

import { useState } from 'react'
import { POSITIONS, headshotOf, pts } from './format'
import { Segmented } from './Segmented'
import type {
  CategoryLeader,
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
    <CategoryLeaders sport={sport} leaders={leaders} />
  ) : (
    <PointsLeaders sport={sport} leaders={leaders} />
  )
}

function CategoryLeaders({
  sport,
  leaders,
}: {
  sport: FantasySport
  leaders: ScoringLeaders
}) {
  const [span, setSpan] = useState<'today' | 'matchup'>('today')
  const rows: Array<CategoryLeader> =
    span === 'today' ? leaders.categories : (leaders.matchupCategories ?? [])
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
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
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          {span === 'today'
            ? 'No stats yet today.'
            : 'No stats yet this matchup.'}
        </p>
      ) : (
        <ul className={LIST}>
          {rows.map((c) => (
            <li
              key={c.statId}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2',
                c.player.mine && 'bg-notice',
              )}
            >
              <span className="w-10 shrink-0 text-xs font-bold text-muted">
                {c.label}
              </span>
              <LeaderName sport={sport} p={c.player} />
              <span className="shrink-0 text-sm font-bold tabular-nums">
                {c.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
