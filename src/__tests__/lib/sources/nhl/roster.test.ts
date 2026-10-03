import { describe, expect, it } from 'vitest'
import { nhlSeasons } from '@/lib/sources/nhl'
import { parseRoster } from '@/lib/sources/nhl/parse'

describe('NHL parseRoster (season bios)', () => {
  const roster = parseRoster(
    {
      data: [
        { id: 10, fullName: 'Toronto Maple Leafs', triCode: 'TOR' },
        // Utah's code twice: the current club has the higher id.
        { id: 59, fullName: 'Utah Hockey Club', triCode: 'UTA' },
        { id: 68, fullName: 'Utah Mammoth', triCode: 'UTA' },
      ],
    },
    {
      standings: [
        { teamAbbrev: { default: 'TOR' } },
        { teamAbbrev: { default: 'UTA' } },
      ],
    },
    [
      {
        data: [
          {
            playerId: 1,
            skaterFullName: 'Auston Matthews',
            positionCode: 'C',
            currentTeamAbbrev: 'TOR',
          },
          {
            playerId: 2,
            skaterFullName: 'Retired Guy',
            positionCode: 'D',
            currentTeamAbbrev: null,
          },
        ],
      },
      {
        // Last season's bios repeat a current player: listed once.
        data: [
          {
            playerId: 1,
            skaterFullName: 'Auston Matthews',
            positionCode: 'C',
            currentTeamAbbrev: 'TOR',
          },
          {
            playerId: 3,
            goalieFullName: 'Karel Vejmelka',
            currentTeamAbbrev: 'UTA',
          },
        ],
      },
    ],
    '20262027',
  )

  it('lists each current player once, on their current team', () => {
    expect(roster.teams.map((t) => t.sourceId).sort()).toEqual(['10', '68'])
    expect(roster.players).toEqual([
      {
        sourceId: '1',
        name: 'Auston Matthews',
        teamSourceId: '10',
        position: 'C',
        headshotUrl: 'https://assets.nhle.com/mugs/nhl/20262027/TOR/1.png',
      },
      {
        sourceId: '3',
        name: 'Karel Vejmelka',
        teamSourceId: '68',
        position: 'G',
        headshotUrl: 'https://assets.nhle.com/mugs/nhl/20262027/UTA/3.png',
      },
    ])
  })
})

describe('nhlSeasons', () => {
  it("rolls over with September's preseason", () => {
    expect(nhlSeasons(new Date('2026-10-02T12:00:00Z'))).toEqual([
      '20262027',
      '20252026',
    ])
    expect(nhlSeasons(new Date('2026-09-20T12:00:00Z'))[0]).toBe('20262027')
    expect(nhlSeasons(new Date('2027-05-01T12:00:00Z'))[0]).toBe('20262027')
  })
})
