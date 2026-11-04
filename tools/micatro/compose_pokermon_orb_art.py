"""Compose the Blue Orb / Red Orb Item cards (Pokermon batch E, the Primal Reversions; owner rule: build it in the mod's own art
style, never a placeholder — Pokermon 3.9.1 has no Orb art). Standalone tool: writes into --out (default: a temp folder); copy the
result into the gitignored micatro/mods/pokermon/assets/2x/ and `npm run deploy-micatro-mods`.

  primal_orbs.png  284 x 190, two Item cards side by side ({0,0} Blue Orb, {1,0} Red Orb), each built from the Pokermon 3.9.1 Item
                   card of its element (AtlasConsumablesBasic-391): the Water Stone card {5,3} (deep sea + bubbles) for the Blue Orb,
                   the Fire Stone card {4,3} (lava swirls) for the Red Orb. The stone is covered by a shaded pixel orb drawn on the
                   logical 71 x 95 grid like the sheet's own item sprites (a 1px dark outline, a 4-tone sphere ramp, a white glint),
                   carrying its Primal's mark (Kyogre's alpha, Groudon's omega) in a light inlay, and the title is re-lettered
                   "BLUE ORB" / "RED ORB" in the sheet's own thin title font (the font cell {7,1}).

  python tools/micatro/compose_pokermon_orb_art.py [--assets "<Basic Series dir>"] [--out <dir>]
"""
import argparse, math, os, sys, tempfile
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose_pokermon_paradox_art import cell, up, hexc, font, draw_text, default_assets, GLYPH_GREY, W, H  # noqa: E402

# the Primal marks, 9 x 9 (x = ink)
ALPHA = [
    '.........',
    '..xx...x.',
    '.x..x.x..',
    'x....xx..',
    'x....x...',
    'x....xx..',
    '.x..x..x.',
    '..xx....x',
    '.........',
]
OMEGA = [
    '...xxx...',
    '..x...x..',
    '.x.....x.',
    '.x.....x.',
    '.x.....x.',
    '..x...x..',
    '...x.x...',
    'xxxx.xxxx',
    '.........',
]
ORBS = {
    'blue': {'card': (5, 3), 'title': 'BLUE ORB', 'mark': ALPHA,
             'ramp': ['#0b1a5c', '#1a3aa6', '#2f6fe0', '#6fb4ff'], 'outline': '#070d2e', 'ink': '#c8f4ff', 'inlay': '#123a9a'},
    'red': {'card': (4, 3), 'title': 'RED ORB', 'mark': OMEGA,
            'ramp': ['#4a0606', '#9a1212', '#d8331c', '#ff8a52'], 'outline': '#240303', 'ink': '#ffe08a', 'inlay': '#7a0c0c'},
}
CX, CY, R = 35, 50, 17  # the orb on the logical grid (the stones sit around rows 34-66)


def orb_card(cons, thin, spec):
    card = cell(cons, *spec['card']).convert('RGBA')
    out = card.copy()
    # 1. the title: clear the stone's name (its glyph grey inside the title bar) to the bar's colour, re-letter it
    tb = [(x, y) for y in range(9, 15) for x in range(7, 64) if card.getpixel((x, y))[:3] == GLYPH_GREY]
    top = min(y for _, y in tb)
    left = min(x for x, _ in tb)
    for (x, y) in tb:
        out.putpixel((x, y), card.getpixel((x, 8)))
    draw_text(out, thin, spec['title'], left, top, GLYPH_GREY + (255,))
    # 2. clear the stone where the orb won't cover it: the stone is what the art window's background can't reach (a flood fill from
    # the window's corner, walled by the stone's grey outline — the sheet's glyph grey). Each stone pixel outside the orb takes the
    # nearest background pixel round the orb's centre at the same distance (turning by 6 degree steps, either way), so the texture
    # keeps flowing round the orb.
    def inside(x, y):
        return 7 <= x < 64 and 18 <= y < 80
    grey = lambda q: card.getpixel(q)[:3] == GLYPH_GREY
    bg, todo = set(), [(8, 19), (62, 19), (8, 78), (62, 78)]
    while todo:
        q = todo.pop()
        if q in bg or not inside(*q) or grey(q):
            continue
        bg.add(q)
        x, y = q
        todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    for y in range(18, 80):
        for x in range(7, 64):
            if (x, y) in bg or math.hypot(x - CX, y - CY) <= R + 1:
                continue
            dx, dy = x - CX, y - CY
            for step in range(1, 31):
                hit = None
                for sgn in (1, -1):
                    a = sgn * step * math.pi / 30
                    q = (round(CX + dx * math.cos(a) - dy * math.sin(a)), round(CY + dx * math.sin(a) + dy * math.cos(a)))
                    if q in bg:
                        hit = q
                        break
                if hit:
                    out.putpixel((x, y), card.getpixel(hit))
                    break
    # 3. the orb: a lit sphere (light from the top left), outlined, over the stone
    ramp = [hexc(c) for c in spec['ramp']]
    lx, ly, lz = -0.55, -0.6, 0.58
    n = math.sqrt(lx * lx + ly * ly + lz * lz)
    lx, ly, lz = lx / n, ly / n, lz / n
    for y in range(CY - R - 1, CY + R + 2):
        for x in range(CX - R - 1, CX + R + 2):
            dx, dy = (x - CX) / R, (y - CY) / R
            d2 = dx * dx + dy * dy
            if d2 <= 1:
                dz = math.sqrt(1 - d2)
                l = max(0, dx * lx + dy * ly + dz * lz)
                t = 0 if l < 0.25 else 1 if l < 0.55 else 2 if l < 0.82 else 3
                out.putpixel((x, y), ramp[t])
            elif d2 <= (1 + 1.35 / R) ** 2:
                out.putpixel((x, y), hexc(spec['outline']))
    # the inlay ring and the mark at its heart
    for y in range(CY - 9, CY + 10):
        for x in range(CX - 9, CX + 10):
            d = math.hypot(x - CX, y - CY)
            if 6.6 <= d <= 7.7:
                out.putpixel((x, y), hexc(spec['inlay']))
    mark = spec['mark']
    for my, row in enumerate(mark):
        for mx, ch in enumerate(row):
            if ch == 'x':
                out.putpixel((CX - 4 + mx, CY - 4 + my), hexc(spec['ink']))
    # the glint
    for (x, y) in [(CX - 9, CY - 10), (CX - 8, CY - 10), (CX - 10, CY - 9), (CX - 9, CY - 9), (CX - 10, CY - 8), (CX - 6, CY - 11)]:
        out.putpixel((x, y), (255, 255, 255, 255))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--assets', default=None)
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    assets = a.assets or default_assets()
    out_dir = a.out or tempfile.mkdtemp(prefix='pokermon_orbs_')
    os.makedirs(out_dir, exist_ok=True)
    cons = Image.open(os.path.join(assets, 'AtlasConsumablesBasic-391.png')).convert('RGBA')
    thin = font(cons, [(4, 9), (11, 16)], ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ'])
    sheet = Image.new('RGBA', (W * 2, H), (0, 0, 0, 0))
    for i, k in enumerate(['blue', 'red']):
        sheet.paste(orb_card(cons, thin, ORBS[k]), (W * i, 0))
    p = os.path.join(out_dir, 'primal_orbs.png')
    up(sheet).save(p)
    print(p)


if __name__ == '__main__':
    main()
