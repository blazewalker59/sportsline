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
  return { sqlite, db: drizzle(sqlite, { schema }) }
}
