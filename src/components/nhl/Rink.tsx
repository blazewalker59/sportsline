/**
 * Where an NHL event happened. NHL.com coordinates are feet from center ice:
 * x along the length (±100), y across (±42.5). Signal: the ice is a
 * recessed well with its lines in ink; the event is an ink dot, lit orange
 * when `lit` (a goal in a live Game).
 */
export function Rink({
  x,
  y,
  lit = false,
}: {
  x: number
  y: number
  lit?: boolean
}) {
  return (
    <svg
      viewBox="-100 -42.5 200 85"
      className="w-full"
      role="img"
      aria-label="Event location on the rink"
    >
      <rect
        x="-100"
        y="-42.5"
        width="200"
        height="85"
        rx="28"
        className="fill-notice stroke-muted"
        strokeWidth="0.8"
      />
      <line
        x1="0"
        x2="0"
        y1="-42.5"
        y2="42.5"
        stroke="var(--foreground)"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      {[-25, 25].map((bx) => (
        <line
          key={bx}
          x1={bx}
          x2={bx}
          y1="-42.5"
          y2="42.5"
          stroke="var(--foreground)"
          strokeOpacity="0.3"
          strokeWidth="1"
        />
      ))}
      {[-89, 89].map((gx) => (
        <g key={gx}>
          <line
            x1={gx}
            x2={gx}
            y1="-38"
            y2="38"
            stroke="var(--muted)"
            strokeOpacity="0.6"
            strokeWidth="0.5"
          />
          <rect
            x={gx > 0 ? gx : gx - 4}
            y="-3"
            width="4"
            height="6"
            className="fill-none stroke-muted"
            strokeWidth="0.6"
          />
        </g>
      ))}
      <circle
        cx="0"
        cy="0"
        r="15"
        className="fill-none stroke-muted"
        strokeOpacity="0.5"
        strokeWidth="0.6"
      />
      {lit && (
        <circle cx={x} cy={-y} r="6" fill="var(--signal)" fillOpacity="0.2" />
      )}
      <circle
        cx={x}
        cy={-y}
        r="3.2"
        fill={lit ? 'var(--signal)' : 'var(--foreground)'}
        stroke="var(--surface)"
        strokeWidth="0.8"
      />
    </svg>
  )
}
