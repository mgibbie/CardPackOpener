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
  python tools/restore_frlg_layouts.py --emerald-splits [--write] [--data=DIR] [--out=STAGING]
      (FireRed maps drawn with an Emerald layout of the same id: see FRLG_SPLITS)
"""
import glob, json, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'overworld', 'data')
def _find_ref():
	# $MAGEPUNK_REF, else the first ancestor with a Magepunk66 checkout beside it (a worktree sits deeper)
	if os.environ.get('MAGEPUNK_REF'): return os.environ['MAGEPUNK_REF']
	d = ROOT
	while True:
		c = os.path.join(os.path.dirname(d), 'Magepunk66', 'Reference')
		if os.path.isdir(c) or os.path.dirname(d) == d: return c
		d = os.path.dirname(d)
REF = _find_ref()
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


# FireRed layouts that EMERALD's converter overwrote. Magepunk66/tools/
# emerald_convert_layouts.py writes into the same layouts/ folder under the same
# ids, and 40 ids exist in both decomps. Where the two blockdata differ, the FireRed
# maps were left drawing Emerald's room with FireRed's events on top: One Island's
# harbor (and Two..Seven Island's) shipped Emerald's Birth Island harbor, whose pier
# is two tiles shorter, so the Seagallop SAILOR at (8,6) stood behind solid rows
# 5-6 and nobody could leave One Island by boat (bug:1792261107959 / ...204379,
# 2026-10-17). The Emerald maps that use the id (Birth Island / Navel Rock harbors
# in Emerald) keep it; the FireRed-only maps move to a FireRed copy under its own
# id. Only the ids listed here are split: the rest are reported, because the shared
# interiors (POKeMON CENTER, MART, HOUSE1-4...) are walked every day and want their
# own look before anything moves.
FRLG_SPLITS = {'LAYOUT_ISLAND_HARBOR': 'LAYOUT_FRLG_ISLAND_HARBOR'}


def decomp_maps(repo):
	names = set()
	for mf in glob.glob(os.path.join(REF, repo, 'data', 'maps', '*', 'map.json')):
		try: names.add(json.load(open(mf, encoding='utf-8'))['name'])
		except (OSError, ValueError, KeyError): pass
	return names


def split_emerald_collisions(write, data, out):
	fr = {l['id']: l for l in json.load(open(os.path.join(REF, 'pokefirered', 'data', 'layouts', 'layouts.json'), encoding='utf-8'))['layouts'] if 'id' in l}
	em = {l['id']: l for l in json.load(open(os.path.join(REF, 'pokeemerald', 'data', 'layouts', 'layouts.json'), encoding='utf-8'))['layouts'] if 'id' in l}
	fr_maps, em_maps = decomp_maps('pokefirered'), decomp_maps('pokeemerald')
	users = {}
	for mf in sorted(glob.glob(os.path.join(data, 'maps', '*_map.json'))):
		try: mj = json.load(open(mf, encoding='utf-8'))
		except ValueError: continue
		if 'layout' in mj and 'name' in mj: users.setdefault(mj['layout'], []).append((mf, mj['name']))
	n = 0
	for lid in sorted(set(fr) & set(em)):
		lp = os.path.join(data, 'layouts', lid + '.json')
		if not os.path.exists(lp): continue
		L = json.load(open(lp, encoding='utf-8'))
		if L.get('game') != 'emerald': continue
		src = fr[lid]
		cells = u16s(os.path.join(REF, 'pokefirered', src['blockdata_filepath']))
		if cells == u16s(os.path.join(REF, 'pokeemerald', em[lid]['blockdata_filepath'])): continue   # same room either way
		fr_only = [(mf, name) for mf, name in users.get(lid, []) if name in fr_maps and name not in em_maps]
		if not fr_only: continue
		if lid not in FRLG_SPLITS:
			print(f"  report: {lid} is Emerald's, also used by {len(fr_only)} FireRed map(s), e.g. {', '.join(n for _, n in fr_only[:3])}")
			continue
		new_id = FRLG_SPLITS[lid]
		w, h, bw, bh = src['width'], src['height'], src['border_width'], src['border_height']
		border = u16s(os.path.join(REF, 'pokefirered', src['border_filepath']))
		assert len(cells) == w * h and len(border) == bw * bh, lid
		lay = {'id': new_id, 'name': src['name'], 'width': w, 'height': h, 'border_width': bw, 'border_height': bh,
			'primary_tileset': src['primary_tileset'], 'secondary_tileset': src['secondary_tileset'], 'game': 'firered',
			'map': [cells[y * w:(y + 1) * w] for y in range(h)], 'border': [border[y * bw:(y + 1) * bw] for y in range(bh)]}
		print(f"  {lid}: FireRed copy -> {new_id} ({w}x{h}); repoint {', '.join(n for _, n in fr_only)}")
		if write:
			os.makedirs(os.path.join(out, 'layouts'), exist_ok=True)
			json.dump(lay, open(os.path.join(out, 'layouts', new_id + '.json'), 'w', encoding='utf-8'), separators=(',', ':'))
			os.makedirs(os.path.join(out, 'maps'), exist_ok=True)
			for mf, _ in fr_only:
				# a textual swap, so the rest of the map file stays byte-for-byte as shipped
				text = open(mf, encoding='utf-8', newline='').read()
				new = text.replace(f'"layout": "{lid}"', f'"layout": "{new_id}"', 1)
				assert new != text, mf
				open(os.path.join(out, 'maps', os.path.basename(mf)), 'w', encoding='utf-8', newline='').write(new)
		n += 1
	print(f"{n} Emerald-overwritten FireRed layout(s) {'split' if write else 'to split (dry run)'}")


if __name__ == '__main__':
	# --data=DIR reads another overworld/data; --out=DIR writes the changed files there
	# (a staging tree mirroring overworld/data) instead of in place
	arg = lambda k: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(k + '=')), None)
	if arg('--data'): DATA = os.path.abspath(arg('--data'))
	if '--emerald-splits' in sys.argv: split_emerald_collisions('--write' in sys.argv, DATA, os.path.abspath(arg('--out') or DATA))
	else: main('--write' in sys.argv)
