/**
 * Security headers for every response the Worker makes (src/server.ts):
 * pages, server functions, auth, MCP, logos, redirects and the health
 * check. Static assets never reach the Worker; their headers come from
 * public/_headers.
 *
 * The Content-Security-Policy on pages is report-only for now: it lists
 * what the app is known to load, and reports (to CSP_REPORT_PATH) anything
 * else, without blocking it. Only framing is enforced.
 */

/** Where browsers send report-only CSP violations. */
export const CSP_REPORT_PATH = '/csp-report'

/** Images the app shows straight from a Source or provider. */
const IMAGE_HOSTS = [
  // ESPN logos and headshots (NFL, NBA, college football; MLB's fallback).
  'https://a.espncdn.com',
  // MLB team logos and headshots.
  'https://www.mlbstatic.com',
  'https://img.mlbstatic.com',
  // NHL team logos and headshots.
  'https://assets.nhle.com',
  // Sleeper fantasy team avatars.
  'https://sleepercdn.com',
  // Google profile photos of signed-in Viewers (lh3, sometimes lh4–lh6).
  'https://*.googleusercontent.com',
]

/**
 * The report-only policy for a page served at `origin`. `connect-src`
 * names the page's own wss:// (and ws:// in local development) for the
 * /live socket, since older Safari doesn't count those as 'self'; and the
 * image hosts, because sharing a Reaction (modern-screenshot) fetches the
 * images it draws. Fonts are self-hosted, so 'self' covers them.
 */
export function contentSecurityPolicy(origin: URL): string {
  const socket = `${origin.protocol === 'https:' ? 'wss' : 'ws'}://${origin.host}`
  const directives: Record<string, Array<string>> = {
    'default-src': ["'self'"],
    // The theme boot scripts (__root.tsx) and TanStack Start's hydration
    // data are inline and carry no nonce yet.
    'script-src': ["'self'", "'unsafe-inline'"],
    // Team colors are inline style attributes from data.
    'style-src': ["'self'", "'unsafe-inline'"],
    // data: and blob: for the Reaction share image as it renders.
    'img-src': ["'self'", 'data:', 'blob:', ...IMAGE_HOSTS],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", socket, ...IMAGE_HOSTS],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'report-uri': [CSP_REPORT_PATH],
    'report-to': ['csp'],
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

/** Headers every Worker response carries, unless it already set them. */
const COMMON_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
}

function isHtml(response: Response): boolean {
  return (response.headers.get('content-type') ?? '')
    .toLowerCase()
    .startsWith('text/html')
}

/**
 * `response` with the security headers added. A WebSocket upgrade (101)
 * passes through untouched: copying it would drop the socket. Any other
 * response is copied, because responses from `fetch` and
 * `Response.redirect` have immutable headers. A header the response
 * already set is kept.
 */
export function withSecurityHeaders(
  response: Response,
  requestUrl: URL,
): Response {
  const upgrade = response as Response & { webSocket?: unknown }
  if (response.status === 101 || upgrade.webSocket) return response

  const headers = new Headers(response.headers)
  const set = (name: string, value: string) => {
    if (!headers.has(name)) headers.set(name, value)
  }
  for (const [name, value] of Object.entries(COMMON_HEADERS)) set(name, value)
  if (isHtml(response)) {
    // Enforced, but only stops other sites framing the app: nothing the
    // app loads is affected.
    set('Content-Security-Policy', "frame-ancestors 'none'")
    set(
      'Content-Security-Policy-Report-Only',
      contentSecurityPolicy(requestUrl),
    )
    set('Reporting-Endpoints', `csp="${CSP_REPORT_PATH}"`)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/** Most of a CSP report worth logging. */
const MAX_REPORT_CHARS = 4_000
/** A report bigger than this is refused unread. */
const MAX_REPORT_BYTES = 64 * 1024

/**
 * Log a report-only CSP violation (as a warning in Workers Logs) and
 * answer 204. Reports come unauthenticated from any browser, so only a
 * bounded slice of the body is logged and nothing is stored.
 */
export async function receiveCspReport(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_REPORT_BYTES) return new Response(null, { status: 413 })
  try {
    const body = await request.text()
    console.warn('csp-report', body.slice(0, MAX_REPORT_CHARS))
  } catch {
    // An unreadable report is not worth an error.
  }
  return new Response(null, { status: 204 })
}
