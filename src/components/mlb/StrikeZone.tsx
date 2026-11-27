/**
 * Pitch locations from the catcher's view. StatsAPI gives `px` (feet from
 * the middle of the plate) and `pz` (feet off the ground); the zone is the
 * plate's width by the batter's own top and bottom. Signal: the zone is a
 * recessed well, strikes are ink, balls are hollow, and the pitch put in
 * play (the one that made the Play) is the lit orange.
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

/** A pitch's marker: its fill, the ink of its number, and its ring. */
export function pitchStyle(
  p: Pick<ZonePitch, 'isStrike' | 'isBall' | 'isInPlay'>,
): { fill: string; ink: string; stroke: string } {
  if (p.isInPlay)
    return { fill: 'var(--signal)', ink: '#121212', stroke: 'var(--signal)' }
  if (p.isStrike)
    return {
      fill: 'var(--foreground)',
      ink: 'var(--background)',
      stroke: 'var(--foreground)',
    }
  return {
    fill: 'var(--surface)',
    ink: 'var(--foreground)',
    stroke: 'var(--muted)',
  }
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
        className="fill-notice stroke-muted"
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
      {located.map((p, i) => {
        const style = pitchStyle(p)
        return (
          <g key={i} transform={`translate(${sx(p.px!)} ${sz(p.pz!)})`}>
            <circle
              r="11"
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth="1.25"
            />
            <text
              textAnchor="middle"
              dy="4"
              fill={style.ink}
              className="font-label text-2xs font-bold"
            >
              {p.number ?? i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function average(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
