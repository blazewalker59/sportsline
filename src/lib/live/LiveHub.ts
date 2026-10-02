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
import type { TimelineEvent, TimelineFilter } from '@/lib/model/timeline'
import { followsFromParam, matchesFilter } from '@/lib/model/timeline'

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
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(filter)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Called by LiveGames with each poll's changes. */
  publish(events: Array<TimelineEvent>): void {
    for (const ws of this.ctx.getWebSockets()) {
      const filter = ws.deserializeAttachment() as TimelineFilter | null
      if (!filter) continue
      const visible = events.filter(
        (e) => e.type !== 'upsert' || matchesFilter(e.item, filter),
      )
      if (visible.length === 0) continue
      try {
        ws.send(JSON.stringify(visible))
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
