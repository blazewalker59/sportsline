/**
 * A server function's typed error survives the wire: serialized with Start's
 * plugins (src/start.ts's adapter ahead of the defaults, as Start orders
 * them), it arrives as the same class, where a plain Error keeps only its
 * message.
 */

import { describe, expect, it } from 'vitest'
import { fromCrossJSON, toCrossJSONAsync } from 'seroval'
import {
  createDefaultSerovalPlugins,
  makeSerovalPlugin,
} from '@tanstack/router-core/ssr/client'
import {
  SignInRequired,
  UserError,
  isSignInRequired,
  userErrorAdapter,
} from '@/lib/userError'

const plugins = [
  makeSerovalPlugin(userErrorAdapter),
  ...createDefaultSerovalPlugins(),
]

async function overTheWire(value: unknown): Promise<unknown> {
  const json = JSON.stringify(
    await toCrossJSONAsync(value, { refs: new Map(), plugins }),
  )
  return fromCrossJSON(JSON.parse(json), { refs: new Map(), plugins })
}

describe('typed errors over the wire', () => {
  it('keeps a SignInRequired a SignInRequired', async () => {
    const back = (await overTheWire({ error: new SignInRequired() })) as {
      error: unknown
    }
    expect(isSignInRequired(back.error)).toBe(true)
    expect((back.error as SignInRequired).status).toBe(401)
  })

  it('keeps a UserError’s message and status', async () => {
    const back = (await overTheWire({
      error: new UserError('Connect ESPN first.'),
    })) as { error: unknown }
    expect(back.error).toBeInstanceOf(UserError)
    expect(isSignInRequired(back.error)).toBe(false)
    expect(back.error).toMatchObject({
      message: 'Connect ESPN first.',
      status: 400,
    })
  })

  it('sends any other error as its message alone', async () => {
    const back = (await overTheWire({ error: new TypeError('boom') })) as {
      error: Error
    }
    expect(back.error).toBeInstanceOf(Error)
    expect(isSignInRequired(back.error)).toBe(false)
    expect(back.error.message).toBe('boom')
  })
})
