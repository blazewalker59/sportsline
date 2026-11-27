/**
 * A head-to-head's lean as a segmented meter from the middle: unlit wells,
 * filled outward toward whoever leads, in their color. A Fantasy
 * category's (CategoryBars) and a Game's team totals (BoxScore).
 */

/** Segments each side of the middle. */
const SEGMENTS = 10

export function LeanMeter({
  lean,
  left,
  right,
}: {
  /** From 1 (the left side's, all the way) through 0 to −1 (the right's). */
  lean: number
  left: string
  right: string
}) {
  const filled = Math.round(Math.min(1, Math.abs(lean)) * SEGMENTS)
  const half = (side: 'left' | 'right') => {
    const on = lean !== 0 && lean > 0 === (side === 'left')
    const color = side === 'left' ? left : right
    return Array.from({ length: SEGMENTS }, (_, i) => {
      // Counted from the middle out.
      const out = side === 'left' ? SEGMENTS - 1 - i : i
      const lit = on && out < filled
      return (
        <span
          key={`${side}${i}`}
          className="meter-seg h-1.5"
          style={lit ? { background: color, boxShadow: 'none' } : undefined}
        />
      )
    })
  }
  return (
    <span
      aria-hidden="true"
      data-lean={lean}
      className="grid w-full items-center gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${SEGMENTS}, minmax(0, 1fr)) 1px repeat(${SEGMENTS}, minmax(0, 1fr))`,
      }}
    >
      {half('left')}
      <span className="h-2.5 w-px bg-border" />
      {half('right')}
    </span>
  )
}
