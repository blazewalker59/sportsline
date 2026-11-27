/**
 * A base diamond: occupied bases filled in ink (lit orange when `live`:
 * the runners on now), empty ones outlined.
 */
export function Bases({
  first,
  second,
  third,
  size = 18,
  live = false,
}: {
  first?: boolean
  second?: boolean
  third?: boolean
  size?: number
  /** The Game's situation now: occupied bases light up. */
  live?: boolean
}) {
  const base = (on: boolean | undefined, x: number, y: number) => (
    <rect
      x={x}
      y={y}
      width="5"
      height="5"
      transform={`rotate(45 ${x + 2.5} ${y + 2.5})`}
      className={
        on
          ? live
            ? 'fill-signal'
            : 'fill-foreground'
          : 'fill-none stroke-muted'
      }
      strokeWidth="1"
    />
  )
  const label = [first && '1st', second && '2nd', third && '3rd']
    .filter(Boolean)
    .join(', ')
  return (
    <svg
      width={size}
      height={(size * 13) / 18}
      viewBox="0 0 18 13"
      role="img"
      aria-label={label ? `Runners on ${label}` : 'Bases empty'}
    >
      {base(third, 2, 6)}
      {base(second, 6.5, 1.5)}
      {base(first, 11, 6)}
    </svg>
  )
}
