# Micatro Multiplayer: the "Your Nemesis" blind chip (our own art, owner D6 — not the Balatro Multiplayer mod's).
#
# Composes a 21-frame blind-chip row (2x: 21 x 68 px wide, 68 px tall) in Balatro's chip style: the disc,
# rim and moving sheen come from the base game's plain boss-chip frames (BlindChips.png row 4, The Club),
# recoloured to the Nemesis crimson with the Club glyph removed; on top, a pixel-art pair of crossed swords
# (blades, gold guards, leather grips, a dark 1 px outline) drawn on the chip's 34 px grid and doubled.
#   python tools/micatro/gen_nemesis_chip.py   -> micatro/assets/textures/pvp/NemesisChip.png
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'micatro/assets/textures/BlindChips.png')
OUT = os.path.join(ROOT, 'micatro/assets/textures/pvp/NemesisChip.png')
ROW, F, S = 4, 21, 2   # the source row, frames, scale (the sheet is 2x)

FILL, GLYPH, SHEEN, RIM, RIM2 = (185, 203, 146), (103, 113, 81), (202, 215, 172), (140, 153, 110), (140, 148, 123)
N_FILL, N_SHEEN, N_RIM = (143, 53, 80), (190, 100, 124), (100, 32, 56)
BLADE, BLADE_HI, GUARD, GRIP, POMMEL, LINE = (226, 222, 214), (250, 248, 240), (242, 190, 72), (112, 66, 44), (242, 190, 72), (40, 14, 26)


def glyph():
    """The crossed swords on the 34 x 34 grid: {(x, y): colour}."""
    px = {}
    def sword(mirror):
        X = (lambda x: 33 - x) if mirror else (lambda x: x)
        for i in range(0, 13):            # the blade: tip at (8, 8) down to the guard
            px[(X(8 + i), 8 + i)] = BLADE_HI if i < 2 else BLADE
            if i > 1: px[(X(9 + i), 8 + i)] = BLADE          # 2 px wide below the tip
        for d in (-2, -1, 1, 2):            # the guard, across the blade at (21, 21)
            px[(X(21 + d), 21 - d)] = GUARD
        px[(X(21), 21)] = GUARD
        for i in range(1, 4):               # the grip
            px[(X(21 + i), 21 + i)] = GRIP
        px[(X(25), 25)] = POMMEL
    sword(False)
    sword(True)
    # the dark outline: every empty 4-neighbour of a glyph pixel
    line = {}
    for (x, y) in px:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in px: line[q] = LINE
    return {**line, **px}


def main():
    src = Image.open(SRC).convert('RGBA')
    g = glyph()
    out = Image.new('RGBA', (F * 34 * S, 34 * S), (0, 0, 0, 0))
    for f in range(F):
        fr = src.crop((f * 34 * S, ROW * 34 * S, (f + 1) * 34 * S, (ROW + 1) * 34 * S))
        pix = fr.load()
        sheen = set()
        for y in range(fr.height):
            for x in range(fr.width):
                r, gg, b, a = pix[x, y]
                if a == 0: continue
                c = (r, gg, b)
                if c == SHEEN: pix[x, y] = (*N_SHEEN, a); sheen.add((x // S, y // S))
                elif c in (RIM, RIM2): pix[x, y] = (*N_RIM, a)
                else: pix[x, y] = (*N_FILL, a)   # the fill and the old glyph
        for (x, y), c in g.items():
            if c != LINE and (x, y) in sheen: c = tuple(min(255, v + 18) for v in c)   # the sheen crosses the swords too
            for dy in range(S):
                for dx in range(S):
                    X, Y = x * S + dx, y * S + dy
                    if pix[X, Y][3]: pix[X, Y] = (*c, 255)
        out.paste(fr, (f * 34 * S, 0))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.save(OUT, optimize=True)
    print('wrote', OUT, out.size)


if __name__ == '__main__':
    main()
