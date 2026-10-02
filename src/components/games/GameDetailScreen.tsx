import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo, TeamMark } from '@/components/brand/TeamMark'
import { FollowButton } from '@/components/follows/FollowButton'
import { AppHeader } from '@/components/layout/AppHeader'
import { Bases, Outs } from '@/components/mlb/Bases'
import { startTime } from '@/components/timeline/format'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { cn } from '@/lib/utils'

interface MlbSituation {
  outs?: number
  balls?: number
  strikes?: number
  onFirst?: boolean
  onSecond?: boolean
  onThird?: boolean
  batter?: string | null
  pitcher?: string | null
}

interface NflSituation {
  downDistance?: string | null
  possession?: string | null
}

function nhlStrength(game: GameSummary): string | null {
  return (
    (game.situation?.detail as { strength?: string | null } | undefined)
      ?.strength ?? null
  )
}

export function GameDetailScreen({ gameId }: { gameId: string }) {
  const { data, isPending } = useLiveGame(gameId)
  const [tab, setTab] = useState<'plays' | 'box'>('plays')

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      {isPending ? null : !data ? (
        <p className="mt-16 text-center text-sm text-muted">Game not found.</p>
      ) : (
        <>
          <Scoreboard game={data.game} />
          {data.box && <Linescore box={data.box} game={data.game} />}
          <div
            role="tablist"
            className="mt-5 mb-3 flex gap-1 rounded-full border border-border p-1 text-sm"
          >
            {(['plays', 'box'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 rounded-full py-1.5 capitalize',
                  tab === t ? 'bg-foreground text-background' : 'text-muted',
                )}
              >
                {t === 'plays' ? 'Plays' : 'Box score'}
              </button>
            ))}
          </div>
          {tab === 'plays' ? (
            <PlayList items={data.items} />
          ) : (
            <BoxTables box={data.box} game={data.game} />
          )}
        </>
      )}
    </div>
  )
}

