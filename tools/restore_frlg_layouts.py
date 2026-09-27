#!/usr/bin/env python3
"""restore_frlg_layouts.py — rebuild FRLG/Emerald layouts a Crystal build overwrote.

Magepunk66/tools/crystal_native_build.py writes every converted Crystal map's
layout to layouts/<its layout id>.json. Crystal's Rock Tunnel shares FireRed's ids
(LAYOUT_ROCK_TUNNEL_1F / _B1F), so its 30x36 Crystal layout replaced FireRed's
48x40 one, while RockTunnel_1F's events kept FireRed coordinates: Route 10's south
entrance landed the player at (18,37), outside the map, with no way out.

For every FRLG/Emerald map whose layout file is `crystal_native`, this rebuilds the
layout from the decomp's map.bin / border.bin (the raw u16 values every healthy
layout stores; LAYOUT_MT_MOON_1F is byte-identical to its map.bin).

  python tools/restore_frlg_layouts.py            (dry run)
  python tools/restore_frlg_layouts.py --write    (then deploy overworld/data to magepunk-owdata)
"""
import glob, json, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'overworld', 'data')
REF = os.path.join(os.path.dirname(ROOT), 'Magepunk66', 'Reference')
DECOMP = {'firered': 'pokefirered', 'emerald': 'pokeemerald'}


def u16s(path):
	b = open(path, 'rb').read()
	return list(struct.unpack('<%dH' % (len(b) // 2), b))


def decomp_layouts():
	out = {}
	for game, repo in DECOMP.items():
		d = json.load(open(os.path.join(REF, repo, 'data', 'layouts', 'layouts.json'), encoding='utf-8'))
		for l in d['layouts']:
			if 'id' in l: out.setdefault(l['id'], (game, repo, l))
	return out


def main(write):
	known = decomp_layouts()
	n = 0
	for mf in sorted(glob.glob(os.path.join(DATA, 'maps', '*_map.json'))):
		mj = json.load(open(mf, encoding='utf-8'))
		if mj.get('_crystal_tileset'): continue   # a real Crystal map: its layout is right
		lp = os.path.join(DATA, 'layouts', f"{mj.get('layout')}.json")
		if not os.path.exists(lp): continue
		L = json.load(open(lp, encoding='utf-8'))
		if L.get('_source') != 'crystal_native': continue
		if mj['layout'] not in known:
			print(f"  {mj['name']}: {mj['layout']} has no decomp layout; left alone"); continue
		game, repo, src = known[mj['layout']]
		w, h, bw, bh = src['width'], src['height'], src['border_width'], src['border_height']
		cells = u16s(os.path.join(REF, repo, src['blockdata_filepath']))
		border = u16s(os.path.join(REF, repo, src['border_filepath']))
		assert len(cells) == w * h and len(border) == bw * bh, mj['layout']
		out = {'id': src['id'], 'name': src['name'], 'width': w, 'height': h, 'border_width': bw, 'border_height': bh,
			'primary_tileset': src['primary_tileset'], 'secondary_tileset': src['secondary_tileset'], 'game': game,
			'map': [cells[y * w:(y + 1) * w] for y in range(h)], 'border': [border[y * bw:(y + 1) * bw] for y in range(bh)]}
		print(f"  {mj['name']}: {mj['layout']} {L['width']}x{L['height']} crystal_native -> {w}x{h} {src['secondary_tileset']} ({game})")
		if write: json.dump(out, open(lp, 'w', encoding='utf-8'), separators=(',', ':'))
		n += 1
	print(f"{n} layout(s) {'restored' if write else 'to restore (dry run)'}")


if __name__ == '__main__':
	main('--write' in sys.argv)
