/**
 * What the Viewer has riding on the Timeline (CONTEXT.md, "Stakes"): their
 * Fantasy Starters (and their opponents'), the Players and Games in their
 * open Predictions, and their Follows. Which plays move a stake, and which
 * Games carry one, for the phone's home board and the feed's tags. Pure.
 */

import type { GameSummary, TimelineItem } from '@/lib/model/timeline'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import type { LegView, PredictionView } from '@/lib/kalshi/predictionViews'

export type FantasySide = 'mine' | 'opponent'

/** A Leg whose Player a play names, with the Prediction it's in. */
export interface LegStake {
  prediction: Pick<PredictionView, 'id' | 'title' | 'kind'>
  leg: Pick<LegView, 'title' | 'playerName' | 'progress' | 'status'>
}

export interface StakeIndex {
  /** Our Player id → whose Starter they are. Theirs win over the opponent. */
  starters: ReadonlyMap<string, FantasySide>
  /** Our Team ids with a Starter (either side) playing for them. */
  starterTeams: ReadonlySet<string>
  /** Our Player id → the open Predictions' Legs on them. */
  legs: ReadonlyMap<string, ReadonlyArray<LegStake>>
  /** Games an open Prediction's Leg depends on. */
  predictionGames: ReadonlySet<string>
}

export const EMPTY_STAKES: StakeIndex = {
  starters: new Map(),
  starterTeams: new Set(),
  legs: new Map(),
  predictionGames: new Set(),
}

/** Index the Viewer's Matchups and open Predictions by Player and Game. */
export function stakeIndex(
  leagues: ReadonlyArray<FantasyLeagueView>,
  predictions: ReadonlyArray<PredictionView>,
): StakeIndex {
  const starters = new Map<string, FantasySide>()
  const starterTeams = new Set<string>()
  for (const l of leagues) {
    if (!l.enabled || !l.matchup) continue
    const sides: Array<[FantasySide, ReadonlyArray<StarterLike>]> = [
      ['opponent', l.matchup.opponent?.lineup ?? []],
      ['mine', l.matchup.mine.lineup],
    ]
    for (const [side, lineup] of sides)
      for (const p of lineup) {
        if (!p.starter) continue
        // The Viewer's own Starters win when a Player is on both sides.
        if (p.playerId) starters.set(p.playerId, side)
        if (p.teamId) starterTeams.add(p.teamId)
      }
  }
  const legs = new Map<string, Array<LegStake>>()
  const predictionGames = new Set<string>()
  for (const p of predictions) {
    if (p.status !== 'open') continue
    for (const leg of p.legs) {
      if (leg.game) predictionGames.add(leg.game.id)
      if (!leg.playerId || leg.status !== 'pending') continue
      const list = legs.get(leg.playerId) ?? []
      list.push({
        prediction: { id: p.id, title: p.title, kind: p.kind },
        leg: {
          title: leg.title,
          playerName: leg.playerName,
          progress: leg.progress,
          status: leg.status,
        },
      })
      legs.set(leg.playerId, list)
    }
  }
  return { starters, starterTeams, legs, predictionGames }
}

interface StarterLike {
  starter: boolean
  playerId?: string | null
  teamId?: string | null
}

/** What a play did for the Viewer: whose Starters it named, which Legs. */
export interface ItemStakes {
  fantasy: { side: FantasySide; names: Array<string> } | null
  legs: Array<LegStake>
}

/** A Player's name as a tag shows it: "Brunson", not "Jalen Brunson". */
const surname = (name: string) => name.split(' ').slice(1).join(' ') || name

export function itemStakes(item: TimelineItem, index: StakeIndex): ItemStakes {
  if (item.kind === 'milestone') return { fantasy: null, legs: [] }
  const hits: Array<{ side: FantasySide; name: string }> = []
  const legs: Array<LegStake> = []
  for (const p of item.players) {
    const side = index.starters.get(p.id)
    if (side) hits.push({ side, name: surname(p.name) })
    legs.push(...(index.legs.get(p.id) ?? []))
  }
  // The Viewer's own Starters lead; the opponent's only when there's none.
  const side = hits.some((h) => h.side === 'mine') ? 'mine' : 'opponent'
  const names = hits.filter((h) => h.side === side).map((h) => h.name)
  return {
    fantasy: names.length ? { side, names: [...new Set(names)] } : null,
    legs,
  }
}

/** Does a play move one of the Viewer's stakes ("Affects me")? */
export function affectsViewer(item: TimelineItem, index: StakeIndex): boolean {
  const s = itemStakes(item, index)
  return s.fantasy?.side === 'mine' || s.legs.length > 0
}

export type GameStake = 'following' | 'prediction' | 'fantasy'

/** What the Viewer has riding on a Game, for its tile's marks. */
export function gameStakes(
  game: GameSummary,
  index: StakeIndex,
  followsGame: (g: GameSummary) => boolean,
): Array<GameStake> {
  const out: Array<GameStake> = []
  if (followsGame(game)) out.push('following')
  if (index.predictionGames.has(game.id)) out.push('prediction')
  if (
    index.starterTeams.has(game.awayTeam.id) ||
    index.starterTeams.has(game.homeTeam.id)
  )
    out.push('fantasy')
  return out
}

/** A Game on now (live, or held up mid-game). */
export const isLiveGame = (g: Pick<GameSummary, 'status'>) =>
  g.status === 'live' || g.status === 'delayed'

/**
 * The board's order: live Games first, then those still to come by start,
 * then the finished; within each, Games carrying a stake first.
 */
export function boardOrder(
  games: ReadonlyArray<GameSummary>,
  staked: (g: GameSummary) => boolean,
): Array<GameSummary> {
  const rank = (g: GameSummary) =>
    isLiveGame(g) ? 0 : g.status === 'final' ? 2 : 1
  return games
    .map((g, i) => ({ g, i }))
    .sort(
      (a, b) =>
        rank(a.g) - rank(b.g) ||
        Number(staked(b.g)) - Number(staked(a.g)) ||
        (rank(a.g) === 1 ? a.g.startsAt.localeCompare(b.g.startsAt) : 0) ||
        a.i - b.i,
    )
    .map((x) => x.g)
}
