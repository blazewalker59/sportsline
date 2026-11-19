/**
 * Everything the phone's Scope bar pages through, at a glance: the
 * Scope's Games (Following, All, a League) or the Viewer's Matchups, a row
 * each, opened from the bar's first page. Picking one jumps the bar (and
 * the Timeline) straight to it, as if paged there. Predictions have their
 * own such sheet, the portfolio (PortfolioSheet).
 */

import { gameStatusLabel } from './GameStrip'
import { pageKey } from './scopePages'
import type { ScopePage } from './scopePages'
import type { GameSummary } from '@/lib/model/timeline'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import { Sheet } from '@/components/chat/Sheet'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { pts, scoreText } from '@/components/fantasy/format'
import { SPORTS } from '@/lib/fantasy/sports'
import { useTimeZone } from '@/lib/time/useTimeZone'
import { cn } from '@/lib/utils'

export function ScopeListSheet({
  title,
  pages,
  current,
  onPick,
  onClose,
}: {
  title: string
  /** The bar's pages: its Games or Matchups are listed (not the first). */
  pages: ReadonlyArray<ScopePage>
  /** The bar's current page's key: that row is marked. */
  current: string
  onPick: (page: ScopePage) => void
  onClose: () => void
}) {
  const rows = pages.filter((p) => p.kind === 'game' || p.kind === 'matchup')
  return (
    <Sheet title={title} onClose={onClose}>
      <ul className="flex flex-col gap-1.5">
        {rows.map((page) => {
          const here = pageKey(page) === current
          return (
            <li key={pageKey(page)}>
              <button
                type="button"
                onClick={() => onPick(page)}
                aria-current={here ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left tabular-nums',
                  here
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:bg-notice',
                )}
              >
                {page.kind === 'game' ? (
                  <GameRow game={page.game} />
                ) : page.kind === 'matchup' ? (
                  <MatchupRow league={page.league} />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

/** A Game: its state on the left, each team and its score stacked. */
function GameRow({ game: g }: { game: GameSummary }) {
  const timeZone = useTimeZone()
  const live = g.status === 'live' || g.status === 'delayed'
  const started = live || g.status === 'final'
  const leader =
    g.score.away === g.score.home
      ? null
      : g.score.away > g.score.home
        ? 'away'
        : 'home'
  return (
    <>
      <span className="flex w-16 shrink-0 flex-col items-start gap-1">
        <LeagueLogo league={g.league} size={16} />
        <span
          className={cn(
            'text-2xs leading-tight font-semibold',
            live ? 'text-live' : 'text-muted',
          )}
        >
          {gameStatusLabel(g, timeZone)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {(['away', 'home'] as const).map((side) => {
          const team = side === 'away' ? g.awayTeam : g.homeTeam
          return (
            <span
              key={side}
              className={cn(
                'flex items-center gap-2 text-[15px]',
                leader === side ? 'font-bold' : 'text-foreground/75',
              )}
            >
              <TeamLogo team={team} size={20} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {team.rank && (
                  <span className="mr-1 text-3xs font-bold text-muted">
                    {team.rank}
                  </span>
                )}
                {team.name}
              </span>
              <span>{started ? g.score[side] : ''}</span>
            </span>
          )
        })}
      </span>
    </>
  )
}

/** A Matchup: its league, then both sides and their scores stacked. */
function MatchupRow({ league }: { league: FantasyLeagueView }) {
  const m = league.matchup!
  const theirs = m.opponent
  const lead =
    theirs && m.mine.score !== theirs.score
      ? m.mine.score > theirs.score
        ? 'mine'
        : 'theirs'
      : null
  const side = (
    s: { name: string; score: number; projected: number | null },
    who: 'mine' | 'theirs',
  ) => (
    <span
      className={cn(
        'flex items-baseline gap-2 text-[15px]',
        lead === who ? 'font-bold' : 'text-foreground/75',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {s.name}
      </span>
      {!m.categories && s.projected !== null && (
        <span className="text-2xs font-normal text-muted">
          proj {pts(s.projected)}
        </span>
      )}
      <span>{scoreText(m, s.score)}</span>
    </span>
  )
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-2xs font-semibold text-muted">
        <LeagueLogo league={SPORTS[m.sport].league} size={14} />
        <span className="truncate">{m.leagueName}</span>
        {lead && (
          <span
            className={cn(
              'ml-auto shrink-0',
              lead === 'mine' ? 'text-scoring' : 'text-live',
            )}
          >
            {lead === 'mine' ? 'Leading' : 'Trailing'}
          </span>
        )}
      </span>
      {side(m.mine, 'mine')}
      {theirs ? (
        side(theirs, 'theirs')
      ) : (
        <span className="text-sm text-muted">Bye week</span>
      )}
    </span>
  )
}
