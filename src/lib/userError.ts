/**
 * Errors a server function means the Viewer to see. A UserError's message
 * is written for them and safe to show; anything else a server function
 * throws is reported and reaches the client as a generic message
 * (`safeErrors`, src/lib/viewer/middleware.ts).
 *
 * Start sends any other Error as its message alone, so these cross through
 * a serialization adapter (src/start.ts) and arrive as the same classes.
 * Shared: no server code.
 */

import { createSerializationAdapter } from '@tanstack/react-router'

export class UserError extends Error {
  /** HTTP-style: 400 for a request we can't do, 401 for signed out. */
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'UserError'
    this.status = status
  }
}

/** The session is missing or over: a 401, which shows the Landing. */
export class SignInRequired extends UserError {
  constructor() {
    super('Sign in required', 401)
    this.name = 'SignInRequired'
  }
}

export function isSignInRequired(error: unknown): error is SignInRequired {
  return error instanceof SignInRequired
}

/** What a server function says when it can't say what went wrong. */
export const GENERIC_MESSAGE = 'Something went wrong. Try again.'

export const userErrorAdapter = createSerializationAdapter({
  key: 'sportsline-user-error',
  test: (value): value is UserError => value instanceof UserError,
  toSerializable: (error) => ({ message: error.message, status: error.status }),
  fromSerializable: ({ message, status }) =>
    status === 401 ? new SignInRequired() : new UserError(message, status),
})
