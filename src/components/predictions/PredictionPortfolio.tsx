/**
 * Open Predictions (CONTEXT.md) together: the summary across the strip and
 * the portfolio sheet it opens.
 */

import { useState } from 'react'
import {
  PropProgress,
  money,
  pct,
  profitOf,
  profitText,
  toneOf,
} from './PredictionParts'
import type { ChangeDisplay, PredictionView } from '@/lib/kalshi/server'
import { Sheet } from '@/components/chat/Sheet'
import { cn } from '@/lib/utils'

/**
 * Open Predictions at a glance, across the strip's width: how many, what's
 * staked, and what cashing everything out now would bring. Tapping it opens
 * the portfolio, every open Prediction with its status and payout.
 */
export function PredictionSummary({
  predictions,
  display = 'dollars',
  onOpen,
}: {
  predictions: ReadonlyArray<PredictionView>
  display?: ChangeDisplay
  /** Open one Prediction's sheet (from the portfolio). */
  onOpen?: (id: string) => void
}) {
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const open = predictions.filter((p) => p.status === 'open')
  if (open.length === 0) return null
  const totals = portfolioTotals(open)
  return (
    <>
      <button
        type="button"
        onClick={() => setPortfolioOpen(true)}
        aria-label="Your portfolio"
        className="mt-2 flex w-full items-stretch divide-x divide-border rounded-2xl border border-border bg-surface text-center transition-colors hover:border-accent/50"
      >
        <span className="flex flex-1 flex-col justify-center px-2 py-1.5">
          <span className="text-[11px] text-muted">Open</span>
          <span className="text-[15px] font-bold tabular-nums">
            {open.length}
          </span>
        </span>
        <span className="flex flex-1 flex-col justify-center px-2 py-1.5">
          <span className="text-[11px] text-muted">Staked</span>
          <span className="text-[15px] font-bold tabular-nums">
            {money(totals.staked)}
          </span>
        </span>
        <span className="flex flex-[1.4] flex-col justify-center px-2 py-1.5">
          <span className="text-[11px] text-muted">Cash out now ›</span>
          <span className="text-[15px] font-bold tabular-nums">
            {totals.profit ? money(totals.cashout) : '—'}
            {totals.profit && (
              <span
                className={cn(
                  'ml-1 text-xs font-semibold',
                  toneOf(totals.profit.dollars),
                )}
              >
                {profitText(totals.profit, display)}
              </span>
            )}
          </span>
        </span>
      </button>
      {portfolioOpen && (
        <PortfolioSheet
          predictions={open}
          display={display}
          onClose={() => setPortfolioOpen(false)}
          onOpen={
            onOpen
              ? (id) => {
                  setPortfolioOpen(false)
                  onOpen(id)
                }
              : undefined
          }
        />
      )}
    </>
  )
}

function portfolioTotals(open: ReadonlyArray<PredictionView>) {
  const staked = open.reduce((n, p) => n + p.cost, 0)
  const priced = open.filter((p) => p.value !== null)
  const cashout = priced.reduce((n, p) => n + (p.value ?? 0), 0)
  return {
    staked,
    cashout,
    /** A winning contract pays $1. */
    payout: open.reduce((n, p) => n + p.contracts, 0),
    profit:
      priced.length > 0
        ? profitOf({
            value: cashout,
            cost: priced.reduce((n, p) => n + p.cost, 0),
          })
        : null,
  }
}

/** Every open Prediction with its status and payout, and the totals. */
function PortfolioSheet({
  predictions,
  display,
  onClose,
  onOpen,
}: {
  predictions: ReadonlyArray<PredictionView>
  display: ChangeDisplay
  onClose: () => void
  onOpen?: (id: string) => void
}) {
  const totals = portfolioTotals(predictions)
  return (
    <Sheet title="Portfolio" onClose={onClose}>
      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-3 text-center text-xs text-muted">
        <div>
          <dt>Staked</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {money(totals.staked)}
          </dd>
        </div>
        <div>
          <dt>Cash out now</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {totals.profit ? money(totals.cashout) : '—'}
            {totals.profit && (
              <span
                className={cn(
                  'block text-[11px] font-semibold',
                  toneOf(totals.profit.dollars),
                )}
              >
                {profitText(totals.profit, display)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>If all win</dt>
          <dd className="text-base font-semibold text-foreground tabular-nums">
            {money(totals.payout)}
          </dd>
        </div>
      </dl>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {predictions.map((p) => {
          const profit = profitOf(p)
          const won = p.legs.filter((l) => l.status === 'won').length
          const lost = p.legs.some((l) => l.status === 'lost')
          const progress =
            p.kind === 'single' ? (p.legs[0]?.progress ?? null) : null
          const row = (
            <span className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-sm leading-snug font-semibold">
                  {p.side === 'no' && <span className="text-muted">Not: </span>}
                  {p.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted tabular-nums">
                  {p.kind === 'combo' && (
                    <span className={cn(lost && 'text-live')}>
                      {lost ? 'Busted · ' : ''}
                      {won}/{p.legs.length} legs ·
                    </span>
                  )}
                  <span>{money(p.cost)} in</span>
                  <span>· pays {money(p.contracts)}</span>
                </span>
                {progress && <PropProgress progress={progress} compact />}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-base leading-tight font-bold tabular-nums">
                  {p.chance === null ? '—' : pct(p.chance)}
                </span>
                <span className="text-xs tabular-nums">
                  {p.value === null ? '—' : money(p.value)}
                </span>
                {profit && (
                  <span
                    className={cn(
                      'text-[11px] font-semibold tabular-nums',
                      toneOf(profit.dollars),
                    )}
                  >
                    {profitText(profit, display)}
                  </span>
                )}
              </span>
            </span>
          )
          return (
            <li key={p.id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full"
                >
                  {row}
                </button>
              ) : (
                row
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-muted">
        Cash out is what selling now would bring at Kalshi’s current prices; a
        winning contract pays $1.
      </p>
    </Sheet>
  )
}
