"""Builds src/fonts/doto-latin.woff2: Doto at weight 900, with real punctuation.

Doto's period and colon are crosses of dots, which read as + at display
sizes ("3+41", "$412+80"). This keeps the dots a reader expects, on a
narrower advance, and pins the variable font to the one weight Signal uses.

  python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools brotli
  .venv-fonts/bin/python scripts/fonts/doto-punctuation.py doto-latin-original.woff2 src/fonts/doto-latin.woff2

The original is Google Fonts' latin subset of Doto (OFL).
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates

src, dst = sys.argv[1], sys.argv[2]
f = instancer.instantiateVariableFont(TTFont(src), {'wght': 900})
glyf = f['glyf']; hmtx = f['hmtx']; cmap = f.getBestCmap()

KEEP = {  # glyph: (dot centers to keep, shift x, new advance)
    '.': ([(250, 50)], -100, 300),
    ':': ([(250, 450), (250, 50)], -100, 300),
    ',': ([(250, 50), (150, -50)], -50, 350),
}
for ch, (keep, dx, adv) in KEEP.items():
    name = cmap[ord(ch)]
    g = glyf[name]
    coords, ends, flags = g.getCoordinates(glyf)
    new_coords, new_ends, new_flags, st = [], [], [], 0
    for e in ends:
        pts = list(coords[st:e + 1]); fl = list(flags[st:e + 1])
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        c = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
        if any(abs(c[0] - kx) < 1 and abs(c[1] - ky) < 1 for kx, ky in keep):
            new_coords += [(x + dx, y) for x, y in pts]; new_flags += fl
            new_ends.append(len(new_coords) - 1)
        st = e + 1
    assert len(new_ends) == len(keep), (ch, len(new_ends))
    ng = Glyph(); ng.numberOfContours = len(new_ends)
    ng.coordinates = GlyphCoordinates(new_coords); ng.endPtsOfContours = new_ends
    ng.flags = bytearray(new_flags); ng.program = g.program if hasattr(g, 'program') else None
    from fontTools.ttLib.tables import ttProgram
    ng.program = ttProgram.Program(); ng.program.fromBytecode(b'')
    ng.recalcBounds(glyf)
    glyf[name] = ng
    hmtx[name] = (adv, ng.xMin)
f.flavor = 'woff2'
f.save(dst)
print('ok', dst)
