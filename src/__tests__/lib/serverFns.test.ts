/**
 * Every server function refuses a request with no session, but for the few
 * listed as public. Finds them all: each module under src/lib that calls
 * createServerFn, through the Start compiler's provider split, which
 * exports each one's server half as `<name>_createServerFn_handler`. A new
 * server function is covered the moment it's written. Bun only.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { isBun } from '../helpers/sqliteDb'
import type * as Db from '@/lib/db'
import type { CloudflareEnv } from '@/lib/db'
import { isSignInRequired } from '@/lib/userError'

interface Exec {
  result?: unknown
  error?: unknown
}

type ServerFn = (opts: { data?: unknown }) => Promise<Exec>

const env = { DB: {} } as unknown as CloudflareEnv

vi.mock('@/lib/db', async (original) => ({
  ...(await original<typeof Db>()),
  dbFromD1: () => ({}),
  getDb: () => ({}),
  getCloudflareEnv: () => env,
}))

// Signed out: there's no session to find.
vi.mock('@/lib/auth/server', () => ({
  getAuth: () => ({ api: { getSession: () => Promise.resolve(null) } }),
}))

/** Answer a signed-out visitor too, each with what it answers. */
const PUBLIC: Record<string, (result: unknown) => void> = {
  // The session check itself: signed out is its answer.
  'viewer/server.ts#getViewerState': (result) =>
    expect(result).toMatchObject({ viewer: null }),
}

const LIB = join(process.cwd(), 'src/lib')

function serverFnModules(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return serverFnModules(path)
    return /\.tsx?$/.test(entry.name) &&
      readFileSync(path, 'utf8').includes('createServerFn(')
      ? [path]
      : []
  })
}

async function call(fn: ServerFn): Promise<Exec> {
  const { serverRequestContext } = await import('@/lib/db')
  return runWithStartContext(
    {
      getRouter: () => ({}) as never,
      request: new Request('https://sportsline.dev/'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    () =>
      serverRequestContext.run({ headers: new Headers(), env }, () =>
        fn({ data: {} }),
      ),
  )
}

const modules = serverFnModules(LIB)

describe.skipIf(!isBun)('server functions with no session', () => {
  it('finds the modules that define them', () => {
    expect(modules.length).toBeGreaterThan(10)
  })

  it.each(modules.map((path) => [relative(LIB, path), path]))(
    '%s refuses every non-public one',
    async (name, path) => {
      const provider = (await import(
        /* @vite-ignore */ `${path}?tss-serverfn-split`
      )) as Record<string, ServerFn>
      const handlers = Object.entries(provider).filter(([key]) =>
        key.endsWith('_createServerFn_handler'),
      )
      // As many server halves as the file has server functions.
      const defined = readFileSync(path, 'utf8').match(/createServerFn\(/g)
      expect(handlers).toHaveLength(defined?.length ?? 0)
      for (const [key, fn] of handlers) {
        const id = `${name}#${key.replace('_createServerFn_handler', '')}`
        const { result, error } = await call(fn)
        const expectPublic = PUBLIC[id] as
          ((result: unknown) => void) | undefined
        if (expectPublic) {
          expect(error, id).toBeUndefined()
          expectPublic(result)
        } else {
          expect(isSignInRequired(error), id).toBe(true)
        }
      }
    },
  )

  it('lists only public server functions that exist', async () => {
    const ids = new Set<string>()
    for (const path of modules) {
      const provider = (await import(
        /* @vite-ignore */ `${path}?tss-serverfn-split`
      )) as Record<string, unknown>
      for (const key of Object.keys(provider)) {
        ids.add(
          `${relative(LIB, path)}#${key.replace('_createServerFn_handler', '')}`,
        )
      }
    }
    for (const id of Object.keys(PUBLIC)) expect(ids).toContain(id)
  })
})
