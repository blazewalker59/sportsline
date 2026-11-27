/**
 * The Timeline header's small controls: the Highlights pill, the live
 * connection dot, and the height-animated collapse the day strip opens in.
 */

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

export function ConnectionDot({ connection }: { connection: Connection }) {
  const label = {
    live: 'Live',
    connecting: 'Connecting',
    offline: 'Reconnecting',
  }[connection]
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="flex size-6 items-center justify-center"
    >
      <span
        className={cn('led', connection === 'live' ? 'led-pulse' : 'led-off')}
      />
    </span>
  )
}
