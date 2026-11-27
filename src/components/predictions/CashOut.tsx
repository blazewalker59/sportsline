/**
 * Cash out and Open in Kalshi (CONTEXT.md, "Cash out"; docs/adr/0012), on
 * a Prediction's sheet. Open in Kalshi takes the Viewer to the market (a
 * Combo to their portfolio). Cash out sells it back: a single at the
 * price shown (or no worse than the allowance under it), a Combo at the
 * best price Kalshi's market makers quote. Either is held to confirm.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { money } from './PredictionParts'
import type { CashOutView } from '@/lib/kalshi/cashOutServer'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import { Sheet } from '@/components/chat/Sheet'
import { HoldKey } from '@/components/signal/HoldKey'
import { Meter } from '@/components/signal/Meter'
import { Num } from '@/components/signal/Num'
import { Segmented } from '@/components/signal/Segmented'
import { ALLOWANCE_CENTS, PORTFOLIO_URL, proceeds } from '@/lib/kalshi/cashOut'
import {
  acceptCashOutQuote,
  cancelCashOutQuote,
  cashOutSingle,
  getCashOut,
  getCashOutPreview,
  getKalshiLinks,
  requestCashOutQuote,
} from '@/lib/kalshi/cashOutServer'
import { syncKalshiNow } from '@/lib/kalshi/server'
import { cn } from '@/lib/utils'

/** How long a Combo waits for a market maker's price. */
export const QUOTE_WAIT_MS = 45_000
const QUOTE_POLL_MS = 1_200

const KEY =
  'key inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-3xs font-bold uppercase'
const LABEL = 'text-3xs text-muted uppercase'

export function kalshiLinksQuery(predictionId: string) {
  return {
    queryKey: ['kalshi-links', predictionId] as const,
    queryFn: () => getKalshiLinks({ data: { predictionId } }),
    staleTime: 60 * 60_000,
  }
}

/** The Prediction sheet's two keys: Open in Kalshi, and Cash out. */
export function KalshiActions({
  prediction: p,
}: {
  prediction: PredictionView
}) {
  const links = useQuery(kalshiLinksQuery(p.id))
  const [cashing, setCashing] = useState(false)
  const open = p.status === 'open'
  const combo = p.kind === 'combo'
  const href = links.data?.market ?? links.data?.portfolio ?? PORTFOLIO_URL
  return (
    <section aria-label="On Kalshi" className="flex flex-col gap-2">
      <div className={cn('grid gap-2', open ? 'grid-cols-2' : 'grid-cols-1')}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={KEY}
          aria-label={
            combo || !links.data?.market
              ? 'Open your Kalshi portfolio'
              : 'Open this market in Kalshi'
          }
        >
          Open in Kalshi <span aria-hidden="true">↗</span>
        </a>
        {open && (
          <button
            type="button"
            onClick={() => setCashing(true)}
            className={cn(KEY, 'key-ink')}
          >
            Cash out
            {p.value !== null && (
              <span className="font-sans tracking-normal normal-case">
                {combo ? '≈ ' : ''}
                {money(p.value)}
              </span>
            )}
          </button>
        )}
      </div>
      {combo && open && (
        <p className="text-2xs text-muted">
          A Combo’s cash-out value is estimated from its Legs’ odds; cashing out
          asks Kalshi’s market makers for a real price.
        </p>
      )}
      {cashing && (
        <CashOutSheet prediction={p} onClose={() => setCashing(false)} />
      )}
    </section>
  )
}

