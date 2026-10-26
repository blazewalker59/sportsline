import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AvailablePlayer } from '@/lib/fantasy/freeAgents'
import {
  AvailablePlayers,
  SHOWN,
  availablePositions,
} from '@/components/fantasy/AvailablePlayers'
import { availableTables, sortedBy } from '@/components/fantasy/AvailableTable'

const player = (over: Partial<AvailablePlayer> = {}): AvailablePlayer => ({
  espnId: 1,
  name: 'Keegan Murray',
  positionId: 3,
  proTeamId: 23,
  teamAbbrev: 'SAC',
  injury: null,
  owned: 64.2,
  ownedChange: 3.1,
  waivers: false,
  projected: null,
  ...over,
})

const line = (stats: Record<string, number>) => ({
  stats,
  points: null,
  average: null,
})

const basketball = [
  { statId: 19, label: 'FG%', reverse: false },
  { statId: 0, label: 'PTS', reverse: false },
  { statId: 11, label: 'TO', reverse: true },
]

describe('availablePositions', () => {
  it('names each position, merging those that share a name', () => {
    expect(
      availablePositions('baseball', [
        player({ positionId: 8 }),
        player({ positionId: 1 }),
        player({ positionId: 7 }),
      ]),
    ).toEqual([
      { label: 'SP', ids: [1] },
      { label: 'OF', ids: [7, 8] },
    ])
  })
})

describe('AvailablePlayers', () => {
  const html = renderToStaticMarkup(
    <AvailablePlayers
      sport="basketball"
      provider="espn"
      available={{
        order: 'owned',
        recentLabel: 'Last 15',
        perGame: true,
        categories: basketball,
        players: [
          player({
            playerId: 'pl_1',
            stats: {
              season: line({ 0: 18.24, 13: 7, 14: 15, 11: 1.6 }),
              recent: line({ 0: 21 }),
            },
          }),
          player({
            espnId: 2,
            name: 'Bub Carrington',
            positionId: 1,
            waivers: true,
            injury: 'DAY_TO_DAY',
            owned: 12,
            ownedChange: -1.5,
          }),
        ],
      }}
    />,
  )

  it('lays the stats out in a table under their headers', () => {
    expect(html).toContain('<table')
    for (const header of ['FG%', 'PTS', 'TO', 'Rost%', '+/−'])
      expect(html).toContain(`>${header}</button>`)
    // Per game, shooting as a percentage.
    expect(html).toContain('>.467</td>')
    expect(html).toContain('>18.2</td>')
    expect(html).toContain('>1.6</td>')
    expect(html).not.toContain('21.0')
    expect(html).toContain('>64.2</td>')
    expect(html).toContain('>+3.1</td>')
    expect(html).toContain('>-1.5</td>')
  })

  it('marks waivers and injuries, and opens a matched Player’s page', () => {
    expect(html).toContain('SF · SAC')
    // No moves here: waivers said in the row.
    expect(html).toContain('PG · SAC · Waivers')
    expect(html).toContain('>DTD<')
    expect(
      html.match(/<button[^>]*>(?:(?!<\/button>).)*K\. Murray/),
    ).not.toBeNull()
    expect(
      html.match(/<button[^>]*>(?:(?!<\/button>).)*B\. Carrington/),
    ).toBeNull()
  })

  it('keeps its filters to one line of dropdowns, no chips', () => {
    expect(html).toContain('Search players or teams')
    expect(html).toContain('2 players')
    expect(html).toContain('>All positions</option>')
    expect(html).toContain('>Last 15</option>')
    expect(html).not.toContain('role="tablist"')
  })

  it('lists Sleeper’s by projection, with season points', () => {
    const sleeper = renderToStaticMarkup(
      <AvailablePlayers
        sport="football"
        provider="sleeper"
        available={{
          order: 'projected',
          players: [
            player({
              owned: null,
              ownedChange: null,
              projected: 12.5,
              stats: {
                season: { stats: null, points: 61.5, average: 10.25 },
                recent: null,
              },
            }),
          ],
        }}
      />,
    )
    for (const header of ['FPTS', 'Avg', 'Proj'])
      expect(sleeper).toContain(`>${header}</button>`)
    expect(sleeper).toContain('>61.5</td>')
    expect(sleeper).toContain('>12.5</td>')
    expect(sleeper).not.toContain('Rost%')
  })

  it('shows a page at a time', () => {
    const many = renderToStaticMarkup(
      <AvailablePlayers
        sport="football"
        provider="espn"
        available={{
          order: 'owned',
          players: Array.from({ length: SHOWN + 7 }, (_, i) =>
            player({ espnId: i + 1 }),
          ),
        }}
      />,
    )
    expect(many).toContain('Show more (7)')
  })
})

describe('availableTables', () => {
  it('splits baseball into batters and pitchers, each with its columns', () => {
    const tables = availableTables(
      'baseball',
      {
        order: 'owned',
        perGame: false,
        categories: [
          { statId: 5, label: 'HR', reverse: false },
          { statId: 2, label: 'AVG', reverse: false },
          { statId: 47, label: 'ERA', reverse: true },
        ],
        players: [],
      },
      [player({ positionId: 7 }), player({ espnId: 2, positionId: 1 })],
    )
    expect(
      tables.map((t) => [
        t.title,
        t.players.map((p) => p.espnId),
        t.columns.map((c) => c.label),
      ]),
    ).toEqual([
      ['Batters', [1], ['HR', 'H/AB', 'Rost%', '+/−']],
      ['Pitchers', [2], ['ERA', 'Rost%', '+/−']],
    ])
  })
})

describe('sortedBy', () => {
  const [table] = availableTables(
    'basketball',
    { order: 'owned', perGame: true, categories: basketball, players: [] },
    [],
  )
  const col = (label: string) => table.columns.find((c) => c.label === label)!
  const players = [
    player({
      espnId: 1,
      stats: { season: line({ 0: 10, 11: 3 }), recent: null },
    }),
    player({
      espnId: 2,
      stats: { season: line({ 0: 20, 11: 1 }), recent: null },
    }),
    // No stats: last, whichever way.
    player({ espnId: 3 }),
  ]
  const ids = (ps: Array<AvailablePlayer>) => ps.map((p) => p.espnId)

  it('sorts best first, then the other way, nothing last', () => {
    expect(ids(sortedBy(players, col('PTS'), 'season', false))).toEqual([
      2, 1, 3,
    ])
    expect(ids(sortedBy(players, col('PTS'), 'season', true))).toEqual([
      1, 2, 3,
    ])
  })

  it('sorts lowest first where lower is better', () => {
    expect(ids(sortedBy(players, col('TO'), 'season', false))).toEqual([
      2, 1, 3,
    ])
  })
})
