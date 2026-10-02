import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'
import { TeamLogo, TeamMark } from '@/components/brand/TeamMark'
import {
  BubbleStack,
  LeagueAvatar,
  Notice,
  TeamAvatar,
  TypingDots,
} from '@/components/chat/ChatParts'
import { FollowButton } from '@/components/follows/FollowButton'
import { AppHeader } from '@/components/layout/AppHeader'
import { startTime, useNow } from '@/components/timeline/format'
import { useLiveGame } from '@/lib/games/useLiveGame'
import { buildChat, typingFor } from '@/lib/timeline/chat'
import { cn } from '@/lib/utils'

/**
 * Game Detail as a message thread between the two teams (design direction
 * "Watch Party"): the away team on the left, the home team on the right,
 * oldest first, with the live Situation as the typing indicator.
 */
export function GameDetailScreen({ gameId }: { gameId: string }) {
  const { data, isPending } = useLiveGame(gameId)
  const [tab, setTab] = useState<'thread' | 'box'>('thread')

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      {isPending ? null : !data ? (
        <p className="mt-16 text-center text-sm text-muted">Game not found.</p>
      ) : (
        <>
          <ThreadHeader game={data.game} />
          <div
            role="tablist"
            className="my-3 flex gap-1 rounded-full bg-notice p-1 text-sm"
          >
            {(['thread', 'box'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'min-h-10 flex-1 rounded-full font-semibold',
                  tab === t
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted',
                )}
              >
                {t === 'thread' ? 'Plays' : 'Box score'}
              </button>
            ))}
          </div>
          {tab === 'thread' ? (
            <Thread items={data.items} game={data.game} />
          ) : (
            <>
              <div className="flex justify-between gap-2">
                {[data.game.awayTeam, data.game.homeTeam].map((team) => (
                  <div key={team.id} className="flex items-center gap-2">
                    <TeamMark team={team} size={20} bold />
                    <FollowButton follow={{ kind: 'team', teamId: team.id }} />
                  </div>
                ))}
              </div>
              {data.box && <Linescore box={data.box} game={data.game} />}
              <div className="mt-4">
                <BoxTables box={data.box} game={data.game} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function ThreadHeader({ game }: { game: GameSummary }) {
  const live = game.status === 'live' || game.status === 'delayed'
  const started = live || game.status === 'final'
  const typing = typingFor(game)
  const status = live
    ? (typing?.text ?? game.situation?.segmentLabel ?? 'Live')
    : game.status === 'final'
      ? 'Final'
      : game.status === 'postponed'
        ? 'Postponed'
        : startTime(game.startsAt)
  return (
    <section className="flex flex-col items-center gap-1.5 rounded-3xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-4">
        <TeamColumn team={game.awayTeam} />
        <span className="text-[34px] font-extrabold tracking-tight tabular-nums">
          {started ? `${game.score.away} – ${game.score.home}` : '@'}
        </span>
        <TeamColumn team={game.homeTeam} />
      </div>
      <span
        className={cn(
          'text-center text-xs font-semibold',
          live ? 'text-live' : 'text-muted',
        )}
      >
        {status}
      </span>
    </section>
  )
}

function TeamColumn({ team }: { team: GameSummary['awayTeam'] }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <TeamLogo team={team} size={40} />
      <span className="text-xs font-semibold text-muted">
        {team.abbreviation}
      </span>
    </span>
  )
}

function Thread({
  items,
  game,
}: {
  items: Array<TimelineItem>
  game: GameSummary
}) {
  const now = useNow()
  const entries = useMemo(() => buildChat(items, { fold: false }), [items])
  const typing = typingFor(game)
  const end = useRef<HTMLDivElement>(null)
  // Open at the latest Play, the way a chat thread does.
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || items.length === 0) return
    scrolled.current = true
    end.current?.scrollIntoView({ block: 'end' })
  }, [items.length])

  if (items.length === 0 && !typing) {
    return <p className="mt-10 text-center text-sm text-muted">No plays yet.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-[11px] text-muted">
        {game.awayTeam.abbreviation} on the left · {game.homeTeam.abbreviation}{' '}
        on the right
      </p>
      {entries.map((entry) => {
        if (entry.type === 'notice')
          return <Notice key={entry.item.id} item={entry.item} now={now} />
        const align = entry.side === 'home' ? 'right' : 'left'
        const team = entry.side === 'home' ? game.homeTeam : game.awayTeam
        const first = entry.bubbles[0]
        const lead = first.type === 'fold' ? first.items[0] : first.item
        return (
          <div
            key={entry.id}
            className={cn(
              'flex items-end gap-2',
              align === 'right' && 'flex-row-reverse',
            )}
          >
            <TeamAvatar team={team} size={28} />
            <div
              className={cn(
                'flex min-w-0 flex-col gap-1',
                align === 'right' && 'items-end',
              )}
            >
              <BubbleStack bubbles={entry.bubbles} align={align} compact />
              <span className="px-1 text-[11px] text-muted tabular-nums">
                {lead.segmentLabel} · {lead.score.away}–{lead.score.home}
              </span>
            </div>
          </div>
        )
      })}
      {typing && (
        <div
          className={cn(
            'flex items-end gap-2',
            typing.side === 'home' && 'flex-row-reverse',
          )}
        >
          {typing.side ? (
            <TeamAvatar
              team={typing.side === 'home' ? game.homeTeam : game.awayTeam}
              size={28}
            />
          ) : (
            <LeagueAvatar league={game.league} size={28} />
          )}
          <TypingDots align={typing.side === 'home' ? 'right' : 'left'} />
        </div>
      )}
      <div ref={end} />
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
