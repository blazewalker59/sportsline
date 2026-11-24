import { describe, expect, it } from 'vitest'
import {
  fantasyLeagueFixture,
  gameSummary,
  play,
  predictionFixture,
  team,
} from '../../components/timeline/fixtures'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import {
  affectsViewer,
  boardOrder,
  gameStakes,
  itemStakes,
  stakeIndex,
} from '@/lib/timeline/stakes'

const day = '2026-11-24'
const nyk = gameSummary(
  {
    id: 'g_nyk',
    league: 'nba',
    awayTeam: team('BOS', 'Boston Celtics'),
    homeTeam: team('NYK', 'New York Knicks'),
    score: { away: 78, home: 88 },
  },
  day,
)
const brunson = { id: 'pl_brunson', name: 'Jalen Brunson' }
const tatum = { id: 'pl_tatum', name: 'Jayson Tatum' }
const both = { id: 'pl_both', name: 'Mikal Bridges' }

/** A league where the Viewer starts Brunson and Bridges; the opponent Tatum and Bridges. */
function league(): FantasyLeagueView {
  const l = fantasyLeagueFixture()
  const m = l.matchup!
  const starter = (playerId: string, teamId: string) =>
    ({ playerId, teamId, starter: true }) as never
  m.mine.lineup = [
    starter(brunson.id, 'tm_nyk'),
    starter(both.id, 'tm_nyk'),
    { playerId: 'pl_bench', teamId: 'tm_lal', starter: false } as never,
  ]
  m.opponent!.lineup = [starter(tatum.id, 'tm_bos'), starter(both.id, 'tm_nyk')]
  return l
}

/** A Prediction with a pending prop on Brunson, and a won one on Tatum. */
function prediction(): PredictionView {
  const p = predictionFixture(nyk)
  const leg = p.legs[0]
  return {
    ...p,
    kind: 'combo',
    title: 'Knicks parlay',
    legs: [
      {
        ...leg,
        title: 'Brunson 25+ pts',
        playerId: brunson.id,
        playerName: brunson.name,
        progress: { current: 23, target: 25, label: 'pts' },
      },
      { ...leg, title: 'Tatum 20+ pts', playerId: tatum.id, status: 'won' },
    ],
  }
}

const by = (...players: Array<{ id: string; name: string }>) =>
  play(nyk, {
    id: 'p',
    description: 'A play',
    players: players.map((p) => ({ ...p, role: 'shooter' })),
  })

describe('stakes', () => {
  const index = stakeIndex([league()], [prediction()])

  it('names the Viewer’s Starter, theirs winning over the opponent’s', () => {
    expect(itemStakes(by(both), index).fantasy).toEqual({
      side: 'mine',
      names: ['Bridges'],
    })
    expect(itemStakes(by(tatum), index).fantasy).toEqual({
      side: 'opponent',
      names: ['Tatum'],
    })
    // A bench Player is no one's Starter.
    expect(
      itemStakes(by({ id: 'pl_bench', name: 'Bench Guy' }), index).fantasy,
    ).toBeNull()
  })

  it('finds a play’s pending Legs, with their count so far', () => {
    const { legs } = itemStakes(by(brunson), index)
    expect(legs).toHaveLength(1)
    expect(legs[0].leg).toMatchObject({
      title: 'Brunson 25+ pts',
      progress: { current: 23, target: 25 },
    })
    // A Leg already won moves nothing.
    expect(itemStakes(by(tatum), index).legs).toEqual([])
  })

  it('“Affects me” keeps the Viewer’s own Starters and Legs, not the opponent’s', () => {
    expect(affectsViewer(by(brunson), index)).toBe(true)
    expect(affectsViewer(by(both), index)).toBe(true)
    expect(affectsViewer(by(tatum), index)).toBe(false)
    expect(affectsViewer(by(), index)).toBe(false)
  })

  it('marks a Game with every stake on it', () => {
    expect(gameStakes(nyk, index, () => true)).toEqual([
      'following',
      'prediction',
      'fantasy',
    ])
    const other = gameSummary(
      {
        id: 'g_other',
        awayTeam: team('MIA', 'Miami Heat'),
        homeTeam: team('ORL', 'Orlando Magic'),
      },
      day,
    )
    expect(gameStakes(other, index, () => false)).toEqual([])
  })

  it('orders the board: live, then next by start, then final; staked first', () => {
    const g = (id: string, status: string, startsAt: string) =>
      gameSummary({ id, status, startsAt } as never, day)
    const games = [
      g('final', 'final', `${day}T18:00:00Z`),
      g('late', 'scheduled', `${day}T23:00:00Z`),
      g('live', 'live', `${day}T20:00:00Z`),
      g('early', 'scheduled', `${day}T21:00:00Z`),
      g('liveStaked', 'live', `${day}T20:30:00Z`),
    ]
    expect(
      boardOrder(games, (x) => x.id === 'liveStaked').map((x) => x.id),
    ).toEqual(['liveStaked', 'live', 'early', 'late', 'final'])
  })
})
