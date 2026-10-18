/**
 * The service worker (public/sw.js), from the page's side. It's registered
 * on every load, not only when a Viewer turns Alerts on: it has no fetch
 * handler, so it never touches the page's requests or caches anything; it
 * just shows Alerts and opens them. Registered everywhere, every open tab
 * is one it controls, and an update ships to devices on their next visit.
 *
 * Opening an Alert while Sportsline is open asks that tab to route to it
 * in place (no reload); the worker falls back to loading the page if no tab
 * answers.
 */

/** The message public/sw.js posts; keep the two in step. */
const NAVIGATE = 'sportsline:navigate'

interface Navigator {
  navigate: (opts: { href: string }) => Promise<void>
}

let current: Navigator | null = null

export function startServiceWorker(router: Navigator): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  // A later router (a fresh getRouter) takes over; listen and register once.
  const first = current === null
  current = router
  if (!first) return

  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: unknown; url?: unknown } | null
    if (data?.type !== NAVIGATE || typeof data.url !== 'string') return
    const url = new URL(data.url, window.location.origin)
    if (url.origin !== window.location.origin) return
    e.ports[0]?.postMessage('ok')
    void current?.navigate({ href: url.pathname + url.search + url.hash })
  })

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No worker (an old browser, a blocked scope): Alerts say so.
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
