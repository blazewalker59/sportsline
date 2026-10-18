/**
 * The signed-in Viewer: no session, a session, one lookup per request.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import type * as Session from '@/lib/viewer/session'

const state = vi.hoisted(() => ({
  db: { marker: 'db' } as unknown,
  env: { DB: { ready: true } } as unknown as CloudflareEnv,
  session: null as {
    user: { id: string; name: string; email: string; image?: string | null }
  } | null,
  lookups: 0,
}))

vi.mock('@/lib/db', async (original) => {
  const mod = await original<typeof Db>()
  return {
    ...mod,
    getDb: () => state.db,
    getCloudflareEnv: () => state.env,
  }
})

vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({
    api: {
      getSession: () => {
        state.lookups++
        return Promise.resolve(state.session)
      },
    },
  }),
}))

describe('session viewer', () => {
  let session: typeof Session

  beforeEach(async () => {
    state.session = null
    session = await import('@/lib/viewer/session')
  })

  it('returns null without a request or a user', async () => {
    expect(await session.sessionViewer()).toBeNull()
    const { serverRequestContext } = await import('@/lib/db')
    const signedOut = await serverRequestContext.run(
      { headers: new Headers(), env: state.env },
      () => session.sessionViewer(),
    )
    expect(signedOut).toBeNull()
  })

  it('returns the profile, read afresh each request', async () => {
    state.session = {
      user: { id: 'u1', name: 'Viewer', email: 'v@example.com' },
    }
    const { serverRequestContext } = await import('@/lib/db')
    const profile = await serverRequestContext.run(
      { headers: new Headers({ cookie: 'session' }), env: state.env },
      () => session.sessionViewer(),
    )
    expect(profile).toEqual({
      id: 'u1',
      name: 'Viewer',
      email: 'v@example.com',
      image: null,
    })
    state.session = {
      user: {
        id: 'u1',
        name: 'Viewer',
        email: 'v@example.com',
        image: 'https://photo',
      },
    }
    const fresh = await serverRequestContext.run(
      { headers: new Headers({ cookie: 'session' }), env: state.env },
      () => session.sessionViewer(),
    )
    expect(fresh?.image).toBe('https://photo')
  })

  it('looks the session up once per request', async () => {
    state.session = {
      user: { id: 'u1', name: 'Viewer', email: 'v@example.com' },
    }
    state.lookups = 0
    const { serverRequestContext } = await import('@/lib/db')
    const [a, b] = await serverRequestContext.run(
      { headers: new Headers({ cookie: 'session' }), env: state.env },
      () => Promise.all([session.sessionViewer(), session.sessionViewer()]),
    )
    expect(a).toBe(b)
    expect(state.lookups).toBe(1)
  })
})
