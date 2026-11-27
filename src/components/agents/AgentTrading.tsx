/**
 * The Agents page's trading (docs/adr/0008): proposals waiting on the
 * Viewer, the Kalshi trade key, its limits, and the orders placed.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FIELD, FIELD_LABEL, KEY, TRADING_KEY, WIDE_KEY, money } from './shared'
import type { TradeView, TradingState } from '@/lib/agents/server'
import { timeAgo, useNow } from '@/components/timeline/format'
import { CAP_LIMITS, DEFAULT_CAPS } from '@/lib/agents/caps'
import { describeOrder } from '@/lib/agents/proposal'
import { formatPrice } from '@/lib/model/price'
import {
  approveTradeProposal,
  connectTradeKey,
  disconnectTradeKey,
  rejectTradeProposal,
  setTradeCaps,
} from '@/lib/agents/server'
import { usePriceDisplay } from '@/lib/viewer/useViewer'
import { Num } from '@/components/signal/Num'
import { SectionLabel } from '@/components/signal/Section'
import { cn } from '@/lib/utils'

// ─── Proposals waiting on you ───────────────────────────────────────────────

export function Pending({ trades }: { trades: Array<TradeView> }) {
  const display = usePriceDisplay()
  const queryClient = useQueryClient()
  const now = useNow(5_000)
  const refresh = () => queryClient.invalidateQueries({ queryKey: TRADING_KEY })
  const approve = useMutation({
    mutationFn: (id: string) => approveTradeProposal({ data: { id } }),
    onSettled: refresh,
  })
  const reject = useMutation({
    mutationFn: (id: string) => rejectTradeProposal({ data: { id } }),
    onSettled: refresh,
  })
  const busy = approve.isPending || reject.isPending
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel title="Waiting for you" index="J1">
        {trades.length}
      </SectionLabel>
      {trades.map((t) => {
        const left =
          now === null ? null : Math.max(0, Date.parse(t.expiresAt) - now)
        const windowMs = Date.parse(t.expiresAt) - Date.parse(t.createdAt)
        return (
          <article
            key={t.id}
            className="flex flex-col gap-3 rounded-card bg-surface p-4 text-sm"
          >
            <p className="flex items-center justify-between gap-2 text-3xs text-muted uppercase">
              <span>
                {t.agentName} proposes
                {left !== null && ` · ${Math.ceil(left / 60_000)} min left`}
              </span>
              <span className="led led-pulse" aria-hidden="true" />
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-lg leading-snug font-semibold tracking-tight">
                  {describeOrder(t, display)}
                </p>
                <p>{t.marketTitle}</p>
                <p className="font-mono text-2xs break-all text-muted">
                  {t.marketTicker}
                </p>
              </div>
              {left !== null && windowMs > 0 && (
                <CountdownRing left={left} windowMs={windowMs} />
              )}
            </div>
            {t.note && (
              <p className="well rounded-control px-3 py-2 text-xs text-notable">
                “{t.note}”
              </p>
            )}
            <p className="text-xs text-muted">
              {t.action === 'buy'
                ? `Costs at most ${money(t.maxCostDollars)}, fees included. Fills what it can at your price right away; the rest is cancelled.`
                : `Sells only contracts you hold. Fees at most ${money(t.maxCostDollars)}.`}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => reject.mutate(t.id)}
                className={WIDE_KEY}
              >
                Reject
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `${describeOrder(t, display)}\n${t.marketTitle}\n\nSend this order to Kalshi now?`,
                    )
                  )
                    approve.mutate(t.id)
                }}
                className={cn(WIDE_KEY, 'key-ink')}
              >
                {approve.isPending && approve.variables === t.id
                  ? 'Placing…'
                  : 'Approve'}
              </button>
            </div>
          </article>
        )
      })}
      {approve.error && (
        <p role="alert" className="text-sm text-negative">
          {approve.error.message}
        </p>
      )}
    </section>
  )
}

/** Segments on the proposal's dial: one per 20 seconds of a 10-minute window. */
const RING_SEGMENTS = 30

/**
 * A proposal's window as a segmented dial: lit ink for the time left, the
 * last lit one orange (it's running now), and the minutes in dots.
 */
