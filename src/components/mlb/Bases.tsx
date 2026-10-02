/** A base diamond: filled bases are occupied. */
export function Bases({
  first,
  second,
  third,
  size = 18,
}: {
  first?: boolean
  second?: boolean
  third?: boolean
  size?: number
}) {
  const base = (on: boolean | undefined, x: number, y: number) => (
    <rect
      x={x}
      y={y}
      width="5"
      height="5"
      transform={`rotate(45 ${x + 2.5} ${y + 2.5})`}
      className={on ? 'fill-scoring' : 'fill-none stroke-muted'}
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

/** Outs as three dots. */
export function Outs({ outs }: { outs: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${outs} out`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={
            i < outs
              ? 'size-1.5 rounded-full bg-foreground/80'
              : 'size-1.5 rounded-full bg-border'
          }
        />
      ))}
    </span>
  )
}
