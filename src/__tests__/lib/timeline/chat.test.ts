import { describe, expect, it } from 'vitest'
import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import {
  buildChat,
  notableLead,
  scoringHeadline,
  textOn,
  typingFor,
} from '@/lib/timeline/chat'

function item(id: string, overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id,
    gameId: 'g1',
    league: 'nfl',
    sportsDay: '2026-10-01',
    kind: 'play',
    side: 'home',
    sequence: 1,
    occurredAt: '2026-10-02T03:00:00Z',
    segmentLabel: 'Q4 1:00',
    score: { away: 24, home: 24 },
    awayTeam: { id: 'a', abbreviation: 'PIT', logoUrl: null },
    homeTeam: { id: 'h', abbreviation: 'CLE', logoUrl: null },
    description: id,
    playType: 'Rush',
    significance: 'routine',
    milestone: null,
    status: 'active',
    revisedAt: null,
    overturnOf: null,
    players: [],
    detail: null,
    ...overrides,
  }
}

describe('buildChat', () => {
  it('clusters consecutive Plays by the same team in the same Game', () => {
    const chat = buildChat(
      [
        item('a1', { side: 'away' }),
        item('h1'),
        item('h2'),
        item('o1', { gameId: 'g2' }),
        item('h3'),
      ],
      { fold: false },
    )
    expect(
      chat.map((e) =>
        e.type === 'cluster'
          ? `${e.gameId}:${e.side}:${e.bubbles.length}`
          : 'notice',
      ),
    ).toEqual(['g1:away:1', 'g1:home:2', 'g2:home:1', 'g1:home:1'])
  })

  it('makes Milestones and side-less Plays notices that break clusters', () => {
    const chat = buildChat(
      [
        item('h1'),
        item('m', { kind: 'milestone', side: null, significance: null }),
        item('h2'),
        item('sub', { side: null }),
      ],
      { fold: false },
    )
    expect(chat.map((e) => e.type)).toEqual([
      'cluster',
      'notice',
      'cluster',
      'notice',
    ])
  })

  it('folds runs of Routine Plays, keeping Scoring and Notable ones visible', () => {
    const [cluster] = buildChat(
      [
        item('r1'),
        item('r2'),
        item('r3'),
        item('n1', { significance: 'notable' }),
        item('r4'),
        item('s1', { significance: 'scoring' }),
      ],
      { fold: true },
    )
    if (cluster.type !== 'cluster') throw new Error('expected a cluster')
    expect(
      cluster.bubbles.map((b) =>
        b.type === 'fold' ? `fold:${b.items.length}` : b.item.id,
      ),
    ).toEqual(['fold:3', 'n1', 'r4', 's1'])
  })
})

describe('headlines', () => {
  it('names Scoring Plays per League', () => {
    expect(scoringHeadline(item('x', { playType: 'Passing Touchdown' }))).toBe(
      'Touchdown',
    )
    expect(scoringHeadline(item('x', { playType: 'Field Goal Good' }))).toBe(
      'Field goal',
    )
    expect(
      scoringHeadline(item('x', { league: 'mlb', playType: 'home_run' })),
    ).toBe('Home run')
    expect(
      scoringHeadline(item('x', { league: 'mlb', playType: 'single' })),
    ).toBe('RBI single')
    expect(
      scoringHeadline(
        item('x', {
          league: 'nhl',
          playType: 'goal',
          detail: { strength: 'power play' },
        }),
      ),
    ).toBe('Power-play goal')
    expect(scoringHeadline(item('x', { kind: 'overturn' }))).toBe('Overturned')
  })

  it('gives Notable Plays a short lead', () => {
    expect(
      notableLead(item('x', { significance: 'notable', playType: 'Sack' })),
    ).toBe('Sack')
    expect(
      notableLead(
        item('x', {
          significance: 'notable',
          playType: 'Pass Reception',
          detail: { yards: 36 },
        }),
      ),
    ).toBe('36 yards')
    expect(
      notableLead(item('x', { significance: 'routine', playType: 'Sack' })),
    ).toBeNull()
  })
})

describe('typingFor', () => {
  const base: GameSummary = {
    id: 'g1',
    league: 'nfl',
    sportsDay: '2026-10-01',
    status: 'live',
    startsAt: '',
    awayTeam: { id: 'a', abbreviation: 'PIT', logoUrl: null, name: 'Steelers' },
    homeTeam: { id: 'h', abbreviation: 'CLE', logoUrl: null, name: 'Browns' },
    score: { away: 24, home: 24 },
    situation: {
      segmentLabel: 'Q4 0:19',
      detail: { downDistance: '3rd & 8 at PIT 38', possession: 'CLE' },
    },
  }

  it('has the team with the ball typing in football', () => {
    expect(typingFor(base)).toEqual({
      gameId: 'g1',
      side: 'home',
      text: '3rd & 8 at PIT 38 · Q4 0:19',
    })
  })

  it('has the batting team typing in baseball', () => {
    const t = typingFor({
      ...base,
      league: 'mlb',
      situation: {
        segmentLabel: 'Bot 4th',
        detail: { outs: 1, onFirst: true, batter: 'Drake Baldwin' },
      },
    })
    expect(t).toEqual({
      gameId: 'g1',
      side: 'home',
      text: 'Bot 4th · 1 out · on 1st · Drake Baldwin up',
    })
  })

  it('is silent for Games that are not live', () => {
    expect(typingFor({ ...base, status: 'final' })).toBeNull()
  })
})

describe('textOn', () => {
  it('picks readable text for a team color', () => {
    expect(textOn('#ffb612')).toBe('#111318')
    expect(textOn('#041e42')).toBe('#ffffff')
  })
})
