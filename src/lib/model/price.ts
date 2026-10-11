/**
 * Showing a Kalshi price (CONTEXT.md, "Price display"): as cents (54¢), or
 * as what a contract pays per dollar staked, after Kalshi's fee (1.79x: a
 * 54¢ contract and its 2¢ fee pay $1). Pure.
 */

import { kalshiFee } from '@/lib/sharp/engine'

export type PriceDisplay = 'cents' | 'multiplier'

/** What one contract at this price pays per $1, fee included (2 decimals). */
export function payoutMultiplier(price: number): number {
  return Math.round((1 / (price + kalshiFee(price))) * 100) / 100
}

/** "54¢" or "1.79x". */
export function formatPrice(price: number, display: PriceDisplay): string {
  return display === 'multiplier'
    ? `${payoutMultiplier(price).toFixed(2)}x`
    : `${Math.round(price * 100)}¢`
}

/**
 * The most a contract may cost, in whole cents, and still pay at least
 * this multiple of what's staked (null: no price can). Compared as shown,
 * to 2 decimals, so a price quoted as 1.79x is one "at least 1.79x" takes.
 */
export function maxCentsFor(multiplier: number): number | null {
  for (let c = 99; c >= 1; c--) {
    if (payoutMultiplier(c / 100) >= multiplier) return c
  }
  return null
}
