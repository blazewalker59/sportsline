import { describe, expect, it } from 'vitest'
import type { LineupPlayer, MatchupSide } from '@/lib/fantasy/matchup'
import {
  ROSTERS_EVERY_MS,
  injuryEvents,
  injuryNews,
  isNotable,
  rostersDue,
  rostersOf,
  severity,
  whoHasOptions,
} from '@/lib/fantasy/whoHas'

const player = (
  espnId: number,
  over: Partial<LineupPlayer> = {},
): LineupPlayer => ({
  espnId,
  name: `Player ${espnId}`,
  slot: 'QB',
  slotId: 0,
  positionId: 1,
  starter: true,
  points: null,
  projected: null,
  proTeamId: 1,
  injury: null,
  breakdown: [],
  ...over,
})

const side = (teamId: number, lineup: Array<LineupPlayer>): MatchupSide => ({
  teamId,
  name: `Team ${teamId}`,
  abbrev: `T${teamId}`,
  logo: null,
  record: null,
  score: 0,
  projected: null,
  lineup,
})

const at = new Date('2026-10-20T12:00:00Z')

describe('severity', () => {
  it('ranks injury statuses, a suspension not among them', () => {
    expect(severity(null)).toBe(0)
    expect(severity('QUESTIONABLE')).toBe(0)
    expect(severity('DAY_TO_DAY')).toBe(0)
    expect(severity('SUSPENSION')).toBe(0)
    expect(severity('DOUBTFUL')).toBe(1)
    expect(severity('OUT')).toBe(2)
    expect(severity('INJURY_RESERVE')).toBe(3)
    expect(severity('FIFTEEN_DAY_DL')).toBe(3)
  })

  it('says what happened', () => {
    expect(injuryNews('DOUBTFUL')).toBe('Doubtful')
    expect(injuryNews('OUT')).toBe('Ruled out')
    expect(injuryNews('INJURY_RESERVE')).toBe('Placed on injured reserve')
    expect(injuryNews('TEN_DAY_DL')).toBe('Placed on the injured list')
  })
})

describe('isNotable', () => {
  it('uses ESPN’s ownership when it has it, else starting', () => {
    expect(isNotable({ owned: 95, starter: false })).toBe(true)
    expect(isNotable({ owned: 40, starter: true })).toBe(false)
    expect(isNotable({ starter: true })).toBe(true)
    expect(isNotable({ starter: false })).toBe(false)
  })
})

describe('rostersDue', () => {
  it('keeps rosters about hourly', () => {
    expect(rostersDue(null, at)).toBe(true)
    const kept = rostersOf([], at)
    expect(rostersDue(kept, new Date(at.getTime() + 5 * 60_000))).toBe(false)
    expect(rostersDue(kept, new Date(at.getTime() + ROSTERS_EVERY_MS))).toBe(
      true,
    )
  })
})

describe('injuryEvents', () => {
  const before = rostersOf(
    [
      side(1, [player(10)]),
      side(2, [
        player(20),
        player(21, { injury: 'QUESTIONABLE' }),
        player(22, { starter: false }),
        player(23, { injury: 'OUT' }),
      ]),
    ],
    at,
  )

  it('finds a notable Player on another team getting worse', () => {
    const now = [
      side(1, [player(10, { injury: 'OUT' })]),
      side(2, [
        player(20, { injury: 'DOUBTFUL' }),
        player(21, { injury: 'OUT' }),
        // Bench: not notable without ownership.
        player(22, { starter: false, injury: 'OUT' }),
        // Still out: not new.
        player(23, { injury: 'OUT' }),
        // New to the team: not a change seen.
        player(24, { injury: 'OUT' }),
      ]),
    ]
    const events = injuryEvents(before, now, 1)
    expect(
      events.map((e) => [e.player.espnId, e.status, e.ownerTeamId]),
    ).toEqual([
      [20, 'DOUBTFUL', 2],
      [21, 'OUT', 2],
    ])
  })

  it('has none before rosters were ever kept', () => {
    expect(
      injuryEvents(null, [side(2, [player(20, { injury: 'OUT' })])], 1),
    ).toEqual([])
  })
})

describe('whoHasOptions', () => {
  const teams = [1, 2, 3, 4, 5, 6].map((teamId) => ({
    teamId,
    name: `Team ${teamId}`,
  }))

  it('offers the owner and three others, the same each time', () => {
    const options = whoHasOptions(3139477, 4, teams)
    expect(options).toHaveLength(4)
    expect(options.map((o) => o.teamId)).toContain(4)
    expect(new Set(options.map((o) => o.teamId)).size).toBe(4)
    expect(whoHasOptions(3139477, 4, teams)).toEqual(options)
  })

  it('offers fewer in a small league', () => {
    expect(whoHasOptions(-16, 1, teams.slice(0, 2))).toHaveLength(2)
  })
})
