import { describe, expect, it } from 'vitest'
import { fingerprintOf, isAdmin, messageOf } from '@/lib/ops/errors'
import { isStale } from '@/lib/ops/jobs'

describe('grouping errors', () => {
  it('groups the same failure across ids, numbers and quoted values', () => {
    const a = fingerprintOf('kalshi', 'Kalshi 429 for "KXNFLGAME-26OCT05KCBUF"')
    const b = fingerprintOf('kalshi', 'Kalshi 503 for "KXMLBGAME-26OCT04SDMIL"')
    expect(a).toBe(b)
    expect(fingerprintOf('espn', 'ESPN 401')).not.toBe(
      fingerprintOf('kalshi', 'ESPN 401'),
    )
    expect(
      fingerprintOf('job', 'gm_497d7defc3f64cf68ff8 failed after 3 tries'),
    ).toBe('job:gm_# failed after # tries')
  })

  it('reads a message from anything thrown', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
    expect(messageOf('plain')).toBe('plain')
    expect(messageOf({ code: 1 })).toBe('{"code":1}')
  })
})

describe('job heartbeats', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  it('call a job stale with no success in twice its interval', () => {
    const job = { everyMs: 60_000, lastStartedAt: null }
    expect(isStale({ ...job, lastOkAt: '2026-10-05T11:59:00Z' }, now)).toBe(
      false,
    )
    expect(isStale({ ...job, lastOkAt: '2026-10-05T11:57:30Z' }, now)).toBe(
      true,
    )
    expect(isStale({ ...job, lastOkAt: null }, now)).toBe(true)
  })
})

describe('admins', () => {
  it('match by email, ignoring case', () => {
    const env = { ADMIN_EMAILS: 'blazewalker59@gmail.com' }
    expect(isAdmin(env, 'BlazeWalker59@gmail.com')).toBe(true)
    expect(isAdmin(env, 'someone@else.com')).toBe(false)
    expect(isAdmin({}, 'blazewalker59@gmail.com')).toBe(false)
  })
})
