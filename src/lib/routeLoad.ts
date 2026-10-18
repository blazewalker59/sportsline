/**
 * How a route's loader warms the query cache. On the server it waits, so the
 * page renders with its data and the cache travels to the browser with it.
 * In the browser it only starts the fetch: the screen opens straight away
 * on whatever is cached and shows its own loading, as it always has.
 */
export async function warm(work: Promise<unknown>): Promise<void> {
  const settled = work.then(
    () => undefined,
    // A failed prefetch isn't fatal: the screen's own query retries it.
    () => undefined,
  )
  if (typeof window === 'undefined') await settled
}
