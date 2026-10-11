/**
 * A fresh in-memory database with every migration applied, on Bun's
 * SQLite, for tests that run real queries. Bun only.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const isBun = Boolean(process.versions.bun)

export async function sqliteDb() {
  // Hidden from Vite's import analysis: Node has no bun:sqlite.
  const bunSqlite = 'bun:sqlite'
  const { Database } = await import(/* @vite-ignore */ bunSqlite)
  const { drizzle } = await import('drizzle-orm/bun-sqlite')
  const schema = await import('@/lib/db/schema')
  const sqlite = new Database(':memory:')
  const dir = join(process.cwd(), 'drizzle')
  const journal = JSON.parse(
    readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> }
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(dir, `${tag}.sql`), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.run(statement)
    }
  }
  const db = drizzle(sqlite, { schema })
  // LiveGame and identity resolve write with D1's batch(). Bun's driver
  // has the same statements; run them in order so those paths can execute.
  return { sqlite, db: withBatch(db) }
}

type Runnable = { run: () => unknown }

/** D1's `db.batch` on a Bun SQLite client: run each statement in order. */
export function withBatch<T extends object>(
  db: T,
): T & { batch: (queries: Array<Runnable>) => Promise<Array<unknown>> } {
  const batched = db as T & {
    batch: (queries: Array<Runnable>) => Promise<Array<unknown>>
  }
  batched.batch = async (queries) => {
    const results: Array<unknown> = []
    for (const query of queries) results.push(await query.run())
    return results
  }
  return batched
}
