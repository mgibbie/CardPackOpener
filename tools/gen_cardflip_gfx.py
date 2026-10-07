"""gen_cardflip_gfx.py — convert pokecrystal's CARD FLIP graphics into the
web port's tracked asset folder (overworld/minigames/cardflip/).

Rebuilds the BG tile VRAM exactly as engine/games/card_flip.asm leaves it
after its setup, so the port can draw the decomp's own tilemaps by tile id:

  $00-$3d  card_flip_1 (--trim-whitespace)        CardFlipLZ01 -> vTiles2 $00
  $3e-...  card_flip_2 (--remove-whitespace)      CardFlipLZ02 -> vTiles2 $3e
  $60-$78  LoadFontsExtra (black, phone, FontExtra+3), where LZ02 didn't land
  $79-$7e  textbox frame 1, $7f space
  $80-$ff  the standard font; '♂'/'♀' replaced by off/on lamps;
           digits shifted up one pixel (CardFlip_ShiftDigitsUpOnePixel)

Outputs (pixel gray encodes the GB colour index: 255=0 170=1 85=2 0=3):
  bg.png        128x128, 256 BG tiles in id order
  obj.png       the OBJ tiles (card_flip_3, cursor + card border)
  cardflip.json the 12x11 board tilemap + the 9 CGB palettes (card_flip.pal)

  python tools/gen_cardflip_gfx.py [path/to/pokecrystal]
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRYSTAL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.expanduser('~'), 'Desktop', 'Magepunk66', 'Reference', 'pokecrystal')
OUT = os.path.join(ROOT, 'overworld', 'minigames', 'cardflip')
GRAY = {255: 0, 170: 1, 85: 2, 0: 3}


def tiles_of(path, one_bpp=False):
    im = Image.open(path).convert('L')
    w, h = im.size
    px = im.load()
    out = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            t = []
            for y in range(8):
                row = []
                for x in range(8):
                    v = px[tx * 8 + x, ty * 8 + y]
                    if one_bpp:
                        row.append(3 if v < 128 else 0)
                    else:
                        row.append(GRAY[min(GRAY, key=lambda g: abs(g - v))])
                t.append(row)
            out.append(t)
    return out


def blank(t):
    return all(c == 0 for row in t for c in row)


def main():
    g = lambda *p: os.path.join(CRYSTAL, *p)
    vram = [[[0] * 8 for _ in range(8)] for _ in range(256)]
    # LoadStandardFont: 128 1bpp tiles at $80
    for i, t in enumerate(tiles_of(g('gfx', 'font', 'font.png'), True)[:128]):
        vram[0x80 + i] = t
    # LoadFontsExtra: solid black $60, phone $62, FontExtra+3 -> $63 (22), frame, space
    vram[0x60] = [[3] * 8 for _ in range(8)]
    vram[0x62] = tiles_of(g('gfx', 'font', 'phone_icon.png'))[0]
    fx = tiles_of(g('gfx', 'font', 'font_extra.png'))
    for i in range(22):
        vram[0x63 + i] = fx[3 + i]
    for i, t in enumerate(tiles_of(g('gfx', 'frames', '1.png'), True)[:6]):
        vram[0x79 + i] = t
    vram[0x7f] = [[0] * 8 for _ in range(8)]
    # CardFlipLZ01 at $00 (trailing blank tiles trimmed by the Makefile)
    lz1 = tiles_of(g('gfx', 'card_flip', 'card_flip_1.png'))
    while lz1 and blank(lz1[-1]):
        lz1.pop()
    for i, t in enumerate(lz1):
        vram[i] = t
    # CardFlipLZ02 at $3e (every blank tile removed)
    lz2 = [t for t in tiles_of(g('gfx', 'card_flip', 'card_flip_2.png')) if not blank(t)]
    for i, t in enumerate(lz2):
        vram[0x3e + i] = t
    # the lamps overwrite '♂' ($ef) and '♀' ($f5)
    vram[0xef] = tiles_of(g('gfx', 'card_flip', 'off.png'))[0]
    vram[0xf5] = tiles_of(g('gfx', 'card_flip', 'on.png'))[0]
    # CardFlip_ShiftDigitsUpOnePixel: '0'-'9' ($f6-$ff) as one strip, up a row
    rows = [r for i in range(10) for r in vram[0xf6 + i]]
    rows = rows[1:] + [[0] * 8]
    for i in range(10):
        vram[0xf6 + i] = rows[i * 8:(i + 1) * 8]

    os.makedirs(OUT, exist_ok=True)
    inv = {0: 255, 1: 170, 2: 85, 3: 0}
    bg = Image.new('L', (128, 128), 255)
    for n, t in enumerate(vram):
        for y in range(8):
            for x in range(8):
                bg.putpixel(((n % 16) * 8 + x, (n // 16) * 8 + y), inv[t[y][x]])
    bg.save(os.path.join(OUT, 'bg.png'), optimize=True)
    obj_tiles = tiles_of(g('gfx', 'card_flip', 'card_flip_3.png'))
    obj = Image.new('L', (8 * len(obj_tiles), 8), 255)
    for n, t in enumerate(obj_tiles):
        for y in range(8):
            for x in range(8):
                obj.putpixel((n * 8 + x, y), inv[t[y][x]])
    obj.save(os.path.join(OUT, 'obj.png'), optimize=True)

    tm = open(g('gfx', 'card_flip', 'card_flip.tilemap'), 'rb').read()
    board = [list(tm[r * 11:(r + 1) * 11]) for r in range(12)]
    pal = [int(v) for v in re.findall(r'\d+', open(g('gfx', 'card_flip', 'card_flip.pal')).read())]
    pals = [[pal[p * 12 + c * 3:p * 12 + c * 3 + 3] for c in range(4)] for p in range(len(pal) // 12)]
    meta = {
        'source': 'pokecrystal gfx/card_flip + gfx/font + gfx/frames/1 (tools/gen_cardflip_gfx.py)',
        'lz1Tiles': len(lz1), 'lz2Tiles': len(lz2),
        'board': board, 'palettes': pals,
    }
    with open(os.path.join(OUT, 'cardflip.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    print(f'lz1 {len(lz1)} tiles (${len(lz1):02x}), lz2 {len(lz2)} tiles -> ${0x3e:02x}-${0x3e + len(lz2) - 1:02x}, '
          f'{len(obj_tiles)} obj tiles, {len(pals)} palettes')


main()
