import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '@/lib/model/timeline'
import {
  alertMessage,
  fantasyEvent,
  isAlertCandidate,
  isFollowingAlertable,
  isPredictionPlayAlertable,
} from '@/lib/push/alerts'
import { swingTitle } from '@/lib/push/predictionAlerts'

const now = Date.parse('2026-10-02T03:00:00Z')

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'g1~play:1',
    gameId: 'g1',
    league: 'nfl',
    sportsDay: '2026-10-01',
    kind: 'play',
    side: 'away',
    sequence: 1,
    occurredAt: '2026-10-02T02:59:00Z',
    segmentLabel: 'Q4 1:42',
    score: { away: 24, home: 24 },
    awayTeam: { id: 'a', abbreviation: 'PIT', logoUrl: null },
    homeTeam: { id: 'h', abbreviation: 'CLE', logoUrl: null },
    description:
      '(Shotgun) A.Rodgers pass short right to P.Freiermuth for 3 yards, TOUCHDOWN.',
    playType: 'Passing Touchdown',
    significance: 'scoring',
    milestone: null,
    status: 'active',
    revisedAt: null,
    overturnOf: null,
    players: [],
    detail: null,
    ...overrides,
  }
}

const final = item({
  kind: 'milestone',
  milestone: 'final',
  significance: null,
  description: 'Final: PIT 24, CLE 27',
})

describe('Following Alerts', () => {
  it('send fresh Scoring Plays, Overturns and Finals at "scores"', () => {
    const at = (i: TimelineItem) => isFollowingAlertable(i, 'scores', now)
    expect(at(item())).toBe(true)
    expect(at(item({ significance: 'notable' }))).toBe(false)
    expect(at(item({ kind: 'overturn' }))).toBe(true)
    expect(at(final)).toBe(true)
    expect(
      at(
        item({
          kind: 'milestone',
          milestone: 'segment_end',
          significance: null,
        }),
      ),
    ).toBe(false)
  })

  it('send only Finals at "finals", nothing when off, never history', () => {
    expect(isFollowingAlertable(item(), 'finals', now)).toBe(false)
    expect(isFollowingAlertable(final, 'finals', now)).toBe(true)
    expect(isFollowingAlertable(final, 'off', now)).toBe(false)
    expect(
      isFollowingAlertable(
        item({ occurredAt: '2026-10-02T02:00:00Z' }),
        'scores',
        now,
      ),
    ).toBe(false)
  })
})

describe('Prediction play Alerts', () => {
  it('send a Game’s Scoring Plays only at "every score", never Notable ones', () => {
    expect(isPredictionPlayAlertable(item(), 'key', now)).toBe(false)
    expect(isPredictionPlayAlertable(item(), 'scores', now)).toBe(true)
    expect(
      isPredictionPlayAlertable(
        item({ significance: 'notable' }),
        'scores',
        now,
      ),
    ).toBe(false)
  })

  it('swing titles show the chance now and the move since last heard', () => {
    expect(swingTitle('Browns win', 0.63, 0.52)).toBe(
      'PREDICTION · Browns win: 63% ▲11',
    )
    expect(swingTitle('Browns win', 0.4, 0.52)).toBe(
      'PREDICTION · Browns win: 40% ▼12',
    )
  })
})

