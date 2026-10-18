/**
 * Errors a server function means the Viewer to see, typed on both sides of
 * the wire. Start sends any other Error as its message alone, so these
 * cross through a serialization adapter (src/start.ts) and arrive as the
 * same classes. Shared: no server code.
 */

import { createSerializationAdapter } from '@tanstack/react-router'

/** The session is missing or over: a 401, which shows the Landing. */
export class SignInRequired extends Error {
  readonly status = 401
  constructor() {
    super('Sign in required')
    this.name = 'SignInRequired'
  }
}

export function isSignInRequired(error: unknown): error is SignInRequired {
  return error instanceof SignInRequired
}

export const userErrorAdapter = createSerializationAdapter({
  key: 'sportsline-user-error',
  test: (value): value is SignInRequired => value instanceof SignInRequired,
  toSerializable: (error) => ({ status: error.status }),
  fromSerializable: () => new SignInRequired(),
})
