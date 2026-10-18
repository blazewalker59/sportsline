/**
 * Source id → Sportsline id resolution (docs/adr/0002). The first time a
 * Source mentions a Team, Player or Game, it gets a Sportsline id and a row
 * in `source_ids`; afterwards the mapping is looked up.
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '@/lib/db'
import type { League, SourceRef, SourceTeam } from '@/lib/model/types'
import { players, sourceIds, teams } from '@/lib/db/schema'

type Entity = 'team' | 'player' | 'game'

const PREFIX: Record<Entity, string> = { team: 'tm', player: 'pl', game: 'gm' }

// D1 caps bound parameters per statement at 100.
const CHUNK = 90

export function chunk<T>(
  items: ReadonlyArray<T>,
  size: number,
): Array<Array<T>> {
  const out: Array<Array<T>> = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

export function newId(entity: Entity): string {
  return `${PREFIX[entity]}_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`
}

async function lookup(
  db: Database,
  entity: Entity,
  source: string,
  ids: Array<string>,
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await db
      .select({
        sourceId: sourceIds.sourceId,
        internalId: sourceIds.internalId,
      })
      .from(sourceIds)
      .where(
        and(
          eq(sourceIds.entity, entity),
          eq(sourceIds.source, source),
          inArray(sourceIds.sourceId, ids.slice(i, i + CHUNK)),
        ),
      )
    for (const r of rows) found.set(r.sourceId, r.internalId)
  }
  return found
}

/** Keeps a VALUES row (`v`) only if a mapping points at its fresh id. */
const claimed = sql`where exists (select 1 from source_ids where internal_id = v.column1)`

/**
 * Resolve every ref to a Sportsline id, creating Teams/Players (and their
 * mappings) that have never been seen. Concurrent creators are safe: each
 * batch claims the mappings first (a loser's insert does nothing), then
 * creates only the Teams/Players whose fresh id won its mapping, all in one
 * transaction, so a lost race leaves no row behind. The final lookup is
 * authoritative.
 */
export async function resolve(
  db: Database,
  entity: Entity,
  source: string,
  league: League,
  refs: ReadonlyArray<SourceRef | SourceTeam>,
): Promise<Map<string, string>> {
  const unique = [...new Map(refs.map((r) => [r.sourceId, r])).values()]
  if (unique.length === 0) return new Map()
  const known = await lookup(
    db,
    entity,
    source,
    unique.map((r) => r.sourceId),
  )
  const missing = unique.filter((r) => !known.has(r.sourceId))
  if (missing.length === 0) return known

  const created = missing.map((ref) => ({ ref, id: newId(entity) }))
  const statements: Array<BatchItem<'sqlite'>> = []
  for (const part of chunk(created, 24)) {
    statements.push(
      db
        .insert(sourceIds)
        .values(
          part.map(({ ref, id }) => ({
            entity,
            source,
            sourceId: ref.sourceId,
            internalId: id,
          })),
        )
        .onConflictDoNothing(),
    )
  }
  // Only rows whose id is now mapped: a concurrent caller that got there
  // first kept its own. Sized to stay under D1's 100 bound parameters.
  if (entity === 'team') {
    for (const part of chunk(created, 20)) {
      const rows = part.map(
        ({ ref, id }) =>
          sql`(${id}, ${ref.name}, ${'abbreviation' in ref ? ref.abbreviation : ref.name}, ${'logoUrl' in ref ? ref.logoUrl : null})`,
      )
      statements.push(
        db
          .insert(teams)
          .select(
            sql`select v.column1, ${league}, v.column2, v.column3, v.column4 from (values ${sql.join(rows, sql`, `)}) v ${claimed}`,
          ),
      )
    }
  } else if (entity === 'player') {
    for (const part of chunk(created, 45)) {
      const rows = part.map(({ ref, id }) => sql`(${id}, ${ref.name})`)
      statements.push(
        db
          .insert(players)
          .select(
            sql`select v.column1, ${league}, v.column2, null, null, null from (values ${sql.join(rows, sql`, `)}) v ${claimed}`,
          ),
      )
    }
  }
  const [first, ...rest] = statements
  await db.batch([first, ...rest])
  return lookup(
    db,
    entity,
    source,
    unique.map((r) => r.sourceId),
  )
}
