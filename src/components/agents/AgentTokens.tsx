/**
 * The Agents page's API tokens (docs/adr/0007): how to connect an agent,
 * making a token (shown once), and the tokens made so far.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { FIELD, FIELD_LABEL, KEY, WIDE_KEY } from './shared'
import { timeAgo, useNow } from '@/components/timeline/format'
import { InlineError } from '@/components/layout/RouteStates'
import { RowsSkeleton } from '@/components/layout/Skeleton'
import { createApiToken, revokeApiToken } from '@/lib/agents/server'
import { apiTokensQuery, useApiTokens } from '@/lib/agents/queries'
import { SectionLabel } from '@/components/signal/Section'
import { cn } from '@/lib/utils'

const TOKENS_KEY = apiTokensQuery().queryKey

const noSubscription = () => () => {}

/** A token used this recently reads as at work. */
const ACTIVE_MS = 3_600_000

export function Tokens({ tradingReady }: { tradingReady: boolean }) {
  const queryClient = useQueryClient()
  const now = useNow()
  const tokens = useApiTokens()
  const [name, setName] = useState('')
  const [trade, setTrade] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: (d: { name: string; trade: boolean }) =>
      createApiToken({ data: d }),
    onSuccess: (r) => {
      setCreated(r.token)
      setName('')
      setTrade(false)
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiToken({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOKENS_KEY }),
  })
  const endpoint = useSyncExternalStore(
    noSubscription,
    () => `${window.location.origin}/mcp`,
    // The server can't know the address the page was opened at.
    () => '/mcp',
  )

  return (
    <>
      <section className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm">
        <p className="font-semibold">Connect an agent</p>
        <p className="text-muted">
          Add an MCP server with this URL, sending your token as a header:
        </p>
        <code className="well rounded-control px-3 py-2 font-mono text-xs break-all">
          {endpoint}
        </code>
        <code className="well rounded-control px-3 py-2 font-mono text-xs break-all">
          Authorization: Bearer sl_…
        </code>
      </section>

      {created ? (
        <section
          role="status"
          className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm"
        >
          <p className="flex items-center gap-2 font-semibold">
            <span className="led led-ink" aria-hidden="true" />
            Your new token
          </p>
          <p className="text-muted">
            Copy it now: it won’t be shown again. Anyone with it can use
            Sportsline as you, so keep it in your agent’s secrets.
          </p>
          <code className="well rounded-control px-3 py-2 font-mono text-xs break-all select-all">
            {created}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(created)}
              className={cn(KEY, 'key-ink')}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className={KEY}
            >
              Done
            </button>
          </div>
        </section>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate({ name: name.trim(), trade })
          }}
        >
          <label className={FIELD_LABEL}>
            New token
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="off"
              placeholder="What it’s for, e.g. Grok"
              className={FIELD}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={trade}
              onChange={(e) => setTrade(e.target.checked)}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              <span className="font-semibold">Can propose Kalshi trades</span>
              <span className="block text-xs text-muted">
                You approve each one here before anything is traded.
                {!tradingReady && ' Connect a trade key below first.'}
              </span>
            </span>
          </label>
          {create.error && (
            <p role="alert" className="text-sm text-negative">
              {create.error.message}
            </p>
          )}
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            className={WIDE_KEY}
          >
            {create.isPending ? 'Creating…' : 'Create token'}
          </button>
        </form>
      )}

      <section>
        <SectionLabel title="Your tokens" index="J2">
          {tokens.data?.length || null}
        </SectionLabel>
        {tokens.isPending ? (
          <RowsSkeleton rows={2} label="Loading your tokens" />
        ) : tokens.isError && tokens.data === undefined ? (
          <InlineError
            what="your tokens"
            error={tokens.error}
            onRetry={() => tokens.refetch()}
          />
        ) : !tokens.data?.length ? (
          <p className="well rounded-card px-4 py-5 text-center text-sm text-muted">
            None yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card bg-surface">
            {tokens.data.map((t) => {
              // Lit while its agent is at work (used in the last hour).
              const active =
                now !== null &&
                t.lastUsedAt !== null &&
                now - Date.parse(t.lastUsedAt) < ACTIVE_MS
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{t.name}</span>
                      {t.scopes.includes('trade') && (
                        <span className="well shrink-0 rounded-[5px] px-1.5 py-0.5 text-3xs uppercase">
                          Can trade
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-3xs text-muted uppercase">
                      <span className="font-mono normal-case">{t.prefix}…</span>{' '}
                      ·{' '}
                      {t.lastUsedAt
                        ? `used ${timeAgo(t.lastUsedAt, now)}`
                        : 'never used'}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn('led', !active && 'led-off')}
                  />
                  <button
                    type="button"
                    disabled={revoke.isPending}
                    onClick={() => {
                      if (
                        confirm(`Revoke “${t.name}”? Its agent stops working.`)
                      )
                        revoke.mutate(t.id)
                    }}
                    className={cn(KEY, 'text-muted')}
                  >
                    Revoke
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
