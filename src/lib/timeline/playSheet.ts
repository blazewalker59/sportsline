/**
 * Whether the open Play sheet was opened by tapping a bubble (so closing it
 * should go Back, like the Back gesture) rather than arriving by a link.
 */
let openedInApp = false

export function markPlayOpened(): void {
  openedInApp = true
}

/** Read and clear: true when closing should be history.back(). */
export function takePlayOpened(): boolean {
  const value = openedInApp
  openedInApp = false
  return value
}