/** All of a position, half of it, or a number of contracts. */
function CountPicker({
  held,
  count,
  onChange,
}: {
  held: number
  count: number
  onChange: (n: number) => void
}) {
  const half = Math.floor(held / 2)
  const [mode, setMode] = useState<'all' | 'half' | 'custom'>('all')
  const [text, setText] = useState(String(held))
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        label="How many to sell"
        value={mode}
        fill
        options={[
          ['all', `All ${fmtCount(held)}`],
          ...(half >= 1 ? ([['half', `Half (${half})`]] as const) : []),
          ['custom', 'Custom'],
        ]}
        onChange={(m) => {
          setMode(m)
          if (m === 'all') onChange(held)
          if (m === 'half') onChange(half)
          if (m === 'custom') onChange(Number(text) || 0)
        }}
      />
      {mode === 'custom' && (
        <label className="well flex items-center gap-2 rounded-control px-3 py-2">
          <span className={LABEL}>Contracts</span>
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              onChange(Number(e.target.value) || 0)
            }}
            className="min-w-0 flex-1 bg-transparent text-right text-base font-semibold tabular-nums outline-none"
          />
          <span className={LABEL}>of {fmtCount(held)}</span>
        </label>
      )}
      {count > held && (
        <p className="text-2xs text-negative">
          You hold {fmtCount(held)} contracts.
        </p>
      )}
    </div>
  )
}

const fmtCount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
const cents = (dollars: number) =>
  `${(dollars * 100).toFixed(dollars * 100 < 10 ? 1 : 0)}¢`

function NoTrading() {
  return (
    <div className="well flex flex-col gap-2 rounded-card p-4">
      <span className={LABEL}>Trading isn’t connected</span>
      <p className="text-sm">
        Cashing out sells on Kalshi with a trade key: a second key that can
        trade but never move money. Your read-only connection stays as it is.
      </p>
      <Link to="/agents" className={cn(KEY, 'self-start')}>
        Connect a trade key
      </Link>
    </div>
  )
}

/** What it would bring, large, with the arithmetic under it. */
function Proceeds({
  count,
  price,
  side,
  note,
}: {
  count: number
  price: number
  side: 'yes' | 'no'
  note: React.ReactNode
}) {
  const p = proceeds(count, price)
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <span className={LABEL}>You get about</span>
      <Num className="text-[56px]">{money(p.net)}</Num>
      <dl className="grid grid-cols-3 gap-2 text-3xs text-muted uppercase">
        <div>
          <dt>Sell</dt>
          <dd className="mt-0.5 font-sans text-sm font-semibold tracking-normal text-foreground normal-case tabular-nums">
            {fmtCount(count)} {side.toUpperCase()}
          </dd>
        </div>
        <div>
          <dt>At</dt>
          <dd className="mt-0.5 font-sans text-sm font-semibold tracking-normal text-foreground normal-case tabular-nums">
            {cents(price)}
          </dd>
        </div>
        <div>
          <dt>Fees</dt>
          <dd className="mt-0.5 font-sans text-sm font-semibold tracking-normal text-foreground normal-case tabular-nums">
            {money(p.fees)}
          </dd>
        </div>
      </dl>
      <p className="text-2xs text-muted">{note}</p>
    </div>
  )
}

/** The outcome, in the Viewer's words. */
function Outcome({ v }: { v: CashOutView }) {
  const filled = v.filledCount ?? 0
  const got =
    v.avgPriceDollars !== null
      ? filled * v.avgPriceDollars - (v.feesDollars ?? 0)
      : null
  const head =
    v.status === 'filled'
      ? 'Sold'
      : v.status === 'partial'
        ? 'Partly sold'
        : v.status === 'unfilled'
          ? 'Not sold'
          : v.status === 'failed'
            ? 'Couldn’t sell'
            : 'Checking with Kalshi'
  const line =
    v.status === 'filled' || v.status === 'partial'
      ? `${fmtCount(filled)}${v.status === 'partial' ? ` of ${fmtCount(v.count)}` : ''} contracts${v.avgPriceDollars !== null ? ` at ${cents(v.avgPriceDollars)}` : ''}.${v.status === 'partial' ? ' The rest are still yours.' : ''}`
      : v.status === 'unfilled'
        ? (v.error ??
          'The price moved before it filled, so nothing was sold. Look again.')
        : v.status === 'failed'
          ? (v.error ?? 'Kalshi refused it. Nothing was sold.')
          : 'Kalshi hasn’t confirmed yet. This Prediction updates within a few minutes either way.'
  const sold = v.status === 'filled' || v.status === 'partial'
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-card bg-surface p-4"
    >
      <span className="flex items-center gap-2 text-3xs text-muted uppercase">
        <span
          aria-hidden="true"
          className={cn('led', sold ? 'led-ink' : 'led-off')}
        />
        {head}
      </span>
      {sold && got !== null && <Num className="text-[56px]">{money(got)}</Num>}
      <p className="text-sm">{line}</p>
    </div>
  )
}

