import { useEffect } from 'react'
import { reportClientError } from './server'

/** Send one browser error to the server's reporter; never throws. */
export function sendClientError(error: unknown, kind: string): void {
  const e = error instanceof Error ? error : new Error(String(error))
  void reportClientError({
    data: {
      message: e.message.slice(0, 1000) || e.name,
      stack: e.stack?.slice(0, 4000),
      path: window.location.pathname,
      kind,
    },
  }).catch(() => undefined)
}

/**
 * While signed in, report the browser's uncaught errors and unhandled
 * rejections (docs/adr/0005), so a crash on a phone shows up on the health
 * page, not just in a console nobody sees.
 */
export function useClientErrors(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onError = (e: ErrorEvent) =>
      sendClientError(e.error ?? e.message, 'error')
    const onRejection = (e: PromiseRejectionEvent) =>
      sendClientError(e.reason, 'rejection')
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [enabled])
}
