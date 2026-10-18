/**
 * The Landing, loaded on its own: a Viewer never sees it, so it (and the
 * sign-in client it carries) stays out of the app's entry. The server
 * renders it in full; the fallback only shows on a client-side switch.
 */

import { Suspense, lazy } from 'react'

const Page = lazy(() =>
  import('./Landing').then((m) => ({ default: m.Landing })),
)

export function Landing() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Page />
    </Suspense>
  )
}
