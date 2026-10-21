import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ActivityPlayer, LeagueActivity } from '@/lib/fantasy/activity'
import {
  ActivityFeed,
  activityDays,
  tradeSides,
} from '@/components/fantasy/ActivityFeed'

const player = (espnId: number, name: string): ActivityPlayer => ({
  espnId,
  name,
  positionId: null,
  proTeamId: null,
  teamAbbrev: 'BUF',
})

const activity: LeagueActivity = {
  teams: [
    { teamId: 3, name: 'Bronx Bombers', abbrev: 'BB' },
    { teamId: 9, name: 'Taco Corp', abbrev: 'TACO' },
  ],
  entries: [
    {
      id: 'trade',
      kind: 'trade',
      at: '2026-10-20T01:00:00Z',
      teamIds: [3, 9],
      items: [
        {
          action: 'add',
          player: player(8, 'Josh Allen'),
          fromTeamId: 9,
          toTeamId: 3,
        },
        {
          action: 'add',
          player: player(11, 'Bijan Robinson'),
          fromTeamId: 3,
          toTeamId: 9,
        },
        {
          action: 'add',
          player: player(12, 'Dalton Kincaid'),
          fromTeamId: 9,
          toTeamId: 3,
        },
      ],
      bid: null,
    },
    {
      id: 'claim',
      kind: 'waiver',
      at: '2026-10-19T09:00:00Z',
      teamIds: [9],
      items: [
        {
          action: 'add',
          player: player(4, 'Keon Coleman'),
          fromTeamId: null,
          toTeamId: 9,
        },
        {
          action: 'drop',
          player: player(5, 'Ty Johnson'),
          fromTeamId: 9,
          toTeamId: null,
        },
      ],
      bid: 12,
      claims: [
        { teamId: 9, bid: 12, won: true },
        { teamId: 3, bid: 8, won: false },
      ],
    },
  ],
}

describe('ActivityFeed', () => {
  const html = renderToStaticMarkup(
    <ActivityFeed
      sport="football"
      activity={activity}
      mine={3}
      timeZone="America/New_York"
    />,
  )

  it('groups moves by day in the Viewer’s zone', () => {
    expect(
      activityDays(activity.entries, 'America/New_York').map((d) => d.day),
    ).toEqual(['Mon, Oct 19'])
    expect(activityDays(activity.entries, 'UTC').map((d) => d.day)).toEqual([
      'Tue, Oct 20',
      'Mon, Oct 19',
    ])
  })

  it('says who moved and what, adds and drops marked', () => {
    expect(html).toContain('Taco Corp')
    expect(html).toContain('Waiver claim · $12')
    expect(html).toContain('aria-label="Added"')
    expect(html).toContain('aria-label="Dropped"')
    expect(html).toContain('Keon Coleman')
  })

  it('lists each side of a trade together, by who gets them', () => {
    expect(html).toContain('Bronx Bombers ⇄ Taco Corp')
    expect(
      tradeSides(activity.entries[0]).map((side) => [
        side.teamId,
        side.items.map((i) => i.player.name),
      ]),
    ).toEqual([
      [3, ['Josh Allen', 'Dalton Kincaid']],
      [9, ['Bijan Robinson']],
    ])
    expect(html).toContain('To Bronx Bombers')
    expect(html).toContain('To Taco Corp')
  })

  it('opens a contested waiver claim to every team’s claim', () => {
    expect(html).toContain('1 other claim ›')
    expect(html).toContain('Won')
    expect(html).toContain('Lost')
    expect(html).toContain('$8')
  })

  it('says when there’s nothing yet', () => {
    expect(
      renderToStaticMarkup(
        <ActivityFeed
          sport="football"
          activity={{ teams: [], entries: [] }}
          mine={null}
          timeZone={null}
        />,
      ),
    ).toContain('No moves in this league yet.')
  })
})
