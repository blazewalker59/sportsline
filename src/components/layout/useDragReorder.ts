import { useState } from 'react'

interface Drag {
  key: string
  from: number
  startY: number
  dy: number
  rowHeight: number
}

/**
 * Drag a list's rows by a handle to reorder them (as the Follows screen's
 * League list does), or move one with the arrow keys. Rows keep their DOM
 * order while dragging (moving the dragged node would drop its pointer
 * capture); the others slide to show where it will land.
 */
export function useDragReorder(
  keys: ReadonlyArray<string>,
  onReorder: (next: Array<string>) => void,
) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const target = drag
    ? Math.max(
        0,
        Math.min(
          keys.length - 1,
          drag.from + Math.round(drag.dy / drag.rowHeight),
        ),
      )
    : -1

  const move = (key: string, to: number) => {
    const from = keys.indexOf(key)
    const clamped = Math.max(0, Math.min(keys.length - 1, to))
    if (from === -1 || from === clamped) return
    const next = [...keys]
    next.splice(from, 1)
    next.splice(clamped, 0, key)
    onReorder(next)
  }

  /** The row's offset while something is dragged. */
  const shift = (index: number): number => {
    if (!drag) return 0
    if (index === drag.from) return drag.dy
    if (drag.from < target && index > drag.from && index <= target)
      return -drag.rowHeight
    if (target < drag.from && index >= target && index < drag.from)
      return drag.rowHeight
    return 0
  }

  /** Props for a row's drag handle (a button). */
  const handle = (key: string, index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      const row = e.currentTarget.closest('li')
      setDrag({
        key,
        from: index,
        startY: e.clientY,
        dy: 0,
        rowHeight: row?.getBoundingClientRect().height ?? 56,
      })
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) =>
      setDrag((d) =>
        d && d.key === key ? { ...d, dy: e.clientY - d.startY } : d,
      ),
    onPointerUp: () => {
      if (drag) move(drag.key, target)
      setDrag(null)
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        move(key, index + (e.key === 'ArrowUp' ? -1 : 1))
      }
    },
  })

  return { dragging: drag?.key ?? null, active: drag !== null, shift, handle }
}

/** The six-dot grip a drag handle shows. */
export const GRIP_DOTS = [3, 10, 17].flatMap((y) =>
  [4, 10].map((x) => ({ x, y })),
)
