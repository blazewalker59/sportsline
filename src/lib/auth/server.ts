/**
 * Better Auth server, configured exactly as dreamteam: Google sign-in only,
 * Drizzle adapter on D1.
 */

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
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
  })
}
