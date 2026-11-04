"""gen_blender_gfx.py — convert pokeemerald's BERRY BLENDER and POKeBLOCK graphics
into the web port's tracked asset folder (overworld/minigames/blender/).

The blender screen is three GBA layers (src/berry_blender.c LoadBerryBlenderGfx):
  BG1  outer.4bpp + outer_map.bin (32x32 text map, palette 8 = outer.gbapal) —
       the frame, the four name plates, the progress bar and the RPM readout
  BG2  center.8bpp + center_map.bin (32x32 affine map, palette 0 = center.gbapal) —
       the spinning blender, rotated by arrowPos about screen/texture (120, 80)
  OBJ  player arrows (arrow.gbapal), score symbols / particles / countdown /
       START (misc.gbapal)

Outputs (RGBA, colour index 0 transparent):
  outer_tiles.png    128x128 — BG1's 256 tiles in id order, palette 8 (the port
                     redraws the progress bar / RPM cells from these by tile id)
  center.png         256x256 — BG2 rendered from its affine map
  arrow.png          32x128  — 4 frames (off / normal / flash / flash-bright)
  score_symbols.png  16x64   — GOOD / MISS / BEST / BEST-bright
  particles.png      8x56
  countdown.png      32x96   — "1" / "2" / "3"
  start.png          64x32
  pokeblock.png      8x120   — the case icon recoloured per PBLOCK_CLR_* (row = colour id)
  case.png           64x64   — the POKeBLOCK CASE device
  blender.json       the BG1 tilemap (cell -> tile/flip/pal), backdrop colour

  python tools/gen_blender_gfx.py [path/to/pokeemerald]
"""
import json
import os
import struct
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EM = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.expanduser('~'), 'Desktop', 'Magepunk66', 'Reference', 'pokeemerald')
G = os.path.join(EM, 'graphics')
OUT = os.path.join(ROOT, 'overworld', 'minigames', 'blender')


def gba(c):
    # a .pal / PNG colour goes through the GBA's 5-bit channels, as on hardware
    return tuple((v >> 3) * 255 // 31 for v in c)


def png_pal(path):
    im = Image.open(path)
    p = im.getpalette()[:48]
    return [gba(tuple(p[i * 3:i * 3 + 3])) for i in range(16)]


def jasc(path):
    rows = open(path).read().split('\n')[3:19]
    return [gba(tuple(int(x) for x in r.split())) for r in rows]


def indexed(path):
    im = Image.open(path)
    assert im.mode == 'P', path
    return im


def tiles(im):
    w, h = im.size
    px = im.load()
    out = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            out.append([[px[tx * 8 + x, ty * 8 + y] for x in range(8)] for y in range(8)])
    return out


def recolor(im, pal):
    w, h = im.size
    src = im.load()
    out = Image.new('RGBA', (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            i = src[x, y] & 15
            dst[x, y] = (0, 0, 0, 0) if i == 0 else pal[i] + (255,)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    bb = os.path.join(G, 'berry_blender')
    outer_pal = png_pal(os.path.join(bb, 'outer.png'))
    center_pal = png_pal(os.path.join(bb, 'center.png'))
    misc_pal = jasc(os.path.join(bb, 'misc.pal'))
    arrow_pal = png_pal(os.path.join(bb, 'arrow.png'))

    # BG1: the tiles in id order (palette 8) + the map
    outer = indexed(os.path.join(bb, 'outer.png'))
    recolor(outer, outer_pal).save(os.path.join(OUT, 'outer_tiles.png'))
    raw = open(os.path.join(bb, 'outer_map.bin'), 'rb').read()
    cells = list(struct.unpack('<%dH' % (len(raw) // 2), raw))

    # BG2: render the affine map (1 byte per cell, 8bpp tiles — indices < 16 here)
    ctiles = tiles(indexed(os.path.join(bb, 'center.png')))
    cmap = open(os.path.join(bb, 'center_map.bin'), 'rb').read()
    center = Image.new('RGBA', (256, 256))
    cp = center.load()
    for cy in range(32):
        for cx in range(32):
            t = cmap[cy * 32 + cx]
            if t >= len(ctiles):
                continue
            for y in range(8):
                for x in range(8):
                    i = ctiles[t][y][x]
                    if i:
                        cp[cx * 8 + x, cy * 8 + y] = center_pal[i] + (255,)
    center.save(os.path.join(OUT, 'center.png'))

    recolor(indexed(os.path.join(bb, 'arrow.png')), arrow_pal).save(os.path.join(OUT, 'arrow.png'))
    for name, out in (('score_symbols', 'score_symbols'), ('particles', 'particles'),
                      ('countdown_numbers', 'countdown'), ('start', 'start')):
        recolor(indexed(os.path.join(bb, name + '.png')), misc_pal).save(os.path.join(OUT, out + '.png'))

    # POKeBLOCK icon per colour (pokeblock.c: gPokeblock<Colour>_Pal, PBLOCK_CLR_* order)
    pb = os.path.join(G, 'pokeblock')
    colours = ['red', 'blue', 'pink', 'green', 'yellow', 'purple', 'indigo', 'brown',
               'liteblue', 'olive', 'gray', 'black', 'white', 'gold']
    icon = indexed(os.path.join(pb, 'pokeblock.png'))
    sheet = Image.new('RGBA', (8, 8 * (len(colours) + 1)))
    for i, c in enumerate(colours):
        sheet.paste(recolor(icon, jasc(os.path.join(pb, c + '.pal'))), (0, 8 * (i + 1)))
    sheet.save(os.path.join(OUT, 'pokeblock.png'))
    dev = indexed(os.path.join(pb, 'device.png'))
    recolor(dev, png_pal(os.path.join(pb, 'device.png'))).save(os.path.join(OUT, 'case.png'))

    with open(os.path.join(OUT, 'blender.json'), 'w') as f:
        json.dump({
            'generated': 'tools/gen_blender_gfx.py',
            # BG1 cells: tile | hflip<<10 | vflip<<11 | pal<<12 (32x32, first 30x20 shown)
            'outerMap': cells,
            # the backdrop: BG palette 0 colour 0 (center.gbapal)
            'backdrop': '#%02x%02x%02x' % center_pal[0],
        }, f, separators=(',', ':'))
    print('wrote', OUT)


if __name__ == '__main__':
    main()
