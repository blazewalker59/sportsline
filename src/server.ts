/// <reference types="@cloudflare/workers-types" />
/**
 * Custom Cloudflare Worker entry (same shape as dreamteam).
 *
 * Serves Better Auth (`/api/auth/*`), the health check and the LiveHub
 * WebSocket (`/live`) directly; everything else falls through to TanStack
 * Start inside a per-request context carrying the env. Also exports the
 * Durable Object classes and the schedule cron.
 */

import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import type { CloudflareEnv } from '@/lib/db'
import { getAuth } from '@/lib/auth/server'
import { serverRequestContext } from '@/lib/db'
import { LIVE_PATH } from '@/lib/live/LiveHub'
import { syncSchedules } from '@/lib/live/schedule'

export { LiveGame } from '@/lib/live/LiveGame'
export { LiveHub } from '@/lib/live/LiveHub'

const startFetch = createStartHandler(defaultStreamHandler) as (
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
) => Promise<Response>

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      try {
        await env.DB.prepare('SELECT 1').first()
        return Response.json({
          ok: true,
          version: __SPORTSLINE_VERSION__ || undefined,
        })
      } catch {
        return Response.json({ ok: false }, { status: 503 })
      }
    }

    if (url.pathname === LIVE_PATH) {
      return env.LIVE_HUB.get(env.LIVE_HUB.idFromName('global')).fetch(request)
    }

    if (url.pathname.startsWith('/api/auth')) {
      return getAuth(env, url.origin).handler(request)
    }

    return serverRequestContext.run({ headers: request.headers, env }, () =>
      startFetch(request, env, ctx),
    )
  },

  scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): void {
    ctx.waitUntil(syncSchedules(env, new Date(controller.scheduledTime)))
  },
}
