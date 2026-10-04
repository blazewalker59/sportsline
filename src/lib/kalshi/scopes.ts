/** Kalshi API key scopes (docs/adr/0003). Pure. */

/** Read-only: every scope reads (an unscoped key has full access). */
export function isReadOnly(scopes: ReadonlyArray<string> | undefined): boolean {
  return (
    !!scopes &&
    scopes.length > 0 &&
    scopes.every((s) => s === 'read' || s.startsWith('read::'))
  )
}
