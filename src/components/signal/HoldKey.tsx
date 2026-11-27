/**
 * A key you hold to confirm (Signal): for an action that moves money, so a
 * stray tap never sends it. Pressed and held (pointer, or Space/Enter), a
 * ring of dots lights around its edge; when it closes, `onConfirm` runs.
 * Let go early and nothing happens. Activated without a hold (a screen
 * reader's click), it asks once more: "Press again to confirm".
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** How long to hold. */
export const HOLD_MS = 900
/** How long "Press again to confirm" waits for the second press. */
const ARMED_MS = 5_000
const DOTS = 24

export function HoldKey({
  children,
  onConfirm,
  disabled = false,
  className,
}: {
  /** What it does, e.g. "Hold to cash out $71.80". */
  children: React.ReactNode
  onConfirm: () => void
  disabled?: boolean
  className?: string
}) {
  const [progress, setProgress] = useState(0)
  const [armed, setArmed] = useState(false)
  const start = useRef<number | null>(null)
  const frame = useRef<number | null>(null)
  const held = useRef(false)
  const done = useRef(false)

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    start.current = null
    setProgress(0)
  }

  const tick = (t: number) => {
    if (start.current === null) start.current = t
    const p = Math.min(1, (t - start.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      done.current = true
      stop()
      setArmed(false)
      onConfirm()
      return
    }
    frame.current = requestAnimationFrame(tick)
  }

  const begin = () => {
    if (disabled || frame.current !== null) return
    held.current = true
    done.current = false
    frame.current = requestAnimationFrame(tick)
  }
  const end = () => {
    held.current = false
    if (!done.current) stop()
  }

  useEffect(() => () => stop(), [])
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), ARMED_MS)
    return () => clearTimeout(t)
  }, [armed])

  const lit = Math.round(progress * DOTS)
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        begin()
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          begin()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') end()
      }}
      onClick={(e) => {
        // A click with no hold behind it (assistive tech): confirm in two
        // presses instead.
        if (e.detail !== 0 || held.current || done.current) return
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-describedby={undefined}
      className={cn(
        'key key-ink relative flex min-h-12 w-full items-center justify-center gap-3 rounded-control px-4 text-3xs font-bold uppercase select-none [-webkit-touch-callout:none]',
        progress > 0 && 'key-pressed',
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 28 28"
        className="size-7 shrink-0 -rotate-90"
      >
        {Array.from({ length: DOTS }, (_, i) => {
          const a = (i / DOTS) * Math.PI * 2
          return (
            <circle
              key={i}
              cx={14 + 11 * Math.cos(a)}
              cy={14 + 11 * Math.sin(a)}
              r={1.4}
              fill={i < lit ? 'var(--signal)' : 'currentColor'}
              opacity={i < lit ? 1 : 0.3}
            />
          )
        })}
      </svg>
      <span aria-live="polite">
        {armed ? 'Press again to confirm' : children}
      </span>
    </button>
  )
}
