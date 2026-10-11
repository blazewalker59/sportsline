/**
 * Polite bulk fetching for roster syncs: a few requests at a time, retrying
 * when a Source rate-limits. Firing a League's 30-70 roster calls at once
 * gets NHL.com to answer 429.
 */

/** Roster calls in flight at once: a burst of every team gets rate-limited. */
export const ROSTER_CONCURRENCY = 6

/** Map over items with at most `limit` calls in flight, keeping order. */
export async function mapPool<T, TResult>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T) => Promise<TResult>,
): Promise<Array<TResult>> {
  const results = new Array<TResult>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 10_000

/**
 * fetch, retrying 429s and 5xxs with backoff (honoring Retry-After). Any
 * other response, or the last attempt's, is returned as is.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init)
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= MAX_ATTEMPTS) return res
    const retryAfter = Number(res.headers.get('retry-after'))
    const delay = Math.min(
      MAX_DELAY_MS,
      retryAfter > 0 ? retryAfter * 1_000 : BASE_DELAY_MS * 2 ** (attempt - 1),
    )
    await sleep(delay)
  }
}

/**
 * GET JSON, retrying 429s and 5xxs. `source` names the API in the error
 * (`ESPN 429 for https://…`). The reader is what shared ESPN helpers take.
 */
export function getJson(source: string): <T>(url: string) => Promise<T> {
  return async <T>(url: string): Promise<T> => {
    const res = await fetchWithRetry(url, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`${source} ${res.status} for ${url}`)
    return (await res.json()) as T
  }
}
