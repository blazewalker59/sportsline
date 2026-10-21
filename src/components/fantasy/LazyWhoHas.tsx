/**
 * Who Has? loaded on its own, after the app's first paint: most opens
 * have no encounter, so it (and the Fantasy client it carries) stays out
 * of the app's entry.
 */

import { Suspense, lazy } from 'react'

const Popup = lazy(() =>
  import('./WhoHas').then((m) => ({ default: m.WhoHasPopup })),
)

export function WhoHasPopup() {
  return (
    <Suspense fallback={null}>
      <Popup />
    </Suspense>
  )
}