describe('Fantasy key events', () => {
  const td = item({
    players: [
      { id: 'qb', name: 'Aaron Rodgers', role: 'passer' },
      { id: 'te', name: 'Pat Freiermuth', role: 'receiver' },
      { id: 'ls', name: 'Christian Kuntz', role: 'snapper' },
    ],
  })

  it('credit the players who made a score, on either side', () => {
    expect(fantasyEvent(td, 'qb', 'mine', 'key', now)).toBe('score')
    expect(fantasyEvent(td, 'te', 'opponent', 'key', now)).toBe('score')
    expect(fantasyEvent(td, 'ls', 'mine', 'key', now)).toBeNull()
    expect(fantasyEvent(td, 'te', 'opponent', 'mine', now)).toBeNull()
    expect(fantasyEvent(td, 'qb', 'mine', 'off', now)).toBeNull()
  })

  it('count a kicker’s field goals, not extra points', () => {
    const kick = (playType: string) =>
      item({
        playType,
        players: [{ id: 'k', name: 'Chris Boswell', role: 'kicker' }],
      })
    expect(fantasyEvent(kick('Field Goal Good'), 'k', 'mine', 'key', now)).toBe(
      'score',
    )
    expect(
      fantasyEvent(kick('Extra Point Good'), 'k', 'mine', 'key', now),
    ).toBeNull()
  })

  it('call a long gain a big play for the Viewer’s own Starter only', () => {
    const long = item({
      significance: 'notable',
      playType: 'Pass Reception',
      detail: { yards: 38 },
      players: [{ id: 'wr', name: 'George Pickens', role: 'receiver' }],
    })
    expect(fantasyEvent(long, 'wr', 'mine', 'key', now)).toBe('big')
    expect(fantasyEvent(long, 'wr', 'opponent', 'key', now)).toBeNull()
    const sack = item({
      significance: 'notable',
      playType: 'Sack',
      players: [{ id: 'qb', name: 'Aaron Rodgers', role: 'passer' }],
    })
    expect(fantasyEvent(sack, 'qb', 'mine', 'key', now)).toBeNull()
  })
})

describe('Alert candidates', () => {
  it('leave out Notable Plays that no level Alerts on', () => {
    expect(isAlertCandidate(item(), now)).toBe(true)
    expect(isAlertCandidate(final, now)).toBe(true)
    expect(
      isAlertCandidate(
        item({ significance: 'notable', playType: 'penalty' }),
        now,
      ),
    ).toBe(false)
    expect(
      isAlertCandidate(
        item({ significance: 'notable', detail: { yards: 30 } }),
        now,
      ),
    ).toBe(true)
  })
})

describe('alertMessage', () => {
  it('leads a Follow’s Alert with its source and who scored', () => {
    const m = alertMessage(item())
    expect(m.title).toBe('FOLLOWING · PIT touchdown')
    expect(m.body).toBe(
      'PIT 24–24 CLE · Q4 1:42 · A.Rodgers pass short right to P.Freiermuth for 3 yards, TOUCHDOWN.',
    )
    expect(m.url).toBe('/?game=g1&play=g1~play%3A1&day=2026-10-01')
    expect(m.tag).toBe('g1')
  })

  it('leads a Prediction’s with the pick and its odds', () => {
    const m = alertMessage(item(), {
      source: 'prediction',
      prediction: 'Steelers win: 58%',
    })
    expect(m.title).toBe('PREDICTION · Steelers win: 58%')
    expect(m.body).toMatch(/^Touchdown · PIT 24–24 CLE · Q4 1:42 · /)
  })

  it('leads a Fantasy one with whose Starter and what they did', () => {
    const m = alertMessage(item(), {
      source: 'fantasy',
      side: 'mine',
      player: 'Rodgers',
      matchup: 'Flex Gods 98–87',
    })
    expect(m.title).toBe('FANTASY · Your Rodgers · Touchdown')
    expect(m.body).toMatch(/TOUCHDOWN\. · PIT 24–24 CLE · Flex Gods 98–87$/)
    expect(
      alertMessage(item(), {
        source: 'fantasy',
        side: 'opponent',
        player: 'Rodgers',
        matchup: null,
      }).title,
    ).toBe('FANTASY · Opp. Rodgers · Touchdown')
  })

  it('makes a Final its own Alert that opens the Game', () => {
    expect(alertMessage(final)).toMatchObject({
      title: 'FOLLOWING · Final',
      body: 'Final: PIT 24, CLE 27',
      final: true,
      url: '/?game=g1&day=2026-10-01',
    })
  })
})
