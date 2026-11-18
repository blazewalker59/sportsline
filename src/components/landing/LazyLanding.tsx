/**
 * The Landing, loaded on its own: a Viewer never sees it, so it (and the
 * sign-in client it carries) stays out of the app's client entry.
 *
 * The server starts loading it as soon as this module is evaluated, and
 * once it has loaded, hands it to `lazy` synchronously. So the server
 * renders the Landing in full, with its image preload links, even on the
 * first render in a fresh isolate: a lazy component whose import is still
 * pending would suspend there and stream the Landing in after an empty
 * shell. In the browser it loads on first render as before; the fallback
 * only shows on a client-side switch to the Landing.
 */

import { Suspense, lazy } from 'react'
import type { ComponentType } from 'react'
import type * as LandingExports from './Landing'

type LandingModule = typeof LandingExports
type LazyModule = { default: ComponentType }

let loaded: LandingModule | undefined
let loading: Promise<LandingModule> | undefined

/**
 * Load the Landing module once, remembering it when it arrives. A failed
 * load is forgotten, so the next render tries again.
 */
export function loadLanding(): Promise<LandingModule> {
  loading ??= import('./Landing').then(
    (m) => (loaded = m),
    (error: unknown) => {
      loading = undefined
      throw error
    },
  )
  return loading
}

/**
 * What `lazy` loads: once the module is in hand, a thenable that resolves
 * on the spot, which `lazy` reads without suspending (React settles a lazy
 * component inside `then` when the thenable calls back synchronously).
 */
export function landingModule(): PromiseLike<LazyModule> {
  if (loaded) {
    const module: LazyModule = { default: loaded.Landing }
    const settled = {
      then(onFulfilled: (value: LazyModule) => unknown) {
        onFulfilled(module)
      },
    }
    return settled as unknown as PromiseLike<LazyModule>
  }
  return loadLanding().then((m) => ({ default: m.Landing }))
}

// A failure here resurfaces when the Landing renders, which loads again.
if (import.meta.env.SSR) loadLanding().catch(() => {})

const Page = lazy(landingModule as () => Promise<LazyModule>)

export function Landing() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Page />
    </Suspense>
  )
}
