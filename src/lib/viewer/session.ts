/**
 * The signed-in Viewer, for server functions. Server-only: kept apart from
 * the server-function modules so the client bundle never pulls in auth or
 * the database. Server functions don't call it directly: they take their
 * Viewer from `viewerMiddleware` (./middleware).
 *
 * D1 has no row-level security, so every Viewer-owned read and write is
 * scoped by the session's user id, the same pattern as dreamteam's
 * `withUser`.
 */

import type { ServerRequestContext } from '@/lib/db'
import { getAuth } from '@/lib/auth/server'
import { getCloudflareEnv, serverRequestContext } from '@/lib/db'

export interface ViewerProfile {
  id: string
  name: string
  image: string | null
  email: string
}

/** One lookup per request, however many server functions a page runs. */
const resolved = new WeakMap<
  ServerRequestContext,
  Promise<ViewerProfile | null>
>()

export function sessionViewer(): Promise<ViewerProfile | null> {
  const store = serverRequestContext.getStore()
  if (!store) return Promise.resolve(null)
  let viewer = resolved.get(store)
  if (!viewer) {
    viewer = lookUp(store.headers)
    // A failed lookup isn't remembered: the next call tries again.
    viewer.catch(() => resolved.delete(store))
    resolved.set(store, viewer)
  }
  return viewer
}

async function lookUp(headers: Headers): Promise<ViewerProfile | null> {
  const session = await getAuth(getCloudflareEnv()).api.getSession({ headers })
  if (!session?.user) return null
  return {
    id: session.user.id,
    name: session.user.name,
    image: session.user.image ?? null,
    email: session.user.email,
  }
}
