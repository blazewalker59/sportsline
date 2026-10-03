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
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
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
    .$type<Array<League>>()
    .notNull(),
  hidden: text('hidden_leagues', { mode: 'json' })
    .$type<Array<League>>()
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
