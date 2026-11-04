"""Compose the art for the owner's Paradox content (Pokermon, Gen 9 batch 3; owner rule: build it in the mod's own art style, never a
placeholder). Standalone tool: writes into --out (default: a temp folder); copy the results into the gitignored
micatro/mods/pokermon/assets/2x/ and `npm run deploy-micatro-mods`.

  paradox_ball.png   142 x 190, one Item card: Pokermon 3.9.1's Ultra Ball card (AtlasConsumablesBasic-391 {2,3}) restyled — its
                     art window hue-turned to Paradox purple, the ball's dome deep violet with its two stripes split by era (the left
                     one amber: Ancient, the right one cyan: Future), the bottom bar purple, and the title re-lettered "PARADOX BALL"
                     in the sheet's own thin title font (the font cell {7,1} of the same sheet).
  paradox_packs.png  568 x 380, 4 x 2 pack cells (row 0 Ancient, row 1 Future; Normal, Normal (alt), Jumbo, Mega): the Pocket Packs
                     (AtlasBoosterpacksBasic {0,1} / {0,0} / {2,0} / {3,0}) gradient-mapped to the era's palette (Ancient: amber / stone
                     brown; Future: chrome / cyan), the crimps and the JUMBO / MEGA banners kept, the emblem replaced by a sun disc
                     (Protosynthesis) or a quark ring (Quark Drive) with a Paradox Pokemon on it — its own upstream 3.9.1 card sprite
                     (the soul layer of its Natdex cell, nearest-neighbour scaled) — and a label plaque "ANCIENT / PACK" or
                     "FUTURE / PACK" in the sheet's bold title font, coloured like the Pocket Pack logo.

Everything happens on the logical 71 x 95 grid (every cell of these sheets is an exact 2x doubling) and is doubled back at the end.
  python tools/micatro/compose_pokermon_paradox_art.py [--assets "<Basic Series dir>"] [--out <dir>]
"""
import argparse, colorsys, os, sys, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
W, H = 71, 95


def default_assets():
    rel = os.path.join('micatro', 'mods', 'pokermon', 'assets', '2x', 'Basic Series')
    for base in [ROOT, os.environ.get('MICATRO_MAIN') or '', os.path.normpath(os.path.join(ROOT, '..', '..'))]:
        p = os.path.join(base, rel)
        if base and os.path.isfile(os.path.join(p, 'AtlasBoosterpacksBasic.png')):
            return p
    sys.exit('no Pokermon art found (--assets)')


def cell(sheet, x, y):
    """A sheet cell on the logical grid (every 2nd pixel of the 2x art)."""
    c = sheet.crop((142 * x, 190 * y, 142 * x + 142, 190 * y + 190))
    return c.resize((W, H), Image.NEAREST)


def up(img):
    return img.resize((img.width * 2, img.height * 2), Image.NEAREST)


def hsv(p):
    r, g, b = (v / 255 for v in p[:3])
    return colorsys.rgb_to_hsv(r, g, b)


def rgb(h, s, v, a=255):
    r, g, b = colorsys.hsv_to_rgb(h % 1, max(0, min(1, s)), max(0, min(1, v)))
    return (round(r * 255), round(g * 255), round(b * 255), a)


