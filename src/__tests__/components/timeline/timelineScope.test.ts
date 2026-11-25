import { describe, expect, it } from 'vitest'
import { gameSummary, team } from './fixtures'
import type { OptIn } from '@/lib/model/scope'
import { inScope } from '@/components/timeline/timelineScope'

const day = '2026-11-24'
const pro = gameSummary({ id: 'gm_nba', league: 'nba' }, day)
const predicted = gameSummary(
  {
    id: 'gm_uf',
    league: 'cbb',
    awayTeam: team('MILW', 'Milwaukee'),
    homeTeam: team('FLA', 'Florida'),
  },
  day,
)
const followed = gameSummary(
  {
    id: 'gm_duke',
    league: 'cbb',
    awayTeam: team('DUKE', 'Duke'),
    homeTeam: team('UNC', 'North Carolina'),
  },
  day,
)
const neither = gameSummary(
  {
    id: 'gm_other',
    league: 'cbb',
    awayTeam: team('IONA', 'Iona'),
    homeTeam: team('MRST', 'Marist'),
  },
  day,
)
const optIns: Array<OptIn> = [
  { league: 'cbb', follow: { kind: 'game', gameId: 'gm_uf' } },
  { league: 'cbb', follow: { kind: 'team', teamId: 'tm_duke' } },
]
const leagues = ['nba', 'cbb'] as const

const shown = (scope: 'all' | 'cbb') =>
  [pro, predicted, followed, neither]
    .filter((g) => inScope(g, scope, [], [], [...leagues], [], optIns))
    .map((g) => g.id)

describe('college Games on the board (opt-in)', () => {
  it('shows a college Game in All only when opted into', () => {
    expect(shown('all')).toEqual(['gm_nba', 'gm_uf', 'gm_duke'])
  })

  it('and in its own League only the opted-in ones', () => {
    expect(shown('cbb')).toEqual(['gm_uf', 'gm_duke'])
  })

  it('shows none with nothing opted in', () => {
    expect(
      [predicted, followed, neither].filter((g) =>
        inScope(g, 'cbb', [], [], [...leagues], []),
      ),
    ).toEqual([])
  })
})
