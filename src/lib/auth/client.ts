/**
 * Better Auth browser client.
 *
 * baseURL defaults to the current origin, so the same client works in local
 * dev and production. Components start Google sign-in with
 * `signIn.social({ provider: 'google' })` and sign out with `signOutClient`.
 */

import { createAuthClient } from 'better-auth/react'

const authClient = createAuthClient()

export const { signIn, signOut: signOutClient } = authClient
