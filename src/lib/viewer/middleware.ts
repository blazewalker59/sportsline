/**
 * What every server function runs first. `safeErrors` keeps internals off
 * the wire; the Viewer middlewares, built on it, resolve the session once,
 * before the handler, and hand the Viewer over in `context`. Sportsline is
 * only for Viewers, so `viewerMiddleware` is the default;
 * `optionalViewerMiddleware` is for the session check itself, which answers
 * a signed-out visitor too.
 *
 * The server halves never reach the client bundle: the Start compiler
 * strips them, with the server-only imports they use.
 */

import { createMiddleware } from '@tanstack/react-start'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { ZodError } from 'zod'
import { sessionViewer } from './session'
import { getCloudflareEnv, getDb } from '@/lib/db'
import { reportError } from '@/lib/ops/errors'
import { GENERIC_MESSAGE, SignInRequired, UserError } from '@/lib/userError'

/**
 * A UserError goes to the client as it is; a rejected input as the
 * validator's first complaint; anything else (a D1 failure, a Source's or
 * Kalshi's response body) is reported and replaced with a generic message.
 */
export const safeErrors = createMiddleware({ type: 'function' }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next()
    } catch (error) {
      if (
        error instanceof UserError ||
        error instanceof Response ||
        isRedirect(error) ||
        isNotFound(error)
      )
        throw error
      if (error instanceof ZodError) {
        throw new UserError(error.issues[0]?.message ?? 'Invalid request')
      }
      const env = getCloudflareEnv()
      await reportError(env, 'server-fn', error, { fn: serverFnMeta.name })
      throw new Error(GENERIC_MESSAGE)
    }
  },
)

/** Signed in, or a SignInRequired (401) the client answers with the Landing. */
export const viewerMiddleware = createMiddleware({ type: 'function' })
  .middleware([safeErrors])
  .server(async ({ next }) => {
    const viewer = await sessionViewer()
    if (!viewer) throw new SignInRequired()
    return next({ context: { viewer, viewerId: viewer.id, db: getDb() } })
  })

/** The Viewer if signed in, else null. */
export const optionalViewerMiddleware = createMiddleware({ type: 'function' })
  .middleware([safeErrors])
  .server(async ({ next }) => {
    const viewer = await sessionViewer()
    return next({ context: { viewer, db: getDb() } })
  })
