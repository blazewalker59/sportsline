/**
 * Number and date formats every chart shares, so axes, tooltips and
 * captions read the same across the app. Pure.
 */

/** "$1,234", or "$12.50" under $100. */
export function usd(n: number): string {
  const abs = Math.abs(n)
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString(undefined, {
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

/** A local calendar day ("2026-10-04") or instant → "Oct 4". */
export function shortDate(value: string | Date): string {
  const d =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00`)
      : new Date(value)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** An instant → "7:42 PM". */
export function clockTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}
