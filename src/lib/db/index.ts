/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare D1 access via Drizzle, and the Worker env.
 *
 * The bindings only exist inside the Worker. Server functions read them from
 * the per-request context the Worker entry (src/server.ts) sets up, the same
 * pattern as dreamteam (#64 there): the request runtime context omits
 * secrets, which Better Auth needs.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { LiveGame } from '@/lib/live/LiveGame'
import type { LiveHub } from '@/lib/live/LiveHub'
import type { Scheduler } from '@/lib/live/Scheduler'

export interface CloudflareEnv {
  DB: D1Database
  LIVE_GAME: DurableObjectNamespace<LiveGame>
  LIVE_HUB: DurableObjectNamespace<LiveHub>
  SCHEDULER: DurableObjectNamespace<Scheduler>
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Web Push (Alerts): public key (also sent to browsers) and private JWK. */
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_JWK?: string
  /** Contact for push services, an https: or mailto: URL. */
  VAPID_SUBJECT?: string
  /** Production's one host; every other host redirects to it. Unset locally. */
  CANONICAL_HOST?: string
  /** 32 bytes, base64: seals Viewers' Kalshi keys (docs/adr/0003). */
  KALSHI_ENCRYPTION_KEY?: string
  /** 32 bytes, base64: seals Viewers' ESPN session cookies (docs/adr/0004). */
  ESPN_ENCRYPTION_KEY?: string
}

export type Database = DrizzleD1Database<typeof schema>

export interface ServerRequestContext {
  headers: Headers
  env: CloudflareEnv
}

export const serverRequestContext =
  new AsyncLocalStorage<ServerRequestContext>()

/** Read the Cloudflare env inside a request. Server-only. */
export function getCloudflareEnv(): CloudflareEnv {
  const env = serverRequestContext.getStore()?.env
  if (!env?.DB) {
    throw new Error(
      'Cloudflare env is not available. This must run in server code on Cloudflare Workers.',
    )
  }
  return env
}

export function dbFromD1(d1: D1Database): Database {
  return drizzle(d1, { schema })
}

/** A Drizzle client bound to the current request's D1 database. */
export function getDb(): Database {
  return dbFromD1(getCloudflareEnv().DB)
}
