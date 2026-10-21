import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LeaderPlayer, ScoringLeaders } from '@/lib/fantasy/leaders'
import { LeadersView } from '@/components/fantasy/LeagueScreen'

const leader = (over: Partial<LeaderPlayer> = {}): LeaderPlayer => ({
  espnId: 1,
  name: 'Josh Allen',
  positionId: 1,
  proTeamId: 2,
  teamAbbrev: 'BUF',
  starter: true,
  points: 31.24,
  fantasyTeamId: 3,
  fantasyTeam: 'BB',
  mine: false,
  ...over,
})

describe('LeadersView', () => {
  it('lists top scorers and team scores in a points league', () => {
    const leaders: ScoringLeaders = {
      scoringPeriod: 5,
      players: [
        leader(),
        leader({ espnId: 2, name: 'Bench Guy', starter: false }),
      ],
      categories: [],
      teams: [
        {
          teamId: 3,
          name: 'Bronx Bombers',
          abbrev: 'BB',
          score: 120.7,
          mine: true,
        },
      ],
    }
    const html = renderToStaticMarkup(
      <LeadersView sport="football" leaders={leaders} />,
    )
    expect(html).toContain('Top scorers this week')
    expect(html).toContain('31.2')
    expect(html).toContain('BUF · BB')
    expect(html).toContain('bench')
    expect(html).toContain('Team scores this matchup')
    expect(html).toContain('120.7')
  })

  it('names each Category’s leader today in a category league', () => {
    const leaders: ScoringLeaders = {
      scoringPeriod: 85,
      players: [],
      teams: [],
      categories: [
        {
          statId: 0,
          label: 'PTS',
          value: '41',
          player: leader({
            name: 'Luka Dončić',
            teamAbbrev: 'LAL',
            points: 41,
          }),
        },
      ],
    }
    const html = renderToStaticMarkup(
      <LeadersView sport="basketball" leaders={leaders} />,
    )
    expect(html).toContain('Category leaders today')
    expect(html).toContain('PTS')
    expect(html).toContain('Luka Dončić')
    expect(html).toContain('41')
  })
})