function CountdownRing({ left, windowMs }: { left: number; windowMs: number }) {
  const on = Math.ceil((left / windowMs) * RING_SEGMENTS)
  const minutes = Math.ceil(left / 60_000)
  return (
    <div
      role="img"
      aria-label={`${minutes} min left to decide`}
      className="relative size-[88px] shrink-0"
    >
      <svg viewBox="0 0 88 88" className="size-full" aria-hidden="true">
        {Array.from({ length: RING_SEGMENTS }, (_, i) => (
          <rect
            key={i}
            x="42.5"
            y="2"
            width="3"
            height="11"
            rx="1.5"
            transform={`rotate(${(i * 360) / RING_SEGMENTS} 44 44)`}
            className={
              i >= on
                ? 'fill-notice'
                : i === on - 1
                  ? 'fill-signal'
                  : 'fill-foreground'
            }
          />
        ))}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <Num className="text-[26px]">{minutes}</Num>
        <span className="mt-0.5 text-3xs text-muted uppercase">min</span>
      </span>
    </div>
  )
}

// ─── Trade key, limits and history ──────────────────────────────────────────

export function Trading({ state }: { state: TradingState }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel title="Trading" index="J3" className="mb-0" />
      {state.key ? <KeyConnected state={state} /> : <ConnectTradeKey />}
      <History trades={state.trades.filter((t) => t.status !== 'pending')} />
    </section>
  )
}

