/**
 * How every server function finds its Viewer: the session is resolved once,
 * before the handler, and handed over in `context`. Sportsline is only for
 * Viewers, so `viewerMiddleware` is the default; `optionalViewerMiddleware`
 * is for the few reads that answer a signed-out visitor too (the session
 * check itself, and the Gate's queries).
 *
 * The server halves never reach the client bundle: the Start compiler
 * strips them, with the server-only imports they use.
 */

import { createMiddleware } from '@tanstack/react-start'
import { sessionViewer } from './session'
import { getDb } from '@/lib/db'
import { SignInRequired } from '@/lib/userError'

/** Signed in, or a SignInRequired (401) the client answers with the Landing. */
export const viewerMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const viewer = await sessionViewer()
    if (!viewer) throw new SignInRequired()
    return next({ context: { viewer, viewerId: viewer.id, db: getDb() } })
  },
)

/** The Viewer if signed in, else null. */
export const optionalViewerMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const viewer = await sessionViewer()
  return next({ context: { viewer, db: getDb() } })
})
