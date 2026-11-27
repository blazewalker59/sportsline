/**
 * Open Predictions (CONTEXT.md) together: the summary across the strip and
 * the portfolio sheet it opens (also opened from the phone's Scope bar).
 */

import { useState } from 'react'
import {
  PropProgress,
  arrowOf,
  isLivePrediction,
  money,
  pct,
  profitOf,
  profitText,
  toneOf,
} from './PredictionParts'
import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import { Sheet } from '@/components/chat/Sheet'
import { TeamPip } from '@/components/brand/TeamPip'
import { Num } from '@/components/signal/Num'
import { predictionTeams } from '@/lib/kalshi/legTeam'
import { cn } from '@/lib/utils'

/**
 * Open Predictions at a glance, the Predictions screen's hero: what
 * cashing everything out now would bring, in dots, how that moved over the
 * last day, and what's staked. Tapping it opens the portfolio, every open
 * Prediction with its status and payout.
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
  const live = open.filter(isLivePrediction).length
  const day = dayChange(open)
  return (
    <>
      <button
        type="button"
        onClick={() => setPortfolioOpen(true)}
        aria-label="Your portfolio"
        className="flex w-full flex-col gap-3 rounded-card bg-surface p-4 text-left"
      >
        <span className="flex items-center justify-between gap-2 text-3xs text-muted uppercase">
          <span className="flex items-center gap-2">
            <span className={cn('led', live > 0 ? 'led-pulse' : 'led-off')} />
            Portfolio · Kalshi
          </span>
          <span>Cash out now ›</span>
        </span>
        <Num className="text-[52px]">
          {money(totals.profit ? totals.cashout : totals.staked)}
        </Num>
        <span className="flex items-baseline justify-between gap-2">
          {day !== null ? (
            <span
              className={cn(
                'font-label text-xs font-bold tabular-nums',
                toneOf(day),
              )}
            >
              {arrowOf(day)} ${Math.abs(day).toFixed(2)} today
            </span>
          ) : (
            <span className="text-3xs text-muted uppercase">
              {totals.profit ? 'Not priced today' : 'Staked'}
            </span>
          )}
          <span className="text-3xs text-muted uppercase">
            {open.length} open{live > 0 && ` · ${live} live`}
          </span>
        </span>
        <span className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Fact label="Staked">{money(totals.staked)}</Fact>
          <Fact label="P&L">
            {totals.profit ? (
              <span className={toneOf(totals.profit.dollars)}>
                {profitText(totals.profit, display)}
              </span>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="If all win">{money(totals.payout)}</Fact>
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

function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-3xs text-muted uppercase">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{children}</span>
    </span>
  )
}

/**
 * How open Predictions' worth moved over the last day (their Odds' kept
 * history), in dollars: a winning contract pays $1. Null when none has a
 * day's history to compare.
 */
export function dayChange(open: ReadonlyArray<PredictionView>): number | null {
  let change = 0
  let any = false
  for (const p of open) {
    const first = p.history[0]
    if (p.chance === null || !first) continue
    change += p.contracts * (p.chance - first.chance)
    any = true
  }
  return any ? change : null
}

/** Across open Predictions: staked, what cashing out now brings, the payout. */
export function portfolioTotals(open: ReadonlyArray<PredictionView>) {
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
export function PortfolioSheet({
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
      <dl className="grid grid-cols-3 gap-2 rounded-card bg-surface p-3 text-3xs text-muted uppercase">
        <div>
          <dt>Staked</dt>
          <dd className="mt-0.5 font-sans text-base font-semibold tracking-normal text-foreground normal-case tabular-nums">
            {money(totals.staked)}
          </dd>
        </div>
        <div>
          <dt>Cash out now</dt>
          <dd className="mt-0.5 font-sans text-base font-semibold tracking-normal text-foreground normal-case tabular-nums">
            {totals.profit ? money(totals.cashout) : '—'}
            {totals.profit && (
              <span
                className={cn(
                  'block text-2xs font-semibold',
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
          <dd className="mt-0.5 font-sans text-base font-semibold tracking-normal text-foreground normal-case tabular-nums">
            {money(totals.payout)}
          </dd>
        </div>
      </dl>
      <ul className="divide-y divide-border rounded-card bg-surface">
        {predictions.map((p) => {
          const profit = profitOf(p)
          const won = p.legs.filter((l) => l.status === 'won').length
          const lost = p.legs.some((l) => l.status === 'lost')
          const progress =
            p.kind === 'single' ? (p.legs[0]?.progress ?? null) : null
          // Whose it is, at a glance: its team's pip, when it has one.
          const teams = predictionTeams(p.legs)
          const row = (
            <span className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
              {teams && 'team' in teams && (
                <TeamPip colors={teams.team.colors} className="mt-1 h-4 w-1" />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-sm leading-snug font-semibold">
                  {p.side === 'no' && <span className="text-muted">Not: </span>}
                  {p.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted tabular-nums">
                  {p.kind === 'combo' && (
                    <span className={cn(lost && 'text-negative')}>
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
                <span className="flex items-center gap-1.5 text-base leading-tight font-bold tabular-nums">
                  {isLivePrediction(p) && (
                    <>
                      <span className="led led-pulse" aria-hidden="true" />
                      <span className="sr-only">Live</span>
                    </>
                  )}
                  {p.chance === null ? '—' : pct(p.chance)}
                </span>
                <span className="text-xs tabular-nums">
                  {p.value === null ? '—' : money(p.value)}
                </span>
                {profit && (
                  <span
                    className={cn(
                      'text-2xs font-semibold tabular-nums',
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
      <p className="text-2xs text-muted">
        Cash out is what selling now would bring at Kalshi’s current prices; a
        winning contract pays $1.
      </p>
    </Sheet>
  )
}
