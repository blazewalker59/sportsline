/**
 * Pitch locations from the catcher's view. StatsAPI gives `px` (feet from
 * the middle of the plate) and `pz` (feet off the ground); the zone is the
 * plate's width by the batter's own top and bottom.
 */

export interface ZonePitch {
  number: number | null
  px: number | null
  pz: number | null
  isStrike: boolean
  isBall: boolean
  isInPlay: boolean
  zoneTop: number | null
  zoneBottom: number | null
}

const HALF_PLATE_FT = 17 / 12 / 2
const X_RANGE = 2.2
const Z_MIN = 0
const Z_MAX = 5
const W = 200
const H = 240

const sx = (px: number) => ((px + X_RANGE) / (2 * X_RANGE)) * W
const sz = (pz: number) => H - ((pz - Z_MIN) / (Z_MAX - Z_MIN)) * H

export function pitchColor(
  p: Pick<ZonePitch, 'isStrike' | 'isBall' | 'isInPlay'>,
): string {
  if (p.isInPlay) return 'var(--scoring)'
  if (p.isStrike) return 'var(--live)'
  return 'var(--notable)'
}

export function StrikeZone({ pitches }: { pitches: Array<ZonePitch> }) {
  const located = pitches.filter((p) => p.px != null && p.pz != null)
  const top = average(located.map((p) => p.zoneTop)) ?? 3.4
  const bottom = average(located.map((p) => p.zoneBottom)) ?? 1.6
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-[220px]"
      role="img"
      aria-label="Pitch locations"
    >
      <rect
        x={sx(-HALF_PLATE_FT)}
        y={sz(top)}
        width={sx(HALF_PLATE_FT) - sx(-HALF_PLATE_FT)}
        height={sz(bottom) - sz(top)}
        className="fill-surface stroke-muted"
        strokeWidth="1.5"
      />
      {[1, 2].map((i) => {
        const x = sx(-HALF_PLATE_FT + (i * 2 * HALF_PLATE_FT) / 3)
        const y = sz(top) + ((sz(bottom) - sz(top)) * i) / 3
        return (
          <g key={i} className="stroke-border" strokeWidth="1">
            <line x1={x} x2={x} y1={sz(top)} y2={sz(bottom)} />
            <line
              x1={sx(-HALF_PLATE_FT)}
              x2={sx(HALF_PLATE_FT)}
              y1={y}
              y2={y}
            />
          </g>
        )
      })}
      {located.map((p, i) => (
        <g key={i} transform={`translate(${sx(p.px!)} ${sz(p.pz!)})`}>
          <circle r="11" fill={pitchColor(p)} fillOpacity="0.9" />
          <text
            textAnchor="middle"
            dy="4"
            className="fill-background text-[11px] font-bold"
          >
            {p.number ?? i + 1}
          </text>
        </g>
      ))}
    </svg>
  )
}

function average(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
