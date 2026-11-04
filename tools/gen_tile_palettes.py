#!/usr/bin/env python3
"""gen_tile_palettes.py — per-tileset colour indices + palettes for the overworld.

The shipped *_tiles.png sheets are 16 palette bands, each band coloured with that
tileset's OWN .pal files (Magepunk66/tools/emerald_colorize_tilesets.py). On the
GBA the BG palettes are shared: Emerald loads palettes 0-5 from the primary and
6-12 from the secondary (FRLG: 0-6 / 7-12). So a primary tile drawn with palette 11
must use the SECONDARY's palette 11 — General's own 11 is all zeros, which is why
Route 115's Fallarbor terrain rendered opaque black — and a secondary tile drawn
with palette 0-5 uses the primary's.

This writes <sheet stem>_pal.json next to each sheet: the tile pixels as 4-bit
colour indices plus the tileset's 16 palettes, so engine.js can re-colour the
cross-tileset bands for a given primary/secondary pair.

  python tools/gen_tile_palettes.py        (then deploy overworld/data to magepunk-owdata)
"""
import base64, glob, json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'overworld', 'data')
REF = os.path.join(os.path.dirname(ROOT), 'Magepunk66', 'Reference')
DECOMP = {'emerald': 'pokeemerald', 'firered': 'pokefirered'}


def mangle(name):  # engine.js mangle()
	n = re.sub(r'^gTileset_', '', name)
	n = re.sub(r'([a-z])([A-Z])', r'\1_\2', n)
	n = re.sub(r'([A-Za-z])(\d+)', r'\1_\2', n)
	return n.lower().lstrip('_').replace('__', '_')


def read_pal(path):
	lines = open(path).read().split('\n')[3:19]
	cols = []
	for ln in lines:
		p = ln.split()
		cols.append('#%02x%02x%02x' % tuple(int(x) for x in p[:3]) if len(p) >= 3 else '#000000')
	return (cols + ['#000000'] * 16)[:16]


def main():
	wanted = set()
	for f in glob.glob(os.path.join(DATA, 'layouts', '*.json')):
		L = json.load(open(f))
		g = L.get('game')
		if g not in DECOMP: continue
		for name, kind in ((L.get('primary_tileset'), 'primary'), (L.get('secondary_tileset'), 'secondary')):
			if name: wanted.add((g, name, kind))
	wrote = skipped = 0
	stems = []
	for g, name, kind in sorted(wanted):
		stem = ('emerald_' if g == 'emerald' else '') + mangle(name)
		sheet = os.path.join(DATA, 'tilesets', stem + '_tiles.png')
		src = os.path.join(REF, DECOMP[g], 'data', 'tilesets', kind, mangle(name))
		if not (os.path.exists(sheet) and os.path.exists(os.path.join(src, 'tiles.png'))):
			skipped += 1  # Crystal-sourced (Cr*) sheets have no decomp tileset: left as-is
			continue
		img = Image.open(os.path.join(src, 'tiles.png'))
		sw, sh = Image.open(sheet).size
		if img.mode != 'P' or img.size != (sw, sh // 16):
			print(f'  SKIP {stem}: reference {img.size} {img.mode} does not match sheet band {sw}x{sh // 16}')
			skipped += 1
			continue
		px = [v & 15 for v in img.getdata()]
		packed = bytes((px[i] << 4) | (px[i + 1] if i + 1 < len(px) else 0) for i in range(0, len(px), 2))
		pals = [read_pal(os.path.join(src, 'palettes', f'{i:02d}.pal')) if os.path.exists(os.path.join(src, 'palettes', f'{i:02d}.pal')) else ['#000000'] * 16 for i in range(16)]
		out = {'w': img.size[0], 'h': img.size[1], 'idx': base64.b64encode(packed).decode(), 'pals': pals}
		with open(os.path.join(DATA, 'tilesets', stem + '_pal.json'), 'w') as fh:
			json.dump(out, fh, separators=(',', ':'))
		stems.append(stem)
		wrote += 1
	# the engine reads this first, so tilesets without a palette file cost no 404s
	with open(os.path.join(DATA, 'tilesets', 'pal_index.json'), 'w') as fh:
		json.dump(sorted(stems), fh, separators=(',', ':'))
	print(f'wrote {wrote} palette files, skipped {skipped}')


if __name__ == '__main__':
	sys.exit(main())
