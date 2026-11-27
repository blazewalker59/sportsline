/**
 * Each Source's team totals (the box score's Team stats), read from the
 * recorded fixtures.
 */
import { describe, expect, it } from 'vitest'
import nflSummary from '../../fixtures/nfl/live-401872964.json'
import nflPlays from '../../fixtures/nfl/live-401872964-plays.json'
import cfbSummary from '../../fixtures/cfb/final-401856704.json'
import cfbPlays from '../../fixtures/cfb/final-401856704-plays.json'
import nbaSummary from '../../fixtures/nba/final-401859964.json'
import cbbSummary from '../../fixtures/cbb/final-401906774.json'
import mlbFeed from '../../fixtures/mlb/final-849848.json'
import nhlPbp from '../../fixtures/nhl/pbp-2026020009.json'
import nhlBox from '../../fixtures/nhl/box-2026020009.json'
import type { NflCorePlays, NflSummary } from '@/lib/sources/nfl/feed'
import type { NbaSummary } from '@/lib/sources/nba/feed'
import type { MlbFeed } from '@/lib/sources/mlb/feed'
import type { NhlBoxscore, NhlPlayByPlay } from '@/lib/sources/nhl/feed'
import type { TeamStat } from '@/lib/model/types'
import { HALVES } from '@/lib/sources/espn/common'
import { parseGame as parseFootball } from '@/lib/sources/nfl/parse'
import { parseGame as parseBasketball } from '@/lib/sources/nba/parse'
import { parseFeed } from '@/lib/sources/mlb/parse'
import { parseGame as parseHockey } from '@/lib/sources/nhl/parse'

const labels = (stats: Array<TeamStat> | undefined) =>
  (stats ?? []).map((s) => s.label)
const find = (stats: Array<TeamStat> | undefined, label: string) =>
  stats?.find((s) => s.label === label)

describe('team totals by Source', () => {
  it('NFL: ESPN’s team statistics, our labels and comparisons', () => {
    const { box } = parseFootball(
      nflSummary as unknown as NflSummary,
      nflPlays as unknown as NflCorePlays,
    )
    expect(labels(box?.teamStats)).toEqual([
      'Total yards',
      'Passing yards',
      'Rushing yards',
      'Yards per play',
      '1st downs',
      '3rd down',
      '4th down',
      'Red zone',
      'Turnovers',
      'Sacked',
      'Penalties',
      'Possession',
    ])
    expect(find(box?.teamStats, '3rd down')).toMatchObject({ compare: 'rate' })
    expect(find(box?.teamStats, 'Possession')?.away).toMatch(/^\d+:\d\d$/)
  })

  it('college football: the ones ESPN gives it', () => {
    const { box } = parseFootball(
      cfbSummary as unknown as NflSummary,
      cfbPlays as unknown as NflCorePlays,
      'cfb',
    )
    expect(labels(box?.teamStats)).toContain('Total yards')
    expect(labels(box?.teamStats)).toContain('3rd down')
  })

  it('NBA and college basketball', () => {
    const nba = parseBasketball(nbaSummary as unknown as NbaSummary).box
    expect(labels(nba?.teamStats).slice(0, 4)).toEqual([
      'Field goals',
      '3-pointers',
      'Free throws',
      'Rebounds',
    ])
    expect(find(nba?.teamStats, 'Field goals')?.away).toMatch(/^\d+-\d+$/)
    const cbb = parseBasketball(cbbSummary as unknown as NbaSummary, HALVES).box
    expect(labels(cbb?.teamStats)).toContain('Turnovers')
  })

  it('MLB: the feed’s teamStats, errors from fielding', () => {
    const { box } = parseFeed(mlbFeed as unknown as MlbFeed)
    expect(labels(box?.teamStats)).toEqual([
      'Hits',
      'Doubles',
      'Home runs',
      'Walks',
      'Struck out',
      'Left on base',
      'Stolen bases',
      'Strikeouts pitched',
      'Pitches',
      'Errors',
    ])
    expect(find(box?.teamStats, 'Errors')).toMatchObject({ lower: true })
    // Hits agree with the linescore's.
    expect(Number(find(box?.teamStats, 'Hits')?.away)).toBe(
      box?.linescore.awayTotals[1],
    )
  })

  it('NHL: summed from the skaters, saves from the goalies', () => {
    const { box } = parseHockey(
      nhlPbp as unknown as NhlPlayByPlay,
      nhlBox as unknown as NhlBoxscore,
    )
    expect(labels(box?.teamStats)).toEqual([
      'Shots on goal',
      'Power-play goals',
      'Saves',
      'Hits',
      'Blocked shots',
      'Takeaways',
      'Giveaways',
      'Penalty minutes',
    ])
    // Shots agree with the linescore's.
    expect(Number(find(box?.teamStats, 'Shots on goal')?.home)).toBe(
      box?.linescore.homeTotals[1],
    )
  })
})
