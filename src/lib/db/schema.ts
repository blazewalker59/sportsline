/**
 * Drizzle schema for the Cloudflare D1 database: the single source of truth
 * for the database shape, drizzle-kit migrations and the Better Auth adapter.
 *
 * Better Auth tables are owned by Better Auth (copied from dreamteam; do not
 * hand-edit their shapes). App tables use Sportsline ids (`tm_…`, `pl_…`,
 * `gm_…`) everywhere; Source ids live only in `source_ids` (docs/adr/0002).
 */

import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
import type { FantasySport } from '@/lib/fantasy/sports'
import type { MatchupView } from '@/lib/fantasy/matchup'
import type { Conference, RowItem } from '@/lib/model/leagues'
import type {
  GameBox,
  Json,
  League,
  MilestoneKind,
  Side,
  Significance,
  Situation,
} from '@/lib/model/types'
import type { TimelinePlayer } from '@/lib/model/timeline'

// ─── Better Auth (generated; do not hand-edit shapes) ───────────────────────

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

// ─── Identity (docs/adr/0002) ───────────────────────────────────────────────

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  league: text('league').$type<League>().notNull(),
  name: text('name').notNull(),
  abbreviation: text('abbreviation').notNull(),
  logoUrl: text('logo_url'),
})

export const players = sqliteTable(
  'players',
  {
    id: text('id').primaryKey(),
    league: text('league').$type<League>().notNull(),
    name: text('name').notNull(),
    /** Current Team, from the nightly roster sync; null until synced. */
    teamId: text('team_id'),
    position: text('position'),
    /** A headshot from the Source's CDN, from the roster sync. */
    headshotUrl: text('headshot_url'),
  },
  (table) => [index('players_league_name_idx').on(table.league, table.name)],
)

/** Maps a Source's own id for a Team, Player or Game to Sportsline's id. */
export const sourceIds = sqliteTable(
  'source_ids',
  {
    entity: text('entity').$type<'team' | 'player' | 'game'>().notNull(),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    internalId: text('internal_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entity, table.source, table.sourceId] }),
    index('source_ids_internal_idx').on(table.internalId),
  ],
)

// ─── Games & Timeline ───────────────────────────────────────────────────────

export const games = sqliteTable(
  'games',
  {
    id: text('id').primaryKey(),
    league: text('league').$type<League>().notNull(),
    sportsDay: text('sports_day').notNull(),
    startsAt: text('starts_at').notNull(),
    status: text('status').notNull(),
    awayTeamId: text('away_team_id')
      .notNull()
      .references(() => teams.id),
    homeTeamId: text('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayScore: integer('away_score').notNull().default(0),
    homeScore: integer('home_score').notNull().default(0),
    /** College football: each team's AP Top 25 rank at this Game, if ranked. */
    awayRank: integer('away_rank'),
    homeRank: integer('home_rank'),
    /** College football: each team's major conference at this Game, if any. */
    awayConference: text('away_conference').$type<Conference>(),
    homeConference: text('home_conference').$type<Conference>(),
    situation: text('situation', { mode: 'json' }).$type<Situation | null>(),
    box: text('box', { mode: 'json' }).$type<GameBox | null>(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('games_sports_day_idx').on(table.sportsDay)],
)

export const timelineItems = sqliteTable(
  'timeline_items',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    /** The adapter's key for this item within its Game. */
    itemKey: text('item_key').notNull(),
    league: text('league').$type<League>().notNull(),
    sportsDay: text('sports_day').notNull(),
    awayTeamId: text('away_team_id').notNull(),
    homeTeamId: text('home_team_id').notNull(),
    kind: text('kind').$type<'play' | 'milestone' | 'overturn'>().notNull(),
    /** The team whose action this Play is, if any. */
    side: text('side').$type<Side>(),
    sequence: integer('sequence').notNull(),
    occurredAt: text('occurred_at').notNull(),
    segmentLabel: text('segment_label').notNull(),
    awayScore: integer('away_score').notNull(),
    homeScore: integer('home_score').notNull(),
    description: text('description').notNull(),
    playType: text('play_type'),
    significance: text('significance').$type<Significance>(),
    milestone: text('milestone').$type<MilestoneKind>(),
    status: text('status').$type<'active' | 'overturned'>().notNull(),
    revisedAt: text('revised_at'),
    overturnOf: text('overturn_of'),
    players: text('players', { mode: 'json' })
      .$type<Array<TimelinePlayer>>()
      .notNull(),
    detail: text('detail', { mode: 'json' }).$type<Json>(),
  },
  (table) => [
    unique('timeline_items_game_key_uq').on(table.gameId, table.itemKey),
    index('timeline_items_day_time_idx').on(table.sportsDay, table.occurredAt),
  ],
)

/** Which Players each item names, for Player Follow lookups. */
export const itemPlayers = sqliteTable(
  'item_players',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => timelineItems.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.playerId] }),
    index('item_players_player_idx').on(table.playerId),
  ],
)