/** Refresh the Viewer's Predictions once Kalshi has the sale. */
function useAfterSale() {
  const queryClient = useQueryClient()
  return (v: CashOutView) => {
    if (v.status !== 'filled' && v.status !== 'partial') return
    void syncKalshiNow()
      .catch(() => undefined)
      .then(() => queryClient.invalidateQueries({ queryKey: ['predictions'] }))
  }
}

/** The cash-out sheet: review, hold to confirm, then the outcome. */
export function CashOutSheet({
  prediction: p,
  onClose,
}: {
  prediction: PredictionView
  onClose: () => void
}) {
  const preview = useQuery({
    queryKey: ['cash-out-preview', p.id],
    queryFn: () => getCashOutPreview({ data: { predictionId: p.id } }),
    // A single's price, kept fresh while it's reviewed.
    refetchInterval: p.kind === 'single' ? 5_000 : false,
  })
  return (
    <Sheet title="Cash out" onClose={onClose}>
      <p className="text-sm font-semibold">
        {p.side === 'no' && <span className="text-muted">Not: </span>}
        {p.title}
      </p>
      {preview.isPending ? (
        <p className={LABEL}>Reading Kalshi…</p>
      ) : preview.isError ? (
        <p className="text-sm">{preview.error.message}</p>
      ) : !preview.data.trading ? (
        <NoTrading />
      ) : p.kind === 'single' ? (
        <SingleCashOut
          prediction={p}
          held={preview.data.held}
          market={preview.data.single}
        />
      ) : (
        <ComboCashOut prediction={p} held={preview.data.held} />
      )}
    </Sheet>
  )
}

function SingleCashOut({
  prediction: p,
  held,
  market,
}: {
  prediction: PredictionView
  held: number
  market: {
    open: boolean
    cents: number | null
    limitCents: number | null
  } | null
}) {
  const [id, setId] = useState(() => crypto.randomUUID())
  const [count, setCount] = useState(held)
  const after = useAfterSale()
  const sell = useMutation({
    mutationFn: (v: { count: number; limitCents: number }) =>
      cashOutSingle({ data: { predictionId: p.id, id, ...v } }),
    onSuccess: after,
  })
  if (sell.data) {
    return (
      <>
        <Outcome v={sell.data} />
        {sell.data.status === 'unfilled' && (
          <button
            type="button"
            className={KEY}
            onClick={() => {
              sell.reset()
              setId(crypto.randomUUID())
            }}
          >
            Look again
          </button>
        )}
      </>
    )
  }
  if (!market?.open) {
    return (
      <p className="well rounded-card p-4 text-sm">
        Kalshi isn’t trading this market right now.
      </p>
    )
  }
  if (market.cents === null || market.limitCents === null) {
    return (
      <p className="well rounded-card p-4 text-sm">
        No one’s buying this right now, so there’s no price to sell at.
      </p>
    )
  }
  const limit = market.limitCents
  const ok = count > 0 && count <= held
  return (
    <>
      <Proceeds
        count={count}
        price={market.cents / 100}
        side={p.side}
        note={`Sells at ${market.cents}¢ or up to ${ALLOWANCE_CENTS}¢ under it (${limit}¢), whatever fills right away. It can only sell what you hold.`}
      />
      <CountPicker held={held} count={count} onChange={setCount} />
      {sell.error && (
        <p className="text-sm text-negative">{sell.error.message}</p>
      )}
      <HoldKey
        disabled={!ok || sell.isPending}
        onConfirm={() => sell.mutate({ count, limitCents: limit })}
      >
        {sell.isPending ? 'Selling…' : 'Hold to cash out'}
      </HoldKey>
    </>
  )
}

