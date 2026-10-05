/**
 * Fantasy (CONTEXT.md, "Fantasy league"): connect ESPN with session
 * cookies (a bookmarklet on espn.com, or pasted), then the Viewer's
 * leagues, each with its live Matchup, shown or hidden in the Timeline.
 */

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { MatchupSheet } from './FantasyParts'
import type { FantasyLeagueView } from '@/lib/fantasy/server'
import { getGames } from '@/lib/timeline/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { GRIP_DOTS, useDragReorder } from '@/components/layout/useDragReorder'
import { LeagueLogo } from '@/components/brand/LeagueLogo'
import { timeAgo, useNow } from '@/components/timeline/format'
import { SPORTS } from '@/lib/fantasy/sports'
import {
  useAddFantasyLeague,
  useConnectEspn,
  useConnectSleeper,
  useDisconnectEspn,
  useDisconnectSleeper,
  useEspnConnection,
  useFantasy,
  useFantasyConnected,
  useReorderFantasyLeagues,
  useSetFantasyLeagueEnabled,
  useSleeperConnection,
  useSyncFantasy,
} from '@/lib/fantasy/useFantasy'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

export function FantasyScreen() {
  const { data: viewerState, isPending } = useViewer()
  const { connected, pending } = useFantasyConnected()
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Fantasy</h1>
      {isPending || pending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to connect your fantasy leagues.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {!connected && (
            <p className="text-sm text-muted">
              Follow your fantasy Matchups live: your Starters’ and your
              opponent’s plays in the feed, Alerts for their big plays, and your
              score as it moves. Connect ESPN, Sleeper, or both.
            </p>
          )}
          <Connections />
          {connected && <Leagues />}
        </div>
      )}
    </div>
  )
}