function Scoreboard({ game }: { game: GameSummary }) {
  const live = game.status === 'live' || game.status === 'delayed'
  const started = live || game.status === 'final'
  const situation = game.situation?.detail as MlbSituation | undefined
  const status = live
    ? (game.situation?.segmentLabel ?? 'Live')
    : game.status === 'final'
      ? 'Final'
      : game.status === 'postponed'
        ? 'Postponed'
        : startTime(game.startsAt)
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p
        className={cn(
          'mb-3 flex items-center justify-center gap-2 text-xs uppercase tracking-wide',
          live ? 'text-live' : 'text-muted',
        )}
      >
        <LeagueLogo league={game.league} size={18} />
        {status}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamColumn team={game.awayTeam} />
        <p className="text-4xl font-bold tabular-nums">
          {started ? `${game.score.away} – ${game.score.home}` : '@'}
        </p>
        <TeamColumn team={game.homeTeam} />
      </div>
      {live && game.league === 'nhl' && nhlStrength(game) && (
        <p className="mt-4 border-t border-border pt-3 text-center text-xs text-muted">
          {nhlStrength(game)}
        </p>
      )}
      {live &&
        game.league === 'nfl' &&
        (game.situation?.detail as NflSituation | undefined)?.downDistance && (
          <p className="mt-4 border-t border-border pt-3 text-center text-xs text-muted">
            {(game.situation?.detail as NflSituation).possession && (
              <span className="mr-1.5 font-semibold text-foreground">
                {(game.situation?.detail as NflSituation).possession} ball
              </span>
            )}
            {(game.situation?.detail as NflSituation).downDistance}
          </p>
        )}
      {live && game.league === 'mlb' && situation && (
        <div className="mt-4 flex items-center justify-center gap-4 border-t border-border pt-3 text-xs text-muted">
          <Bases
            first={situation.onFirst}
            second={situation.onSecond}
            third={situation.onThird}
            size={28}
          />
          <Outs outs={situation.outs ?? 0} />
          <span className="tabular-nums">
            {situation.balls ?? 0}-{situation.strikes ?? 0}
          </span>
          {situation.batter && (
            <span className="truncate">
              {situation.pitcher} →{' '}
              <span className="text-foreground">{situation.batter}</span>
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function TeamColumn({ team }: { team: GameSummary['awayTeam'] }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamLogo team={team} size={48} />
      <span className="text-lg font-semibold">{team.abbreviation}</span>
      <span className="text-xs text-muted">{team.name}</span>
      <FollowButton follow={{ kind: 'team', teamId: team.id }} />
    </div>
  )
}

function Linescore({ box, game }: { box: GameBox; game: GameSummary }) {
  const ls = box.linescore
  if (ls.segments.length === 0) return null
  const row = (
    team: GameSummary['awayTeam'],
    runs: Array<number | null>,
    totals: Array<number>,
  ) => (
    <tr>
      <th className="py-1 pr-3 text-left font-semibold">
        <TeamMark team={team} size={16} />
      </th>
      {runs.map((r, i) => (
        <td key={i} className="px-1.5 text-center text-muted">
          {r ?? '–'}
        </td>
      ))}
      {totals.map((t, i) => (
        <td
          key={`t${i}`}
          className={cn(
            'px-1.5 text-center font-semibold',
            i === 0 && 'border-l border-border pl-2',
          )}
        >
          {t}
        </td>
      ))}
    </tr>
  )
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface px-3 py-2">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-muted">
            <th />
            {ls.segments.map((s) => (
              <th key={s} className="px-1.5 font-normal">
                {s}
              </th>
            ))}
            {ls.totalColumns.map((c, i) => (
              <th
                key={c}
                className={cn(
                  'px-1.5 font-normal',
                  i === 0 && 'border-l border-border pl-2',
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row(game.awayTeam, ls.away, ls.awayTotals)}
          {row(game.homeTeam, ls.home, ls.homeTotals)}
        </tbody>
      </table>
    </div>
  )
}

/** Plays grouped by segment, newest segment first, with a scoring summary on top. */
function PlayList({ items }: { items: Array<TimelineItem> }) {
  const plays = useMemo(
    () => items.filter((i) => i.kind !== 'milestone'),
    [items],
  )
  const groups = useMemo(() => {
    const out: Array<{ label: string; plays: Array<TimelineItem> }> = []
    for (const p of plays) {
      const last = out.at(-1)
      if (last?.label === p.segmentLabel) last.plays.push(p)
      else out.push({ label: p.segmentLabel, plays: [p] })
    }
    return out.reverse().map((g) => ({ ...g, plays: [...g.plays].reverse() }))
  }, [plays])
  const scoring = plays.filter(
    (p) => p.significance === 'scoring' && p.kind === 'play',
  )

  if (plays.length === 0)
    return <p className="mt-10 text-center text-sm text-muted">No plays yet.</p>
  return (
    <div className="flex flex-col gap-5">
      {scoring.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Scoring</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {scoring.map((p) => (
              <PlayRow key={p.id} item={p} showSegment />
            ))}
          </ul>
        </section>
      )}
      {groups.map((g, i) => (
        <section key={`${g.label}-${i}`}>
          <h2 className="mb-2 text-sm font-semibold text-muted">{g.label}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {g.plays.map((p) => (
              <PlayRow key={p.id} item={p} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function PlayRow({
  item,
  showSegment,
}: {
  item: TimelineItem
  showSegment?: boolean
}) {
  const accent =
    item.kind === 'overturn'
      ? 'bg-live'
      : item.significance === 'scoring'
        ? 'bg-scoring'
        : item.significance === 'notable'
          ? 'bg-notable'
          : 'bg-transparent'
  return (
    <li>
      <Link
        to="/plays/$playId"
        params={{ playId: item.id }}
        className="flex items-start gap-3 px-4 py-2.5 hover:bg-background/50"
      >
        <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', accent)} />
        <span
          className={cn(
            'flex-1 text-sm leading-snug',
            item.status === 'overturned' && 'line-through opacity-60',
          )}
        >
          {item.kind === 'overturn' && (
            <span className="mr-1 font-semibold text-live">Overturned:</span>
          )}
          {item.kind === 'overturn'
            ? item.description.replace(/^Overturned: /, '')
            : item.description}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {showSegment ? `${item.segmentLabel} · ` : ''}
          {item.score.away}-{item.score.home}
        </span>
      </Link>
    </li>
  )
}

function BoxTables({ box, game }: { box: GameBox | null; game: GameSummary }) {
  if (!box || box.tables.length === 0) {
    return (
      <p className="mt-10 text-center text-sm text-muted">No box score yet.</p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {box.tables.map((t) => (
        <div
          key={t.title}
          className="overflow-x-auto rounded-xl border border-border bg-surface"
        >
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-3 py-2 text-left font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <TeamLogo
                      team={t.side === 'away' ? game.awayTeam : game.homeTeam}
                      size={16}
                    />
                    {t.title}
                  </span>
                </th>
                {t.columns.map((c) => (
                  <th key={c} className="px-2 py-2 text-right font-normal">
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
                  <td
                    className={cn(
                      'py-1.5 pr-2',
                      r.sub ? 'pl-6 text-foreground/80' : 'pl-3',
                    )}
                  >
                    {r.player.name}
                    {r.note && (
                      <span className="ml-1.5 text-muted">{r.note}</span>
                    )}
                  </td>
                  {r.values.map((v, j) => (
                    <td key={j} className="px-2 text-right">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
