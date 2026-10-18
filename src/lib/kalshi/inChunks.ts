/** Run a query over ids in parts (D1 binds at most 100 parameters). */
export async function inChunks<T>(
  ids: ReadonlyArray<string>,
  query: (part: Array<string>) => Promise<Array<T>>,
): Promise<Array<T>> {
  const out: Array<T> = []
  for (let i = 0; i < ids.length; i += 80) {
    out.push(...(await query(ids.slice(i, i + 80))))
  }
  return out
}
