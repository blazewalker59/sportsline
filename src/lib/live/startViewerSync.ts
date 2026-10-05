/**
 * Start a Viewer's ViewerSync (docs/adr/0005): idempotent. Apart from the
 * Durable Object's module, so server functions can call it without
 * pulling the class (and cloudflare:workers) into their bundles.
 */

import type { CloudflareEnv } from '@/lib/db'

export function startViewerSync(
  env: Pick<CloudflareEnv, 'VIEWER_SYNC'>,
  viewerId: string,
): Promise<void> {
  return env.VIEWER_SYNC.get(env.VIEWER_SYNC.idFromName(viewerId)).start(
    viewerId,
  )
}
