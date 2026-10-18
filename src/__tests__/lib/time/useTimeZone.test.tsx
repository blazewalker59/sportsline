// @vitest-environment happy-dom
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clockTime } from '@/lib/time/format'
import { TimeZoneProvider, useTimeZone } from '@/lib/time/useTimeZone'

// The browser is in Los Angeles, whatever zone the tests run in.
vi.mock('@/lib/time/format', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runtimeTimeZone: () => 'America/Los_Angeles',
}))

// 4:05 PM in New York, 1:05 PM in Los Angeles.
const PITCH = '2026-10-18T20:05:00Z'

function Pitch() {
  return <p>{clockTime(PITCH, useTimeZone())}</p>
}

/**
 * Server-render with the zone the server knew, hydrate with the zone the
 * client was handed, and report what hydration made of it.
 */
function hydrate(server: string | null, client: string | null) {
  const html = renderToString(
    <TimeZoneProvider zone={server}>
      <Pitch />
    </TimeZoneProvider>,
  )
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const errors: Array<unknown> = []
  act(() => {
    hydrateRoot(
      container,
      <TimeZoneProvider zone={client}>
        <Pitch />
      </TimeZoneProvider>,
      { onRecoverableError: (e) => errors.push(e) },
    )
  })
  return { html, errors, after: container.textContent }
}

afterEach(() => {
  document.body.innerHTML = ''
  document.cookie = 'tz=; Max-Age=0; Path=/'
})

describe('useTimeZone', () => {
  it('renders in the cookie’s zone, then moves to the browser’s', () => {
    const r = hydrate('America/New_York', 'America/New_York')
    expect(r.html).toContain('4:05 PM')
    expect(r.errors).toEqual([])
    expect(r.after).toBe('1:05 PM')
  })

  it('leaves times blank on a first visit, then fills them in', () => {
    const r = hydrate(null, null)
    expect(r.html).toBe('<p></p>')
    expect(r.errors).toEqual([])
    expect(r.after).toBe('1:05 PM')
  })

  it('would fail hydration if the client disagreed with the server', () => {
    const r = hydrate('America/New_York', null)
    expect(r.errors).not.toEqual([])
  })

  it('leaves the browser’s zone in the cookie for the next render', () => {
    hydrate(null, null)
    expect(document.cookie).toContain('tz=America%2FLos_Angeles')
  })
})
