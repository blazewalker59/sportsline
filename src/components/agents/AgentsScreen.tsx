/**
 * Agents: API tokens that let an AI agent use Sportsline as you, through
 * the MCP server at /mcp (docs/adr/0007), and trading (docs/adr/0008): the
 * Kalshi trade key, its limits, and the orders Agents propose, which wait
 * here for you to approve or reject.
 */

import { Tokens } from './AgentTokens'
import { Pending, Trading } from './AgentTrading'
import { money } from './shared'
import type { BetRecordView } from '@/lib/agents/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { StatGrid, StatTile } from '@/components/layout/StatTile'
import { PriceDisplayToggle } from '@/components/predictions/PriceDisplayToggle'
import { timeAgo, useNow } from '@/components/timeline/format'
import { formatPrice } from '@/lib/model/price'
import { useBetRecord, useTrading } from '@/lib/agents/queries'
import { usePriceDisplay, useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

export function AgentsScreen() {
  const { data: viewerState, isPending } = useViewer()
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Agents</h1>
      {isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to connect an agent.
        </p>
      ) : (
        <Signed />
      )}
    </div>
  )
}

function Signed() {
  // Proposals expire in minutes: keep the page current while it's open.
  const trading = useTrading()
  const pending = trading.data?.trades.filter((t) => t.status === 'pending')
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Let an AI agent (Grok, Claude or your own bot) use Sportsline as you:
        read today’s Sharp picks and their record and, if you allow it, propose
        Kalshi trades that you approve one by one.
      </p>
      <PriceDisplayToggle />
      {pending && pending.length > 0 && <Pending trades={pending} />}
      <Tokens tradingReady={Boolean(trading.data?.key)} />
      {trading.data && <Trading state={trading.data} />}
      <BetRecord />
    </div>
  )
}

// ─── find_bet record ────────────────────────────────────────────────────────

function BetRecord() {
  const display = usePriceDisplay()
  const record = useBetRecord()
  const now = useNow()
  const data: BetRecordView | undefined = record.data
  if (!data || data.stats.requests === 0) return null
  const s = data.stats
  const tile = (label: string, value: string) => (
    <StatTile label={label} value={value} />
  )
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
        Trend picks asked for
      </h2>
      <p className="text-sm text-muted">
        Every time an agent asks find_bet for a trend pick, and what came of its
        picks: placed on Kalshi after they were suggested (by you or an approved
        trade), and how those did.
      </p>
      <StatGrid>
        {tile('asks', String(s.requests))}
        {tile('picks offered', String(s.picksOffered))}
        {tile('placed', String(s.placed))}
        {tile('won – lost', `${s.won}–${s.lost}`)}
        {tile(
          'win rate',
          s.winRate === null ? '—' : `${Math.round(s.winRate * 100)}%`,
        )}
        {tile('profit', `${s.pnl < 0 ? '−' : ''}${money(Math.abs(s.pnl))}`)}
      </StatGrid>
      <p className="text-xs text-muted">
        {s.pending} placed still open · skipped picks went {s.skipped.won}–
        {s.skipped.lost}
        {s.skipped.pending ? ` (${s.skipped.pending} open)` : ''}
      </p>
      <ul className="flex flex-col gap-2">
        {data.recent.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold">
                {p.title} · {p.gameLabel}
              </span>
              <span
                className={cn(
                  'shrink-0 text-xs font-semibold',
                  p.result === 'won'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : p.result === 'lost'
                      ? 'text-live'
                      : 'text-muted',
                )}
              >
                {p.result === 'won'
                  ? 'Won'
                  : p.result === 'lost'
                    ? 'Lost'
                    : p.result === 'void'
                      ? 'Void'
                      : 'Open'}
              </span>
            </span>
            <span className="text-xs text-muted">
              {formatPrice(p.price, display)} · suggested{' '}
              {timeAgo(p.createdAt, now)} ·{' '}
              {p.placedAt
                ? `placed${p.placedVia === 'agent' ? ' by agent' : ''}${p.placedCost ? ` (${money(p.placedCost)})` : ''}`
                : 'not placed'}
              {p.pnl !== null
                ? ` · ${p.pnl < 0 ? '−' : '+'}${money(Math.abs(p.pnl))}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
