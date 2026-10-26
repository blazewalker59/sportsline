import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LeaderPlayer, ScoringLeaders } from '@/lib/fantasy/leaders'
import {
  LeadersView,
  TeamBoard,
  positionGroups,
} from '@/components/fantasy/LeadersView'

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

describe('positionGroups', () => {
  it('names each position, merging those that share a name', () => {
    const leaders: ScoringLeaders = {
      scoringPeriod: 5,
      players: [],
      categories: [],
      teams: [],
      positions: [
        { positionId: 7, players: [leader({ espnId: 1, points: 3 })] },
        { positionId: 8, players: [leader({ espnId: 2, points: 9 })] },
        { positionId: 1, players: [leader({ espnId: 3, points: 5 })] },
      ],
    }
    expect(
      positionGroups('baseball', leaders).map((g) => [
        g.label,
        g.players.map((p) => p.espnId),
      ]),
    ).toEqual([
      ['OF', [2, 1]],
      ['SP', [3]],
    ])
  })
})

describe('LeadersView', () => {
  it('offers Teams beside Players where teams are ranked', () => {
    const html = renderToStaticMarkup(
      <LeadersView
        sport="basketball"
        leaders={{
          scoringPeriod: 85,
          players: [],
          teams: [],
          categories: [
            {
              statId: 0,
              label: 'PTS',
              reverse: false,
              players: [{ ...leader(), value: '41' }],
            },
          ],
          teamCategories: [],
          matchupTeamCategories: [
            {
              statId: 0,
              label: 'PTS',
              reverse: false,
              teams: [
                {
                  teamId: 3,
                  name: 'Bronx Bombers',
                  abbrev: 'BB',
                  value: '612',
                  mine: true,
                },
              ],
            },
          ],
        }}
      />,
    )
    expect(html).toContain('>Players<')
    expect(html).toContain('>Teams<')
  })

  it('offers each position in a points league', () => {
    const html = renderToStaticMarkup(
      <LeadersView
        sport="football"
        leaders={{
          scoringPeriod: 5,
          players: [leader()],
          categories: [],
          teams: [],
          positions: [
            { positionId: 1, players: [leader()] },
            {
              positionId: 2,
              players: [leader({ espnId: 9, name: 'Bijan Robinson' })],
            },
          ],
        }}
      />,
    )
    expect(html).toContain('>All<')
    expect(html).toContain('>QB<')
    expect(html).toContain('>RB<')
  })

  it('offers today or the whole matchup in a category league', () => {
    const html = renderToStaticMarkup(
      <LeadersView
        sport="basketball"
        leaders={{
          scoringPeriod: 85,
          players: [],
          teams: [],
          categories: [],
          matchupCategories: [
            {
              statId: 0,
              label: 'PTS',
              reverse: false,
              players: [{ ...leader(), value: '160' }],
            },
          ],
        }}
      />,
    )
    expect(html).toContain('>Today<')
    expect(html).toContain('>Matchup<')
    expect(html).toContain('No stats yet today.')
  })

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
    expect(html).toContain('Scoring leaders this week')
    expect(html).toContain('31.2')
    expect(html).toContain('BUF · BB')
    expect(html).toContain('bench')
    // Players first; Teams one tap away.
    expect(html).toContain('>Teams<')
    expect(html).not.toContain('120.7')
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
          reverse: false,
          players: [
            {
              ...leader({
                name: 'Luka Dončić',
                teamAbbrev: 'LAL',
                points: 41,
              }),
              value: '41',
            },
          ],
        },
        {
          statId: 19,
          label: 'FG%',
          reverse: false,
          minimum: '5+ FGA',
          players: [
            {
              ...leader({ name: 'Jalen Duren' }),
              value: '.900',
              parts: '9-10',
            },
          ],
        },
        {
          statId: 11,
          label: 'TO',
          reverse: true,
          players: [{ ...leader({ name: 'Trae Young' }), value: '7' }],
        },
      ],
    }
    const html = renderToStaticMarkup(
      <LeadersView sport="basketball" leaders={leaders} />,
    )
    expect(html).toContain('Category leaders')
    expect(html).toContain('PTS')
    expect(html).toContain('Luka Dončić')
    expect(html).toContain('41')
    // A rate with its parts; turnovers as the most.
    expect(html).toContain('9-10')
    expect(html).toContain('Trae Young')
    expect(html).toContain('>most<')
    // Each Category one tap from its top Players.
    expect(html).toContain('>FG%<')
    expect(html).toContain('>All<')
  })
})

describe('TeamBoard', () => {
  const lists = [
    {
      statId: 11,
      label: 'TO',
      reverse: true,
      teams: [
        {
          teamId: 4,
          name: 'Careful Club',
          abbrev: 'CC',
          value: '41',
          mine: false,
        },
        {
          teamId: 3,
          name: 'Bronx Bombers',
          abbrev: 'BB',
          value: '58',
          mine: true,
        },
      ],
    },
  ]

  it('names each Category’s leading team', () => {
    const html = renderToStaticMarkup(
      <TeamBoard
        lists={lists}
        chosen={null}
        onChoose={() => {}}
        when="today"
      />,
    )
    expect(html).toContain('Careful Club')
    expect(html).not.toContain('Bronx Bombers')
    expect(html).toContain('TO: every team')
  })

  it('ranks every team in one, lowest first where lower wins', () => {
    const html = renderToStaticMarkup(
      <TeamBoard lists={lists} chosen="11" onChoose={() => {}} when="today" />,
    )
    expect(html).toContain('Lowest first: fewer wins TO.')
    expect(html.indexOf('Careful Club')).toBeLessThan(
      html.indexOf('Bronx Bombers'),
    )
  })
})
