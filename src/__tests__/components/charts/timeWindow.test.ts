import { describe, expect, it } from 'vitest'
import {
  actionWindow,
  sameWindow,
  windowTicks,
  withinWindow,
} from '@/components/charts/timeWindow'

const MIN = 60_000
const HOUR = 60 * MIN
const at = (h: number, m = 0) => Date.UTC(2026, 9, 14, h, m)
const opts = { gapMs: 45 * MIN, leadMs: 10 * MIN }

describe('actionWindow', () => {
  it('opens on the latest stretch, not when the Prediction was bought', () => {
    // Bought at 15:50; quiet until the games, then scores from 19:10 on.
    const extent = { start: at(15, 50), end: at(22, 0) }
    const moments = [at(19, 10), at(19, 40), at(20, 15), at(20, 50), at(21, 30)]
    expect(actionWindow(extent, moments, opts)).toEqual({
      start: at(19, 0),
      end: at(22, 0),
    })
  })

  it('splits on a long quiet spell and takes the latest stretch', () => {
    const extent = { start: at(0), end: at(23) }
    const moments = [at(1), at(1, 20), at(18), at(18, 30), at(19)]
    expect(actionWindow(extent, moments, opts).start).toBe(at(17, 50))
  })

  it('shows everything with nothing happening, or the action filling it', () => {
    const extent = { start: at(12), end: at(16) }
    expect(actionWindow(extent, [], opts)).toEqual(extent)
    expect(
      actionWindow(extent, [at(12, 30), at(13), at(13, 40)], opts),
    ).toEqual(extent)
  })

  it('never opens narrower than the minimum', () => {
    const extent = { start: at(10), end: at(20) }
    expect(actionWindow(extent, [at(19, 55)], opts)).toEqual({
      start: at(20) - 30 * MIN,
      end: at(20),
    })
  })

  it('ignores moments outside the series', () => {
    const extent = { start: at(10), end: at(20) }
    expect(actionWindow(extent, [at(8), at(21)], opts)).toEqual(extent)
  })
})

describe('withinWindow', () => {
  const rows = [1, 2, 3, 4, 5, 6].map((h) => ({ t: h * HOUR }))

  it('keeps the rows inside, plus one either side', () => {
    expect(
      withinWindow(rows, { start: 2.5 * HOUR, end: 4.5 * HOUR }).map(
        (r) => r.t / HOUR,
      ),
    ).toEqual([2, 3, 4, 5])
  })

  it('keeps the last row when the window is past the data', () => {
    expect(withinWindow(rows, { start: 9 * HOUR, end: 10 * HOUR })).toEqual([
      { t: 6 * HOUR },
    ])
  })
})

it('compares windows to the minute and spaces ticks across one', () => {
  expect(
    sameWindow({ start: 0, end: HOUR }, { start: 10, end: HOUR - 10 }),
  ).toBe(true)
  expect(windowTicks({ start: 0, end: 3 * HOUR })).toEqual([
    0,
    HOUR,
    2 * HOUR,
    3 * HOUR,
  ])
})
