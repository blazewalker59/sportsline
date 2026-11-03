import { describe, expect, it } from 'vitest'
import { espnPause } from '@/lib/sources/espn/common'

describe('espnPause', () => {
  const live = (name: string) => ({ type: { name, state: 'in' as const } })

  it('calls halftime a long break and the end of a quarter a short one', () => {
    expect(espnPause(live('STATUS_HALFTIME'))).toBe('long')
    expect(espnPause(live('STATUS_END_PERIOD'))).toBe('short')
  })

  it('reports no break while play is on, or once the Game is over', () => {
    expect(espnPause(live('STATUS_IN_PROGRESS'))).toBeUndefined()
    expect(
      espnPause({ type: { name: 'STATUS_END_PERIOD', state: 'post' } }),
    ).toBeUndefined()
    expect(espnPause(undefined)).toBeUndefined()
  })
})
