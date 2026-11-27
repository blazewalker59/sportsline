/**
 * The Timeline header's small controls: the Highlights pill, the live
 * connection dot, and the height-animated collapse the day strip opens in.
 */

import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/timeline/useLiveTimeline'
import { cn } from '@/lib/utils'

/** Highlights on/off (Scoring and Notable only): a labeled pill in the header. */
export function HighlightsButton({
  on,
  onChange,
}: {
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      // A key, held down (and inked) while on.
      className={cn(
        'key inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-3xs font-bold uppercase',
        on ? 'key-ink' : 'text-muted',
      )}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
      </svg>
      Highlights
    </button>
  )
}

/** Height-animated show/hide (grid rows 0fr ↔ 1fr), so rows slide instead of popping. */
export function Collapse({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-250 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** How long a lost or slow connection waits before it says so. */
const QUIET_MS = 3000

/**
 * The live connection, said only when it's missing: nothing while plays
 * arrive by themselves (orange means a live Game, not this), and after a
 * few seconds without it, "Reconnecting" beside an unlit LED. The wait
 * keeps a first connect or a quick reconnect from flashing it.
 */
export function ConnectionDot({ connection }: { connection: Connection }) {
  const [lost, setLost] = useState(false)
  const live = connection === 'live'
  useEffect(() => {
    if (live) {
      setLost(false)
      return
    }
    const t = setTimeout(() => setLost(true), QUIET_MS)
    return () => clearTimeout(t)
  }, [live])
  return (
    <span role="status" className="flex items-center gap-1.5">
      {lost && (
        <>
          <span aria-hidden="true" className="led led-off" />
          <span className="font-label text-3xs text-muted uppercase">
            Reconnecting
          </span>
        </>
      )}
    </span>
  )
}
