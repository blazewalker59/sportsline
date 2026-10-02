/**
 * Better Auth browser client.
 *
 * baseURL defaults to the current origin, so the same client works in local
 * dev and production. Components use `useSession()` for reactive auth state and
 * `signIn.social({ provider: 'google' })` to start the Google flow.
 */

import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()

export const { signIn, signOut: signOutClient, useSession } = authClient
