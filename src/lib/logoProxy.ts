/**
 * Same-origin copies of team and league logos, so a Play can be drawn into
 * a shareable image (a canvas only reads cross-origin images served with
 * CORS, which NHL.com's logos are not). Only the logo hosts we use.
 */

export const LOGO_PATH = '/logo'

const ALLOWED_HOSTS = new Set([
  'a.espncdn.com',
  'www.mlbstatic.com',
  'assets.nhle.com',
])
const MAX_AGE = 7 * 24 * 60 * 60

/** The same-origin URL for a logo, or the original when it can't be proxied. */
export function proxiedLogo(url: string | null): string | null {
  if (!url) return url
  try {
    return ALLOWED_HOSTS.has(new URL(url).hostname)
      ? `${LOGO_PATH}?u=${encodeURIComponent(url)}`
      : url
  } catch {
    return url
  }
}

export async function serveLogo(url: URL): Promise<Response> {
  let target: URL
  try {
    target = new URL(url.searchParams.get('u') ?? '')
  } catch {
    return new Response('Bad logo URL', { status: 400 })
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response('Logo host not allowed', { status: 403 })
  }
  const upstream = await fetch(target.toString(), {
    cf: { cacheTtl: MAX_AGE, cacheEverything: true },
  } as RequestInit)
  const type = upstream.headers.get('content-type') ?? ''
  if (!upstream.ok || !type.startsWith('image/')) {
    return new Response('Logo unavailable', { status: 502 })
  }
  return new Response(upstream.body, {
    headers: {
      'content-type': type,
      'cache-control': `public, max-age=${MAX_AGE}`,
      'access-control-allow-origin': '*',
    },
  })
}