function ComboCashOut({
  prediction: p,
  held,
}: {
  prediction: PredictionView
  held: number
}) {
  const [id, setId] = useState(() => crypto.randomUUID())
  const [count, setCount] = useState(held)
  const [asked, setAsked] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const after = useAfterSale()
  const request = useMutation({
    mutationFn: () =>
      requestCashOutQuote({ data: { predictionId: p.id, id, count } }),
    onSuccess: () => setAsked(Date.now()),
  })
  const quoting = request.data?.status === 'quoting'
  const waited = asked === null ? 0 : now - asked
  const timedOut = waited > QUOTE_WAIT_MS
  const live = useQuery({
    queryKey: ['cash-out', id],
    queryFn: () => getCashOut({ data: { id } }),
    enabled: quoting && !timedOut,
    refetchInterval: QUOTE_POLL_MS,
  })
  const accept = useMutation({
    mutationFn: (q: { quoteId: string; price: number }) =>
      acceptCashOutQuote({ data: { id, ...q } }),
    onSuccess: after,
  })
  // Leaving with a request open closes it.
  const pending = useRef<string | null>(null)
  pending.current = quoting && !accept.data ? id : null
  useEffect(
    () => () => {
      if (pending.current) {
        void cancelCashOutQuote({ data: { id: pending.current } }).catch(
          () => undefined,
        )
      }
    },
    [],
  )
  useEffect(() => {
    if (!quoting || timedOut) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [quoting, timedOut])

  const again = () => {
    if (quoting)
      void cancelCashOutQuote({ data: { id } }).catch(() => undefined)
    request.reset()
    accept.reset()
    setAsked(null)
    setId(crypto.randomUUID())
  }

  if (accept.data) {
    return (
      <>
        <Outcome v={accept.data} />
        {accept.data.status === 'unfilled' && (
          <button type="button" className={KEY} onClick={again}>
            Ask again
          </button>
        )}
      </>
    )
  }
  if (request.data && !quoting) return <Outcome v={request.data} />

  const quote = live.data?.quote ?? null
  if (!quoting) {
    return (
      <>
        <div className="flex flex-col gap-3 rounded-card bg-surface p-4">
          <span className={LABEL}>Estimated from its Legs’ odds</span>
          <Num className="text-[56px]">
            {p.value === null
              ? '—'
              : money((p.value * count) / (p.contracts || 1))}
          </Num>
          <p className="text-2xs text-muted">
            A Combo has no order book. Cashing out asks Kalshi’s market makers
            to quote a price for it, usually within seconds. You decide once you
            see it.
          </p>
        </div>
        <CountPicker held={held} count={count} onChange={setCount} />
        {request.error && (
          <p className="text-sm text-negative">{request.error.message}</p>
        )}
        <button
          type="button"
          disabled={count <= 0 || count > held || request.isPending}
          onClick={() => request.mutate()}
          className={cn(KEY, 'key-ink min-h-12')}
        >
          {request.isPending ? 'Asking…' : 'Get a price'}
        </button>
      </>
    )
  }
  if (!quote) {
    return timedOut ? (
      <div className="well flex flex-col gap-2 rounded-card p-4">
        <span className={LABEL}>No price came in</span>
        <p className="text-sm">
          No market maker quoted this Combo just now. Try again, or sell it in
          Kalshi.
        </p>
        <button type="button" className={cn(KEY, 'self-start')} onClick={again}>
          Ask again
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-3 rounded-card bg-surface p-4">
        <span className="flex items-center gap-2 text-3xs text-muted uppercase">
          <span aria-hidden="true" className="led led-pulse" />
          Asking Kalshi’s market makers
        </span>
        <Meter
          value={waited / QUOTE_WAIT_MS}
          segments={24}
          thin
          label="Waiting for a price"
        />
        <p className="text-2xs text-muted">
          Prices usually arrive within a few seconds.
        </p>
      </div>
    )
  }
  return (
    <>
      <Proceeds
        count={count}
        price={quote.price}
        side={p.side}
        note="The best price quoted right now. Prices update as market makers requote; it sells at the price you accept, or not at all."
      />
      {accept.error && (
        <p className="text-sm text-negative">{accept.error.message}</p>
      )}
      <HoldKey
        disabled={accept.isPending}
        onConfirm={() =>
          accept.mutate({ quoteId: quote.id, price: quote.price })
        }
      >
        {accept.isPending
          ? 'Selling…'
          : `Hold to sell at ${cents(quote.price)}`}
      </HoldKey>
    </>
  )
}
