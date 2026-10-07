/**
 * Agents (docs/adr/0007): API tokens that let an AI agent read Sportsline
 * as you, through the MCP server at /mcp. A new token is shown once.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { timeAgo, useNow } from '@/components/timeline/format'
import {
  createApiToken,
  getApiTokens,
  revokeApiToken,
} from '@/lib/agents/server'
import { useViewer } from '@/lib/viewer/useViewer'

const TOKENS_KEY = ['api-tokens']

export function AgentsScreen() {
  const { data: viewerState, isPending } = useViewer()
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Agents</h1>
      {isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to connect an agent.
        </p>
      ) : (
        <Tokens />
      )}
    </div>
  )
}

function Tokens() {
  const queryClient = useQueryClient()
  const now = useNow()
  const tokens = useQuery({
    queryKey: TOKENS_KEY,
    queryFn: () => getApiTokens(),
  })
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: (n: string) => createApiToken({ data: { name: n } }),
    onSuccess: (r) => {
      setCreated(r.token)
      setName('')
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiToken({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOKENS_KEY }),
  })
  const endpoint =
    typeof window === 'undefined' ? '/mcp' : `${window.location.origin}/mcp`

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Let an AI agent (Grok, Claude or your own bot) read Sportsline as you:
        today’s Sharp picks and their record. Agents can’t trade or change
        anything.
      </p>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-sm">
        <p className="font-semibold">Connect an agent</p>
        <p className="text-muted">
          Add an MCP server with this URL, sending your token as a header:
        </p>
        <code className="rounded-lg bg-background px-2 py-1.5 font-mono text-xs break-all">
          {endpoint}
        </code>
        <code className="rounded-lg bg-background px-2 py-1.5 font-mono text-xs break-all">
          Authorization: Bearer sl_…
        </code>
      </section>

      {created ? (
        <section
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-3 text-sm"
        >
          <p className="font-semibold">Your new token</p>
          <p className="text-muted">
            Copy it now: it won’t be shown again. Anyone with it can read
            Sportsline as you, so keep it in your agent’s secrets.
          </p>
          <code className="rounded-lg bg-background px-2 py-1.5 font-mono text-xs break-all select-all">
            {created}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(created)}
              className="min-h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-background"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="min-h-9 rounded-full px-3 text-[13px] font-semibold text-muted"
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
            if (name.trim()) create.mutate(name.trim())
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            New token
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="off"
              placeholder="What it’s for, e.g. Grok"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal"
            />
          </label>
          {create.error && (
            <p role="alert" className="text-sm text-live">
              {create.error.message}
            </p>
          )}
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-background disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create token'}
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          Your tokens
        </h2>
        {tokens.isPending ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !tokens.data?.length ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.data.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-muted">
                    <span className="font-mono">{t.prefix}…</span> ·{' '}
                    {t.lastUsedAt
                      ? `used ${timeAgo(t.lastUsedAt, now)}`
                      : 'never used'}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (confirm(`Revoke “${t.name}”? Its agent stops working.`))
                      revoke.mutate(t.id)
                  }}
                  className="min-h-9 rounded-full px-2 text-[13px] font-semibold text-muted hover:text-live disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
