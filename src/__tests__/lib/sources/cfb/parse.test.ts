import { describe, expect, it } from 'vitest'
import summaryFixture from '../../../fixtures/cfb/final-401856704.json'
import playsFixture from '../../../fixtures/cfb/final-401856704-plays.json'
import type { NflCorePlays, NflSummary } from '@/lib/sources/nfl/feed'
import type { SourceMilestone, SourcePlay } from '@/lib/model/types'
import type { TimelineItem } from '@/lib/model/timeline'
import { isCovered } from '@/lib/sources/cfb'
import { top25 } from '@/lib/sources/espn/common'
import { scoringSummary } from '@/lib/timeline/sides'
import { collegeDescription, parseGame } from '@/lib/sources/nfl/parse'

const game = parseGame(
  summaryFixture as unknown as NflSummary,
  playsFixture as unknown as NflCorePlays,
  'cfb',
)
const plays = game.items.filter((i): i is SourcePlay => i.kind === 'play')
const milestones = game.items.filter(
  (i): i is SourceMilestone => i.kind === 'milestone',
)

describe('college football parseGame — final (TEX @ TENN)', () => {
  it('reports the Game as college football with ESPN college logos', () => {
    expect(game.league).toBe('cfb')
    expect(game.status).toBe('final')
    expect(game.away.abbreviation).toBe('TEX')
    expect(game.home.abbreviation).toBe('TENN')
    expect(game.score).toEqual({ away: 20, home: 17 })
    expect(game.home.logoUrl).toContain('/teamlogos/ncaa/500-dark/2633.png')
  })

  it('scores every point: touchdowns, field goals and the return TD', () => {
    const scoring = plays.filter((p) => p.significance === 'scoring')
    const types = scoring.map((p) => p.playType)
    expect(types).toContain('Rushing Touchdown')
    expect(types).toContain('Field Goal Good')
    expect(types).toContain('Punt Return Touchdown')
    expect(scoring.at(-1)?.score).toEqual(game.score)
    const returnTd = scoring.find(
      (p) => p.playType === 'Punt Return Touchdown',
    )!
    expect(
      scoringSummary({
        ...returnTd,
        league: 'cfb',
        players: returnTd.involved.map((i) => ({
          id: i.sourceId,
          name: i.name,
          role: i.role,
        })),
      } as unknown as TimelineItem),
    ).toBe('Moss · 57-yd return')
    expect(milestones.some((m) => m.milestone === 'final')).toBe(true)
  })

  it('writes descriptions like the NFL: no clock, jerseys, formations or crew', () => {
    for (const p of plays) {
      expect(p.description).not.toMatch(/^\(\d{1,2}:\d{2}\)/)
      expect(p.description).not.toMatch(/#\d/)
      expect(p.description).not.toMatch(/Shotgun|\(H: /)
      expect(p.description).not.toMatch(/clock \d/)
    }
    const fg = plays.find((p) => p.playType === 'Field Goal Good')!
    expect(fg.description).toBe(
      'C.Ranvier field goal attempt from 33 yards GOOD',
    )
  })
})

describe('collegeDescription', () => {
  it('spaces yard lines and names the end zone', () => {
    expect(
      collegeDescription(
        '(14:29) No Huddle-Shotgun #0 R.Brown rush middle for 9 yards gain to the TENN00 TOUCHDOWN, clock 10:58',
      ),
    ).toBe('R.Brown rush middle for 9 yards gain to the end zone TOUCHDOWN')
    expect(
      collegeDescription(
        '(07:32) #16 A.Manning sacked for loss of 8 yards to the TEXAS18',
      ),
    ).toBe('A.Manning sacked for loss of 8 yards to the TEXAS 18')
  })

  it('drops a repeated extra point', () => {
    expect(
      collegeDescription(
        '(11:32) #6 Q.Moss return 57 yards to the TEXAS00 TOUCHDOWN, clock 11:14 #28 C.Ranvier kick attempt good (H: #98 J.Ross, LS: #48 B.Brady) #28 C.Ranvier kick attempt good (H: #98 J.Ross, LS: #48 B.Brady)',
      ),
    ).toBe(
      'Q.Moss return 57 yards to the end zone TOUCHDOWN C.Ranvier kick attempt good',
    )
  })

  it('keeps only the outcome of a review', () => {
    expect(
      collegeDescription(
        '(12:13) #16 A.Manning pass intercepted by #14 K.Lee at TENN04. The previous play is under automatic review - "Interception". CALL UPHELD',
      ),
    ).toBe('A.Manning pass intercepted by K.Lee at TENN 4. Call upheld.')
  })
})

describe('isCovered', () => {
  const event = (...teams: Array<{ id: string; conferenceId?: string }>) => ({
    id: 'e',
    date: '2026-09-26T16:00:00Z',
    competitions: [
      {
        competitors: teams.map((team, i) => ({
          id: team.id,
          homeAway: i === 0 ? ('away' as const) : ('home' as const),
          team,
        })),
      },
    ],
  })

  it('covers Power 4 and Notre Dame games, whoever the opponent', () => {
    expect(
      isCovered(
        event(
          { id: '2633', conferenceId: '8' },
          { id: '1', conferenceId: '48' },
        ),
      ),
    ).toBe(true)
    expect(
      isCovered(event({ id: '87', conferenceId: '18' }, { id: '2' })),
    ).toBe(true)
    expect(
      isCovered(
        event(
          { id: '2', conferenceId: '151' },
          { id: '3', conferenceId: '37' },
        ),
      ),
    ).toBe(false)
  })

  it('also covers any game with an AP Top 25 team', () => {
    const g5 = event(
      { id: '2', conferenceId: '151' },
      { id: '3', conferenceId: '37' },
    )
    g5.competitions[0].competitors[1] = {
      ...g5.competitions[0].competitors[1],
      curatedRank: { current: 22 },
    } as (typeof g5.competitions)[0]['competitors'][1]
    expect(isCovered(g5)).toBe(true)
  })
})

describe('top25', () => {
  it('reads either ranking field and drops the unranked 99', () => {
    const c = { id: '1', homeAway: 'home' as const, team: { id: '1' } }
    expect(top25({ ...c, curatedRank: { current: 14 } })).toBe(14)
    expect(top25({ ...c, rank: 1 })).toBe(1)
    expect(top25({ ...c, curatedRank: { current: 99 } })).toBeNull()
    expect(top25(c)).toBeNull()
  })
})

describe('scoring follows ESPN, not a glitched score', () => {
  // PSU @ NU live: the punt row briefly carried the next touchdown's score.
  const row = (
    sequenceNumber: string,
    type: string,
    homeScore: number,
    scoringPlay: boolean,
  ) => ({
    id: sequenceNumber,
    sequenceNumber,
    type: { text: type },
    text: type,
    awayScore: 0,
    homeScore,
    scoringPlay,
    period: { number: 1 },
  })
  const glitched = parseGame(
    summaryFixture as unknown as NflSummary,
    {
      items: [
        row('12', 'Field Goal Good', 3, true),
        row('18', 'Punt', 10, false),
        row('20', 'Rush', 3, false),
        row('26', 'Rushing Touchdown', 10, true),
      ],
    } as unknown as NflCorePlays,
    'cfb',
  )
  const byType = (type: string) =>
    glitched.items.find(
      (i): i is SourcePlay => i.kind === 'play' && i.playType === type,
    )!

  it('does not make the punt a Scoring play or show the future score', () => {
    expect(byType('Punt').significance).not.toBe('scoring')
    expect(byType('Punt').score).toEqual({ away: 0, home: 3 })
    expect(byType('Field Goal Good').significance).toBe('scoring')
    expect(byType('Rushing Touchdown').significance).toBe('scoring')
    expect(byType('Rushing Touchdown').score).toEqual({ away: 0, home: 10 })
  })
})
