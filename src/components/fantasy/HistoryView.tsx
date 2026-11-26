/**
 * A league's History (CONTEXT.md, "League history"): its champions by
 * season, each manager's all-time record, the Viewer's head-to-head
 * against every manager they've played, and the league's scoring records.
 */

import { SectionHead } from './Picker'
import type { FantasySport } from '@/lib/fantasy/sports'
import type { Bracket, LeagueHistory, ScoreRecord } from '@/lib/fantasy/history'
import { cn } from '@/lib/utils'

const record = (w: number, l: number, t: number) =>
  `${w}-${l}${t ? `-${t}` : ''}`

const score = (n: number, points: boolean) =>
  points ? n.toFixed(1) : String(n)

/** "2024 · Week 7", "2025 · Matchup 21 · Playoffs". */
export function whenText(
  sport: FantasySport,
  season: number,
  period: number,
  bracket: Bracket,
): string {
  return [
    season,
    `${sport === 'football' ? 'Week' : 'Matchup'} ${period}`,
    bracket === 'playoff' ? 'Playoffs' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function HistoryView({
  sport,
  history,
}: {
  sport: FantasySport
  history: LeagueHistory
}) {
  if (history.seasons.length === 0)
    return <p className="text-sm text-muted">No seasons to look back on yet.</p>
  const oldest = history.seasons[history.seasons.length - 1]
  return (
    <div className="flex flex-col gap-6">
      <Champions history={history} />
      <Managers history={history} />
      {history.rivals.length > 0 && <Rivals sport={sport} history={history} />}
      {history.records && <Records sport={sport} records={history.records} />}
      <p className="text-2xs text-muted">
        {history.seasons.length === 1
          ? `The ${oldest} season.`
          : `${history.seasons.length} seasons since ${oldest}.`}{' '}
        Records count the regular season and the playoffs, not consolation
        games.
        {history.missing.length > 0 &&
          ` Couldn’t read ${history.missing.join(', ')}; they’re tried again next time.`}
      </p>
    </div>
  )
}

function Champions({ history }: { history: LeagueHistory }) {
  return (
    <section>
      <SectionHead title="Champions" />
      <ol className="overflow-hidden rounded-card border border-border bg-surface">
        {history.champions.map((c) => (
          <li
            key={c.season}
            aria-current={c.mine || undefined}
            className={cn(
              'flex items-baseline gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0',
              c.mine && 'bg-notice',
            )}
          >
            <span className="w-10 shrink-0 text-muted tabular-nums">
              {c.season}
            </span>
            {c.champion ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {c.champion.manager}
                  {c.mine && (
                    <span className="ml-1.5 text-2xs text-scoring">You</span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted">
                  {c.champion.team}
                  {c.runnerUp && ` · beat ${c.runnerUp.manager}`}
                </span>
              </span>
            ) : (
              <span className="flex-1 text-muted">
                {c.complete ? 'No champion recorded' : 'In progress'}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Managers({ history }: { history: LeagueHistory }) {
  const ties = history.managers.some((m) => m.ties > 0)
  return (
    <section>
      <SectionHead title="All-time" />
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full text-sm whitespace-nowrap tabular-nums">
          <thead className="text-2xs text-muted uppercase">
            <tr className="border-b border-border">
              <th className="py-2 pr-1 pl-3 text-left font-semibold">
                Manager
              </th>
              <th className="px-1 text-right font-semibold">Yrs</th>
              <th className="px-1 text-right font-semibold">
                {ties ? 'W-L-T' : 'W-L'}
              </th>
              <th className="px-1 text-right font-semibold">Playoffs</th>
              <th className="pr-3 pl-1 text-right font-semibold">Titles</th>
            </tr>
          </thead>
          <tbody>
            {history.managers.map((m) => (
              <tr
                key={m.id}
                aria-current={m.mine || undefined}
                className={cn(
                  'border-b border-border last:border-b-0',
                  m.mine && 'bg-notice font-semibold',
                )}
              >
                <td className="max-w-36 truncate py-2 pr-1 pl-3">{m.name}</td>
                <td className="px-1 text-right text-muted">{m.seasons}</td>
                <td className="px-1 text-right">
                  {record(m.wins, m.losses, m.ties)}
                </td>
                <td className="px-1 text-right">
                  {m.playoffs}
                  {m.playoffWins + m.playoffLosses > 0 && (
                    <span className="text-2xs text-muted">
                      {' '}
                      ({m.playoffWins}-{m.playoffLosses})
                    </span>
                  )}
                </td>
                <td className="pr-3 pl-1 text-right">
                  {m.titles > 0 ? (
                    <span className="font-semibold">{m.titles}</span>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                  {m.finals > 0 && (
                    <span className="text-2xs text-muted">
                      {' '}
                      +{m.finals} final{m.finals === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-2xs text-muted">
        Regular-season record; playoff appearances, with their record.
      </p>
    </section>
  )
}

function Rivals({
  sport,
  history,
}: {
  sport: FantasySport
  history: LeagueHistory
}) {
  return (
    <section>
      <SectionHead title="Your head-to-head" />
      <ul className="overflow-hidden rounded-card border border-border bg-surface">
        {history.rivals.map((r) => {
          const ahead = r.wins + r.playoffWins - (r.losses + r.playoffLosses)
          const { last } = r
          const won = last.mine > last.theirs
          return (
            <li
              key={r.id}
              className="flex items-baseline gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-muted">
                  Last: {won ? 'W' : last.mine === last.theirs ? 'T' : 'L'}{' '}
                  {score(last.mine, last.points)}–
                  {score(last.theirs, last.points)} ·{' '}
                  {whenText(sport, last.season, last.period, last.bracket)}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span
                  className={cn(
                    'block font-semibold',
                    ahead > 0 ? 'text-scoring' : ahead < 0 ? 'text-live' : '',
                  )}
                >
                  {record(r.wins, r.losses, r.ties)}
                </span>
                {r.playoffWins + r.playoffLosses > 0 && (
                  <span className="block text-2xs text-muted">
                    {r.playoffWins}-{r.playoffLosses} playoffs
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Records({
  sport,
  records,
}: {
  sport: FantasySport
  records: NonNullable<LeagueHistory['records']>
}) {
  const rows: Array<{ label: string; r: ScoreRecord; value: string }> = [
    {
      label: 'Highest score',
      r: records.highest,
      value: records.highest.score.toFixed(1),
    },
    {
      label: 'Lowest score',
      r: records.lowest,
      value: records.lowest.score.toFixed(1),
    },
    {
      label: 'Biggest win',
      r: records.blowout,
      value: `by ${(records.blowout.score - records.blowout.opponentScore).toFixed(1)}`,
    },
    {
      label: 'Closest win',
      r: records.closest,
      value: `by ${(records.closest.score - records.closest.opponentScore).toFixed(2)}`,
    },
  ]
  return (
    <section>
      <SectionHead title="Records" />
      <ul className="overflow-hidden rounded-card border border-border bg-surface">
        {rows.map(({ label, r, value }) => (
          <li
            key={label}
            className="flex items-baseline gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-2xs font-semibold text-muted uppercase">
                {label}
              </span>
              <span className="block truncate font-semibold">{r.manager}</span>
              <span className="block truncate text-xs text-muted">
                {r.score.toFixed(1)}–{r.opponentScore.toFixed(1)} vs{' '}
                {r.opponentManager} ·{' '}
                {whenText(sport, r.season, r.period, r.bracket)}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
