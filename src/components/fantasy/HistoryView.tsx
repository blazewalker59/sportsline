/**
 * A league's History (CONTEXT.md, "League history"): its champions by
 * season, each manager's all-time record, the Viewer's head-to-head
 * against every manager they've played, and the league's scoring records.
 */

import { SectionHead } from './Picker'
import type { FantasySport } from '@/lib/fantasy/sports'
import type { Bracket, LeagueHistory, ScoreRecord } from '@/lib/fantasy/history'
import { Num } from '@/components/signal/Num'
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
    return (
      <p className="well rounded-card px-4 py-6 text-center text-3xs text-muted uppercase">
        No seasons to look back on yet.
      </p>
    )
  const oldest = history.seasons[history.seasons.length - 1]
  return (
    <div className="flex flex-col gap-6">
      <Champions history={history} />
      <Managers history={history} />
      {history.rivals.length > 0 && <Rivals sport={sport} history={history} />}
      {history.records && <Records sport={sport} records={history.records} />}
      <p className="text-3xs text-muted">
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

const PANEL = 'rounded-card border border-border bg-surface'
const ROW = 'border-b border-border py-2.5 last:border-b-0'

/**
 * The champions by season, newest first: the year in dots, the winner
 * and the final, and a title glyph lit when it's the Viewer's.
 */
function Champions({ history }: { history: LeagueHistory }) {
  return (
    <section>
      <SectionHead title="Champions" index="H1">
        <span>
          {history.champions.length}{' '}
          {history.champions.length === 1 ? 'season' : 'seasons'}
        </span>
      </SectionHead>
      <ol className={cn(PANEL, 'px-4 py-1')}>
        {history.champions.map((c) => (
          <li
            key={c.season}
            aria-current={c.mine || undefined}
            className={cn(
              ROW,
              'grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2.5',
            )}
          >
            <Num className="text-[20px]">{c.season}</Num>
            {c.champion ? (
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{c.champion.manager}</span>
                  {c.mine && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-3xs font-normal text-scoring uppercase">
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-signal"
                      />
                      You
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-3xs text-muted">
                  {c.champion.team}
                  {c.runnerUp && ` · beat ${c.runnerUp.manager}`}
                </span>
              </span>
            ) : (
              <span className="text-3xs text-muted uppercase">
                {c.complete ? 'No champion recorded' : 'In progress'}
              </span>
            )}
            {c.champion ? (
              <span
                aria-hidden="true"
                className={cn(
                  'w-3.5 text-center text-xs',
                  c.mine && 'text-scoring',
                )}
              >
                ●
              </span>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** "2 titles, 1 lost final", for the glyphs' screen readers. */
const titlesText = (titles: number, finals: number) =>
  [
    `${titles} ${titles === 1 ? 'title' : 'titles'}`,
    finals > 0 && `${finals} lost final${finals === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(', ')

function Managers({ history }: { history: LeagueHistory }) {
  const ties = history.managers.some((m) => m.ties > 0)
  return (
    <section>
      <SectionHead title="All-time" index="H2" />
      <div className={cn(PANEL, 'overflow-x-auto px-3 py-2')}>
        <table className="w-full text-[13px] whitespace-nowrap tabular-nums">
          <thead>
            <tr className="border-b border-border text-3xs text-muted uppercase">
              <th className="py-1.5 pr-1 text-left font-normal">Manager</th>
              <th className="px-1 text-right font-normal">Yrs</th>
              <th className="px-1 text-right font-normal">
                {ties ? 'W-L-T' : 'W-L'}
              </th>
              <th className="px-1 text-right font-normal">Playoffs</th>
              <th className="pl-1 text-right font-normal">Titles</th>
            </tr>
          </thead>
          <tbody>
            {history.managers.map((m) => (
              <tr
                key={m.id}
                aria-current={m.mine || undefined}
                className={cn(
                  'border-b border-border last:border-b-0',
                  m.mine && 'font-bold',
                )}
              >
                <td className="max-w-36 truncate py-2 pr-1">{m.name}</td>
                <td className="px-1 text-right text-muted">{m.seasons}</td>
                <td className="px-1 text-right">
                  {record(m.wins, m.losses, m.ties)}
                </td>
                <td className="px-1 text-right">
                  {m.playoffs}
                  {m.playoffWins + m.playoffLosses > 0 && (
                    <span className="text-muted">
                      {' '}
                      ({m.playoffWins}-{m.playoffLosses})
                    </span>
                  )}
                </td>
                <td className="pl-1 text-right text-xs tracking-[0.1em]">
                  {m.titles + m.finals === 0 ? (
                    <span className="text-muted">–</span>
                  ) : (
                    <>
                      <span aria-hidden="true">
                        {'●'.repeat(m.titles)}
                        <span className="text-muted">
                          {'○'.repeat(m.finals)}
                        </span>
                      </span>
                      <span className="sr-only">
                        {titlesText(m.titles, m.finals)}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-3xs text-muted uppercase">
          <span>Regular season W-L · playoff trips (W-L)</span>
          <span aria-hidden="true">● title ○ lost final</span>
        </p>
      </div>
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
      <SectionHead title="Your head-to-head" index="H3" />
      <ul className={cn(PANEL, 'px-4 py-1')}>
        {history.rivals.map((r) => {
          const { last } = r
          const won = last.mine > last.theirs
          return (
            <li key={r.id} className={cn(ROW, 'flex items-center gap-3')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {r.name}
                </span>
                <span className="mt-0.5 block truncate text-3xs text-muted">
                  Last: {won ? 'W' : last.mine === last.theirs ? 'T' : 'L'}{' '}
                  {score(last.mine, last.points)}–
                  {score(last.theirs, last.points)} ·{' '}
                  {whenText(sport, last.season, last.period, last.bracket)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Num className="block text-[26px]">
                  {record(r.wins, r.losses, r.ties)}
                </Num>
                {r.playoffWins + r.playoffLosses > 0 && (
                  <span className="mt-1 block text-3xs text-muted uppercase">
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
      <SectionHead title="Records" index="H4" />
      <ul className={cn(PANEL, 'grid grid-cols-2 gap-x-4 gap-y-5 p-4')}>
        {rows.map(({ label, r, value }) => {
          const [by, figure] = value.startsWith('by ')
            ? ['by', value.slice(3)]
            : [null, value]
          return (
            <li key={label} className="min-w-0">
              <span className="sr-only">{value}</span>
              <span aria-hidden="true" className="flex items-baseline gap-1.5">
                {by && (
                  <span className="text-3xs text-muted uppercase">by</span>
                )}
                <Num className="text-[30px]">{figure}</Num>
              </span>
              <span className="mt-2 block text-3xs text-muted uppercase">
                {label}
              </span>
              <span className="mt-0.5 block truncate text-sm font-semibold">
                {r.manager}
              </span>
              <span className="block text-3xs text-muted">
                {r.score.toFixed(1)}–{r.opponentScore.toFixed(1)} vs{' '}
                {r.opponentManager} ·{' '}
                {whenText(sport, r.season, r.period, r.bracket)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
