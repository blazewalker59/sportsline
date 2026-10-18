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
/** A Source call that hasn't answered in this long is abandoned. */
export const FETCH_TIMEOUT_MS = 8_000

export interface FetchOptions {
  /** Calls made before giving up on 429s and 5xxs; 1 never retries. */
  attempts?: number
  /** Per attempt, body included, in milliseconds. */
  timeoutMs?: number
}

/**
 * A live poll's reads: a single attempt, since LiveGame's pacing already
 * backs off after a failed poll and a 429 retried inside one only adds to it.
 */
export const LIVE_POLL: FetchOptions = { attempts: 1 }

/**
 * fetch, retrying 429s and 5xxs with backoff (honoring Retry-After), each
 * attempt abandoned after `timeoutMs`. Any other response, or the last
 * attempt's, is returned as is.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
  { attempts = MAX_ATTEMPTS, timeoutMs = FETCH_TIMEOUT_MS }: FetchOptions = {},
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const res = await fetch(url, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    })
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= attempts) return res
    const retryAfter = Number(res.headers.get('retry-after'))
    const delay = Math.min(
      MAX_DELAY_MS,
      retryAfter > 0 ? retryAfter * 1_000 : BASE_DELAY_MS * 2 ** (attempt - 1),
    )
    await sleep(delay)
  }
}

/**
 * ESPN's edge answers 403 to some runtime defaults (`Bun/1.3`, since
 * October 2026) and its Fantasy API to Workers' missing one, so Source
 * calls pass as a browser.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

/**
 * GET JSON, retrying 429s and 5xxs unless `options` say otherwise (a live
 * poll passes LIVE_POLL). `source` names the API in the error (`ESPN 429
 * for https://…`, `NHL timed out after 8000ms for https://…`). The reader
 * is what shared ESPN helpers take.
 */
export function getJson(
  source: string,
  options: FetchOptions = {},
): <T>(url: string) => Promise<T> {
  return async <T>(url: string): Promise<T> => {
    try {
      const res = await fetchWithRetry(
        url,
        {
          headers: {
            accept: 'application/json',
            'user-agent': BROWSER_USER_AGENT,
          },
        },
        undefined,
        options,
      )
      if (!res.ok) throw new Error(`${source} ${res.status} for ${url}`)
      return (await res.json()) as T
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        const ms = options.timeoutMs ?? FETCH_TIMEOUT_MS
        throw new Error(`${source} timed out after ${ms}ms for ${url}`)
      }
      throw error
    }
  }
}
