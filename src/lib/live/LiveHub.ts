/// <reference types="@cloudflare/workers-types" />
/**
 * The single relay between LiveGames and Viewers (docs/adr/0001, "Fan-out").
 * Each browser holds one hibernatable WebSocket; LiveGames publish Timeline
 * events here and the Hub forwards each Viewer only what their Follows
 * cover. It never stores Timeline data: D1 is the record, so after a
 * reconnect clients refetch the gap over HTTP.
 */

import { DurableObject } from 'cloudflare:workers'
import type { CloudflareEnv } from '@/lib/db'
import type {
  GameSummary,
  TimelineEvent,
  TimelineFilter,
} from '@/lib/model/timeline'
import {
  followsFromParam,
  inConference,
  isRanked,
  matchesFilter,
} from '@/lib/model/timeline'

export const LIVE_PATH = '/live'

export class LiveHub extends DurableObject<CloudflareEnv> {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env)
    // Keepalives are answered without waking the Hub from hibernation.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
  }

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const url = new URL(request.url)
    const filter: TimelineFilter = {
      follows: followsFromParam(url.searchParams.get('follows')),
      includeRoutine: url.searchParams.get('routine') === '1',
      gameId: url.searchParams.get('game') ?? undefined,
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(filter)
    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Called by LiveGames with each poll's changes. Sockets sharing a filter
   * (every Timeline's socket asks for all Leagues) share one payload.
   */
  publish(events: Array<TimelineEvent>): void {
    const payloads = new Map<string, string | null>()
    for (const ws of this.ctx.getWebSockets()) {
      const filter = ws.deserializeAttachment() as TimelineFilter | null
      if (!filter) continue
      const key = JSON.stringify(filter)
      let payload = payloads.get(key)
      if (payload === undefined) {
        const visible = events.filter((e) => covers(e, filter))
        payload = visible.length > 0 ? JSON.stringify(visible) : null
        payloads.set(key, payload)
      }
      if (payload === null) continue
      try {
        ws.send(payload)
      } catch {
        // Socket already closing; the close handler cleans up.
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number): void {
    // 1005/1006/1015 are reserved and may not be sent back.
    ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, 'closing')
  }
}

function covers(event: TimelineEvent, filter: TimelineFilter): boolean {
  switch (event.type) {
    case 'upsert':
      return matchesFilter(event.item, filter)
    case 'game':
      return gameCovered(event.game, filter)
    case 'remove':
      return !filter.gameId || event.gameId === filter.gameId
  }
}

/**
 * Does a socket's filter cover this Game's scoreboard? The Games its Team,
 * League, Top 25, Conference and Game Follows cover (the Timeline's socket
 * asks for every League, so its games strip sees every Game). Player and
 * Fantasy Follows name no Game: they get the Plays, not the scoreboards.
 */
function gameCovered(game: GameSummary, filter: TimelineFilter): boolean {
  if (filter.gameId) return game.id === filter.gameId
  return filter.follows.some((follow) => {
    switch (follow.kind) {
      case 'team':
        return (
          game.awayTeam.id === follow.teamId ||
          game.homeTeam.id === follow.teamId
        )
      case 'league':
        return game.league === follow.league
      case 'top25':
        return game.league === 'cfb' && isRanked(game)
      case 'conference':
        return game.league === 'cfb' && inConference(game, follow.conference)
      case 'game':
        return game.id === follow.gameId
      case 'player':
      case 'fantasy':
        return false
    }
  })
}
