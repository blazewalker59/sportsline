/**
 * Predictions (CONTEXT.md): connect Kalshi with a read-only key, then every
 * Prediction, open and settled, each opening its sheet.
 */

import { useState } from 'react'
import {
  PredictionSheet,
  PredictionSummary,
  Sparkline,
  money,
  pct,
  profitOf,
  profitText,
} from './PredictionParts'
import type { ChangeDisplay, PredictionView } from '@/lib/kalshi/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { timeAgo, useNow } from '@/components/timeline/format'
import {
  useConnectKalshi,
  useDisconnectKalshi,
  useKalshiConnection,
  usePredictions,
  useSetChangeDisplay,
  useSyncKalshi,
} from '@/lib/kalshi/usePredictions'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

export function PredictionsScreen() {
  const { data: viewerState, isPending } = useViewer()
  const connection = useKalshiConnection()
  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <AppHeader />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Predictions</h1>
      {isPending || connection.isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to connect your Kalshi account.
        </p>
      ) : connection.data ? (
        <Connected />
      ) : (
        <ConnectForm />
      )}
    </div>
  )
}

function ConnectForm() {
  const connect = useConnectKalshi()
  const [keyId, setKeyId] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        connect.mutate({ keyId: keyId.trim(), privateKey })
      }}
    >
      <p className="text-sm text-muted">
        Follow your Kalshi predictions here: their odds move with the game, and
        you’ll get Alerts for every big play in the games they depend on.
      </p>
      <ol className="list-decimal space-y-1 rounded-xl border border-border bg-surface py-3 pr-3 pl-8 text-sm">
        <li>On Kalshi, open Account → API Keys and create a key.</li>
        <li>
          Give it <span className="font-semibold">read-only</span> access.
          Sportsline refuses keys that can trade.
        </li>
        <li>Paste its key ID and the private key below.</li>
      </ol>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Key ID
        <input
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm font-normal"
          placeholder="a952bcbe-ec3b-4b5b-…"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Private key
        <textarea
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          rows={6}
          className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs font-normal"
          placeholder={
            '-----BEGIN RSA PRIVATE KEY-----\n…\n-----END RSA PRIVATE KEY-----'
          }
        />
      </label>
      {connect.error && (
        <p role="alert" className="text-sm text-live">
          {connect.error.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!keyId.trim() || !privateKey.trim() || connect.isPending}
        className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-background disabled:opacity-50"
      >
        {connect.isPending ? 'Checking with Kalshi…' : 'Connect Kalshi'}
      </button>
      <p className="text-[11px] text-muted">
        The private key is encrypted before it’s stored and only used to read
        your positions. Disconnect any time to delete it.
      </p>
    </form>
  )
}

function Connected() {
  const now = useNow()
  const connection = useKalshiConnection()
  const list = usePredictions()
  const sync = useSyncKalshi()
  const disconnect = useDisconnectKalshi()
  const setDisplay = useSetChangeDisplay()
  const [openId, setOpenId] = useState<string | null>(null)
  const predictions = list.data ?? []
  const open = predictions.filter((p) => p.status === 'open')
  const past = predictions.filter((p) => p.status !== 'open')
  const selected = predictions.find((p) => p.id === openId)
  const c = connection.data!
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
          <span className="block font-semibold">Kalshi connected</span>
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
                'Disconnect Kalshi and delete its key and Predictions?',
              )
            )
              disconnect.mutate()
          }}
          className="min-h-9 rounded-full px-2 text-[13px] font-semibold text-muted hover:text-live"
        >
          Disconnect
        </button>
      </section>

      <section className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">Show profit and loss as</span>
        <span
          role="radiogroup"
          aria-label="Show profit and loss as"
          className="flex gap-1 rounded-full bg-notice p-1"
        >
          {(
            [
              ['dollars', 'Dollars'],
              ['percent', 'Percent'],
            ] as Array<[ChangeDisplay, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={c.changeDisplay === value}
              onClick={() => setDisplay.mutate(value)}
              className={cn(
                'min-h-8 rounded-full px-3 text-[13px] font-semibold transition-colors',
                c.changeDisplay === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted',
              )}
            >
              {label}
            </button>
          ))}
        </span>
      </section>

      <PredictionSummary predictions={open} display={c.changeDisplay} />

      {list.isError && (
        <p
          role="alert"
          className="rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-sm text-live"
        >
          Couldn’t load your Predictions: {list.error.message}
        </p>
      )}
      {list.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <PredictionList
          title="Open"
          empty="No open Predictions. New ones appear within a few minutes of making them on Kalshi."
          predictions={open}
          onOpen={setOpenId}
          display={c.changeDisplay}
        />
      )}
      {past.length > 0 && (
        <PredictionList title="Settled" predictions={past} onOpen={setOpenId} />
      )}
      {selected && (
        <PredictionSheet
          prediction={selected}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function PredictionList({
  title,
  empty,
  predictions,
  onOpen,
  display = 'dollars',
}: {
  title: string
  empty?: string
  predictions: Array<PredictionView>
  onOpen: (id: string) => void
  display?: ChangeDisplay
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {title}
        {predictions.length > 0 && (
          <span className="ml-1 font-normal">{predictions.length}</span>
        )}
      </h2>
      {predictions.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {predictions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {p.side === 'no' && (
                      <span className="text-muted">Not: </span>
                    )}
                    {p.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {p.kind === 'combo'
                      ? `${p.legs.filter((l) => l.status === 'won').length}/${p.legs.length} legs · `
                      : ''}
                    {money(p.cost)} in
                  </span>
                </span>
                {p.status === 'open' ? (
                  <span className="flex items-center gap-2">
                    <Sparkline
                      points={p.history}
                      entry={p.entryChance}
                      width={48}
                      height={22}
                    />
                    <span className="flex w-16 flex-col text-right">
                      <span className="text-base leading-tight font-bold tabular-nums">
                        {p.chance === null ? '—' : pct(p.chance)}
                      </span>
                      {(() => {
                        const profit = profitOf(p)
                        return profit ? (
                          <span
                            className={cn(
                              'text-[11px] font-semibold tabular-nums',
                              profit.dollars > 0.004
                                ? 'text-scoring'
                                : profit.dollars < -0.004
                                  ? 'text-live'
                                  : 'text-muted',
                            )}
                          >
                            {profitText(profit, display)}
                          </span>
                        ) : null
                      })()}
                    </span>
                  </span>
                ) : (
                  <span
                    className={cn(
                      'text-right text-sm font-semibold tabular-nums',
                      p.result === 'won' ? 'text-scoring' : 'text-muted',
                    )}
                  >
                    {p.status === 'closed'
                      ? 'Closed'
                      : p.result === 'won'
                        ? 'Won'
                        : p.result === 'lost'
                          ? 'Lost'
                          : 'Void'}
                    {p.pnl !== null && (
                      <span className="block text-xs">
                        {p.pnl >= 0 ? '+' : ''}
                        {money(p.pnl)}
                      </span>
                    )}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
