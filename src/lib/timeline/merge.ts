/**
 * Client-side Timeline state: the HTTP backlog plus whatever the LiveHub
 * socket has delivered since, newest first. Pure.
 */

import type {
  GameSummary,
  TimelineEvent,
  TimelineItem,
} from '@/lib/model/timeline'

export interface TimelineState {
  sportsDay: string
  items: ReadonlyMap<string, TimelineItem>
  games: ReadonlyMap<string, GameSummary>
}

export function emptyState(sportsDay: string): TimelineState {
  return { sportsDay, items: new Map(), games: new Map() }
}

export function withItems(
  state: TimelineState,
  items: ReadonlyArray<TimelineItem>,
): TimelineState {
  const next = new Map(state.items)
  for (const item of items)
    if (item.sportsDay === state.sportsDay) next.set(item.id, item)
  return { ...state, items: next }
}

export function withGames(
  state: TimelineState,
  games: ReadonlyArray<GameSummary>,
): TimelineState {
  const next = new Map(state.games)
  for (const game of games)
    if (game.sportsDay === state.sportsDay) next.set(game.id, game)
  return { ...state, games: next }
}

export function applyEvents(
  state: TimelineState,
  events: ReadonlyArray<TimelineEvent>,
): TimelineState {
  let next = state
  for (const event of events) {
    switch (event.type) {
      case 'upsert':
        next = withItems(next, [event.item])
        break
      case 'remove': {
        if (!next.items.has(event.id)) break
        const items = new Map(next.items)
        items.delete(event.id)
        next = { ...next, items }
        break
      }
      case 'game':
        next = withGames(next, [event.game])
        break
    }
  }
  return next
}

/** Newest first; ties broken by in-Game order. */
export function orderedItems(state: TimelineState): Array<TimelineItem> {
  return [...state.items.values()].sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) || b.sequence - a.sequence,
  )
}

const STATUS_ORDER: Record<string, number> = {
  live: 0,
  delayed: 0,
  scheduled: 1,
  final: 2,
  postponed: 3,
}

/** Live Games first, then upcoming by start time, then finished. */
export function orderedGames(state: TimelineState): Array<GameSummary> {
  return [...state.games.values()].sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      a.startsAt.localeCompare(b.startsAt),
  )
}

/**
 * Where the "you were here" divider goes: the index of the first item the
 * Viewer had already seen, or null when there is nothing new above it (or
 * nothing seen below it).
 */
export function readMarkerIndex(
  items: ReadonlyArray<TimelineItem>,
  readAt: string | null,
): number | null {
  if (!readAt) return null
  const index = items.findIndex((item) => item.occurredAt <= readAt)
  return index > 0 ? index : null
}
