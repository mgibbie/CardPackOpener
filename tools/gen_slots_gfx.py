# gen_slots_gfx.py — Crystal's slot machine graphics, converted for the web port.
#
# Reads pokecrystal gfx/slots/ (slots_1.png BG tiles, slots_2.png reel symbols,
# slots_3.png Golem / Chansey / egg, slots.tilemap, slots.pal) and composes them
# the way engine/games/slot_machine.asm + _CGB_SlotMachine (engine/gfx/
# cgb_layouts.asm) lay them out on the Game Boy Color, into two tracked sheets
# under overworld/minigames/slots/:
#
#   slots_bg.png  160 x 384: the 20x12-tile machine face (rows 0-11 of the screen)
#                 y   0  lights off, opaque          y  96  lights on, opaque
#                 y 192  lights off, BG colour 0 cut y 288  lights on, BG colour 0 cut
#                 The reels are OAM sprites with the priority bit set, so they show
#                 only through BG colour 0: draw the opaque face, the reels, then the
#                 cut face on top.
#   slots_obj.png the sprites
#                 y  0  the six reel symbols (16x16, OBJ palettes 0-5)
#                 y 16  the same, palettes inverted (SlotsAction_FlashScreen)
#                 y 32  the same in the text palette (the payout text's icon)
#                 y 48  Golem frames 1-2 (24x32)   y 80  Chansey frames 1-5 (24x32)
#                 y 112 the egg (8x16)
#
#   python tools/gen_slots_gfx.py
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def find_mp66():
    d = ROOT
    while True:
        p = os.path.join(d, 'Magepunk66')
        if os.path.isdir(os.path.join(p, 'Reference', 'pokecrystal')):
            return p
        if os.path.dirname(d) == d:
            raise SystemExit('Magepunk66 not found above ' + ROOT)
        d = os.path.dirname(d)


SRC = os.path.join(find_mp66(), 'Reference', 'pokecrystal', 'gfx', 'slots')
OUT = os.path.join(ROOT, 'overworld', 'minigames', 'slots')


def shade(v):  # greyscale png -> 2bpp colour index
    return {255: 0, 170: 1, 85: 2, 0: 3}[v]


def load_pals():
    pals, cur = [], []
    for line in open(os.path.join(SRC, 'slots.pal')):
        line = line.strip()
        if not line.startswith('RGB'):
            continue
        r, g, b = (int(x) for x in line[3:].split(','))
        cur.append(tuple((c << 3) | (c >> 2) for c in (r, g, b)))
        if len(cur) == 4:
            pals.append(cur)
            cur = []
    assert len(pals) == 16, len(pals)
    return pals[:8], pals[8:]


def tiles_rowmajor(im):
    w, h = im.size
    out = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            out.append([[shade(im.getpixel((tx * 8 + x, ty * 8 + y))) for x in range(8)] for y in range(8)])
    return out


def tiles_interleaved(im):
    # rgbgfx --interleave: each 16px band reads top/bottom per column (8x16 OBJ order)
    w, h = im.size
    out = []
    for by in range(h // 16):
        for tx in range(w // 8):
            for half in range(2):
                out.append([[shade(im.getpixel((tx * 8 + x, by * 16 + half * 8 + y))) for x in range(8)] for y in range(8)])
    return out


def bg_attr(x, y):
    # _CGB_SlotMachine, in order (later boxes overwrite earlier ones)
    a = 0
    if y >= 12:
        return 7
    def box(x0, y0, rows, cols):
        return x0 <= x < x0 + cols and y0 <= y < y0 + rows
    if box(0, 2, 10, 3) or box(17, 2, 10, 3): a = 2
    if box(0, 4, 6, 3) or box(17, 4, 6, 3): a = 3
    if box(0, 6, 2, 3) or box(17, 6, 2, 3): a = 4
    if box(4, 2, 2, 12): a = 1
    if box(3, 2, 10, 1) or box(16, 2, 10, 1): a = 1
    return a


def main():
    bgp, obp = load_pals()
    s1 = Image.open(os.path.join(SRC, 'slots_1.png')).convert('L')
    s2 = Image.open(os.path.join(SRC, 'slots_2.png')).convert('L')
    s3 = Image.open(os.path.join(SRC, 'slots_3.png')).convert('L')
    vt2 = {}
    t1 = tiles_rowmajor(s1)
    # --trim-whitespace drops the trailing blank tiles (they'd overlap slots_2 at $25)
    while t1 and all(v == 0 for row in t1[-1] for v in row):
        t1.pop()
    for i, t in enumerate(t1):
        vt2[i] = t
    for i, t in enumerate(tiles_interleaved(s2)):
        vt2[0x25 + i] = t
    tm = open(os.path.join(SRC, 'slots.tilemap'), 'rb').read()
    assert len(tm) == 20 * 12

    def face(lights_on, cut):
        img = Image.new('RGBA', (160, 96), (0, 0, 0, 0))
        px = img.load()
        for ty in range(12):
            for tx in range(20):
                t = tm[ty * 20 + tx]
                # Slots_TurnLightsOnOrOff: $23/$24 off, $14/$15 on, columns 3 and 16
                if lights_on and tx in (3, 16) and t in (0x23, 0x24):
                    t = 0x14 if t == 0x23 else 0x15
                tile = vt2.get(t)
                pal = bgp[bg_attr(tx, ty)]
                for y in range(8):
                    for x in range(8):
                        c = tile[y][x] if tile else 0
                        if cut and c == 0:
                            continue
                        px[tx * 8 + x, ty * 8 + y] = pal[c] + (255,)
        return img

    bg = Image.new('RGBA', (160, 384), (0, 0, 0, 0))
    bg.paste(face(False, False), (0, 0))
    bg.paste(face(True, False), (0, 96))
    bg.paste(face(False, True), (0, 192))
    bg.paste(face(True, True), (0, 288))
    os.makedirs(OUT, exist_ok=True)
    bg.save(os.path.join(OUT, 'slots_bg.png'))

    obj = Image.new('RGBA', (120, 128), (0, 0, 0, 0))
    op = obj.load()

    def blit(src, sx, sy, w, h, pal, dx, dy, remap=None):
        for y in range(h):
            for x in range(w):
                c = shade(src.getpixel((sx + x, sy + y)))
                if remap:
                    c = remap[c]
                if c == 0:
                    continue   # OBJ colour 0 is transparent
                op[dx + x, dy + y] = pal[c] + (255,)

    for k in range(6):   # SLOTS_SEVEN .. SLOTS_STARYU; OAM palette = tile id >> 2 = k
        blit(s2, 0, k * 16, 16, 16, obp[k], k * 16, 0)
        # rOBP0 xor $ff: shade i shows palette colour 3-i (colour 0 stays clear)
        blit(s2, 0, k * 16, 16, 16, obp[k], k * 16, 16, remap={0: 0, 1: 2, 2: 1, 3: 0})
        blit(s2, 0, k * 16, 16, 16, [(255, 255, 255)] + bgp[7][1:], k * 16, 32)
    # slots_3: Golem 1-2, Chansey 1-5 as 24x32 frames, then the 8x16 egg
    for f in range(2):
        blit(s3, 0, f * 32, 24, 32, obp[5], f * 24, 48)
    for f in range(5):
        blit(s3, 0, 64 + f * 32, 24, 32, obp[6], f * 24, 80)
    blit(s3, 0, 224, 8, 16, obp[0], 0, 112)
    obj.save(os.path.join(OUT, 'slots_obj.png'))
    print('wrote', os.path.join(OUT, 'slots_bg.png'), 'and slots_obj.png')


if __name__ == '__main__':
    main()
