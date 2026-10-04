/// <reference types="@cloudflare/workers-types" />
/**
 * Custom Cloudflare Worker entry (same shape as dreamteam).
 *
 * Serves Better Auth (`/api/auth/*`), the health check, logo copies
 * (`/logo`) and the LiveHub WebSocket (`/live`) directly; everything else falls through to TanStack
 * Start inside a per-request context carrying the env. Also exports the
 * Durable Object classes, and keeps the Scheduler loop running
 * (docs/adr/0001, "Scheduling").
 */

import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import type { CloudflareEnv } from '@/lib/db'
import { getAuth } from '@/lib/auth/server'
import { canonicalRedirect } from '@/lib/canonical'
import { serverRequestContext } from '@/lib/db'
import { LIVE_PATH } from '@/lib/live/LiveHub'
import { LOGO_PATH, serveLogo } from '@/lib/logoProxy'

export { LiveGame } from '@/lib/live/LiveGame'
export { LiveHub } from '@/lib/live/LiveHub'
export { Scheduler } from '@/lib/live/Scheduler'

/**
 * Any request makes sure the Scheduler loop is running, at most once per
 * isolate per few minutes (a per-isolate throttle; correctness never depends
 * on it, since `ensureRunning` is idempotent).
 */
const KICK_EVERY_MS = 5 * 60_000
let lastKick = 0

function ensureScheduler(env: CloudflareEnv): Promise<void> {
  lastKick = Date.now()
  return env.SCHEDULER.get(env.SCHEDULER.idFromName('global')).ensureRunning()
}

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

    // One canonical address (one sign-in, one cache): www and workers.dev
    // permanently redirect to the same path on CANONICAL_HOST.
    const redirect = canonicalRedirect(url, request.method, env.CANONICAL_HOST)
    if (redirect) return redirect

    // The deploy smoke check hits /health, which starts the loop right away.
    if (url.pathname === '/health') {
      try {
        await env.DB.prepare('SELECT 1').first()
        await ensureScheduler(env)
        return Response.json({
          ok: true,
          version: __SPORTSLINE_VERSION__ || undefined,
        })
      } catch {
        return Response.json({ ok: false }, { status: 503 })
      }
    }

    if (url.pathname === LOGO_PATH && request.method === 'GET') {
      return serveLogo(url)
    }

    if (Date.now() - lastKick > KICK_EVERY_MS) {
      ctx.waitUntil(
        ensureScheduler(env).catch((error: unknown) =>
          console.error('Scheduler kick failed', String(error)),
        ),
      )
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
}
