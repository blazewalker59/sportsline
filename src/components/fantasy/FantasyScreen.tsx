/**
 * Fantasy (CONTEXT.md, "Fantasy league"): connect ESPN with session
 * cookies (a bookmarklet on espn.com, or pasted), then the Viewer's
 * leagues, each with its live Matchup, shown or hidden in the Timeline.
 */

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { MatchupCard, MatchupSheet } from './FantasyParts'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import { getGames } from '@/lib/timeline/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { timeAgo, useNow } from '@/components/timeline/format'
import { SPORTS } from '@/lib/fantasy/sports'
import {
  useAddFantasyLeague,
  useConnectEspn,
  useDisconnectEspn,
  useEspnConnection,
  useFantasy,
  useSetFantasyLeagueEnabled,
  useSyncFantasy,
} from '@/lib/fantasy/useFantasy'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

export function FantasyScreen() {
  const { data: viewerState, isPending } = useViewer()
  const connection = useEspnConnection()
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Fantasy</h1>
      {isPending || connection.isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to connect your ESPN fantasy leagues.
        </p>
      ) : connection.data ? (
        <Connected />
      ) : (
        <ConnectForm />
      )}
    </div>
  )
}

/** Reads espn.com's two session cookies and brings them back here. */
function bookmarklet(origin: string): string {
  const code = `(()=>{const c={};document.cookie.split('; ').forEach(p=>{const i=p.indexOf('=');c[p.slice(0,i)]=p.slice(i+1)});if(!c.espn_s2||!c.SWID){alert('Sign in to ESPN on this page first, then tap the bookmark again.');return}location.href='${origin}/fantasy#espn_s2='+encodeURIComponent(c.espn_s2)+'&swid='+encodeURIComponent(c.SWID)})()`
  return `javascript:${encodeURIComponent(code)}`
}