def hexc(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


# ------------------------------------------------------------------------------------------------ the sheet's own fonts
def font(sheet, rows, letters):
    """Glyph bitmaps from the font cell {7,1}: each row band holds letters separated by empty columns."""
    fc = cell(sheet, 7, 1)
    glyphs = {}
    for (y0, y1), word in zip(rows, letters):
        cols = [any(fc.getpixel((x, y))[3] > 0 for y in range(y0, y1 + 1)) for x in range(W)]
        runs, x = [], 0
        while x < W:
            if cols[x]:
                s = x
                while x < W and cols[x]:
                    x += 1
                runs.append((s, x - 1))
            x += 1
        if len(runs) != len(word):
            sys.exit(f'font row {y0}-{y1}: {len(runs)} glyphs for {len(word)} letters')
        for (a, b), ch in zip(runs, word):
            glyphs[ch] = [[fc.getpixel((xx, yy))[3] > 0 for xx in range(a, b + 1)] for yy in range(y0, y1 + 1)]
    return glyphs


def text_width(glyphs, s, gap=1, space=3):
    return sum((space if ch == ' ' else len(glyphs[ch][0])) for ch in s) + gap * (len(s) - 1)


def draw_text(img, glyphs, s, x, y, colour, gap=1, space=3):
    """Draws s; -> the set of pixels painted. colour: a colour or fn(row index) -> colour."""
    painted = set()
    for ch in s:
        if ch == ' ':
            x += space + gap
            continue
        g = glyphs[ch]
        for gy, row in enumerate(g):
            for gx, on in enumerate(row):
                if on:
                    img.putpixel((x + gx, y + gy), colour(gy) if callable(colour) else colour)
                    painted.add((x + gx, y + gy))
        x += len(g[0]) + gap
    return painted


def outline(img, pixels, colour):
    for (x, y) in pixels:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (x + dx, y + dy)
                if q not in pixels and 0 <= q[0] < img.width and 0 <= q[1] < img.height:
                    img.putpixel(q, colour)


# ------------------------------------------------------------------------------------------------ the Paradox Ball
GLYPH_GREY = (79, 99, 103)


def paradox_ball(cons):
    card = cell(cons, 2, 3).convert('RGBA')        # the Ultra Ball's Item card
    thin = font(cons, [(4, 9), (11, 16)], ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ'])
    out = card.copy()
    # 1. the title: clear "ULTRA BALL" (its glyph grey inside the title bar) to the bar's colour, re-letter it
    # (the bar is a left-to-right gradient, the same colour down each column: its top row, 8, has no glyph)
    tb = [(x, y) for y in range(9, 15) for x in range(7, 64) if card.getpixel((x, y))[:3] == GLYPH_GREY]
    top = min(y for _, y in tb)
    left = min(x for x, _ in tb)
    for (x, y) in tb:
        out.putpixel((x, y), card.getpixel((x, 8)))
    draw_text(out, thin, 'PARADOX BALL', left, top, GLYPH_GREY + (255,))
    # 2. the art window (inside the frame, between the title bar and the bottom bar): Paradox purple
    cx = 35  # the ball's centre column (its two stripes sit either side)
    for y in range(18, 80):
        for x in range(7, 64):
            p = card.getpixel((x, y))
            if p[3] == 0:
                continue
            h, s, v = hsv(p)
            if 35 / 360 <= h <= 65 / 360 and s > 0.4:          # the yellow stripes: amber (Ancient) | cyan (Future)
                out.putpixel((x, y), rgb(30 / 360, 0.85, v * 0.95) if x < cx else rgb(188 / 360, 0.75, min(1, v * 1.02)))
            elif s < 0.1 and v > 0.85:                           # the white floor and the ball's bottom
                continue
            else:                                                # the blues and the slate dome -> violet
                out.putpixel((x, y), rgb(h + 50 / 360, min(1, s * 1.3 + 0.08), v))
    # 3. the bottom bar: gold -> purple
    for y in range(80, 92):
        for x in range(5, 66):
            p = card.getpixel((x, y))
            if p[3] == 0:
                continue
            h, s, v = hsv(p)
            if 30 / 360 <= h <= 70 / 360 and s > 0.25:
                out.putpixel((x, y), rgb(h + 225 / 360, s * 1.1, v * 0.9))
    return up(out)


# ------------------------------------------------------------------------------------------------ the packs
ERAS = {
    'ancient': {
        'ramp': ['#1e0d05', '#4a230c', '#7e4116', '#b8681f', '#e39a3a', '#f8d585', '#fff6dc'],
        'disc': ('#f7a531', '#ffd970', '#9a4a12'),     # Protosynthesis: a sun (fill, light, rim)
        'plaque': ('#3a1a08', '#e0a040'), 'outline': '#3a1606', 'word': 'ANCIENT',
        'mons': [(28, 66), (16, 65), (28, 67), (0, 68)],  # Roaring Moon, Great Tusk, Gouging Fire, Raging Bolt
    },
    'future': {
        'ramp': ['#06111f', '#0f2d47', '#1a5878', '#2c8fb0', '#5cc7e3', '#aeefff', '#f2fdff'],
        'disc': ('#2c8fb0', '#bff6ff', '#0b2c45'),     # Quark Drive: a charged ring
        'plaque': ('#0b2338', '#7fe3ff'), 'outline': '#0b1d5a', 'word': 'FUTURE',
        'mons': [(0, 67), (28, 65), (8, 67), (4, 68)],    # Iron Valiant, Iron Treads, Iron Leaves, Iron Crown
    },
}
SOUL = {(28, 66): (29, 66), (16, 65): (17, 65), (28, 67): (29, 67), (0, 68): (1, 68), (0, 67): (1, 67), (28, 65): (29, 65), (8, 67): (9, 67), (4, 68): (5, 68)}
TEMPLATES = [(0, 1, None), (0, 0, None), (2, 0, (7, 22)), (3, 0, (4, 31))]  # cell + the banner rows to keep (JUMBO / MEGA)


def ramp(stops, t):
    cols = [hexc(s) for s in stops]
    t = max(0, min(1, t)) * (len(cols) - 1)
    i = min(int(t), len(cols) - 2)
    f = t - i
    return tuple(round(cols[i][k] * (1 - f) + cols[i + 1][k] * f) for k in range(3)) + (255,)


def lum(p):
    return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255


def soul_sprite(natdex, at, height, width):
    s = cell(natdex, *SOUL[at]).convert('RGBA')
    s = s.crop(s.getbbox())
    k = min(height / s.height, width / s.width)
    w2, h2 = max(1, round(s.width * k)), max(1, round(s.height * k))
    s = s.resize((w2, h2), Image.NEAREST)
    return s


def pack_cell(packs, natdex, bold, era, i):
    E = ERAS[era]
    tx, ty, banner = TEMPLATES[i]
    t = cell(packs, tx, ty).convert('RGBA')
    out = t.copy()
    # 1. the body (between the crimps) gradient-mapped to the era's ramp; the JUMBO / MEGA lettering kept (its whites and greys)
    for y in range(H):
        for x in range(W):
            p = t.getpixel((x, y))
            if p[3] == 0:
                continue
            # (the crimps stay; their coloured seam lines take the era's colour too)
            if not 11 <= y < 84 and hsv(p)[1] < 0.45:
                continue
            if banner and banner[0] <= y <= banner[1]:
                h, s, v = hsv(p)
                if s < 0.22 and v > 0.55:
                    continue
            out.putpixel((x, y), ramp(E['ramp'], lum(p) * 1.08 - 0.04))
    # 2. the emblem: a disc (the sun / a charged ring), the Paradox Pokemon on it
    top = (banner[1] + 2) if banner else 13
    cy = (top + 58) // 2 + 1
    r = min(17, (58 - top) // 2)
    fill, light, rim = (hexc(c) for c in E['disc'])
    for y in range(cy - r - 1, cy + r + 2):
        for x in range(35 - r - 1, 35 + r + 2):
            d = ((x - 35) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= r - 1:
                if era == 'ancient':
                    out.putpixel((x, y), light if (x - 35 + y - cy) < -r * 0.55 else fill)
                else:
                    ring = r - 4 <= d
                    out.putpixel((x, y), light if ring and ((x + y) % 2 == 0) else (fill if ring else ramp(E['ramp'], 0.42 + 0.1 * ((x * 7 + y * 3) % 3 == 0))))
            elif d <= r:
                out.putpixel((x, y), rim)
    if era == 'ancient':  # the sun's rays: short dithered spokes outside the rim
        for k in range(12):
            import math
            a = k * math.pi / 6
            for rr in range(r + 2, r + 5):
                x, y = round(35 + rr * math.cos(a)), round(cy + rr * math.sin(a))
                if 9 <= x <= 61 and top <= y <= 58:
                    out.putpixel((x, y), light if rr < r + 4 else fill)
    mon = soul_sprite(natdex, E['mons'][i], (59 - top) - 3, 44)
    mx, my = 35 - mon.width // 2, 60 - mon.height
    for y in range(mon.height):
        for x in range(mon.width):
            p = mon.getpixel((x, y))
            X, Y = mx + x, my + y
            if p[3] > 127 and 8 <= X <= 62 and 11 <= Y < 84:
                out.putpixel((X, Y), p[:3] + (255,))
    # 3. the label plaque: "ANCIENT" / "FUTURE" over "PACK", Pocket Pack's logo colours (yellow with a dark rim; PACK red, rimmed yellow)
    pf, pr = hexc(E['plaque'][0]), hexc(E['plaque'][1])
    y0, y1 = 61, 82
    for y in range(y0, y1 + 1):
        for x in range(10, 61):
            edge = y in (y0, y1) or x in (10, 60)
            corner = (x in (10, 60)) and (y in (y0, y1))
            if corner:
                continue
            out.putpixel((x, y), pr if edge else pf)
    word = E['word']
    wd = text_width(bold, word)
    yel = lambda gy: hexc('#ffe45a') if gy < 3 else hexc('#ffb01e')
    px = draw_text(out, bold, word, 35 - wd // 2 - (wd % 2 == 0) * 0, 64, yel)
    outline(out, px, hexc(E['outline']))
    draw_text(out, bold, word, 35 - wd // 2, 64, yel)
    pw = text_width(bold, 'PACK')
    px2 = draw_text(out, bold, 'PACK', 35 - pw // 2, 73, hexc('#e8382c'))
    outline(out, px2, hexc('#ffd23a'))
    draw_text(out, bold, 'PACK', 35 - pw // 2, 73, lambda gy: hexc('#ff5a3c') if gy < 3 else hexc('#c8231c'))
    return out


def packs_sheet(packs, natdex, cons):
    bold = font(cons, [(22, 27), (29, 34)], ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ'])
    sheet = Image.new('RGBA', (W * 4, H * 2), (0, 0, 0, 0))
    for row, era in enumerate(['ancient', 'future']):
        for i in range(4):
            sheet.paste(pack_cell(packs, natdex, bold, era, i), (i * W, row * H))
    return up(sheet)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--assets', default=None)
    ap.add_argument('--out', default=os.path.join(tempfile.gettempdir(), 'pokermon_paradox_art'))
    a = ap.parse_args()
    assets = a.assets or default_assets()
    if os.path.normpath(a.out).startswith(os.path.normpath(os.path.join(ROOT, 'micatro'))):
        sys.exit('refusing to write into an asset folder: copy the results yourself')
    os.makedirs(a.out, exist_ok=True)
    cons = Image.open(os.path.join(assets, 'AtlasConsumablesBasic-391.png')).convert('RGBA')
    packs = Image.open(os.path.join(assets, 'AtlasBoosterpacksBasic.png')).convert('RGBA')
    natdex = Image.open(os.path.join(assets, 'AtlasJokersBasicNatdex-391.png')).convert('RGBA')
    paradox_ball(cons).save(os.path.join(a.out, 'paradox_ball.png'))
    packs_sheet(packs, natdex, cons).save(os.path.join(a.out, 'paradox_packs.png'))
    print('wrote', os.path.join(a.out, 'paradox_ball.png'), os.path.join(a.out, 'paradox_packs.png'))


if __name__ == '__main__':
    main()
