/**
 * Predictions (CONTEXT.md): connect Kalshi with a read-only key, then every
 * Prediction, open and settled, each opening its sheet.
 */

import { useState } from 'react'
import {
  LegDots,
  OddsMeter,
  PropProgress,
  arrowOf,
  isLivePrediction,
  leadGame,
  money,
  pct,
  profitOf,
  profitText,
  toneOf,
} from './PredictionParts'
import { PredictionSheet } from './PredictionSheet'
import { PredictionSummary } from './PredictionPortfolio'
import { PredictionRecordSection } from './PredictionRecord'
import { SharpPicksSection } from './SharpPicks'
import { PriceDisplayToggle } from './PriceDisplayToggle'
import type { ChangeDisplay } from '@/lib/kalshi/server'
import type { PredictionView } from '@/lib/kalshi/predictionViews'
import { Segmented } from '@/components/signal/Segmented'
import { AppHeader } from '@/components/layout/AppHeader'
import { SectionLabel } from '@/components/signal/Section'
import { InlineError, ScreenError } from '@/components/layout/RouteStates'
import { CardSkeleton, RowsSkeleton } from '@/components/layout/Skeleton'
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
      {isPending ? null : !viewerState?.viewer ? (
        <p className="mt-16 text-center text-sm text-muted">
          Sign in to connect your Kalshi account.
        </p>
      ) : connection.isPending ? (
        <div className="flex flex-col gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : connection.isError && connection.data === undefined ? (
        // Not knowing isn't the same as not connected: no connect form.
        <ScreenError
          error={connection.error}
          onRetry={() => connection.refetch()}
        />
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
      <ol className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm">
        {[
          <>On Kalshi, open Account → API Keys and create a key.</>,
          <>
            Give it <span className="font-semibold">read-only</span> access.
            Sportsline refuses keys that can trade.
          </>,
          <>Paste its key ID and the private key below.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 font-label text-3xs text-muted">
              0{i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <label className="flex flex-col gap-1.5 text-3xs text-muted uppercase">
        Key ID
        <input
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={FIELD}
          placeholder="a952bcbe-ec3b-4b5b-…"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-3xs text-muted uppercase">
        Private key
        <textarea
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          rows={6}
          className={cn(FIELD, 'text-xs')}
          placeholder={
            '-----BEGIN RSA PRIVATE KEY-----\n…\n-----END RSA PRIVATE KEY-----'
          }
        />
      </label>
      {connect.error && (
        <p role="alert" className="text-sm text-negative">
          {connect.error.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!keyId.trim() || !privateKey.trim() || connect.isPending}
        className="key key-ink inline-flex h-11 items-center justify-center rounded-control px-5 text-3xs font-bold uppercase"
      >
        {connect.isPending ? 'Checking with Kalshi…' : 'Connect Kalshi'}
      </button>
      <p className="text-2xs text-muted">
        The private key is encrypted before it’s stored and only used to read
        your positions. Disconnect any time to delete it.
      </p>
    </form>
  )
}

/** A text field (Signal): recessed into the page. */
const FIELD =
  'well rounded-control px-3 py-2 font-mono text-sm tracking-normal text-foreground normal-case'

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
      <PredictionSummary
        predictions={open}
        display={c.changeDisplay}
        onOpen={setOpenId}
      />

      {list.isPending ? (
        <RowsSkeleton rows={3} label="Loading your Predictions" />
      ) : list.isError && list.data === undefined ? (
        <InlineError
          what="your Predictions"
          error={list.error}
          onRetry={() => list.refetch()}
        />
      ) : (
        <OpenPredictions
          predictions={open}
          onOpen={setOpenId}
          display={c.changeDisplay}
        />
      )}

      <SharpPicksSection />

      <PredictionRecordSection />

      <section className="flex flex-col gap-3">
        <SectionLabel title="Kalshi" index="E4" />
        <div className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 text-sm">
          <span
            aria-hidden="true"
            className={cn(
              'led shadow-none',
              c.status === 'ok' ? 'bg-positive' : 'bg-negative',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Kalshi connected</span>
            <span className="block truncate text-3xs text-muted uppercase">
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
            className={KEY}
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
            className={cn(KEY, 'text-muted')}
          >
            Disconnect
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Show profit and loss as</span>
          <Segmented
            label="Show profit and loss as"
            value={c.changeDisplay}
            options={
              [
                ['dollars', 'Dollars'],
                ['percent', 'Percent'],
              ] as Array<[ChangeDisplay, string]>
            }
            onChange={(v) => setDisplay.mutate(v)}
          />
        </div>
        <PriceDisplayToggle />
      </section>

      {past.length > 0 && (
        <SettledPredictions predictions={past} onOpen={setOpenId} />
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

/** A key (Signal): a raised cap with its label in the manual's face. */
const KEY =
  'key inline-flex h-9 shrink-0 items-center justify-center rounded-control px-3 text-3xs font-bold uppercase'

/** Open Predictions as panels: each one's Odds on a meter, Combos' Legs as glyphs. */
function OpenPredictions({
  predictions,
  onOpen,
  display,
}: {
  predictions: Array<PredictionView>
  onOpen: (id: string) => void
  display: ChangeDisplay
}) {
  return (
    <section>
      <SectionLabel title="Open" index="E1">
        {predictions.length > 0 && predictions.length}
      </SectionLabel>
      {predictions.length === 0 ? (
        <p className="well rounded-card px-4 py-5 text-center text-sm text-muted">
          No open Predictions. New ones appear within a few minutes of making
          them on Kalshi.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {predictions.map((p) => (
            <li key={p.id}>
              <OpenPanel prediction={p} onOpen={onOpen} display={display} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function OpenPanel({
  prediction: p,
  onOpen,
  display,
}: {
  prediction: PredictionView
  onOpen: (id: string) => void
  display: ChangeDisplay
}) {
  const live = isLivePrediction(p)
  const game = leadGame(p)
  const profit = profitOf(p)
  const progress = p.kind === 'single' ? (p.legs[0]?.progress ?? null) : null
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      className="flex w-full flex-col gap-2.5 rounded-card bg-surface p-4 text-left"
    >
      <span className="flex items-center justify-between gap-2 text-3xs text-muted uppercase">
        <span className="truncate">
          {p.kind === 'combo'
            ? `Combo · ${p.legs.length} legs`
            : `Single${game ? ` · ${game.league}` : ''}`}
        </span>
        {live && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="led led-pulse" aria-hidden="true" />
            {game?.situation?.segmentLabel ?? 'Live'}
          </span>
        )}
      </span>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-[15px] leading-snug font-semibold">
          {p.side === 'no' && <span className="text-muted">Not: </span>}
          {p.title}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-xl leading-none font-bold tabular-nums">
            {p.chance === null ? '—' : pct(p.chance)}
          </span>
          {profit && (
            <span
              className={cn(
                'mt-1 text-2xs font-semibold tabular-nums',
                toneOf(profit.dollars),
              )}
            >
              {arrowOf(profit.dollars)} {profitText(profit, display)}
            </span>
          )}
        </span>
      </span>
      {p.kind === 'combo' && (
        <span className="flex items-center gap-2">
          <LegDots legs={p.legs} />
          <span className="ml-auto shrink-0 text-3xs text-muted uppercase tabular-nums">
            {money(p.cost)} to win {money(p.contracts)}
          </span>
        </span>
      )}
      <OddsMeter prediction={p} />
      {progress && <PropProgress progress={progress} />}
    </button>
  )
}

/** Settled Predictions: hairline rows, ● won and ○ lost down the left. */
function SettledPredictions({
  predictions,
  onOpen,
}: {
  predictions: Array<PredictionView>
  onOpen: (id: string) => void
}) {
  return (
    <section>
      <SectionLabel title="Settled" index="E5">
        {predictions.length}
      </SectionLabel>
      <ul className="divide-y divide-border rounded-card bg-surface">
        {predictions.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span aria-hidden="true" className="w-3 text-center text-xs">
                {p.result === 'won' ? '●' : '○'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {p.side === 'no' && <span className="text-muted">Not: </span>}
                  {p.title}
                </span>
                <span className="block truncate text-3xs text-muted uppercase">
                  {p.kind === 'combo'
                    ? `${p.legs.filter((l) => l.status === 'won').length}/${p.legs.length} legs · `
                    : ''}
                  {money(p.cost)} in
                </span>
              </span>
              <span className="flex flex-col items-end text-right">
                <span className="text-3xs text-muted uppercase">
                  {p.status === 'closed'
                    ? 'Closed'
                    : p.result === 'won'
                      ? 'Won'
                      : p.result === 'lost'
                        ? 'Lost'
                        : 'Void'}
                </span>
                {p.pnl !== null && (
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      toneOf(p.pnl),
                    )}
                  >
                    {p.pnl >= 0 ? '+' : ''}
                    {money(p.pnl)}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
