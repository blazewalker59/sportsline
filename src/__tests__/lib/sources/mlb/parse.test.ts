import { describe, expect, it } from 'vitest'
import finalFeed from '../../../fixtures/mlb/final-849848.json'
import liveFeed from '../../../fixtures/mlb/live-849844.json'
import playersFixture from '../../../fixtures/mlb/players-2026.json'
import teamsFixture from '../../../fixtures/mlb/teams-2026.json'
import type { MlbFeed, MlbPeople, MlbTeams } from '@/lib/sources/mlb/feed'
import type { SourceMilestone, SourcePlay } from '@/lib/model/types'
import { ordinal, parseFeed, parseRoster } from '@/lib/sources/mlb/parse'

const final = parseFeed(finalFeed as unknown as MlbFeed)
const live = parseFeed(liveFeed as unknown as MlbFeed)
const plays = (s: typeof final) =>
  s.items.filter((i): i is SourcePlay => i.kind === 'play')
const milestones = (s: typeof final) =>
  s.items.filter((i): i is SourceMilestone => i.kind === 'milestone')

describe('MLB parseFeed — final game (BOS @ NYY, 2026-09-30)', () => {
  it('reports the Game', () => {
    expect(final.status).toBe('final')
    expect(final.sportsDay).toBe('2026-09-30')
    expect(final.away.abbreviation).toBe('BOS')
    expect(final.home.abbreviation).toBe('NYY')
    expect(final.score).toEqual({ away: 2, home: 9 })
    expect(final.situation).toBeNull()
  })

  it('makes one Play per completed plate appearance', () => {
    const pas = plays(final).filter((p) => /^pa:\d+$/.test(p.key))
    expect(pas).toHaveLength(
      (finalFeed as unknown as MlbFeed).liveData.plays.allPlays.length,
    )
  })

  it('keeps Pitches as detail inside the plate appearance', () => {
    const first = plays(final).find((p) => p.key === 'pa:0')!
    const detail = first.detail as { pitches: Array<{ mph: number | null }> }
    expect(detail.pitches.length).toBeGreaterThan(0)
    expect(detail.pitches[0].mph).toBeGreaterThan(60)
  })

  it('marks exactly the score-changing Plays as Scoring', () => {
    const scoring = plays(final).filter((p) => p.significance === 'scoring')
    expect(scoring.map((p) => p.key)).toEqual([
      'pa:26',
      'pa:37',
      'pa:41',
      'pa:44',
      'pa:47',
      'pa:48',
      'pa:50',
      'pa:55',
      'pa:60',
    ])
    expect(scoring.at(-1)!.score).toEqual({ away: 2, home: 9 })
  })

  it('turns game-relevant in-PA actions into Plays and drops the noise', () => {
    const types = new Set(plays(final).map((p) => p.playType))
    expect(types).toContain('pitching_substitution')
    expect(types).toContain('stolen_base_2b')
    expect(types).not.toContain('batter_timeout')
    expect(types).not.toContain('mound_visit')
    expect(types).not.toContain('game_advisory')
    const steal = plays(final).find((p) => p.playType === 'stolen_base_3b')!
    expect(steal.significance).toBe('notable')
    expect(steal.involved.map((i) => i.name)).toContain('Jazz Chisholm Jr.')
  })

  it('names batter, pitcher, runners and fielders as Involved Players', () => {
    const hr = plays(final).find((p) => p.key === 'pa:50')!
    const roles = Object.fromEntries(hr.involved.map((i) => [i.name, i.role]))
    expect(roles['Cody Bellinger']).toBe('batter')
    expect(roles['Trent Grisham']).toBe('runner')
    expect(hr.involved.filter((i) => i.role === 'pitcher')).toHaveLength(1)
  })

  it('emits start, half-inning ends and Final, but no end for the final half', () => {
    const ms = milestones(final)
    expect(ms.filter((m) => m.milestone === 'start')).toHaveLength(1)
    expect(ms.filter((m) => m.milestone === 'final')).toHaveLength(1)
    const ends = ms.filter((m) => m.milestone === 'segment_end')
    // NYY led after the top of the 9th, so 17 halves were played; the last
    // one is covered by Final.
    expect(ends).toHaveLength(16)
    expect(ms.find((m) => m.milestone === 'final')!.description).toBe(
      'Final: BOS 2, NYY 9',
    )
  })

  it('orders every item uniquely', () => {
    const keys = final.items.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    const seqs = final.items.map((i) => i.sequence)
    expect(new Set(seqs).size).toBe(seqs.length)
  })
})

