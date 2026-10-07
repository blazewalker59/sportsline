/** Kalshi API key scopes (docs/adr/0003). Pure. */

/** Read-only: every scope reads (an unscoped key has full access). */
export function isReadOnly(scopes: ReadonlyArray<string> | undefined): boolean {
  return (
    !!scopes &&
    scopes.length > 0 &&
    scopes.every((s) => s === 'read' || s.startsWith('read::'))
  )
}

/**
 * Can trade but never move money (docs/adr/0008): `write::trade`, plus any
 * reads. The broad `write` scope also grants transfers, so it's refused,
 * as is an unscoped key (full access).
 */
export function isTradeOnly(
  scopes: ReadonlyArray<string> | undefined,
): boolean {
  return (
    !!scopes &&
    scopes.includes('write::trade') &&
    scopes.every(
      (s) => s === 'write::trade' || s === 'read' || s.startsWith('read::'),
    )
  )
}
