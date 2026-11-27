/**
 * Draws Sportsline's icons from the mark (components/signal/Logo.tsx): the
 * dot S on aluminum, one dot lit orange, on the full 5×7 grid of unlit
 * dots like a device's display.
 *
 *   bun scripts/icons.ts            # public/favicon.svg
 *   bun scripts/icons.ts --png      # and the PNGs (needs @resvg/resvg-js)
 *
 * The PNG step imports @resvg/resvg-js, which isn't a dependency: add it
 * for the run (`bun add -d @resvg/resvg-js`) and drop it after.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MARK_ROWS } from '../src/components/signal/Logo'

const ALUMINUM = '#e9e8e3'
const INK = '#121212'
const SIGNAL = '#ff4f00'
const UNLIT = '#d3d2cb'

/**
 * The icon at `size` px: the mark centered on `scale` of the width (a
 * maskable icon keeps it inside the safe circle), corners rounded unless
 * the platform rounds them itself.
 */
function icon(size: number, { scale = 0.5, radius = 0, unlit = true } = {}) {
  const pitch = (size * scale) / 7
  const r = pitch * 0.36
  const w = pitch * 5
  const ox = (size - w) / 2
  const oy = (size - pitch * 7) / 2
  const dots = MARK_ROWS.flatMap((row, y) =>
    [...row].flatMap((c, x) => {
      const fill = c === 'o' ? SIGNAL : c === '#' ? INK : unlit ? UNLIT : null
      if (!fill) return []
      const cx = (ox + x * pitch + pitch / 2).toFixed(2)
      const cy = (oy + y * pitch + pitch / 2).toFixed(2)
      return [
        `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="${fill}"/>`,
      ]
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${ALUMINUM}"/>${dots.join('')}</svg>\n`
}

const pub = fileURLToPath(new URL('../public', import.meta.url))
// The tab icon: the mark fills more of it, without the unlit grid.
writeFileSync(
  join(pub, 'favicon.svg'),
  icon(64, { scale: 0.78, radius: 14, unlit: false }),
)

if (process.argv.includes('--png')) {
  // Not a dependency (see above), so named at run time.
  const resvg = '@resvg/resvg-js'
  const { Resvg } = (await import(resvg)) as {
    Resvg: new (svg: string) => { render: () => { asPng: () => Uint8Array } }
  }
  const png = (svg: string, file: string) =>
    writeFileSync(join(pub, file), new Resvg(svg).render().asPng())
  // iOS and Android round the corners themselves.
  png(icon(180, { scale: 0.56 }), 'apple-touch-icon.png')
  png(icon(192, { scale: 0.5 }), 'icon-192.png')
  png(icon(512, { scale: 0.5 }), 'icon-512.png')
}
