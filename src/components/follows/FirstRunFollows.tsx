/**
 * The first-run Follow picker, inline at the top of the Timeline for a
 * Viewer with no Follows: pick Leagues, then Teams from them, and land on
 * the Following Scope for today's Sports Day. Skippable; once skipped,
 * finished or made moot by any Follow (viewer_settings.first_run_done_at)
 * it isn't offered again, on any device. /follows stays the place to
 * manage Follows afterwards.
 */

import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { FollowButton } from './FollowButton'
import type { ReactNode } from 'react'
import type { League } from '@/lib/model/types'
import type { FollowEntry } from '@/lib/viewer/server'
import { isCollege } from '@/lib/model/types'
import { RowItemMark, rowItemName } from '@/components/brand/RowItemMark'
import { TeamLogo } from '@/components/brand/TeamMark'
import { DEFAULT_LEAGUE_SETTINGS, visibleLeagues } from '@/lib/model/leagues'
import { leagueFollowablesQuery } from '@/lib/viewer/queries'
import {
  followKey,
  useDismissFirstRun,
  useSetFollow,
  useViewer,
} from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

/** Past this many Teams (college), a filter box helps. */
const FILTER_FROM = 40

/**
 * Shown to a signed-in Viewer who has no Follows and hasn't put the
 * picker behind them. Whether to show it is settled when it mounts, so
 * the first Follow (which marks it done) doesn't close it mid-pick.
 */
export function FirstRunFollows() {
  const { data } = useViewer()
  const [open, setOpen] = useState(
    () =>
      Boolean(data?.viewer) &&
      !data?.firstRunDone &&
      (data?.follows.length ?? 0) === 0,
  )
  if (!open) return null
  return <FollowPicker onClose={() => setOpen(false)} />
}

type Step = { kind: 'leagues' } | { kind: 'teams'; leagues: Array<League> }

export function FollowPicker({ onClose }: { onClose: () => void }) {
  const { data } = useViewer()
  const dismiss = useDismissFirstRun()
  const navigate = useNavigate()
  const leagues = visibleLeagues(data?.leagues ?? DEFAULT_LEAGUE_SETTINGS)
  const [picked, setPicked] = useState<Array<League>>([])
  const [step, setStep] = useState<Step>({ kind: 'leagues' })
  const followCount = data?.follows.length ?? 0

  const skip = () => {
    dismiss.mutate()
    onClose()
  }
  const finish = () => {
    onClose()
    // Following, today: a fresh search drops any day, Game or Prediction.
    void navigate({ to: '/', search: { scope: 'following' } })
  }

  return (
    <section
      aria-labelledby="first-run-title"
      // A container: the tile grids size to the card, not the window.
      className="@container mb-3 rounded-card border border-border bg-surface"
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-3xs text-muted uppercase">
            <span aria-hidden="true" className="flex gap-1">
              <span className="led led-ink size-1.5" />
              <span
                className={cn(
                  'led size-1.5',
                  step.kind === 'leagues' ? 'led-off' : 'led-ink',
                )}
              />
            </span>
            Step {step.kind === 'leagues' ? 1 : 2} of 2
          </p>
          <h2 id="first-run-title" className="mt-0.5 text-base font-semibold">
            {step.kind === 'leagues'
              ? 'Make this Timeline yours'
              : 'Pick your Teams'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {step.kind === 'leagues'
              ? 'Which Leagues do you watch?'
              : 'Their Games fill your Following Timeline.'}
          </p>
        </div>
        <button
          type="button"
          onClick={skip}
          className="key inline-flex h-8 shrink-0 items-center rounded-control px-3 text-3xs font-bold uppercase"
        >
          Skip
        </button>
      </header>

      {step.kind === 'leagues' ? (
        <>
          <ul
            className="grid grid-cols-3 gap-2 px-4 pt-3 @md:grid-cols-5"
            aria-label="Leagues"
          >
            {leagues.map((league) => {
              const on = picked.includes(league)
              return (
                <li key={league}>
                  <Tile
                    on={on}
                    onClick={() =>
                      setPicked((p) =>
                        on ? p.filter((l) => l !== league) : [...p, league],
                      )
                    }
                    mark={<RowItemMark item={league} size={28} />}
                    label={rowItemName(league)}
                  />
                </li>
              )
            })}
          </ul>
          <footer className="flex items-center justify-end gap-3 px-4 py-4">
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() =>
                // In the Viewer's own League order, whatever order they tapped.
                setStep({
                  kind: 'teams',
                  leagues: leagues.filter((l) => picked.includes(l)),
                })
              }
              className="key key-ink inline-flex h-10 items-center rounded-control px-5 text-3xs font-bold uppercase disabled:opacity-40"
            >
              Next
            </button>
          </footer>
        </>
      ) : (
        <>
          <TeamStep leagues={step.leagues} />
          <footer className="flex items-center gap-3 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setStep({ kind: 'leagues' })}
              className="key inline-flex h-10 items-center rounded-control px-3 text-3xs font-bold uppercase"
            >
              Back
            </button>
            <p className="min-w-0 flex-1 text-right text-2xs text-muted">
              {followCount === 0
                ? 'Pick one to finish'
                : `Following ${followCount}`}
            </p>
            <button
              type="button"
              disabled={followCount === 0}
              onClick={finish}
              className="key key-ink inline-flex h-10 shrink-0 items-center rounded-control px-5 text-3xs font-bold uppercase disabled:opacity-40"
            >
              Done
            </button>
          </footer>
          <p className="px-4 pb-3 text-2xs text-muted">
            Change these any time in{' '}
            <Link to="/follows" className="underline">
              Follows
            </Link>
            .
          </p>
        </>
      )}
    </section>
  )
}

