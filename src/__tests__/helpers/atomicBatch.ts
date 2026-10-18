/**
 * D1's `db.batch` runs its statements as one transaction. The sqliteDb
 * helper only runs them in order; this one rolls back like D1 does, for
 * tests of what must be all or nothing. Bun only.
 */

type Runnable = { run: () => unknown }

export function atomicBatch(
  sqlite: { transaction: (fn: () => void) => () => void },
  db: { batch: (queries: Array<Runnable>) => Promise<Array<unknown>> },
): void {
  db.batch = (queries) => {
    const results: Array<unknown> = []
    try {
      // Bun's driver runs each statement synchronously.
      sqlite.transaction(() => {
        for (const query of queries) results.push(query.run())
      })()
    } catch (error) {
      return Promise.reject(error)
    }
    return Promise.resolve(results)
  }
}
