/** What the Agents page's sections share. */

import { tradingQuery } from '@/lib/agents/queries'

export const TRADING_KEY = tradingQuery().queryKey

export const money = (n: number) => `$${n.toFixed(2)}`

/** A key (Signal): a raised cap, its label in the manual's face. */
export const KEY =
  'key inline-flex h-9 shrink-0 items-center justify-center rounded-control px-3 text-3xs font-bold uppercase'

/** A wide key, for a form's submit or a decision. */
export const WIDE_KEY =
  'key inline-flex h-11 items-center justify-center rounded-control px-5 text-3xs font-bold uppercase'

/** A field's label, in the manual's face. */
export const FIELD_LABEL = 'flex flex-col gap-1.5 text-3xs text-muted uppercase'

/** A text field: recessed into the page. */
export const FIELD =
  'well rounded-control px-3 py-2 text-sm tracking-normal text-foreground normal-case font-sans'
