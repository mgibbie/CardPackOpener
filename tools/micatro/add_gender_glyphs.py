#!/usr/bin/env python3
"""Add the female sign (U+2640) and male sign (U+2642) to Micatro's pixel font.

m6x11plus (Daniel Linssen) has no gender signs, so text like "Nidoran♀" or Burmy's tooltip fell back to another font.
This script draws both as pixel art on the font's own grid and writes the patched font:

  python tools/micatro/add_gender_glyphs.py            # specs/m6x11plus_original.ttf -> micatro/assets/fonts/m6x11plus.ttf
  python tools/micatro/add_gender_glyphs.py --preview out.png   # also a zoomed preview of the two glyphs

Source: tools/micatro/specs/m6x11plus_original.ttf, the font as shipped before this patch (byte-identical copy). The output is
reproducible: the same source gives the same bytes.

The font's grid: 1 pixel = 64 units (unitsPerEm 1024); capitals are 11 px tall and stand on y = -128, 2 px below the
font's own y = 0 (O spans y -128..576); strokes are 2 px wide; glyphs start at x = 0 and advance one blank column past the
ink (O: 6 px of ink, advance 7 px = 448). Every outline is straight lines on that grid (union contours of the lit pixels,
outer clockwise, holes counter-clockwise), which is how the two new glyphs are built too. Everything else (the other 226
glyphs' stored bytes and advances, the name table) is left alone; the header tables count the two new glyphs. The test
overworld/tests/micatro_font_glyphs_test.mjs compares every glyph against the original.

Requires fontTools (pip install fonttools).
"""
import argparse
import os

from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(HERE, 'specs', 'm6x11plus_original.ttf')
DST = os.path.join(ROOT, 'micatro', 'assets', 'fonts', 'm6x11plus.ttf')

PX = 64          # font units per pixel
BASE = -128      # where a capital's lowest pixel row starts (O, 0, 8 all stand here)
CAP = 11         # capital height in pixels

# The two glyphs, top row first; '#' is a lit pixel. Both are CAP rows tall and stand where a capital does.
# ♀: the ring is O's corners on a 6 x 6 box (2 px strokes), then a 2 px stem crossed by a 2 px bar as wide as the ring.
# ♂: a 6 x 7 ring (O's corners, 2 px strokes) at the bottom left; from its top-right corner a 2-3 px shaft climbs one
#    column per row (the way the font's diagonals in %, x and Ø step) into a solid arrowhead in the top-right corner.
GLYPHS = {
    0x2640: ('female', [
        '.####.',
        '######',
        '##..##',
        '##..##',
        '######',
        '.####.',
        '..##..',
        '######',
        '######',
        '..##..',
        '..##..',
    ]),
    0x2642: ('male', [
        '....####',
        '.....###',
        '....####',
        '...###.#',
        '.####...',
        '######..',
        '##..##..',
        '##..##..',
        '##..##..',
        '######..',
        '.####...',
    ]),
}


def pixels(rows):
    """The lit pixels as (col, row-from-bottom) cells: row 0 is the lowest (at y = BASE)."""
    assert len(rows) == CAP, 'each glyph is CAP rows tall'
    lit = set()
    for r, line in enumerate(rows):
        for c, ch in enumerate(line):
            if ch == '#':
                lit.add((c, CAP - 1 - r))
    return lit


