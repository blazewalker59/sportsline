/**
 * The shared, League-agnostic model every Source adapter produces
 * (CONTEXT.md). Nothing here carries a Source's own shapes; Source IDs appear
 * only as opaque `SourceRef`s that the identity layer maps to Sportsline IDs
 * (docs/adr/0002).
 */

export const LEAGUES = ['mlb', 'nba', 'nfl', 'cfb', 'nhl'] as const
export type League = (typeof LEAGUES)[number]

export const SIGNIFICANCES = ['scoring', 'notable', 'routine'] as const
export type Significance = (typeof SIGNIFICANCES)[number]

export type Side = 'away' | 'home'

/** League-specific payloads (Play Detail, Situation) are plain JSON. */
export type Json =
  string | number | boolean | null | Array<Json> | { [key: string]: Json }

export type GameStatus =
  'scheduled' | 'live' | 'delayed' | 'final' | 'postponed'

export interface Score {
  away: number
  home: number
}

/** A Source's own id for a Team or Player, opaque outside the adapter. */
export interface SourceRef {
  sourceId: string
  name: string
}

export interface SourceTeam extends SourceRef {
  abbreviation: string
  /** A logo that reads on a dark background, from the Source's CDN. */
  logoUrl: string | null
}

export interface InvolvedPlayer extends SourceRef {
  /** League-specific role in the Play: batter, pitcher, runner, fielder… */
  role: string
}

export type MilestoneKind =
  'start' | 'segment_end' | 'final' | 'delay' | 'postponed'

interface ItemBase {
  /** Stable key for this item within its Game, assigned by the adapter. */
  key: string
  /** Order within the Game; later items have larger values. */
  sequence: number
  occurredAt: string
  /**
   * The Source gave no wall-clock time, so `occurredAt` is estimated from
   * the game clock. A LiveGame replaces it with the time it first saw the
   * item, except while backfilling a Game's earlier history.
   */
  timeEstimated?: boolean
  /** e.g. "Top 4th", "Q3 4:12", "2nd 13:05". */
  segmentLabel: string
  /** Score once this item is complete. */
  score: Score
  description: string
}

/** A Play as an adapter reports it (CONTEXT.md, "Play"). */
export interface SourcePlay extends ItemBase {
  kind: 'play'
  /** League-specific Play Type, e.g. "home_run", "stolen_base_2b". */
  playType: string
  significance: Significance
  /** The side whose action this Play is (batting team in MLB). */
  side: Side | null
  involved: Array<InvolvedPlayer>
  /**
   * Players credited with a stat by this Play without being named in it
   * (e.g. the pitcher charged with an inherited runner's run). Not Involved
   * Players, so they never match a Player Follow.
   */
  credits: Array<SourceRef & { credit: string }>
  /** League-specific Play Detail payload (Pitches, hit data…). */
  detail: Json
}

/** A Game Milestone as an adapter reports it (CONTEXT.md, "Game Milestone"). */
export interface SourceMilestone extends ItemBase {
  kind: 'milestone'
  milestone: MilestoneKind
}

export type SourceItem = SourcePlay | SourceMilestone

/** A Game's Situation (CONTEXT.md, "Situation"), League-specific beyond the basics. */
export interface Situation {
  segmentLabel: string
  /** League-specific context: count and runners in MLB, etc. */
  detail: Json
}

/**
 * A Game's box score in a League-agnostic table shape: a linescore by
 * segment plus stat tables per side. `TPlayer` is how a row names its player: a
 * SourceRef from the adapter, a Sportsline id once stored.
 */
export interface Box<TPlayer> {
  linescore: {
    segments: Array<string>
    away: Array<number | null>
    home: Array<number | null>
    totalColumns: Array<string>
    awayTotals: Array<number>
    homeTotals: Array<number>
  }
  tables: Array<BoxTable<TPlayer>>
}

export interface BoxTable<TPlayer> {
  side: Side
  title: string
  columns: Array<string>
  rows: Array<{
    player: TPlayer
    /** e.g. position. */
    note: string | null
    /** Entered the Game as a substitute. */
    sub: boolean
    values: Array<string | number>
  }>
}

export type SourceBox = Box<SourceRef>
/** A box score as stored: players by Sportsline id (null if never resolved). */
export type GameBox = Box<{ id: string | null; name: string }>

/** Everything an adapter knows about one Game at one moment. */
export interface GameSnapshot {
  league: League
  sourceGameId: string
  status: GameStatus
  startsAt: string
  /** The Sports Day the Source files this Game under (YYYY-MM-DD). */
  sportsDay: string
  away: SourceTeam
  home: SourceTeam
  score: Score
  situation: Situation | null
  /** Every completed Play and Game Milestone so far, in any order. */
  items: Array<SourceItem>
  box: SourceBox | null
  /** Source's suggested seconds before the next poll, if it gives one. */
  pollHintSeconds?: number
}

/** A Game on a League's schedule, before its play-by-play is fetched. */
export interface ScheduledGame {
  league: League
  sourceGameId: string
  status: GameStatus
  startsAt: string
  sportsDay: string
  away: SourceTeam
  home: SourceTeam
  score: Score
}

/** A Player as a Source's roster lists them. */
export interface SourcePlayer extends SourceRef {
  /** Source id of the Team they currently play for, if any. */
  teamSourceId: string | null
  position: string | null
}

/** A League's Teams and Players, for the nightly roster sync. */
export interface SourceRoster {
  teams: Array<SourceTeam>
  players: Array<SourcePlayer>
}

/** One League's Source, behind the boundary (CONTEXT.md, "Source"). */
export interface SourceAdapter {
  league: League
  /** Names this Source in the identity mapping, e.g. "mlb-statsapi". */
  source: string
  schedule: (sportsDay: string) => Promise<Array<ScheduledGame>>
  snapshot: (sourceGameId: string) => Promise<GameSnapshot>
  roster: (season: number) => Promise<SourceRoster>
}
