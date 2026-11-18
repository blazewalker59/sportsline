/// <reference types="@cloudflare/workers-types" />
/**
 * Custom Cloudflare Worker entry (same shape as dreamteam).
 *
 * Serves Better Auth (`/api/auth/*`), the health check, logo copies
 * (`/logo`), the LiveHub WebSocket (`/live`) and the MCP server for Agents
 * (`/mcp`) directly; everything else falls through to TanStack
 * Start inside a per-request context carrying the env. Also exports the
 * Durable Object classes, and keeps the Scheduler loop running
 * (docs/adr/0001, "Scheduling"), from requests and from a five-minute Cron
 * Trigger as a safety net. Every response but a WebSocket upgrade gets the
 * security headers (src/lib/securityHeaders.ts).
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
import { reportError } from '@/lib/ops/errors'
import {
  CSP_REPORT_PATH,
  receiveCspReport,
  withSecurityHeaders,
} from '@/lib/securityHeaders'

export { LiveGame } from '@/lib/live/LiveGame'
export { LiveHub } from '@/lib/live/LiveHub'
export { Scheduler } from '@/lib/live/Scheduler'
export { ViewerSync } from '@/lib/live/ViewerSync'

/** Where Agents reach the MCP server; the same path as `endpoint.MCP_PATH`. */
const MCP_PATH = '/mcp'

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

/** The response to one request, before the security headers. */
async function route(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
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

  if (url.pathname === CSP_REPORT_PATH) return receiveCspReport(request)

  if (Date.now() - lastKick > KICK_EVERY_MS) {
    ctx.waitUntil(
      ensureScheduler(env).catch((error: unknown) =>
        reportError(env, 'scheduler', error),
      ),
    )
  }

  if (url.pathname === LIVE_PATH) {
    // Live updates are for signed-in Viewers, like everything else.
    const session = await getAuth(env, url.origin).api.getSession({
      headers: request.headers,
    })
    if (!session?.user) return new Response('Sign in required', { status: 401 })
    return env.LIVE_HUB.get(env.LIVE_HUB.idFromName('global')).fetch(request)
  }

  // Agents sign in with an API token, not a session (docs/adr/0007). The
  // MCP server loads on its first call: a page view never needs it, so it
  // stays out of what every new isolate evaluates before its first request.
  if (url.pathname === MCP_PATH) {
    const { serveMcp } = await import('@/lib/agents/endpoint')
    return serveMcp(request, env)
  }

  if (url.pathname.startsWith('/api/auth')) {
    return getAuth(env, url.origin).handler(request)
  }

  return serverRequestContext.run({ headers: request.headers, env }, () =>
    startFetch(request, env, ctx),
  )
}

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url)
    return withSecurityHeaders(await route(request, env, ctx, url), url)
  },

  /**
   * A safety net, not the schedule: every five minutes, make sure the
   * Scheduler loop is running (docs/adr/0001, "Scheduling"). Harmless if
   * the trigger never fires, and a no-op while the loop runs.
   */
  async scheduled(
    _controller: ScheduledController,
    env: CloudflareEnv,
  ): Promise<void> {
    await ensureScheduler(env).catch((error: unknown) =>
      reportError(env, 'scheduler', error),
    )
  },
}
