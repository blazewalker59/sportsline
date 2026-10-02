import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '@/lib/model/timeline'
import { playerSide, scoringSummary } from '@/lib/timeline/sides'

function item(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: 'i',
    gameId: 'g',
    league: 'nfl',
    sportsDay: '2026-10-01',
    kind: 'play',
    side: 'home',
    sequence: 1,
    occurredAt: '2026-10-02T03:00:00Z',
    segmentLabel: 'Q4',
    score: { away: 0, home: 0 },
    awayTeam: { id: 'a', abbreviation: 'PIT', logoUrl: null },
    homeTeam: { id: 'h', abbreviation: 'CLE', logoUrl: null },
    description: '',
    playType: null,
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

describe('playerSide', () => {
  it('reads NFL roles from the snapping team on a change of possession', () => {
    // CLE (home) intercepts PIT: the play is credited to CLE.
    const pick = item({ side: 'home', playType: 'Pass Interception Return' })
    expect(playerSide(pick, { role: 'passer' })).toBe('away')
    expect(playerSide(pick, { role: 'receiver' })).toBe('away')
    expect(playerSide(pick, { role: 'returner' })).toBe('home')
    expect(playerSide(pick, { role: 'tackler' })).toBe('away')
    // A CLE sack of nothing special: CLE offense, PIT sacker.
    const sack = item({ side: 'home', playType: 'Sack' })
    expect(playerSide(sack, { role: 'passer' })).toBe('home')
    expect(playerSide(sack, { role: 'sackedBy' })).toBe('away')
    // Kickoffs are credited to the receiving team.
    const kick = item({ side: 'home', playType: 'Kickoff' })
    expect(playerSide(kick, { role: 'kicker' })).toBe('away')
    expect(playerSide(kick, { role: 'returner' })).toBe('home')
    expect(playerSide(kick, { role: 'penalized' })).toBeNull()
  })

  it('puts defenders on the other side', () => {
    const it1 = item({ side: 'home' })
    expect(playerSide(it1, { role: 'passer' })).toBe('home')
    expect(playerSide(it1, { role: 'tackler' })).toBe('away')
    expect(
      playerSide(item({ league: 'mlb', side: 'away' }), { role: 'fielder' }),
    ).toBe('home')
    expect(
      playerSide(item({ league: 'nhl', side: 'away' }), { role: 'goalie' }),
    ).toBe('home')
  })

  it('knows NHL blocked shots belong to the blocking team', () => {
    const blocked = item({
      league: 'nhl',
      side: 'home',
      playType: 'blocked-shot',
    })
    expect(playerSide(blocked, { role: 'blocker' })).toBe('home')
    expect(playerSide(blocked, { role: 'shooter' })).toBe('away')
  })
})

describe('scoringSummary', () => {
  it('NFL: passer → receiver · yards, runs and field goals', () => {
    expect(
      scoringSummary(
        item({
          description:
            'A.Rodgers pass short right to P.Freiermuth for 3 yards, TOUCHDOWN.',
          players: [
            { id: '1', name: 'Aaron Rodgers', role: 'passer' },
            { id: '2', name: 'Pat Freiermuth', role: 'receiver' },
          ],
        }),
      ),
    ).toBe('Rodgers → Freiermuth · 3 yds')
    expect(
      scoringSummary(
        item({
          description: 'A.Szmyt 44 yard field goal is GOOD.',
          players: [{ id: '3', name: 'Andre Szmyt', role: 'kicker' }],
        }),
      ),
    ).toBe('Szmyt · 44-yd field goal')
  })

  it('MLB: batter result, then who scored', () => {
    expect(
      scoringSummary(
        item({
          league: 'mlb',
          description:
            'Drake Baldwin doubles (1) on a fly ball to right fielder Bryce Harper. Sean Murphy scores.',
          players: [
            { id: '1', name: 'Drake Baldwin', role: 'batter' },
            { id: '2', name: 'Bryce Harper', role: 'fielder' },
            { id: '3', name: 'Sean Murphy', role: 'runner' },
          ],
        }),
      ),
    ).toBe('Baldwin doubles · Murphy scores')
  })

  it('NHL: scorer (count) and assists', () => {
    expect(
      scoringSummary(
        item({
          league: 'nhl',
          description:
            'EDM goal: Vasily Podkolzin (3), wrist shot. Assists: Kasperi Kapanen (1), Connor McDavid (3).',
          players: [
            { id: '1', name: 'Vasily Podkolzin', role: 'scorer' },
            { id: '2', name: 'Kasperi Kapanen', role: 'assist' },
            { id: '3', name: 'Connor McDavid', role: 'assist' },
          ],
        }),
      ),
    ).toBe('Podkolzin (3) · Kapanen, McDavid')
  })

  it('NBA: shooter, distance, assist', () => {
    expect(
      scoringSummary(
        item({
          league: 'nba',
          description:
            'Devin Vassell makes 24-foot three point jumper (Stephon Castle assists)',
          players: [
            { id: '1', name: 'Devin Vassell', role: 'shooter' },
            { id: '2', name: 'Stephon Castle', role: 'assist' },
          ],
        }),
      ),
    ).toBe('Vassell · 24 ft · ast Castle')
  })
})
