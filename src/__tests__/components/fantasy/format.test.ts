import { describe, expect, it } from 'vitest'
import { STALE_MS, matchupAge } from '@/components/fantasy/format'

const asOf = '2026-10-19T20:00:00.000Z'
const at = (ms: number) => Date.parse(asOf) + ms

describe('matchupAge', () => {
  it('reads fresh scores as fresh', () => {
    expect(matchupAge({ asOf }, at(20_000))).toEqual({
      label: 'now',
      stale: false,
    })
    expect(matchupAge({ asOf }, at(STALE_MS))).toEqual({
      label: '3m',
      stale: false,
    })
  })

  it('flags scores older than their slowest sync', () => {
    expect(matchupAge({ asOf }, at(STALE_MS + 1))).toEqual({
      label: '3m',
      stale: true,
    })
  })

  it('says nothing before a stamp or a client clock', () => {
    expect(matchupAge({}, at(0))).toBeNull()
    expect(matchupAge({ asOf }, null)).toBeNull()
  })
})