function TeamStep({ leagues }: { leagues: Array<League> }) {
  const { data } = useViewer()
  const teams = useQuery(leagueFollowablesQuery(leagues))
  const [filter, setFilter] = useState('')
  const followed = useMemo(
    () => new Set((data?.follows ?? []).map((f) => followKey(f.follow))),
    [data?.follows],
  )
  const all = teams.data ?? []
  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? all.filter(
        (t) =>
          t.label.toLowerCase().includes(needle) ||
          t.detail?.toLowerCase().includes(needle),
      )
    : all

  return (
    // Held to a phone screen's worth, so Done stays in reach.
    <div className="mt-3 max-h-96 overflow-y-auto overscroll-contain border-t border-border px-4 pb-3">
      {all.length > FILTER_FROM && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a Team"
          aria-label="Find a Team"
          autoComplete="off"
          className="well mt-3 w-full rounded-control border border-transparent px-3 py-2 text-base outline-none placeholder:text-muted focus:border-foreground/50"
        />
      )}
      {teams.isPending ? (
        <p className="py-6 text-center text-sm text-muted">Loading Teams…</p>
      ) : teams.isError ? (
        <p className="py-6 text-center text-sm text-muted">
          Couldn’t load Teams.{' '}
          <button
            type="button"
            onClick={() => void teams.refetch()}
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      ) : (
        leagues.map((league) => {
          const inLeague = shown.filter((t) => t.league === league)
          return (
            <section key={league} aria-label={rowItemName(league)}>
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface pt-3 pb-2">
                <span aria-hidden="true" className="flex">
                  <RowItemMark item={league} size={18} />
                </span>
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {rowItemName(league)}
                </h3>
                {/* A college League is followed by Team (opt-in). */}
                {!isCollege(league) && (
                  <>
                    <span className="text-2xs text-muted">Every Game</span>
                    <FollowButton follow={{ kind: 'league', league }} />
                  </>
                )}
              </div>
              {inLeague.length === 0 ? (
                <p className="pb-2 text-2xs text-muted">
                  {needle ? 'No Teams match.' : 'No Teams yet.'}
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 @md:grid-cols-4">
                  {inLeague.map((team) => (
                    <li key={followKey(team.follow)}>
                      <TeamToggle
                        team={team}
                        following={followed.has(followKey(team.follow))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

/** One Team, followed or not with a tap; shows the answer before the server. */
function TeamToggle({
  team,
  following,
}: {
  team: FollowEntry
  following: boolean
}) {
  const setFollow = useSetFollow()
  const on = setFollow.isPending ? setFollow.variables.following : following
  return (
    <Tile
      on={on}
      disabled={setFollow.isPending}
      onClick={() =>
        setFollow.mutate({ follow: team.follow, following: !following })
      }
      mark={
        <TeamLogo
          team={{
            abbreviation: team.detail ?? team.label,
            logoUrl: team.logoUrl,
          }}
          size={28}
        />
      }
      label={team.label}
    />
  )
}

/** A League or Team to pick: its mark over its name, ticked when picked. */
function Tile({
  on,
  disabled,
  onClick,
  mark,
  label,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  mark: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      // A key: pressed in while picked.
      className="key relative flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-control px-1.5 text-center"
    >
      {/* The name labels the tile; a League's logo would say it twice. */}
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center"
      >
        {mark}
      </span>
      <span
        className={cn(
          'line-clamp-2 text-2xs leading-tight',
          on && 'font-semibold',
        )}
      >
        {label}
      </span>
      {on && (
        <span className="absolute top-1.5 right-1.5">
          <Check />
        </span>
      )}
      {!on && (
        <span
          aria-hidden="true"
          className="led led-off absolute top-2 right-2 size-1.5"
        />
      )}
    </button>
  )
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-foreground"
    >
      <path d="M2.5 7.5l3 3 6-7" />
    </svg>
  )
}