function ConnectForm() {
  const connect = useConnectEspn()
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')
  const [origin, setOrigin] = useState('')
  const link = useRef<HTMLAnchorElement>(null)
  // Back from the bookmarklet: connect with what it brought, then wipe it
  // from the address bar and history.
  useEffect(() => {
    setOrigin(window.location.origin)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const s2 = hash.get('espn_s2')
    const id = hash.get('swid')
    if (s2 && id) {
      history.replaceState(null, '', window.location.pathname)
      connect.mutate({
        swid: decodeURIComponent(id),
        espnS2: decodeURIComponent(s2),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // React drops javascript: hrefs, so the bookmarklet's is set directly.
  useEffect(() => {
    if (link.current && origin)
      link.current.setAttribute('href', bookmarklet(origin))
  }, [origin])
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Follow your ESPN fantasy Matchups live: your Starters’ and your
        opponent’s plays in the feed, Alerts for their big plays, and your score
        as it moves.
      </p>
      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold">The easy way</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Drag this button to your bookmarks bar:</li>
        </ol>
        <a
          ref={link}
          onClick={(e) => e.preventDefault()}
          className="self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background"
        >
          Sportsline ← ESPN
        </a>
        <ol
          start={2}
          className="list-decimal space-y-1 pl-5 text-sm text-muted"
        >
          <li>Open espn.com, signed in.</li>
          <li>Tap the bookmark. You’ll land back here, connected.</li>
        </ol>
      </section>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          connect.mutate({ swid: swid.trim(), espnS2: espnS2.trim() })
        }}
      >
        <h2 className="text-sm font-semibold">Or paste your cookies</h2>
        <p className="text-xs text-muted">
          On espn.com, signed in: your browser’s developer tools → Application
          (Storage) → Cookies → espn.com. Copy SWID and espn_s2.
        </p>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          SWID
          <input
            value={swid}
            onChange={(e) => setSwid(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm font-normal"
            placeholder="{8A1C…-…}"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          espn_s2
          <textarea
            value={espnS2}
            onChange={(e) => setEspnS2(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            rows={4}
            className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs font-normal"
            placeholder="AEB…"
          />
        </label>
        {connect.error && (
          <p role="alert" className="text-sm text-live">
            {connect.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={!swid.trim() || !espnS2.trim() || connect.isPending}
          className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-background disabled:opacity-50"
        >
          {connect.isPending ? 'Checking with ESPN…' : 'Connect ESPN'}
        </button>
        <p className="text-[11px] text-muted">
          These cookies are your ESPN session, so they’re encrypted before
          they’re stored and only used to read your leagues. Disconnect any time
          to delete them; signing out of ESPN also ends access.
        </p>
      </form>
    </div>
  )
}

function Connected() {
  const now = useNow()
  const connection = useEspnConnection()
  const fantasy = useFantasy()
  const sync = useSyncFantasy()
  const disconnect = useDisconnectEspn()
  const add = useAddFantasyLeague()
  const setEnabled = useSetFantasyLeagueEnabled()
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const c = connection.data!
  const leagues = fantasy.data ?? []
  const selected = leagues.find((l) => l.id === open && l.matchup)
  // Today's Games, for each Player's game state in the Matchup sheet.
  const games = useQuery({
    queryKey: ['games', 'today'],
    queryFn: () => getGames({ data: {} }),
    enabled: Boolean(selected),
    refetchInterval: 30_000,
  })
  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            c.status === 'ok' ? 'bg-scoring' : 'bg-live',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">ESPN connected</span>
          <span className="block truncate text-xs text-muted">
            {c.status === 'error'
              ? (c.lastError ?? 'Last sync failed')
              : c.syncedAt
                ? `Synced ${timeAgo(c.syncedAt, now)}`
                : 'Syncing…'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="min-h-9 rounded-full bg-notice px-3 text-[13px] font-semibold"
        >
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Disconnect ESPN and delete its cookies and leagues?',
              )
            )
              disconnect.mutate()
          }}
          className="min-h-9 rounded-full px-2 text-[13px] font-semibold text-muted hover:text-live"
        >
          Disconnect
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Your leagues
        </h2>
        {fantasy.isPending ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : leagues.length === 0 ? (
          <p className="text-sm text-muted">
            ESPN didn’t list any leagues yet. Add one by its URL below, or sync
            again.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leagues.map((l) => (
              <LeagueRow
                key={l.id}
                league={l}
                onOpen={() => setOpen(l.id)}
                onToggle={() =>
                  setEnabled.mutate({ id: l.id, enabled: !l.enabled })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate(url.trim(), { onSuccess: () => setUrl('') })
        }}
      >
        <label className="text-xs font-bold tracking-wide text-muted uppercase">
          Add a league
        </label>
        <span className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://fantasy.espn.com/football/league?leagueId=…"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!url.trim() || add.isPending}
            className="min-h-10 rounded-full bg-notice px-4 text-[13px] font-semibold disabled:opacity-50"
          >
            {add.isPending ? 'Adding…' : 'Add'}
          </button>
        </span>
        {add.error && (
          <p role="alert" className="text-sm text-live">
            {add.error.message}
          </p>
        )}
      </form>
      {selected && (
        <MatchupSheet
          league={selected}
          games={games.data ?? []}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function LeagueRow({
  league: l,
  onOpen,
  onToggle,
}: {
  league: FantasyLeagueView
  onOpen: () => void
  onToggle: () => void
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <span className="flex items-center gap-2">
        <LeagueLogo league={SPORTS[l.sport].league} size={18} />
        <span className={cn('min-w-0 flex-1', !l.enabled && 'opacity-50')}>
          <span className="block truncate text-sm font-semibold">{l.name}</span>
          {l.teamName && (
            <span className="block truncate text-xs text-muted">
              {l.teamName}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={l.enabled}
          className={cn(
            'min-h-9 rounded-full px-3 text-[13px] font-semibold',
            l.enabled
              ? 'border border-border text-foreground/80'
              : 'bg-notice text-muted',
          )}
        >
          {l.enabled ? 'Hide' : 'Show'}
        </button>
      </span>
      {l.lastError && <p className="text-xs text-live">{l.lastError}</p>}
      {l.enabled && l.matchup && (
        <span className="flex">
          <MatchupCard league={l} onOpen={onOpen} />
        </span>
      )}
    </li>
  )
}
