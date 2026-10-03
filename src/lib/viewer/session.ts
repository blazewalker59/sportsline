/**
 * The signed-in Viewer, for server functions. Server-only: kept apart from
 * the server-function modules so the client bundle never pulls in auth or
 * the database.
 *
 * D1 has no row-level security, so every Viewer-owned read and write is
 * scoped by the session's user id via `withViewer`, the same pattern as
 * dreamteam's `withUser`.
 */

import type { Database } from '@/lib/db'
import { getAuth } from '@/lib/auth/server'
import { getCloudflareEnv, getDb, serverRequestContext } from '@/lib/db'

export interface ViewerProfile {
  id: string
  name: string
  image: string | null
}

export async function sessionViewer(): Promise<ViewerProfile | null> {
  const headers = serverRequestContext.getStore()?.headers
  if (!headers) return null
  const session = await getAuth(getCloudflareEnv()).api.getSession({ headers })
  if (!session?.user) return null
  return {
    id: session.user.id,
    name: session.user.name,
    image: session.user.image ?? null,
  }
}

export async function withViewer<T>(
  fn: (scope: { db: Database; viewerId: string }) => Promise<T>,
): Promise<T> {
  const viewer = await sessionViewer()
  if (!viewer) throw new Error('Sign in required')
  return fn({ db: getDb(), viewerId: viewer.id })
}
