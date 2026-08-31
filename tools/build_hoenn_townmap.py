#!/usr/bin/env python3
"""build_hoenn_townmap.py — assemble Hoenn's Town Map art from pokeemerald.

Kanto and Johto have real region art behind their Town Map; HOENN had none, so
the largest region in the game — 16 fly destinations — drew as a bare 28x15 grid
of dots while the other three got a map.

An earlier attempt (Magepunk66/tools/build_region_map_art.py) skipped Hoenn on
the grounds that "Emerald's tilemap references ~982 tiles into a 240-tile
sheet". That is not what the data says: graphics/pokedex/region_map.bin has 1024
entries whose highest tile index is 231, and the sheet holds exactly 240 tiles.
It assembles cleanly.

The sheet is 8bpp with its OWN full-colour palette (pixel indices run 113-129),
not 4bpp indices into region_map.pal — applying the .pal with palette-bank
offsets yields a solid black image, which is presumably what made this look
impossible the first time.

GBA tilemap entry (u16 LE): bits 0-9 tile, bit 10 h-flip, bit 11 v-flip,
bits 12-15 palette bank.

    python tools/build_hoenn_townmap.py            (writes a preview only)
    python tools/build_hoenn_townmap.py --write    (writes overworld/data/townmap/hoenn.png)
"""
import os
import struct
import sys

from PIL import Image

REF = os.path.join('..', 'Magepunk66', 'Reference', 'pokeemerald', 'graphics', 'pokedex')
OUT = os.path.join('overworld', 'data', 'townmap', 'hoenn.png')
COLS, ROWS = 32, 20          # the GBA tilemap is 32 wide; 20 rows is the screen
VISIBLE_COLS = 30            # ...but only 30 columns are ever on screen


def main():
    write = '--write' in sys.argv
    sheet = Image.open(os.path.join(REF, 'region_map.png')).convert('RGBA')
    per_row = sheet.width // 8

    data = open(os.path.join(REF, 'region_map.bin'), 'rb').read()
    ents = [struct.unpack('<H', data[i:i + 2])[0] for i in range(0, len(data), 2)]

    out = Image.new('RGBA', (VISIBLE_COLS * 8, ROWS * 8), (0, 0, 0, 255))
    for r in range(ROWS):
        for c in range(VISIBLE_COLS):
            e = ents[r * COLS + c]
            tile, hf, vf = e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1
            tx, ty = (tile % per_row) * 8, (tile // per_row) * 8
            t = sheet.crop((tx, ty, tx + 8, ty + 8))
            if hf:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            if vf:
                t = t.transpose(Image.FLIP_TOP_BOTTOM)
            out.paste(t, (c * 8, r * 8))

    tiles = [e & 0x3FF for e in ents]
    print(f'sheet {sheet.size} ({per_row * (sheet.height // 8)} tiles) | '
          f'tilemap {len(ents)} entries | max tile {max(tiles)} | out {out.size}')
    if write:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        out.save(OUT)
        print('wrote ' + OUT)
    else:
        prev = os.path.join(os.environ.get('TEMP', '/tmp'), 'hoenn_townmap_preview.png')
        out.save(prev)
        print('preview -> ' + prev + '   (pass --write to install)')


main()
