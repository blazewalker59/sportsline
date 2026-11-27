/**
 * A roster move, confirmed before anything goes to ESPN (docs/adr/0010):
 * the Player to add or claim, who to drop (optional, unless the move is a
 * drop), a bid in a budget league, the move in words, and one Confirm.
 * Its id is made when the sheet opens, so a second Confirm can't send it
 * twice.
 */

import { useState } from 'react'
import { POSITIONS, headshotOf, injuryLabel } from './format'
import type { AvailablePlayer } from '@/lib/fantasy/freeAgents'
import type { FantasyMove, MoveKind } from '@/lib/fantasy/moves'
import type { MoveOptions } from '@/lib/fantasy/rosterMoves'
import type { FantasySport } from '@/lib/fantasy/sports'
import { Sheet } from '@/components/chat/Sheet'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { PlayerButton } from '@/components/players/playerSheet'
import { moveSummary } from '@/lib/fantasy/moves'
import { useMakeMove } from '@/lib/fantasy/useFantasy'
import { cn } from '@/lib/utils'

export type MoveIntent =
  { kind: 'add' | 'claim'; player: AvailablePlayer } | { kind: 'drop' }

const TITLE: Record<MoveKind, string> = {
  add: 'Add player',
  claim: 'Waiver claim',
  drop: 'Drop player',
}

/** What came of a move, in a sentence. */
export function outcomeText(move: FantasyMove): string {
  const what = moveSummary(move)
  switch (move.status) {
    case 'done':
      return `Done: ${what}.`
    case 'pending':
      return `Claim in: ${what}. It waits for the league’s waivers to run.`
    case 'lost':
      return `${what}: another team won the claim.`
    case 'refused':
      return `ESPN didn’t make it: ${move.reason ?? 'no reason given'}`
    case 'sending':
    case 'unknown':
      return 'No answer from ESPN. It may have gone through: Sportsline checks the rosters in a few minutes, and Activity shows what ESPN did.'
  }
}

export function MoveSheet({
  leagueId,
  sport,
  options,
  intent,
  onClose,
}: {
  leagueId: string
  sport: FantasySport
  options: MoveOptions
  intent: MoveIntent
  onClose: () => void
}) {
  const [moveId] = useState(() => crypto.randomUUID())
  const [dropId, setDropId] = useState<number | null>(null)
  const budget = intent.kind === 'claim' ? options.budget : null
  const [bid, setBid] = useState(String(budget?.minimum ?? 0))
  const make = useMakeMove(leagueId)
  const add =
    intent.kind === 'drop'
      ? null
      : { espnId: intent.player.espnId, name: intent.player.name }
  const drop = options.roster.find((p) => p.espnId === dropId) ?? null
  const amount = budget ? Number(bid) : null
  const bidOk =
    !budget ||
    (Number.isInteger(amount) &&
      amount! >= budget.minimum &&
      amount! <= budget.left)
  const ready = (intent.kind !== 'drop' || drop !== null) && bidOk
  const summary = moveSummary({
    kind: intent.kind,
    add,
    drop: drop ? { espnId: drop.espnId, name: drop.name } : null,
    bid: amount,
  })
  const result = make.data
  return (
    <Sheet title={TITLE[intent.kind]} onClose={onClose}>
      {intent.kind !== 'drop' && (
        <PlayerButton
          playerId={intent.player.playerId}
          className="flex items-center gap-2.5 rounded-card border border-border bg-surface px-3 py-2.5"
        >
          <PlayerAvatar
            name={intent.player.name}
            headshotUrl={headshotOf(sport, intent.player)}
            size={36}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {intent.player.name}
            </span>
            <span className="mt-0.5 block truncate text-3xs text-muted uppercase">
              {[
                intent.player.teamAbbrev,
                intent.player.positionId === null
                  ? null
                  : POSITIONS[sport][intent.player.positionId],
                intent.player.injury && injuryLabel(intent.player.injury),
                intent.kind === 'claim' ? 'On waivers' : 'Free agent',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </PlayerButton>
      )}
      {result ? (
        <p
          role="status"
          data-status={result.status}
          className="well flex gap-2.5 rounded-card px-3 py-3 text-sm"
        >
          <span aria-hidden="true" className="shrink-0">
            {result.status === 'done'
              ? '●'
              : result.status === 'pending'
                ? '◐'
                : '○'}
          </span>
          {outcomeText(result)}
        </p>
      ) : (
        <>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-3xs font-bold text-foreground/80 uppercase">
              {intent.kind === 'drop' ? 'Who to drop' : 'Drop someone?'}
            </legend>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {intent.kind !== 'drop' && (
                <DropChoice
                  checked={dropId === null}
                  onChange={() => setDropId(null)}
                  label="Don’t drop anyone"
                  detail="ESPN refuses it if your roster is full."
                />
              )}
              {options.roster.map((p) => (
                <DropChoice
                  key={p.espnId}
                  checked={dropId === p.espnId}
                  onChange={() => setDropId(p.espnId)}
                  label={p.name}
                  detail={[
                    p.slot,
                    p.teamAbbrev,
                    p.injury && injuryLabel(p.injury),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  avatar={headshotOf(sport, p)}
                />
              ))}
            </ul>
          </fieldset>
          {budget && (
            <label className="flex flex-col gap-1 text-3xs font-bold text-foreground/80 uppercase">
              Bid
              <span className="flex items-center gap-2">
                <span className="text-muted">$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={budget.minimum}
                  max={budget.left}
                  step={1}
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  className="well min-h-10 w-24 rounded-control px-3 font-sans text-sm font-normal tracking-normal tabular-nums"
                />
                <span className="font-normal text-muted">
                  ${budget.left} of ${budget.total} left
                </span>
              </span>
            </label>
          )}
          {make.error && (
            <p role="alert" className="text-sm text-negative">
              {make.error.message}
            </p>
          )}
          <p className="text-sm">
            <span className="font-semibold">{summary}.</span>{' '}
            <span className="text-muted">
              A drop goes to waivers, where any team can claim them.
            </span>
          </p>
        </>
      )}
      {result ? (
        <button
          type="button"
          onClick={onClose}
          className="key inline-flex h-11 items-center justify-center rounded-control text-3xs font-bold uppercase"
        >
          Close
        </button>
      ) : (
        <button
          type="button"
          disabled={!ready || make.isPending}
          onClick={() =>
            make.mutate({
              moveId,
              kind: intent.kind,
              add,
              dropId,
              bid: amount,
            })
          }
          className="key key-ink inline-flex min-h-11 items-center justify-center rounded-control px-4 text-3xs font-bold uppercase"
        >
          {make.isPending ? 'Sending to ESPN…' : `Confirm: ${summary}`}
        </button>
      )}
    </Sheet>
  )
}

function DropChoice({
  checked,
  onChange,
  label,
  detail,
  avatar,
}: {
  checked: boolean
  onChange: () => void
  label: string
  detail: string
  avatar?: string | null
}) {
  return (
    <li>
      <label
        className={cn(
          'flex cursor-pointer items-center gap-2.5 px-3 py-2',
          checked && 'bg-notice',
        )}
      >
        <input
          type="radio"
          name="drop"
          checked={checked}
          onChange={onChange}
          className="size-4 shrink-0 accent-foreground"
        />
        {avatar !== undefined && (
          <PlayerAvatar name={label} headshotUrl={avatar} size={28} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{label}</span>
          {detail && (
            <span className="block truncate text-2xs text-muted">{detail}</span>
          )}
        </span>
      </label>
    </li>
  )
}
