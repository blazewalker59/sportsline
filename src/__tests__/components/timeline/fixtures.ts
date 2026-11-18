/**
 * Hand-written Games and Plays for Timeline tests: three Games on one
 * Sports Day, a few Plays each.
 */

import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { GameBox } from '@/lib/model/types'

export function team(abbreviation: string, name: string) {
  return {
    id: `tm_${abbreviation.toLowerCase()}`,
    abbreviation,
    name,
    logoUrl: null,
  }
}

export function gameSummary(
  over: Partial<GameSummary> & Pick<GameSummary, 'id'>,
  sportsDay: string,
): GameSummary {
  return {
    league: 'mlb',
    sportsDay,
    status: 'live',
    startsAt: `${sportsDay}T23:00:00Z`,
    awayTeam: team('PHI', 'Philadelphia Phillies'),
    homeTeam: team('ATL', 'Atlanta Braves'),
    score: { away: 0, home: 0 },
    situation: null,
    ...over,
  }
}

export function play(
  game: GameSummary,
  over: Partial<TimelineItem> & Pick<TimelineItem, 'id' | 'description'>,
): TimelineItem {
  return {
    gameId: game.id,
    league: game.league,
    sportsDay: game.sportsDay,
    kind: 'play',
    side: 'away',
    sequence: 1,
    occurredAt: `${game.sportsDay}T23:00:00Z`,
    segmentLabel: 'Top 1st',
    score: game.score,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    playType: null,
    significance: 'notable',
    milestone: null,
    status: 'active',
    revisedAt: null,
    overturnOf: null,
    players: [],
    detail: null,
    ...over,
  }
}

export function timelineFixture(sportsDay: string) {
  const mlb = gameSummary(
    {
      id: 'g_mlb',
      score: { away: 2, home: 3 },
      situation: { segmentLabel: 'Bot 6th', detail: {} },
    },
    sportsDay,
  )
  const nba = gameSummary(
    {
      id: 'g_nba',
      league: 'nba',
      status: 'final',
      awayTeam: team('BOS', 'Boston Celtics'),
      homeTeam: team('NYK', 'New York Knicks'),
      score: { away: 108, home: 112 },
    },
    sportsDay,
  )
  const nfl = gameSummary(
    {
      id: 'g_nfl',
      league: 'nfl',
      awayTeam: team('KC', 'Kansas City Chiefs'),
      homeTeam: team('BUF', 'Buffalo Bills'),
      score: { away: 14, home: 10 },
      situation: { segmentLabel: 'Q3 8:12', detail: {} },
    },
    sportsDay,
  )
  const at = (h: number, m: number) =>
    `${sportsDay}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
  // Newest first, as the Timeline holds them.
  const items: Array<TimelineItem> = [
    play(nfl, {
      id: 'p_nfl_3',
      description: 'Patrick Mahomes pass to Travis Kelce for 12 yards',
      occurredAt: at(23, 50),
      segmentLabel: 'Q3',
    }),
    play(mlb, {
      id: 'p_mlb_4',
      side: 'home',
      description: 'Ronald Acuña Jr. doubles to left, Ozzie Albies scores',
      significance: 'scoring',
      occurredAt: at(23, 45),
      segmentLabel: 'Bot 6th',
    }),
    play(nba, {
      id: 'p_nba_2',
      side: 'home',
      description: 'Jalen Brunson makes 18-foot pullup jump shot',
      significance: 'scoring',
      occurredAt: at(23, 40),
      segmentLabel: 'Q4',
    }),
    play(mlb, {
      id: 'p_mlb_3',
      description: 'Bryce Harper homers to right, Trea Turner scores',
      significance: 'scoring',
      occurredAt: at(23, 30),
      segmentLabel: 'Top 6th',
    }),
    play(nfl, {
      id: 'p_nfl_2',
      side: 'home',
      description: 'Josh Allen 4 yard run for a touchdown',
      significance: 'scoring',
      occurredAt: at(23, 20),
      segmentLabel: 'Q2',
    }),
    play(mlb, {
      id: 'p_mlb_2',
      side: 'home',
      description: 'Matt Olson strikes out swinging',
      occurredAt: at(23, 10),
      segmentLabel: 'Bot 5th',
    }),
    play(nba, {
      id: 'p_nba_1',
      description: 'Jayson Tatum makes 26-foot three point jumper',
      occurredAt: at(23, 5),
      segmentLabel: 'Q4',
    }),
    play(mlb, {
      id: 'p_mlb_1',
      description: 'Kyle Schwarber walks',
      occurredAt: at(23, 0),
      segmentLabel: 'Top 5th',
    }),
  ]
  const box: GameBox = {
    linescore: {
      segments: ['1', '2', '3', '4', '5', '6'],
      away: [0, 0, 0, 0, 0, 2],
      home: [1, 0, 0, 0, 1, 1],
      totalColumns: ['R', 'H', 'E'],
      awayTotals: [2, 5, 0],
      homeTotals: [3, 7, 1],
    },
    tables: [
      {
        side: 'away',
        title: 'PHI Batting',
        columns: ['AB', 'H', 'RBI'],
        rows: [
          {
            player: { id: null, name: 'Bryce Harper' },
            note: '1B',
            sub: false,
            values: [3, 2, 2],
          },
        ],
      },
      {
        side: 'home',
        title: 'ATL Batting',
        columns: ['AB', 'H', 'RBI'],
        rows: [
          {
            player: { id: null, name: 'Ronald Acuña Jr.' },
            note: 'RF',
            sub: false,
            values: [3, 2, 1],
          },
        ],
      },
    ],
  }
  const games = [mlb, nfl, nba]
  /** A Game's detail: every Play in Game order. */
  const detail = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)!
    return {
      game,
      box: gameId === mlb.id ? box : null,
      items: items.filter((i) => i.gameId === gameId).reverse(),
    }
  }
  return { games, items, mlb, nba, nfl, box, detail }
}
