/** Trading limits (docs/adr/0008), shared by the server and the Agents page. */

export const DEFAULT_CAPS = { maxOrderDollars: 25, maxDailyDollars: 100 }
/** The highest limits a Viewer can set, against a slip of the thumb. */
export const CAP_LIMITS = { maxOrderDollars: 1_000, maxDailyDollars: 5_000 }
