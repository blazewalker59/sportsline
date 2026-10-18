/**
 * Better Auth server, configured as dreamteam: Google sign-in only, Drizzle
 * adapter on D1, plus a short-lived session cookie cache.
 */

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import * as schema from '@/lib/db/schema'

export function getAuth(env: CloudflareEnv, baseURL?: string) {
  return betterAuth({
    baseURL: baseURL ?? env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(dbFromD1(env.DB), { provider: 'sqlite', schema }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google'],
      },
    },
    // Every server function checks the session; without a cache each check
    // is a D1 read. The signed session_data cookie answers instead for up to
    // five minutes, after which the next check reads D1 and re-signs it.
    // The tradeoff is revocation: a session deleted in D1 (signed out on
    // another device, or revoked by hand) keeps working on a device holding
    // a fresh cache for up to those five minutes. Signing out on the device
    // itself clears both cookies at once. Five minutes keeps that window
    // short while sparing the reads a page's several server functions make.
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // Lets a session check inside a server function set the refreshed
    // cookie on its response. Must stay the last plugin.
    plugins: [tanstackStartCookies()],
  })
}
