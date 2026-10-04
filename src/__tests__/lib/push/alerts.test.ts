import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '@/lib/model/timeline'
import { alertMessage, isAlertable } from '@/lib/push/alerts'

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

describe('isAlertable', () => {
  it('alerts fresh Scoring Plays, Overturns and Finals only', () => {
    expect(isAlertable(item(), now)).toBe(true)
    expect(isAlertable(item({ significance: 'notable' }), now)).toBe(false)
    expect(isAlertable(item({ kind: 'overturn' }), now)).toBe(true)
    expect(
      isAlertable(
        item({ kind: 'milestone', milestone: 'final', significance: null }),
        now,
      ),
    ).toBe(true)
    expect(
      isAlertable(
        item({
          kind: 'milestone',
          milestone: 'segment_end',
          significance: null,
        }),
        now,
      ),
    ).toBe(false)
  })

  it('never alerts history', () => {
    expect(isAlertable(item({ occurredAt: '2026-10-02T02:00:00Z' }), now)).toBe(
      false,
    )
  })
})

describe('alertMessage', () => {
  it('leads with the headline and score, then the cleaned play, and opens the Play', () => {
    const m = alertMessage(item())
    expect(m.title).toBe('Touchdown · PIT 24–24 CLE')
    expect(m.body).toBe(
      'A.Rodgers pass short right to P.Freiermuth for 3 yards, TOUCHDOWN.',
    )
    expect(m.url).toBe('/?game=g1&play=g1~play%3A1&day=2026-10-01')
    expect(m.tag).toBe('g1')
  })

  it('makes a Final its own Alert that opens the Game', () => {
    const m = alertMessage(
      item({
        kind: 'milestone',
        milestone: 'final',
        description: 'Final: PIT 24, CLE 27',
      }),
    )
    expect(m).toMatchObject({
      title: 'Final: PIT 24, CLE 27',
      final: true,
      url: '/?game=g1&day=2026-10-01',
    })
  })
})

describe('alertMessage for Notable Plays (Prediction Alerts)', () => {
  it('leads with what happened, never a score that did not happen', () => {
    const steal = alertMessage(
      item({
        league: 'mlb',
        significance: 'notable',
        playType: 'stolen_base_2b',
        description: 'Jackson Chourio steals (12) 2nd base.',
      }),
    )
    expect(steal.title).toMatch(/^Stolen base · /)
    expect(steal.title).not.toMatch(/Run scores/)
  })

  it('falls back to "Big play" when there is no lead for it', () => {
    const m = alertMessage(
      item({
        league: 'mlb',
        significance: 'notable',
        playType: 'something_new',
        description: 'Something notable.',
      }),
    )
    expect(m.title).toMatch(/^Big play · /)
  })
})
