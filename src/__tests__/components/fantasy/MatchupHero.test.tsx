import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import football from '../../fixtures/fantasy/football-matchup-2026-week-1.json'
import type { MatchupView, WireLeague } from '@/lib/fantasy/matchup'
import {
  MatchupScoreboard,
  periodLabel,
} from '@/components/fantasy/MatchupHero'
import { readMatchup } from '@/lib/fantasy/matchup'

const view = (): MatchupView => {
  const league = football as unknown as WireLeague
  const home = league.schedule!.find(
    (m) => m.matchupPeriodId === league.status!.currentMatchupPeriod,
  )!.home!.teamId!
  return readMatchup('football', league, home)!
}

describe('MatchupScoreboard', () => {
  it('sets both scores in heavy Inter, never dots, over the projection meter', () => {
    const m = view()
    const html = renderToStaticMarkup(<MatchupScoreboard m={m} own />)
    expect(html.match(/font-extrabold/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('font-dots')
    expect(html).toContain(m.mine.score.toFixed(1))
    expect(html).toContain('role="meter"')
    if (m.mine.projected !== null)
      expect(html).toContain(`Projected ${m.mine.projected.toFixed(1)}`)
    expect(html).toContain(' · you')
  })

  it('lights only the Viewer’s own side, and only while it leads', () => {
    const m = view()
    const ahead: MatchupView = {
      ...m,
      mine: { ...m.mine, score: 120 },
      opponent: { ...m.opponent!, score: 80 },
    }
    expect(renderToStaticMarkup(<MatchupScoreboard m={ahead} own />)).toContain(
      'text-scoring',
    )
    expect(
      renderToStaticMarkup(<MatchupScoreboard m={ahead} own={false} />),
    ).not.toContain('text-scoring')
    const behind = { ...ahead, mine: { ...ahead.mine, score: 60 } }
    expect(
      renderToStaticMarkup(<MatchupScoreboard m={behind} own />),
    ).not.toContain('text-scoring')
  })

  it('counts Starters in play and to go under the meter', () => {
    const html = renderToStaticMarkup(
      <MatchupScoreboard m={view()} own inPlay={{ live: 3, toGo: 2 }} />,
    )
    expect(html).toContain('3 in play · 2 to go')
  })

  it('names the period as its sport does', () => {
    expect(periodLabel({ sport: 'football', matchupPeriod: 12 })).toBe(
      'Week 12',
    )
    expect(periodLabel({ sport: 'basketball', matchupPeriod: 6 })).toBe(
      'Matchup 6',
    )
  })
})
