import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { FollowButton } from './FollowButton'
import type { FollowEntry } from '@/lib/viewer/server'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { TeamLogo } from '@/components/brand/TeamMark'
import { PlayerAvatar } from '@/components/brand/PlayerAvatar'
import { AppHeader } from '@/components/layout/AppHeader'
import { LEAGUES } from '@/lib/model/types'
import { searchFollowables } from '@/lib/viewer/server'
import { useViewer } from '@/lib/viewer/useViewer'

export function FollowsScreen() {
  const { data, isPending } = useViewer()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 250)
  const results = useQuery({
    queryKey: ['followables', q],
    queryFn: () => searchFollowables({ data: { q } }),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
  })

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      {isPending ? null : !data?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to follow Teams, Players and Leagues.
        </p>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-muted">Leagues</h2>
          <div className="mb-6 flex flex-wrap gap-2">
            {LEAGUES.map((league) => (
              <div
                key={league}
                className="flex items-center gap-2 rounded-full border border-border py-1 pr-1 pl-3"
              >
                <LeagueLogo league={league} size={24} />
                <FollowButton follow={{ kind: 'league', league }} />
              </div>
            ))}
          </div>

          <label
            className="mb-2 block text-sm font-semibold text-muted"
            htmlFor="follow-search"
          >
            Teams and Players
          </label>
          <input
            id="follow-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. Yankees or Aaron Judge"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-base outline-none focus:border-foreground/50"
          />
          {q.length >= 2 && (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
              {results.data?.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted">No matches.</li>
              )}
              {results.data?.map((r) => (
                <EntryRow key={r.label + r.detail} entry={r} />
              ))}
            </ul>
          )}

          <h2 className="mt-8 mb-2 text-sm font-semibold text-muted">
            Following
          </h2>
          {data.follows.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing yet. Until you follow something, your{' '}
              <Link to="/" className="underline">
                Timeline
              </Link>{' '}
              shows every League.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {data.follows.map((f) => (
                <EntryRow key={f.label + f.league} entry={f} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function EntryRow({ entry }: { entry: FollowEntry }) {
  const player = entry.follow.kind === 'player' ? entry.follow : null
  const body = (
    <>
      {player ? (
        <PlayerAvatar
          name={entry.label}
          headshotUrl={entry.headshotUrl}
          team={
            entry.logoUrl
              ? { abbreviation: entry.label, logoUrl: entry.logoUrl }
              : null
          }
        />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-bubble-border bg-surface">
          {entry.logoUrl ? (
            <TeamLogo
              team={{ abbreviation: entry.label, logoUrl: entry.logoUrl }}
              size={28}
            />
          ) : (
            <LeagueLogo league={entry.league} size={24} />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{entry.label}</span>
        <span className="flex items-center gap-1.5 truncate text-xs text-muted">
          <LeagueLogo league={entry.league} size={14} />
          {entry.detail}
        </span>
      </span>
    </>
  )
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {player ? (
        <Link
          to="/players/$playerId"
          params={{ playerId: player.playerId }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      <FollowButton follow={entry.follow} />
    </li>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}