def contours(lit):
    """Union outlines of the lit cells, in pixel corner coordinates: outer contours clockwise, holes counter-clockwise (y up),
    collinear points dropped — the shape of the font's own outlines. Two cells touching only at a corner stay separate loops."""
    # Directed boundary edges with the lit cell on the right (clockwise around ink in a y-up system).
    edges = {}
    for (x, y) in lit:
        if (x, y + 1) not in lit: edges.setdefault((x, y + 1), []).append((x + 1, y + 1))   # top: left -> right
        if (x + 1, y) not in lit: edges.setdefault((x + 1, y + 1), []).append((x + 1, y))   # right: top -> bottom
        if (x, y - 1) not in lit: edges.setdefault((x + 1, y), []).append((x, y))           # bottom: right -> left
        if (x - 1, y) not in lit: edges.setdefault((x, y), []).append((x, y + 1))           # left: bottom -> top
    loops = []

    def turn_rank(prev, cur, nxt):
        # at a vertex with two ways on, take the right turn (keeps diagonal-touching cells apart)
        dx1, dy1 = cur[0] - prev[0], cur[1] - prev[1]
        dx2, dy2 = nxt[0] - cur[0], nxt[1] - cur[1]
        cross = dx1 * dy2 - dy1 * dx2
        return 0 if cross < 0 else (1 if cross == 0 else 2)

    while any(edges.values()):
        start = min(k for k, v in edges.items() if v)       # deterministic: lowest-left vertex with an edge
        a = start
        b = edges[a].pop(0)
        loop = [a]
        prev, cur = a, b
        while cur != start:
            loop.append(cur)
            outs = edges[cur]
            outs.sort(key=lambda n: turn_rank(prev, cur, n))
            nxt = outs.pop(0)
            prev, cur = cur, nxt
        # drop collinear points
        pts = []
        n = len(loop)
        for i in range(n):
            p0, p1, p2 = loop[i - 1], loop[i], loop[(i + 1) % n]
            if (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]) != 0:
                pts.append(p1)
        # start each loop at its top-left point, as the font's glyphs do (cosmetic; deterministic)
        i0 = min(range(len(pts)), key=lambda i: (-pts[i][1], pts[i][0]))
        loops.append(pts[i0:] + pts[:i0])
    loops.sort(key=lambda l: (-max(p[1] for p in l), min(p[0] for p in l)))
    return loops


def build_glyph(rows):
    pen = TTGlyphPen(None)
    for loop in contours(pixels(rows)):
        pen.moveTo((loop[0][0] * PX, BASE + loop[0][1] * PX))
        for p in loop[1:]:
            pen.lineTo((p[0] * PX, BASE + p[1] * PX))
        pen.closePath()
    return pen.glyph()


def patch(src=SRC, dst=DST):
    font = TTFont(src, recalcBBoxes=False)       # leave the other glyphs as stored (not re-encoded)
    order = font.getGlyphOrder()
    glyf, hmtx = font['glyf'], font['hmtx']
    for cp, (name, rows) in GLYPHS.items():
        width = max(len(r.rstrip('.')) for r in rows)
        g = build_glyph(rows)
        if name not in order:
            order.append(name)
        glyf[name] = g
        g.recalcBounds(glyf)
        hmtx[name] = (PX * (width + 1), 0)      # one blank column after the ink, like every glyph in the font
        for t in font['cmap'].tables:
            if t.isUnicode():
                t.cmap[cp] = name
    font.setGlyphOrder(order)
    font['maxp'].numGlyphs = len(order)
    # usLastCharIndex covers U+2642 now (OS/2 records the highest BMP code point the font maps)
    font['OS/2'].usLastCharIndex = max(font['OS/2'].usLastCharIndex, max(GLYPHS))
    # (the original's DSIG is an empty placeholder with no signatures: kept as is)
    font.recalcTimestamp = False                 # keep head.modified: the output depends only on the source
    font.save(dst, reorderTables=True)
    return dst


def preview(path, out, text='O♀♂o Nidoran♀ ♂'):
    """The patched font itself rasterised at 16 px (1 font pixel = 1 screen pixel), zoomed 12x with a pixel grid."""
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype(path, 16)
    w = int(f.getlength(text)) + 4
    small = Image.new('L', (w, 20), 0)
    ImageDraw.Draw(small).text((2, 2), text, font=f, fill=255)
    Z = 12
    im = Image.new('RGB', (w * Z, 20 * Z), (45, 61, 64))
    d = ImageDraw.Draw(im)
    for y in range(20):
        for x in range(w):
            v = small.getpixel((x, y))
            col = (255, 255, 255) if v > 127 else (52, 70, 74)
            d.rectangle([x * Z, y * Z, x * Z + Z - 2, y * Z + Z - 2], fill=col)
    im.save(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=SRC)
    ap.add_argument('--out', default=DST)
    ap.add_argument('--preview')
    a = ap.parse_args()
    print('wrote', patch(a.src, a.out))
    if a.preview:
        preview(a.out, a.preview)
        print('preview', a.preview)
