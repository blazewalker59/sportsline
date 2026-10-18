/**
 * The Agents page's trading (docs/adr/0008): proposals waiting on the
 * Viewer, the Kalshi trade key, its limits, and the orders placed.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TRADING_KEY, money } from './shared'
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
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
        Waiting for you
      </h2>
      {trades.map((t) => {
        const left =
          now === null ? null : Math.max(0, Date.parse(t.expiresAt) - now)
        return (
          <article
            key={t.id}
            className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-3 text-sm"
          >
            <p className="text-xs text-muted">
              {t.agentName} proposes
              {left !== null && ` · ${Math.ceil(left / 60_000)} min left`}
            </p>
            <p className="font-semibold">{describeOrder(t, display)}</p>
            <p>{t.marketTitle}</p>
            <p className="font-mono text-[11px] text-muted">{t.marketTicker}</p>
            {t.note && (
              <p className="rounded-lg bg-background px-2 py-1.5 text-xs">
                “{t.note}”
              </p>
            )}
            <p className="text-xs text-muted">
              {t.action === 'buy'
                ? `Costs at most ${money(t.maxCostDollars)}, fees included. Fills what it can at your price right away; the rest is cancelled.`
                : `Sells only contracts you hold. Fees at most ${money(t.maxCostDollars)}.`}
            </p>
            <div className="flex gap-2">
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
                className="min-h-10 flex-1 rounded-full bg-accent px-4 text-[13px] font-semibold text-background disabled:opacity-50"
              >
                {approve.isPending && approve.variables === t.id
                  ? 'Placing…'
                  : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => reject.mutate(t.id)}
                className="min-h-10 rounded-full px-4 text-[13px] font-semibold text-muted hover:text-live disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </article>
        )
      })}
      {approve.error && (
        <p role="alert" className="text-sm text-live">
          {approve.error.message}
        </p>
      )}
    </section>
  )
}

// ─── Trade key, limits and history ──────────────────────────────────────────

export function Trading({ state }: { state: TradingState }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
        Trading
      </h2>
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
      <ol className="list-decimal space-y-1 rounded-xl border border-border bg-surface py-3 pr-3 pl-8 text-sm">
        <li>On Kalshi, open Account → API Keys and create a new key.</li>
        <li>
          Give it only the <span className="font-semibold">Read</span> and{' '}
          <span className="font-semibold">Trade</span> scopes. Sportsline
          refuses keys that can transfer money.
        </li>
        <li>Paste its key ID and private key, and set your limits.</li>
      </ol>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Key ID
        <input
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Private key
        <textarea
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          rows={5}
          className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs font-normal"
        />
      </label>
      <Limits
        perOrder={perOrder}
        perDay={perDay}
        onPerOrder={setPerOrder}
        onPerDay={setPerDay}
      />
      {connect.error && (
        <p role="alert" className="text-sm text-live">
          {connect.error.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!keyId.trim() || !privateKey.trim() || connect.isPending}
        className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-background disabled:opacity-50"
      >
        {connect.isPending ? 'Checking with Kalshi…' : 'Connect trade key'}
      </button>
      <p className="text-[11px] text-muted">
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
      <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
        Most per order ($)
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={CAP_LIMITS.maxOrderDollars}
          value={props.perOrder}
          onChange={(e) => props.onPerOrder(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
        Most per day ($)
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={CAP_LIMITS.maxDailyDollars}
          value={props.perDay}
          onChange={(e) => props.onPerDay(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal"
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            Kalshi trade key connected
          </span>
          <span className="block truncate text-xs text-muted">
            {money(key.maxOrderDollars)} an order · {money(key.maxDailyDollars)}{' '}
            a day · {money(state.spentToday)} spent today
          </span>
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-9 rounded-full bg-notice px-3 text-[13px] font-semibold"
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
          className="min-h-9 rounded-full px-2 text-[13px] font-semibold text-muted hover:text-live disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
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
            <p role="alert" className="text-sm text-live">
              {save.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={save.isPending}
              className="min-h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-background disabled:opacity-50"
            >
              Save limits
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-9 rounded-full px-3 text-[13px] font-semibold text-muted"
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
    <ul className="flex flex-col gap-2">
      {trades.map((t) => (
        <li
          key={t.id}
          className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{describeOrder(t, display)}</span>
            <span
              className={cn(
                'shrink-0 text-xs font-semibold',
                t.status === 'filled' || t.status === 'partial'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : t.status === 'failed'
                    ? 'text-live'
                    : 'text-muted',
              )}
            >
              {STATUS_TEXT[t.status]}
            </span>
          </span>
          <span className="truncate text-xs text-muted">{t.marketTitle}</span>
          <span className="text-xs text-muted">
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
            t.error && <span className="text-xs text-live">{t.error}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
