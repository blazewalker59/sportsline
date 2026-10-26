import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AvailablePlayer } from '@/lib/fantasy/freeAgents'
import {
  AvailablePlayers,
  SHOWN,
  availablePositions,
} from '@/components/fantasy/AvailablePlayers'

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
  it('lists ESPN’s with how rostered, waivers and injuries marked', () => {
    const html = renderToStaticMarkup(
      <AvailablePlayers
        sport="basketball"
        provider="espn"
        available={{
          order: 'owned',
          players: [
            player(),
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
    expect(html).toContain('Search players or teams')
    expect(html).toContain('>All<')
    expect(html).toContain('>PG<')
    expect(html).toContain('64.2%')
    expect(html).toContain('+3.1')
    expect(html).toContain('-1.5')
    expect(html).toContain('SAC · SF')
    expect(html).toContain('Waivers')
    expect(html).toContain('Day-to-day')
    expect(html).toContain('2 most rostered')
  })

  it('shows each Player’s stats, and opens their page', () => {
    const html = renderToStaticMarkup(
      <AvailablePlayers
        sport="basketball"
        provider="espn"
        available={{
          order: 'owned',
          recentLabel: 'Last 15',
          players: [
            player({
              playerId: 'pl_1',
              stats: {
                season: [{ label: 'PTS', value: '18.2' }],
                recent: [{ label: 'PTS', value: '21.0' }],
              },
            }),
            // Not matched to ours yet: no page to open.
            player({ espnId: 2, name: 'Unmatched Guy' }),
          ],
        }}
      />,
    )
    expect(html).toContain('>18.2</span>')
    expect(html).not.toContain('21.0')
    expect(html).toContain('>Season<')
    expect(html).toContain('>Last 15<')
    expect(
      html.match(/<button[^>]*>(?:(?!<\/button>).)*Keegan Murray/),
    ).not.toBeNull()
    expect(
      html.match(/<button[^>]*>(?:(?!<\/button>).)*Unmatched Guy/),
    ).toBeNull()
  })

  it('lists Sleeper’s by projection', () => {
    const html = renderToStaticMarkup(
      <AvailablePlayers
        sport="football"
        provider="sleeper"
        available={{
          order: 'projected',
          players: [
            player({ owned: null, ownedChange: null, projected: 12.5 }),
          ],
        }}
      />,
    )
    expect(html).toContain('12.5')
    expect(html).toContain('proj')
    expect(html).toContain('most projected this week')
  })

  it('shows a page at a time', () => {
    const html = renderToStaticMarkup(
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
    expect(html).toContain('Show more (7)')
  })
})
