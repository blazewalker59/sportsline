/**
 * Looking for new leagues on a manual sync. Kept out of the server-function
 * module: a plain export there is pulled into the client bundle.
 */

import { eq } from 'drizzle-orm'
import { sleeperState } from './sleeper/client'
import { discover as discoverSleeper } from './sleeper/sync'
import { discover, loadSession } from './sync'
import type { CloudflareEnv, Database } from '@/lib/db'
import { sleeperAccounts } from '@/lib/db/schema'
import { reportError } from '@/lib/ops/errors'

/**
 * A failed lookup is reported (it shows on the health page) and does not
 * stop the leagues already stored. Returns which connections exist, so the
 * sync can still refresh them.
 */
export async function discoverConnectedLeagues(
  env: CloudflareEnv,
  db: Database,
  viewerId: string,
): Promise<{ espn: boolean; sleeper: boolean }> {
  const session = await loadSession(env, viewerId)
  if (session) {
    await discover(db, viewerId, session).catch((error: unknown) =>
      reportError(env, 'espn', error, { viewerId, step: 'discovery' }),
    )
  }
  const sleeper = await db
    .select()
    .from(sleeperAccounts)
    .where(eq(sleeperAccounts.viewerId, viewerId))
    .get()
  if (sleeper) {
    await sleeperState()
      .then((state) => discoverSleeper(db, viewerId, sleeper.userId, state))
      .catch((error: unknown) =>
        reportError(env, 'sleeper', error, { viewerId, step: 'discovery' }),
      )
  }
  return { espn: session !== null, sleeper: sleeper !== undefined }
}
