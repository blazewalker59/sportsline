/**
 * A deploy replaces the code chunks a tab was loaded with, so a tab left open
 * across one fails its next lazy import. Reloading picks up the new build;
 * it isn't a bug worth reporting.
 */

/** Each browser's words for a lazy import that failed to load. */
const STALE_BUILD =
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i

const RELOADED_KEY = 'staleBuildReloadedAt'
/** Don't reload again this soon, so a real failure can't loop. */
const RELOAD_GUARD_MS = 60_000

export function isStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return STALE_BUILD.test(message)
}

/** Reload once for a new build; false (and no reload) if we just did. */
export function reloadForNewBuild(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY))
    if (now - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOADED_KEY, String(now))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