/** ESPN and Sleeper: each connected or not, connected from right here. */
function Connections() {
  const now = useNow()
  const espn = useEspnConnection()
  const sleeper = useSleeperConnection()
  const sync = useSyncFantasy()
  const disconnectEspn = useDisconnectEspn()
  const disconnectSleeper = useDisconnectSleeper()
  // Back from the ESPN bookmarklet: open ESPN's form so it connects.
  const [open, setOpen] = useState<'espn' | 'sleeper' | null>(() =>
    typeof window !== 'undefined' && window.location.hash.includes('espn_s2')
      ? 'espn'
      : null,
  )
  const status = (c: {
    status: 'ok' | 'error'
    lastError: string | null
    syncedAt: string | null
  }) =>
    c.status === 'error'
      ? (c.lastError ?? 'Last sync failed')
      : c.syncedAt
        ? `Synced ${timeAgo(c.syncedAt, now)}`
        : 'Syncing…'
  const rows = [
    {
      key: 'espn' as const,
      name: 'ESPN',
      data: espn.data,
      detail: espn.data ? status(espn.data) : 'Not connected',
      disconnect: () => {
        if (
          window.confirm('Disconnect ESPN and delete its cookies and leagues?')
        )
          disconnectEspn.mutate()
      },
    },
    {
      key: 'sleeper' as const,
      name: 'Sleeper',
      data: sleeper.data,
      detail: sleeper.data
        ? `@${sleeper.data.username} · ${status(sleeper.data)}`
        : 'Not connected',
      disconnect: () => {
        if (window.confirm('Disconnect Sleeper and remove its leagues?'))
          disconnectSleeper.mutate()
      },
    },
  ]
  return (
    <section>
      <h2 className="mb-2 flex items-center justify-between text-xs font-bold tracking-wide text-muted uppercase">
        <span>Connections</span>
        {(espn.data || sleeper.data) && (
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="rounded-full bg-notice px-3 py-1 text-[12px] font-semibold tracking-normal normal-case"
          >
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  !r.data
                    ? 'bg-muted/40'
                    : r.data.status === 'ok'
                      ? 'bg-scoring'
                      : 'bg-live',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-muted">
                  {r.detail}
                </span>
              </span>
              {r.data ? (
                <button
                  type="button"
                  onClick={r.disconnect}
                  className="min-h-9 rounded-full px-2 text-[13px] font-semibold text-muted hover:text-live"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen((o) => (o === r.key ? null : r.key))}
                  aria-expanded={open === r.key}
                  className={cn(
                    'min-h-9 rounded-full px-3 text-[13px] font-semibold',
                    open === r.key
                      ? 'bg-notice text-foreground'
                      : 'bg-accent text-background',
                  )}
                >
                  {open === r.key ? 'Cancel' : 'Connect'}
                </button>
              )}
            </div>
            {open === r.key && !r.data && (
              <div className="border-t border-border px-3 py-3">
                {r.key === 'espn' ? <ConnectForm /> : <SleeperForm />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Sleeper is public: a username is all it takes. */
function SleeperForm() {
  const connect = useConnectSleeper()
  const [username, setUsername] = useState('')
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        connect.mutate(username.trim())
      }}
    >
      <label className="text-sm font-semibold" htmlFor="sleeper-username">
        Your Sleeper username
      </label>
      <span className="flex gap-2">
        <input
          id="sleeper-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="username"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!username.trim() || connect.isPending}
          className="min-h-10 rounded-full bg-accent px-4 text-[13px] font-semibold text-background disabled:opacity-50"
        >
          {connect.isPending ? 'Finding…' : 'Connect'}
        </button>
      </span>
      {connect.error && (
        <p role="alert" className="text-sm text-live">
          {connect.error.message}
        </p>
      )}
      <p className="text-[11px] text-muted">
        Sleeper’s leagues are public, so there’s no password or key: your NFL
        leagues this season are found from your username.
      </p>
    </form>
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

function Leagues() {
  const fantasy = useFantasy()
  const add = useAddFantasyLeague()
  const setEnabled = useSetFantasyLeagueEnabled()
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState<string | null>(null)
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
      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Your leagues
        </h2>
        {fantasy.isPending ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : leagues.length === 0 ? (
          <p className="text-sm text-muted">
            No leagues found yet. Add one by its URL below, or sync again.
          </p>
        ) : (
          <LeagueList
            leagues={leagues}
            onOpen={setOpen}
            onToggle={(l) =>
              setEnabled.mutate({ id: l.id, enabled: !l.enabled })
            }
          />
        )}
      </section>

      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-accent [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">+ Add a league by its URL</span>
          <span className="hidden group-open:inline">Add a league</span>
        </summary>
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(url.trim(), { onSuccess: () => setUrl('') })
          }}
        >
          <span className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ESPN or Sleeper league URL"
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
      </details>
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

/**
 * The Viewer's leagues, one compact row each, in their order (the
 * Timeline's Fantasy cards follow it): drag the grip to reorder, tap the
 * score for the Matchup, Show or Hide in the Timeline.
 */
function LeagueList({
  leagues,
  onOpen,
  onToggle,
}: {
  leagues: ReadonlyArray<FantasyLeagueView>
  onOpen: (id: string) => void
  onToggle: (league: FantasyLeagueView) => void
}) {
  const reorder = useReorderFantasyLeagues()
  const { dragging, active, shift, handle } = useDragReorder(
    leagues.map((l) => l.id),
    (ids) => reorder.mutate(ids),
  )
  return (
    <ol
      className="divide-y divide-border rounded-xl border border-border bg-surface"
      aria-label="Your leagues, in order"
    >
      {leagues.map((l, index) => (
        <li
          key={l.id}
          className={cn(
            'relative flex min-h-14 items-center gap-2 bg-surface py-1.5 pr-2 pl-0.5',
            dragging === l.id
              ? 'z-10 rounded-xl shadow-lg ring-1 ring-border'
              : active && 'transition-transform duration-150',
          )}
          style={
            active ? { transform: `translateY(${shift(index)}px)` } : undefined
          }
        >
          <button
            type="button"
            aria-label={`Move ${l.name}. Use the arrow keys to reorder.`}
            className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
            {...handle(l.id, index)}
          >
            <svg
              width="14"
              height="20"
              viewBox="0 0 14 20"
              fill="currentColor"
              aria-hidden="true"
            >
              {GRIP_DOTS.map(({ x, y }) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />
              ))}
            </svg>
          </button>
          <span
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5',
              !l.enabled && 'opacity-45',
            )}
          >
            <LeagueLogo league={SPORTS[l.sport].league} size={20} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {l.name}
              </span>
              <span
                className={cn(
                  'block truncate text-xs',
                  l.lastError ? 'text-live' : 'text-muted',
                )}
              >
                {l.lastError ??
                  [
                    l.teamName,
                    l.matchup?.mine.record,
                    l.provider === 'sleeper' ? 'Sleeper' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
              </span>
            </span>
          </span>
          {l.enabled && l.matchup && (
            <button
              type="button"
              onClick={() => onOpen(l.id)}
              aria-label={`${l.name} matchup`}
              className="flex shrink-0 flex-col items-end rounded-lg px-1.5 py-0.5 tabular-nums hover:bg-notice"
            >
              <MatchupScore league={l} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggle(l)}
            aria-pressed={l.enabled}
            className={cn(
              'min-h-8 shrink-0 rounded-full px-2.5 text-xs font-semibold',
              l.enabled
                ? 'border border-border text-foreground/80'
                : 'bg-notice text-muted',
            )}
          >
            {l.enabled ? 'Hide' : 'Show'}
          </button>
        </li>
      ))}
    </ol>
  )
}

/** "98.4 – 87.2" (or categories "6–3–1"), the leader's side bold. */
function MatchupScore({ league }: { league: FantasyLeagueView }) {
  const m = league.matchup!
  const cats = Boolean(m.categories)
  const fmt = (n: number) => (cats ? String(n) : n.toFixed(1))
  const theirs = m.opponent?.score
  const lead =
    theirs === undefined || m.mine.score === theirs
      ? null
      : m.mine.score > theirs
        ? 'mine'
        : 'opponent'
  return (
    <>
      <span className="text-sm leading-tight">
        <span
          className={cn(
            lead === 'mine' ? 'font-bold text-scoring' : 'text-foreground/75',
          )}
        >
          {fmt(m.mine.score)}
        </span>
        {theirs !== undefined && (
          <>
            <span className="text-muted"> – </span>
            <span
              className={cn(
                lead === 'opponent'
                  ? 'font-bold text-live'
                  : 'text-foreground/75',
              )}
            >
              {fmt(theirs)}
            </span>
          </>
        )}
      </span>
      <span className="text-[10px] leading-tight text-muted">
        {m.opponent ? `vs ${m.opponent.abbrev}` : 'Bye'}
      </span>
    </>
  )
}
