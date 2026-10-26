/**
 * The league page's quiet controls: a section's heading with its choices
 * beside it, each a small dropdown rather than another row of chips. The
 * dropdown is our own (a button and a listbox), styled like the page:
 * the choice in place with a chevron, opening to a small card of options,
 * the chosen one checked. Arrow keys, Home and End move through it, Enter
 * or Space picks, Escape or a tap outside closes it.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={cn('size-3 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  )
}

export function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** What it picks, for screen readers ("Position"). */
  label: string
  options: ReadonlyArray<{ key: T; label: string }>
  value: T
  onChange: (key: T) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // The option the keyboard is on while open.
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const chosen = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  )

  // A tap anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => {
    if (open) list.current?.focus({ preventScroll: true })
  }, [open])

  const show = () => {
    setActive(chosen)
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    button.current?.focus({ preventScroll: true })
  }
  const pick = (i: number) => {
    const o = options[i]
    if (o.key !== value) onChange(o.key)
    close()
  }

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      show()
    }
  }
  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1
    const move: Record<string, () => number> = {
      ArrowDown: () => Math.min(last, active + 1),
      ArrowUp: () => Math.max(0, active - 1),
      Home: () => 0,
      End: () => last,
    }
    if (move[e.key]) {
      e.preventDefault()
      setActive(move[e.key]())
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={root} className={cn('relative shrink-0', className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${options[chosen]?.label ?? ''}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onButtonKey}
        className={cn(
          'flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-notice',
          open && 'bg-notice',
        )}
      >
        {options[chosen]?.label}
        <Chevron
          className={cn(
            'text-muted transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          className="absolute top-full right-0 z-30 mt-1 max-h-72 min-w-36 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg outline-none"
        >
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.key === value}
              onClick={() => pick(i)}
              onPointerMove={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm whitespace-nowrap',
                i === active && 'bg-notice',
                o.key === value ? 'font-semibold' : 'text-foreground/80',
              )}
            >
              <span className="min-w-0 flex-1">{o.label}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                className={cn(
                  'size-3 shrink-0',
                  o.key === value ? 'text-foreground' : 'invisible',
                )}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M2.5 6.5 5 9l4.5-5.5" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A section's heading, its Pickers on the right. */
export function SectionHead({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-1.5 flex min-h-8 items-center justify-between gap-2">
      <h2 className="min-w-0 truncate text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {children && (
        <div className="-mr-1.5 flex shrink-0 items-center">{children}</div>
      )}
    </div>
  )
}
