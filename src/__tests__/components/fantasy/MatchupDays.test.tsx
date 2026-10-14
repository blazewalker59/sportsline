import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import basketball from '../../fixtures/fantasy/basketball-category-matchup.json'
import type { MatchupView, WireLeague } from '@/lib/fantasy/matchup'
import { MatchupDays, matchupChoices } from '@/components/fantasy/MatchupDays'
import { sideRecord } from '@/components/fantasy/format'
import { readMatchup } from '@/lib/fantasy/matchup'

const now = new Date('2026-10-13T18:00:00Z')
const m = { scoringPeriod: 85, days: [83, 84, 85, 86] }
const noop = () => {}

describe('MatchupDays', () => {
  it('offers the summary, then each day, today by name', () => {
    expect(matchupChoices(m, m.days, true, now)).toEqual([
      { part: 'summary', top: 'Summary', bottom: 'All days' },
      { part: 83, top: 'Sun', bottom: 'Oct 11' },
      { part: 84, top: 'Mon', bottom: 'Oct 12' },
      { part: 85, top: 'Today', bottom: 'Oct 13' },
      { part: 86, top: 'Wed', bottom: 'Oct 14' },
    ])
    // No summary stored yet: just the days.
    expect(matchupChoices(m, m.days, false, now)[0].part).toBe(83)
  })

  it('names the day in view, and can be opened to choose', () => {
    const html = renderToStaticMarkup(
      <MatchupDays m={m} days={m.days} part={85} onPart={noop} summary />,
    )
    expect(html).toContain('Today')
    expect(html).toContain('Day 3 of 4')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('choose a day or the summary')
  })

  it('shows the summary with nowhere to step', () => {
    const html = renderToStaticMarkup(
      <MatchupDays m={m} days={m.days} part="summary" onPart={noop} summary />,
    )
    expect(html).toContain('Summary')
    expect(html).toContain('The whole matchup so far')
    expect(html.match(/disabled=""/g)).toHaveLength(2)
  })
})

describe('sideRecord', () => {
  const view = (mine: number, theirs: number, ties: number) =>
    ({
      mine: { score: mine },
      opponent: { score: theirs },
      ties,
    }) as MatchupView

  it('reads each side’s categories won, lost and tied, from that side', () => {
    expect(sideRecord(view(0, 0, 9), 'mine')).toBe('0–0–9')
    expect(sideRecord(view(0, 0, 9), 'opponent')).toBe('0–0–9')
    expect(sideRecord(view(5, 3, 1), 'mine')).toBe('5–3–1')
    expect(sideRecord(view(5, 3, 1), 'opponent')).toBe('3–5–1')
    // No ties: just won and lost.
    expect(sideRecord(view(6, 3, 0), 'opponent')).toBe('3–6')
  })

  it('matches a real Matchup’s tally', () => {
    const real = readMatchup(
      'basketball',
      basketball as unknown as WireLeague,
      1,
    )!
    expect(sideRecord(real, 'mine')).toBe('8–1')
    expect(sideRecord(real, 'opponent')).toBe('1–8')
  })
})
