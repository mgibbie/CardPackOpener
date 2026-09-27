#!/usr/bin/env python3
"""crystal_counters.py — mark Crystal-sourced COUNTER tiles with MB_COUNTER (0x80).

The engine talks across a counter the way the GBA does (ow_input.js interact():
faced tile has behavior 0x80 and nobody on it -> the NPC one tile beyond). FRLG and
Emerald metatiles carry that behavior; the native Crystal tilesets (cr_*) were
built by Magepunk66/tools/crystal_native_build.py with a behavior table that only
knew grass and ledges, so every Crystal counter is behavior 0 and the Goldenrod
Dept. Store clerks can't be spoken to.

Crystal records counters per block quadrant in data/tilesets/<name>_collision.asm.
Each Crystal block is 2x2 engine metatiles, so every layout cell maps to exactly
one quadrant. For each Crystal map: cells whose quadrant is COUNTER (and that are
collision-blocked in the live layout) get behavior 0x80 on their metatile. If the
same metatile id also appears on a NON-counter cell, it is cloned first and only
the counter cells are repointed, so a wall never becomes talk-through.

Rebuilding via crystal_native_build.py would renumber every cr_* metatile under
layouts that have been edited since, so this patches overworld/data in place.

  python tools/crystal_counters.py            (dry run: prints what would change)
  python tools/crystal_counters.py --write    (then deploy overworld/data to magepunk-owdata)
"""
import glob, json, os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'overworld', 'data')
MP_TOOLS = os.path.join(os.path.dirname(ROOT), 'Magepunk66', 'tools')
sys.path.insert(0, MP_TOOLS)
import crystal_truth_lib as T   # tileset_file, load_blk_grid, DATA_TS_DIR

MB_COUNTER = 0x80
BEHAVIOR_MASK = 0x1FF
METATILE_MASK, COLLISION_MASK = 0x3FF, 0x0C00


def mangle(name):  # engine.js mangle()
	n = re.sub(r'^gTileset_', '', name)
	n = re.sub(r'([a-z])([A-Z])', r'\1_\2', n)
	n = re.sub(r'([A-Za-z])(\d+)', r'\1_\2', n)
	return n.lower().lstrip('_').replace('__', '_')


def collision(const):
	path = os.path.join(T.DATA_TS_DIR, f'{T.tileset_file(const)}_collision.asm')
	out = []
	if os.path.exists(path):
		for line in open(path, encoding='utf-8'):
			m = re.match(r'\s*tilecoll\s+(\w+),\s*(\w+),\s*(\w+),\s*(\w+)', line)
			if m: out.append([m.group(i).upper() for i in range(1, 5)])
	return out


def main(write):
	# per tileset: metatile id -> {'counter': [(layout, x, y)], 'other': n}
	uses = defaultdict(lambda: defaultdict(lambda: {'counter': [], 'other': 0}))
	layouts = {}
	for mf in sorted(glob.glob(os.path.join(DATA, 'maps', '*_map.json'))):
		mj = json.load(open(mf, encoding='utf-8'))
		const, w, h = mj.get('_crystal_tileset'), mj.get('_crystal_width_blocks'), mj.get('_crystal_height_blocks')
		if not (const and w and h): continue
		lp = os.path.join(DATA, 'layouts', mj['layout'] + '.json')
		if not os.path.exists(lp): continue
		L = layouts.get(lp) or json.load(open(lp, encoding='utf-8'))
		if L.get('_source') != 'crystal_native' or L['width'] != w * 2 or L['height'] != h * 2: continue
		grid = T.load_blk_grid(mj['name'], w, h)
		coll = collision(const)
		if grid is None or not coll: continue
		layouts[lp] = L
		ts = L['primary_tileset']
		for y in range(L['height']):
			for x in range(L['width']):
				v = L['map'][y][x]
				bid = grid[y // 2][x // 2]
				q = coll[bid][(y & 1) * 2 + (x & 1)] if bid < len(coll) else 'WALL'
				u = uses[ts][v & METATILE_MASK]
				if q == 'COUNTER' and v & COLLISION_MASK: u['counter'].append((lp, x, y))
				else: u['other'] += 1
	stamped = cloned = cells = 0
	for ts, ids in sorted(uses.items()):
		path = os.path.join(DATA, 'tilesets', f'primary_{mangle(ts)}_metatiles.json')
		meta = json.load(open(path, encoding='utf-8'))
		attrs = meta['attributes']
		from PIL import Image   # clones must stay under the engine's primary/secondary split
		sheet = Image.open(os.path.join(DATA, 'tilesets', f'{mangle(ts)}_tiles.png'))
		split = (sheet.height // 16 // 8) * (sheet.width // 8)
		touched = False
		for mid, u in sorted(ids.items()):
			if not u['counter'] or (attrs[mid] & BEHAVIOR_MASK) == MB_COUNTER: continue
			if u['other']:
				# shared with walls/floors elsewhere: clone it for the counter cells only
				new = len(meta['metatiles'])
				if new >= split: print(f'  {ts} #{mid}: SKIP, no room to clone under the split ({split})'); continue
				meta['metatiles'].append(list(meta['metatiles'][mid]))
				attrs.append((attrs[mid] & ~BEHAVIOR_MASK) | MB_COUNTER)
				for lp, x, y in u['counter']:
					layouts[lp]['map'][y][x] = (layouts[lp]['map'][y][x] & ~METATILE_MASK) | new
				print(f'  {ts} #{mid}: cloned -> #{new} for {len(u["counter"])} counter cells ({u["other"]} other uses keep #{mid})')
				cloned += 1
			else:
				attrs[mid] = (attrs[mid] & ~BEHAVIOR_MASK) | MB_COUNTER
				print(f'  {ts} #{mid}: behavior -> 0x80 ({len(u["counter"])} counter cells)')
				stamped += 1
			cells += len(u['counter'])
			touched = True
		if touched and write:
			json.dump(meta, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
	if write:
		for lp, L in layouts.items(): json.dump(L, open(lp, 'w', encoding='utf-8'), separators=(',', ':'))
	print(f'{stamped} metatiles stamped, {cloned} cloned, {cells} counter cells' + ('' if write else '  (dry run)'))


if __name__ == '__main__':
	main('--write' in sys.argv)
