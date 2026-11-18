import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CSP_REPORT_PATH,
  contentSecurityPolicy,
  receiveCspReport,
  withSecurityHeaders,
} from '@/lib/securityHeaders'

const PAGE_URL = new URL('https://sportsline.dev/timeline')

function directive(policy: string, name: string): Array<string> {
  const found = policy
    .split('; ')
    .map((part) => part.split(' '))
    .find(([key]) => key === name)
  return found ? found.slice(1) : []
}

describe('withSecurityHeaders', () => {
  it('adds the common headers and a report-only CSP to HTML', async () => {
    const page = new Response('<!doctype html><p>hi</p>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
    const response = withSecurityHeaders(page, PAGE_URL)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<!doctype html><p>hi</p>')
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    )
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('permissions-policy')).toContain('camera=()')
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'",
    )
    expect(response.headers.get('content-security-policy-report-only')).toBe(
      contentSecurityPolicy(PAGE_URL),
    )
    expect(response.headers.get('reporting-endpoints')).toBe(
      `csp="${CSP_REPORT_PATH}"`,
    )
  })

  it('adds the common headers but no CSP to JSON', async () => {
    const json = Response.json({ ok: true })
    const response = withSecurityHeaders(json, PAGE_URL)

    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('strict-transport-security')).not.toBeNull()
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect(
      response.headers.get('content-security-policy-report-only'),
    ).toBeNull()
  })

  it('passes a 101 WebSocket upgrade through untouched', () => {
    const upgrade = { status: 101, headers: new Headers() } as Response
    expect(withSecurityHeaders(upgrade, PAGE_URL)).toBe(upgrade)
    expect(upgrade.headers.has('x-frame-options')).toBe(false)
  })

  it('passes any response carrying a webSocket through untouched', () => {
    const upgrade = {
      status: 200,
      headers: new Headers(),
      webSocket: {},
    } as unknown as Response
    expect(withSecurityHeaders(upgrade, PAGE_URL)).toBe(upgrade)
  })

  it('handles a redirect, whose headers are immutable', () => {
    const redirect = Response.redirect('https://sportsline.dev/', 301)
    const response = withSecurityHeaders(redirect, PAGE_URL)

    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('https://sportsline.dev/')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('keeps a header the response already set', () => {
    const framed = new Response('ok', {
      headers: {
        'x-frame-options': 'SAMEORIGIN',
        'referrer-policy': 'no-referrer',
      },
    })
    const response = withSecurityHeaders(framed, PAGE_URL)

    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('keeps an empty response empty', () => {
    const response = withSecurityHeaders(
      new Response(null, { status: 204 }),
      PAGE_URL,
    )
    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })
})

describe('contentSecurityPolicy', () => {
  it('allows the page’s own live socket', () => {
    expect(directive(contentSecurityPolicy(PAGE_URL), 'connect-src')).toContain(
      'wss://sportsline.dev',
    )
    const local = contentSecurityPolicy(new URL('http://localhost:3000/'))
    expect(directive(local, 'connect-src')).toContain('ws://localhost:3000')
  })

  it('allows the Source and profile image hosts', () => {
    const images = directive(contentSecurityPolicy(PAGE_URL), 'img-src')
    for (const host of [
      'https://a.espncdn.com',
      'https://www.mlbstatic.com',
      'https://img.mlbstatic.com',
      'https://assets.nhle.com',
      'https://sleepercdn.com',
      'https://*.googleusercontent.com',
    ]) {
      expect(images).toContain(host)
    }
  })

  it('allows self-hosted fonts and no font hosts', () => {
    const policy = contentSecurityPolicy(PAGE_URL)
    expect(directive(policy, 'style-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
    ])
    expect(directive(policy, 'font-src')).toEqual(["'self'", 'data:'])
    expect(policy).not.toContain('fonts.googleapis.com')
    expect(policy).not.toContain('fonts.gstatic.com')
  })

  it('reports violations and forbids plugins and framing', () => {
    const policy = contentSecurityPolicy(PAGE_URL)
    expect(directive(policy, 'object-src')).toEqual(["'none'"])
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(policy, 'report-uri')).toEqual([CSP_REPORT_PATH])
    expect(directive(policy, 'report-to')).toEqual(['csp'])
  })
})

describe('receiveCspReport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs a report and answers 204', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await receiveCspReport(
      new Request('https://sportsline.dev/csp-report', {
        method: 'POST',
        body: '{"csp-report":{"blocked-uri":"https://evil.example"}}',
      }),
    )
    expect(response.status).toBe(204)
    expect(warn).toHaveBeenCalledWith(
      'csp-report',
      expect.stringContaining('evil.example'),
    )
  })

  it('logs only the start of a long report', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await receiveCspReport(
      new Request('https://sportsline.dev/csp-report', {
        method: 'POST',
        body: 'x'.repeat(10_000),
      }),
    )
    expect((warn.mock.calls[0]?.[1] as string).length).toBe(4_000)
  })

  it('refuses an oversized report unread', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await receiveCspReport(
      new Request('https://sportsline.dev/csp-report', {
        method: 'POST',
        headers: { 'content-length': String(100 * 1024) },
        body: 'x',
      }),
    )
    expect(response.status).toBe(413)
    expect(warn).not.toHaveBeenCalled()
  })

  it('refuses anything but POST', async () => {
    const response = await receiveCspReport(
      new Request('https://sportsline.dev/csp-report'),
    )
    expect(response.status).toBe(405)
  })
})