// ─── Viewers ────────────────────────────────────────────────────────────────

/** A Viewer's Follows (CONTEXT.md). `target` is a League code, Team id or Player id. */
export const follows = sqliteTable(
  'follows',
  {
    viewerId: text('viewer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'league' | 'team' | 'player'>().notNull(),
    target: text('target').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.viewerId, table.kind, table.target] }),
  ],
)

/** A Viewer's Reaction to a Timeline item (CONTEXT.md): one emoji each. */
export const reactions = sqliteTable(
  'reactions',
  {
    itemId: text('item_id').notNull(),
    viewerId: text('viewer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.viewerId] })],
)

/** How a Viewer arranges Leagues: their order on the Scope row, and which are hidden. */
export const leagueSettings = sqliteTable('league_settings', {
  viewerId: text('viewer_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  order: text('league_order', { mode: 'json' })
    .$type<Array<RowItem>>()
    .notNull(),
  hidden: text('hidden_leagues', { mode: 'json' })
    .$type<Array<RowItem>>()
    .notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** Where each Viewer stopped reading the Timeline (CONTEXT.md, "Read Marker"). */
export const readMarkers = sqliteTable('read_markers', {
  viewerId: text('viewer_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** occurredAt of the newest item the Viewer had seen. */
  readAt: text('read_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** A Viewer's device that receives Alerts (CONTEXT.md, "Alert"): one Web Push subscription. */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    viewerId: text('viewer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('push_subscriptions_viewer_idx').on(table.viewerId)],
)

/** How much each Alert source sends a Viewer (CONTEXT.md, "Alert level"). */
export const alertSettings = sqliteTable('alert_settings', {
  viewerId: text('viewer_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  following: text('following')
    .$type<'scores' | 'finals' | 'off'>()
    .notNull()
    .default('scores'),
  predictions: text('predictions')
    .$type<'key' | 'scores' | 'off'>()
    .notNull()
    .default('key'),
  fantasy: text('fantasy')
    .$type<'key' | 'mine' | 'off'>()
    .notNull()
    .default('key'),
})

/** Alerts already sent for one-time events (a Leg hitting), by key. */
export const alertMarks = sqliteTable('alert_marks', {
  key: text('key').primaryKey(),
  at: text('at').notNull(),
})

// ─── Kalshi (docs/adr/0003) ─────────────────────────────────────────────────

/** A Viewer's Kalshi connection: a read-only key, its private half sealed. */
export const kalshiAccounts = sqliteTable('kalshi_accounts', {
  viewerId: text('viewer_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  keyId: text('key_id').notNull(),
  keyType: text('key_type').$type<'rsa' | 'ed25519'>().notNull(),
  /** AES-GCM ciphertext and IV of the PEM private key (base64). */
  keyCiphertext: text('key_ciphertext').notNull(),
  keyIv: text('key_iv').notNull(),
  scopes: text('scopes', { mode: 'json' }).$type<Array<string>>().notNull(),
  status: text('status').$type<'ok' | 'error'>().notNull(),
  lastError: text('last_error'),
  connectedAt: text('connected_at').notNull(),
  syncedAt: text('synced_at'),
  /** How Prediction cards show profit or loss: dollars or percent return. */
  changeDisplay: text('change_display')
    .$type<'dollars' | 'percent'>()
    .notNull()
    .default('dollars'),
})

/** A Viewer's Prediction (CONTEXT.md): one Kalshi market they hold. */
export const predictions = sqliteTable(
  'predictions',
  {
    id: text('id').primaryKey(),
    viewerId: text('viewer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    marketTicker: text('market_ticker').notNull(),
    kind: text('kind').$type<'single' | 'combo'>().notNull(),
    side: text('side').$type<'yes' | 'no'>().notNull(),
    title: text('title').notNull(),
    contracts: real('contracts').notNull(),
    /** What the Viewer paid, in dollars. */
    cost: real('cost').notNull(),
    /** The Viewer's chance when last Alerted about it (or first seen). */
    alertChance: real('alert_chance'),
    status: text('status').$type<'open' | 'settled' | 'closed'>().notNull(),
    result: text('result').$type<'won' | 'lost' | 'void'>(),
    payout: real('payout'),
    pnl: real('pnl'),
    openedAt: text('opened_at').notNull(),
    /** When the Viewer first bought in, from Kalshi's fills (null: unknown). */
    tradedAt: text('traded_at'),
    settledAt: text('settled_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('predictions_viewer_idx').on(table.viewerId, table.status),
    unique('predictions_viewer_market_uq').on(
      table.viewerId,
      table.marketTicker,
    ),
  ],
)

/** One market a Prediction rests on, matched to our Game, Team or Player. */
export const predictionLegs = sqliteTable(
  'prediction_legs',
  {
    predictionId: text('prediction_id')
      .notNull()
      .references(() => predictions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    marketTicker: text('market_ticker').notNull(),
    eventTicker: text('event_ticker').notNull(),
    side: text('side').$type<'yes' | 'no'>().notNull(),
    title: text('title').notNull(),
    gameId: text('game_id'),
    teamId: text('team_id'),
    playerId: text('player_id'),
  },
  (table) => [
    primaryKey({ columns: [table.predictionId, table.position] }),
    index('prediction_legs_game_idx').on(table.gameId),
    index('prediction_legs_market_idx').on(table.marketTicker),
  ],
)

/** Kalshi markets we watch, with their latest prices (dollars). */
export const kalshiMarkets = sqliteTable('kalshi_markets', {
  ticker: text('ticker').primaryKey(),
  eventTicker: text('event_ticker').notNull(),
  title: text('title').notNull(),
  yesBid: real('yes_bid'),
  yesAsk: real('yes_ask'),
  lastPrice: real('last_price'),
  /** The line a "greater than" market is over (299.5 for 300+). */
  floorStrike: real('floor_strike'),
  status: text('status'),
  result: text('result'),
  updatedAt: text('updated_at').notNull(),
})

/** A watched market's YES chance over time, one point a minute at most. */
export const kalshiPrices = sqliteTable(
  'kalshi_prices',
  {
    ticker: text('ticker').notNull(),
    at: text('at').notNull(),
    chance: real('chance').notNull(),
  },
  (table) => [primaryKey({ columns: [table.ticker, table.at] })],
)

/** Kalshi's real-world game behind an event, and our Game once matched. */
export const kalshiEvents = sqliteTable('kalshi_events', {
  eventTicker: text('event_ticker').primaryKey(),
  milestoneId: text('milestone_id'),
  league: text('league').$type<League>(),
  startsAt: text('starts_at'),
  homeName: text('home_name'),
  awayName: text('away_name'),
  gameId: text('game_id'),
  checkedAt: text('checked_at').notNull(),
})

/** Kalshi's team and player records (structured targets), cached. */
export const kalshiTargets = sqliteTable('kalshi_targets', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  league: text('league'),
})

// ─── ESPN Fantasy (docs/adr/0004) ───────────────────────────────────────────

/** A Viewer's ESPN connection: their session cookies, sealed. */
export const espnAccounts = sqliteTable('espn_accounts', {
  viewerId: text('viewer_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  swidCiphertext: text('swid_ciphertext').notNull(),
  swidIv: text('swid_iv').notNull(),
  s2Ciphertext: text('s2_ciphertext').notNull(),
  s2Iv: text('s2_iv').notNull(),
  status: text('status').$type<'ok' | 'error'>().notNull(),
  lastError: text('last_error'),
  connectedAt: text('connected_at').notNull(),
  syncedAt: text('synced_at'),
  discoveredAt: text('discovered_at'),
})

/** A Viewer's Sleeper connection: just who they are (Sleeper is public). */
export const sleeperAccounts = sqliteTable('sleeper_accounts', {
  viewerId: text('viewer_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
  userId: text('user_id').notNull(),
  status: text('status').$type<'ok' | 'error'>().notNull(),
  lastError: text('last_error'),
  connectedAt: text('connected_at').notNull(),
  syncedAt: text('synced_at'),
  discoveredAt: text('discovered_at'),
})

/** A Viewer's Fantasy league, with their latest Matchup (as read). */
export const fantasyLeagues = sqliteTable(
  'fantasy_leagues',
  {
    id: text('id').primaryKey(),
    viewerId: text('viewer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sport: text('sport').$type<FantasySport>().notNull(),
    /** Where the league lives: ESPN (cookies) or Sleeper (public). */
    provider: text('provider')
      .$type<'espn' | 'sleeper'>()
      .notNull()
      .default('espn'),
    leagueId: text('league_id').notNull(),
    season: integer('season').notNull(),
    teamId: integer('team_id'),
    name: text('name').notNull(),
    teamName: text('team_name'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    /** The Viewer's order for their leagues (null: after the ordered ones). */
    position: integer('position'),
    matchup: text('matchup', { mode: 'json' }).$type<MatchupView | null>(),
    lastError: text('last_error'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('fantasy_leagues_viewer_idx').on(table.viewerId)],
)

/** Each Matchup's Players, mapped to ours: for the Fantasy feed and Alerts. */
export const fantasyPlayers = sqliteTable(
  'fantasy_players',
  {
    leagueRowId: text('league_row_id')
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: 'cascade' }),
    espnId: integer('espn_id').notNull(),
    side: text('side').$type<'mine' | 'opponent'>().notNull(),
    playerId: text('player_id'),
    starter: integer('starter', { mode: 'boolean' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.leagueRowId, table.espnId, table.side] }),
    index('fantasy_players_player_idx').on(table.playerId),
  ],
)

/**
 * A Matchup's score over its period, a point each time it moved (or every
 * ten minutes): the race on the Matchup sheet (fantasy/race.ts).
 */
export const fantasyScorePoints = sqliteTable(
  'fantasy_score_points',
  {
    leagueRowId: text('league_row_id')
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: 'cascade' }),
    at: text('at').notNull(),
    matchupPeriod: integer('matchup_period').notNull(),
    mine: real('mine').notNull(),
    opponent: real('opponent').notNull(),
  },
  (table) => [primaryKey({ columns: [table.leagueRowId, table.at] })],
)

// ─── Operations (src/lib/ops) ───────────────────────────────────────────────

/** Errors, grouped by what went wrong, for the health page and its Alerts. */
export const errorEvents = sqliteTable('error_events', {
  /** Scope plus the message with ids and numbers taken out. */
  fingerprint: text('fingerprint').primaryKey(),
  scope: text('scope').notNull(),
  message: text('message').notNull(),
  count: integer('count').notNull(),
  firstAt: text('first_at').notNull(),
  lastAt: text('last_at').notNull(),
  /** The latest occurrence's details (ids, stack). */
  context: text('context', { mode: 'json' }).$type<Record<string, unknown>>(),
  /** When the admins were last pushed about it. */
  notifiedAt: text('notified_at'),
})

/** Each background job's heartbeat: when it ran, last worked, last failed. */
export const jobRuns = sqliteTable('job_runs', {
  name: text('name').primaryKey(),
  /** How often it should succeed (ms): older than twice this is stale. */
  everyMs: integer('every_ms').notNull(),
  lastStartedAt: text('last_started_at'),
  lastOkAt: text('last_ok_at'),
  lastErrorAt: text('last_error_at'),
  lastError: text('last_error'),
  lastDurationMs: integer('last_duration_ms'),
  runs: integer('runs').notNull().default(0),
  failures: integer('failures').notNull().default(0),
})

// ─── Sharp picks (src/lib/sharp, docs/adr/0006) ─────────────────────────────

/** A day's Sharp picks: five singles (rank 1–5) and the combo (rank 6). */
export const sharpPicks = sqliteTable(
  'sharp_picks',
  {
    /** "2026-10-05:1". */
    id: text('id').primaryKey(),
    /** The Sports Day the slate is for. */
    day: text('day').notNull(),
    rank: integer('rank').notNull(),
    kind: text('kind').$type<'single' | 'combo'>().notNull(),
    league: text('league').$type<League>(),
    gameId: text('game_id'),
    startsAt: text('starts_at').notNull(),
    /** A single's market (null for the combo). */
    marketTicker: text('market_ticker'),
    side: text('side').$type<'yes' | 'no'>(),
    marketKind: text('market_kind').$type<'moneyline' | 'spread' | 'total'>(),
    title: text('title').notNull(),
    gameLabel: text('game_label').notNull(),
    /** Fair chance of the pick (the combo's: its legs multiplied). */
    fair: real('fair').notNull(),
    /** Kalshi's price when published (the combo's: its legs multiplied). */
    price: real('price').notNull(),
    fee: real('fee').notNull(),
    edge: real('edge').notNull(),
    evPerDollar: real('ev_per_dollar').notNull(),
    grade: text('grade').$type<'strong' | 'edge' | 'thin'>().notNull(),
    sources: text('sources', { mode: 'json' })
      .$type<Array<{ source: string; prob: number }>>()
      .notNull(),
    /** The combo's legs, as singles are stored (without their own ids). */
    legs: text('legs', { mode: 'json' }).$type<Array<{
      marketTicker: string
      side: 'yes' | 'no'
      title: string
      gameLabel: string
      league: League
      startsAt: string
      fair: number
      price: number
      /** Absent on legs published before form was read. */
      form?: { lean: number; note: string } | null
      currentPrice: number | null
      closingPrice: number | null
      result: 'won' | 'lost' | null
    }> | null>(),
    /** A single: what the Teams' recent form says (null: too few Games). */
    form: text('form', { mode: 'json' }).$type<{
      lean: number
      note: string
    } | null>(),
    /** The combo: the most worth paying for it on Kalshi. */
    worthItUnder: real('worth_it_under'),
    /** Re-checked through the day: Kalshi's price now and the edge left. */
    currentPrice: real('current_price'),
    currentEdge: real('current_edge'),
    checkedAt: text('checked_at'),
    /** Kalshi's price at the start (closing line value is measured on it). */
    closingPrice: real('closing_price'),
    result: text('result').$type<'won' | 'lost' | 'void'>(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('sharp_picks_day_idx').on(table.day)],
)
