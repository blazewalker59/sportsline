/**
 * Number formats every chart shares, so axes, tooltips and captions read
 * the same across the app (dates and times: @/lib/time/format). Pure.
 */

import { formatNumber } from '@/lib/time/format'

/** "$1,234", or "$12.50" under $100. */
export function usd(n: number): string {
  const abs = Math.abs(n)
  return `${n < 0 ? '−' : ''}$${formatNumber(abs, {
    maximumFractionDigits: abs >= 100 ? 0 : 2,
    minimumFractionDigits: abs >= 100 || Number.isInteger(abs) ? 0 : 2,
  })}`
}

/** "+$12.50" / "−$4" / "$0": signed money for profit and loss. */
export function signedUsd(n: number): string {
  if (Math.abs(n) < 0.005) return '$0'
  return `${n > 0 ? '+' : '−'}${usd(Math.abs(n))}`
}

/** 0.634 → "63%". */
export const pct = (n: number) => `${Math.round(n * 100)}%`