describe('MLB parseFeed — live game (PHI @ ATL, in progress)', () => {
  it('excludes the plate appearance in progress and exposes the Situation', () => {
    expect(live.status).toBe('live')
    const current = (liveFeed as unknown as MlbFeed).liveData.plays.allPlays.at(
      -1,
    )!
    expect(current.about?.isComplete).toBe(false)
    expect(plays(live).some((p) => p.key === `pa:${current.atBatIndex}`)).toBe(
      false,
    )
    expect(live.situation?.segmentLabel).toBe('Bot 4th')
    expect(live.situation?.detail).toMatchObject({ outs: 1, onFirst: true })
    expect(milestones(live).some((m) => m.milestone === 'final')).toBe(false)
  })

  it('passes on the Source poll hint', () => {
    expect(live.pollHintSeconds).toBe(10)
  })
})

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [21, '21st'],
  ])('%i → %s', (n, s) => expect(ordinal(n)).toBe(s))
})

describe('MLB parseRoster', () => {
  const roster = parseRoster(
    teamsFixture as MlbTeams,
    playersFixture as unknown as MlbPeople,
  )

  it('lists the 30 Teams and every active Player', () => {
    expect(roster.teams).toHaveLength(30)
    expect(roster.players.length).toBeGreaterThan(1000)
  })

  it('carries each Player’s current Team and position', () => {
    const judge = roster.players.find((p) => p.name === 'Aaron Judge')!
    const nyy = roster.teams.find((t) => t.abbreviation === 'NYY')!
    expect(judge.teamSourceId).toBe(nyy.sourceId)
    expect(judge.position).toBe('RF')
  })
})

describe('MLB parseFeed — box score and base runners', () => {
  it('builds a linescore whose totals match the final score', () => {
    const ls = final.box!.linescore
    expect(ls.segments).toHaveLength(9)
    expect(ls.home.at(-1)).toBeNull() // NYY didn't bat in the bottom of the 9th
    expect(ls.awayTotals).toEqual([2, 4, 1])
    expect(ls.homeTotals).toEqual([9, 14, 0])
    expect(ls.home.reduce<number>((a, r) => a + (r ?? 0), 0)).toBe(9)
  })

  it('lists batters in batting order, flagging substitutes', () => {
    const batting = final.box!.tables.find((t) => t.title === 'BOS Batting')!
    expect(batting.columns).toEqual(['AB', 'R', 'H', 'RBI', 'BB', 'K'])
    expect(batting.rows[0].player.name).toBe('Jahmai Jones')
    const duran = batting.rows.find((r) => r.player.name === 'Jarren Duran')!
    expect(duran.sub).toBe(true)
  })

  it('lists every pitcher with a pitching line', () => {
    const pitching = final.box!.tables.find((t) => t.title === 'NYY Pitching')!
    expect(pitching.rows.length).toBeGreaterThan(0)
    expect(pitching.rows[0].sub).toBe(false)
    expect(pitching.columns[0]).toBe('IP')
  })

  it('records runners before and after each plate appearance', () => {
    const hr = plays(final).find((p) => p.key === 'pa:50')!
    const detail = hr.detail as {
      basesBefore: Record<string, string | null>
      basesAfter: Record<string, string | null>
    }
    expect(detail.basesBefore).toEqual({
      first: 'Ben Rice',
      second: 'Trent Grisham',
      third: null,
    })
    expect(detail.basesAfter).toEqual({
      first: null,
      second: null,
      third: null,
    })
    const leadoff = plays(final).find((p) => p.key === 'pa:0')!
    expect((leadoff.detail as typeof detail).basesBefore).toEqual({
      first: null,
      second: null,
      third: null,
    })
  })
})
