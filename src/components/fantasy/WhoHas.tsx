/**
 * Who Has? (CONTEXT.md, "Who Has?"): when the app opens and one of the
 * Viewer's leagues had an Injury Event, a sheet pops up asking which of
 * four teams has the Player. Answered or closed, it never comes back.
 */

import { useEffect, useState } from 'react'
import { headshotOf } from './format'
import type { WhoHasRecord, WhoHasView } from '@/lib/fantasy/server'
import { Sheet } from '@/components/chat/Sheet'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { useAnswerWhoHas, useWhoHas } from '@/lib/fantasy/useFantasy'
import { injuryNews } from '@/lib/fantasy/whoHas'
import { cn } from '@/lib/utils'

/** Let the screen settle before popping up. */
const POP_AFTER_MS = 1200

export interface WhoHasResult {
  pick: number
  ownerTeamId: number
  record: WhoHasRecord
}

export function WhoHasPopup() {
  const whoHas = useWhoHas()
  const answer = useAnswerWhoHas()
  const [ready, setReady] = useState(false)
  const [closed, setClosed] = useState(false)
  const [result, setResult] = useState<WhoHasResult | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), POP_AFTER_MS)
    return () => clearTimeout(t)
  }, [])
  const encounter = whoHas.data?.encounter
  if (!encounter || !ready || closed) return null
  return (
    <Sheet
      title="Who has?"
      onClose={() => {
        // Closed before guessing: passed on, so it isn't offered again.
        if (!result && !answer.isPending)
          answer.mutate({ id: encounter.id, teamId: null })
        setClosed(true)
      }}
    >
      <WhoHasCard
        encounter={encounter}
        result={result}
        pending={answer.isPending}
        onPick={(teamId) =>
          answer.mutate(
            { id: encounter.id, teamId },
            {
              onSuccess: (r) => {
                if (r) setResult({ pick: teamId, ...r })
                else setClosed(true)
              },
            },
          )
        }
        onDone={() => setClosed(true)}
      />
    </Sheet>
  )
}

/** The Player, the question and four teams; then who it was. */
export function WhoHasCard({
  encounter: e,
  result,
  pending = false,
  onPick,
  onDone,
}: {
  encounter: WhoHasView
  result: WhoHasResult | null
  pending?: boolean
  onPick: (teamId: number) => void
  onDone: () => void
}) {
  const owner = result
    ? e.options.find((o) => o.teamId === result.ownerTeamId)
    : undefined
  const right = result !== null && result.pick === result.ownerTeamId
  return (
    <>
      <header className="flex flex-col items-center gap-2 text-center">
        <PlayerAvatar
          name={e.player.name}
          headshotUrl={headshotOf(e.sport, e.player)}
          team={
            e.player.teamAbbrev
              ? {
                  abbreviation: e.player.teamAbbrev,
                  logoUrl: e.player.teamLogo ?? null,
                }
              : null
          }
          size={72}
        />
        <span>
          <span className="block text-lg font-bold">{e.player.name}</span>
          <span className="block text-sm font-semibold text-live">
            {injuryNews(e.status)}
          </span>
        </span>
        <p className="text-sm text-muted">
          Which team in {e.leagueName} has {e.player.name}?
        </p>
      </header>
      <ul className="grid grid-cols-2 gap-2">
        {e.options.map((o) => {
          const isOwner = result?.ownerTeamId === o.teamId
          const wrongPick = result?.pick === o.teamId && !isOwner
          return (
            <li key={o.teamId}>
              <button
                type="button"
                disabled={result !== null || pending}
                onClick={() => onPick(o.teamId)}
                className={cn(
                  'min-h-14 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                  isOwner
                    ? 'border-scoring bg-scoring/15 text-scoring'
                    : wrongPick
                      ? 'border-live bg-live/10 text-live'
                      : result
                        ? 'border-border text-muted'
                        : 'border-border bg-surface hover:bg-notice',
                )}
              >
                {o.name}
              </button>
            </li>
          )
        })}
      </ul>
      {result && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm">
            {right ? (
              <span className="font-semibold text-scoring">Right!</span>
            ) : (
              <>
                <span className="font-semibold text-live">Not quite.</span>{' '}
                {owner?.name ?? 'Another team'} has them.
              </>
            )}{' '}
            <span className="text-muted">
              You’re {result.record.right} for {result.record.answered}.
            </span>
          </p>
          <button
            type="button"
            onClick={onDone}
            className="min-h-11 rounded-full bg-accent px-6 text-sm font-semibold text-background"
          >
            Done
          </button>
        </div>
      )}
    </>
  )
}
