/**
 * Key plays on a chart (its scoring dots): a tap anywhere on the plot
 * picks the play nearest in time, so no one has to hit a 9px dot, and the
 * play reads in a panel under the chart instead of a tooltip over it. The
 * panel steps through the plays in order. Pairs with keyPlaySelection,
 * which gives the chart its selection, focus and selected-dot marks.
 */

import { dot } from '@tanstack/charts'
import { controlledSignal } from '@tanstack/charts/interaction/signal'
import { keyedSelection, whenSelected } from '@tanstack/charts/selection'
import { useState } from 'react'
import type { KeyedSelectionChange } from '@tanstack/charts/selection'
import { cn } from '@/lib/utils'

/**
 * The play the Viewer picked, among those the chart shows now: none once
 * it's no longer shown (scrolled out of the window, or gone).
 */
export function useKeyPlay<T>(
  plays: ReadonlyArray<T>,
  keyOf: (play: T) => string,
) {
  const [picked, setPicked] = useState<string | null>(null)
  const index =
    picked === null ? -1 : plays.findIndex((p) => keyOf(p) === picked)
  return {
    selected: index === -1 ? null : keyOf(plays[index]),
    play: index === -1 ? null : plays[index],
    index,
    pick: setPicked,
  }
}

/**
 * What a chart with key plays adds to its definition: tap or click
 * anywhere and the play nearest in time is selected (the chart's other
 * marks must be decorative, so only plays take focus), and the selected
 * one is drawn larger with a ring.
 */
export function keyPlaySelection<T extends object>(
  selected: string | null,
  onPick: (key: string | null) => void,
  keyOf: (play: T) => string,
) {
  const selection = keyedSelection<T, string>({
    selected: controlledSignal<string | null, KeyedSelectionChange<T, string>>(
      selected,
      // A tap always lands on a play; only the panel's close clears.
      (next) => (next === null ? undefined : onPick(next)),
    ),
    key: keyOf,
  })
  return {
    selection,
    focus: 'nearest-x' as const,
    maxFocusDistance: Infinity,
    /** The selected play's ring, over the dots. */
    highlight: (
      plays: Array<T>,
      channels: {
        x: (play: T) => number
        y: (play: T) => number
        fill: string
      },
    ) =>
      whenSelected(
        dot(plays, {
          id: 'key-play-selected',
          x: channels.x,
          y: channels.y,
          key: keyOf,
          r: 7,
          fill: channels.fill,
          stroke: 'var(--color-foreground)',
          strokeWidth: 2,
        }),
        selection,
      ),
  }
}

export function KeyPlayPanel({
  count,
  index,
  onStep,
  onClose,
  noun = 'scoring play',
  children,
}: {
  /** Plays the chart shows. */
  count: number
  /** The selected one's place among them; -1 for none. */
  index: number
  /** Go to the play at this place. */
  onStep: (index: number) => void
  onClose: () => void
  noun?: string
  /** The selected play, as the chart tells it. */
  children?: React.ReactNode
}) {
  if (count === 0) return null
  const none = index === -1
  return (
    <div
      className="mt-1.5 flex min-h-[4.75rem] items-center gap-2 rounded-lg border border-border bg-background/60 px-1.5 text-[11px]"
      aria-live="polite"
    >
      <StepButton
        label={`Previous ${noun}`}
        disabled={index === 0}
        // From none, step back from the latest.
        onClick={() => onStep(none ? count - 1 : index - 1)}
      >
        <path d="m15 6-6 6 6 6" />
      </StepButton>
      <div className="min-w-0 flex-1 self-stretch py-1.5">
        {none ? (
          <p className="flex h-full items-center justify-center text-center">
            Tap the chart for a {noun} · {count} marked
          </p>
        ) : (
          <>
            <p className="mb-0.5 flex items-center justify-between text-[10px] text-muted tabular-nums">
              {index + 1} of {count}
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                // Small to see, but a fair size to tap.
                className="-my-2 -mr-1 flex size-8 touch-manipulation items-center justify-center rounded-full hover:text-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-3.5 fill-none stroke-current stroke-[2.5]"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </p>
            {children}
          </>
        )}
      </div>
      <StepButton
        label={`Next ${noun}`}
        disabled={!none && index === count - 1}
        onClick={() => onStep(none ? 0 : index + 1)}
      >
        <path d="m9 6 6 6-6 6" />
      </StepButton>
    </div>
  )
}

/** A round button with a chevron: a thumb's size on phones. */
function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  /** The chevron's path. */
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full sm:size-9',
        'border border-border bg-foreground/10 text-foreground transition',
        'hover:bg-foreground/15 active:scale-95 active:bg-foreground/20',
        'disabled:pointer-events-none disabled:opacity-30',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-5 fill-none stroke-current stroke-[2.75] sm:size-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  )
}