function ConnectTradeKey() {
  const queryClient = useQueryClient()
  const [keyId, setKeyId] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [perOrder, setPerOrder] = useState(String(DEFAULT_CAPS.maxOrderDollars))
  const [perDay, setPerDay] = useState(String(DEFAULT_CAPS.maxDailyDollars))
  const connect = useMutation({
    mutationFn: () =>
      connectTradeKey({
        data: {
          keyId: keyId.trim(),
          privateKey,
          maxOrderDollars: Number(perOrder),
          maxDailyDollars: Number(perDay),
        },
      }),
    onSuccess: () => {
      setPrivateKey('')
      void queryClient.invalidateQueries({ queryKey: TRADING_KEY })
    },
  })
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        connect.mutate()
      }}
    >
      <p className="text-sm text-muted">
        Agents can only propose trades. To carry out the ones you approve,
        Sportsline needs a separate Kalshi key that can trade but never withdraw
        or transfer money. Your read-only key stays as it is.
      </p>
      <ol className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm">
        {[
          <>On Kalshi, open Account → API Keys and create a new key.</>,
          <>
            Give it only the <span className="font-semibold">Read</span> and{' '}
            <span className="font-semibold">Trade</span> scopes. Sportsline
            refuses keys that can transfer money.
          </>,
          <>Paste its key ID and private key, and set your limits.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 font-label text-3xs text-muted">
              0{i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <label className={FIELD_LABEL}>
        Key ID
        <input
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={cn(FIELD, 'font-mono')}
        />
      </label>
      <label className={FIELD_LABEL}>
        Private key
        <textarea
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          rows={5}
          className={cn(FIELD, 'font-mono text-xs')}
        />
      </label>
      <Limits
        perOrder={perOrder}
        perDay={perDay}
        onPerOrder={setPerOrder}
        onPerDay={setPerDay}
      />
      {connect.error && (
        <p role="alert" className="text-sm text-negative">
          {connect.error.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!keyId.trim() || !privateKey.trim() || connect.isPending}
        className={WIDE_KEY}
      >
        {connect.isPending ? 'Checking with Kalshi…' : 'Connect trade key'}
      </button>
      <p className="text-2xs text-muted">
        The private key is encrypted before it’s stored and only used to place
        orders you approve. Disconnect any time to delete it.
      </p>
    </form>
  )
}

function Limits(props: {
  perOrder: string
  perDay: string
  onPerOrder: (v: string) => void
  onPerDay: (v: string) => void
}) {
  return (
    <div className="flex gap-3">
      <label className={cn(FIELD_LABEL, 'flex-1')}>
        Most per order ($)
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={CAP_LIMITS.maxOrderDollars}
          value={props.perOrder}
          onChange={(e) => props.onPerOrder(e.target.value)}
          className={cn(FIELD, 'tabular-nums')}
        />
      </label>
      <label className={cn(FIELD_LABEL, 'flex-1')}>
        Most per day ($)
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={CAP_LIMITS.maxDailyDollars}
          value={props.perDay}
          onChange={(e) => props.onPerDay(e.target.value)}
          className={cn(FIELD, 'tabular-nums')}
        />
      </label>
    </div>
  )
}

function KeyConnected({ state }: { state: TradingState }) {
  const key = state.key!
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [perOrder, setPerOrder] = useState(String(key.maxOrderDollars))
  const [perDay, setPerDay] = useState(String(key.maxDailyDollars))
  const refresh = () => queryClient.invalidateQueries({ queryKey: TRADING_KEY })
  const save = useMutation({
    mutationFn: () =>
      setTradeCaps({
        data: {
          maxOrderDollars: Number(perOrder),
          maxDailyDollars: Number(perDay),
        },
      }),
    onSuccess: () => {
      setEditing(false)
      void refresh()
    },
  })
  const disconnect = useMutation({
    mutationFn: () => disconnectTradeKey(),
    onSuccess: refresh,
  })
  return (
    <div className="flex flex-col gap-4 rounded-card bg-surface p-4 text-sm">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="led bg-positive shadow-none" />
        <span className="min-w-0 flex-1 font-semibold">
          Kalshi trade key connected
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={KEY}
          >
            Limits
          </button>
        )}
        <button
          type="button"
          disabled={disconnect.isPending}
          onClick={() => {
            if (
              confirm(
                'Disconnect the trade key? Agents can’t trade until you connect one again, and anything waiting for you is rejected.',
              )
            )
              disconnect.mutate()
          }}
          className={cn(KEY, 'text-muted')}
        >
          Disconnect
        </button>
      </div>
      <dl className="grid grid-cols-2 items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <dt className="order-last text-3xs text-muted uppercase">An order</dt>
          <dd>
            <Num className="text-[30px]">{money(key.maxOrderDollars)}</Num>
          </dd>
        </div>
        <div className="flex flex-col gap-1.5">
          <dt className="order-last text-3xs text-muted uppercase">
            A day · {money(state.spentToday)} spent today
          </dt>
          <dd>
            <Num className="text-[30px]">{money(key.maxDailyDollars)}</Num>
          </dd>
        </div>
      </dl>
      {editing && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Limits
            perOrder={perOrder}
            perDay={perDay}
            onPerOrder={setPerOrder}
            onPerDay={setPerDay}
          />
          {save.error && (
            <p role="alert" className="text-sm text-negative">
              {save.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className={KEY}>
              Save limits
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={cn(KEY, 'text-muted')}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const STATUS_TEXT: Record<TradeView['status'], string> = {
  pending: 'Waiting for you',
  rejected: 'Rejected',
  cancelled: 'Withdrawn by the agent',
  expired: 'Expired',
  placing: 'Placing…',
  unknown: 'Checking with Kalshi…',
  filled: 'Filled',
  partial: 'Partly filled',
  unfilled: 'Not filled at that price',
  failed: 'Failed',
}

function History({ trades }: { trades: Array<TradeView> }) {
  const display = usePriceDisplay()
  const now = useNow()
  if (trades.length === 0) return null
  return (
    <ul className="divide-y divide-border rounded-card bg-surface">
      {trades.map((t) => (
        <li key={t.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{describeOrder(t, display)}</span>
            <span
              className={cn(
                'shrink-0 text-3xs uppercase',
                t.status === 'filled' || t.status === 'partial'
                  ? 'font-bold text-positive'
                  : t.status === 'failed'
                    ? 'font-bold text-negative'
                    : 'text-muted',
              )}
            >
              {STATUS_TEXT[t.status]}
            </span>
          </span>
          <span className="truncate text-xs text-muted">{t.marketTitle}</span>
          <span className="text-3xs text-muted uppercase tabular-nums">
            {t.agentName} · {timeAgo(t.createdAt, now)}
            {t.filledCount
              ? ` · ${t.filledCount} at ${formatPrice(t.avgPriceDollars ?? 0, display)}, fees ${money(t.feesDollars ?? 0)}`
              : ''}
          </span>
          {t.status === 'unknown' ? (
            <span className="text-xs text-muted">
              Kalshi didn’t confirm this order, so it may have gone through.
              Sportsline is checking, and counts it toward today’s limit
              meanwhile.
            </span>
          ) : (
            t.error && <span className="text-xs text-negative">{t.error}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
