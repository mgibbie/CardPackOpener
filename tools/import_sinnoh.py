#!/usr/bin/env python3
"""import_sinnoh.py — SINNOH, stage 1: its maps, layouts and tilesets into overworld/data.

The owner, 2026-11-15: Sinnoh maps "for after johkanto for the post game", from a fan-made 2D source. The source is
LiderMorti00/Sinnoh-pokeemerald-expansion (a Platinum demake on the Emerald decomp; cloned beside the other reference
decomps, Desktop/Magepunk66/Reference/sinnoh-pokeemerald-expansion), so its data is in the format Hoenn came in.

What this writes (all NEW files, under names of their own — the demake still carries Hoenn's maps and reuses Hoenn's
tileset names with its own contents, so nothing of Sinnoh's may land on a Hoenn file):
  maps/Sinnoh<Name>_map.json        id MAP_SINNOH_<X>, layout LAYOUT_SINNOH_<X>; warps and connections point at MAP_SINNOH_*
  layouts/LAYOUT_SINNOH_<X>.json    game 'sinnoh' (engine.js: tileset files prefixed sinnoh_)
  tilesets/sinnoh_<name>_tiles.png  16 palette bands, as Hoenn's sheets (Magepunk66/tools/emerald_colorize_tilesets.py)
  tilesets/sinnoh_(primary|secondary)_<name>_metatiles.json   metatiles + attributes (u16 -> the u32 layout Hoenn's use)
  tilesets/sinnoh_<name>_pal.json   colour indices + palettes for the shared-palette repaint (tools/gen_tile_palettes.py)
and it adds the maps to map_index.json and the sheets to tilesets/pal_index.json.

Which maps: every map in the demake's Sinnoh map groups, plus whatever those reach by a warp or a connection.
  people/<id>.png                   the sheet of each person the maps use that the game does not have yet
NOT in this stage: scripts and their text, trainers, wild tables, music, the town map, the story. A map loads and can
be walked; its people stand there and say nothing.

  python tools/import_sinnoh.py            dry run: says what it would write
  python tools/import_sinnoh.py --write    (then deploy overworld/data to magepunk-owdata and refresh the manifest)
"""
import base64, json, os, re, struct, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = ROOT.split(os.sep + '.worktrees' + os.sep)[0]   # (a worktree: the data and the references live by the main checkout)
DATA = os.path.join(MAIN, 'overworld', 'data')
SRC = os.environ.get('SINNOH_SRC') or os.path.join(os.path.dirname(MAIN), 'Magepunk66', 'Reference', 'sinnoh-pokeemerald-expansion')
WRITE = '--write' in sys.argv
GROUP = re.compile(r'Sinnoh|Indoor(Twinleaf|Sandgem|Jubilife|Oreburgh|Floaroma|Eterna|Hearthome|Solaceon|Veilstone|Pastoria|Celestic|Canalave|Snowpoint|Sunyshore|PokemonLeague|FightArea|SurvivalArea|ResortArea)$')
PRE_ID, PRE_STEM, PRE_FILE = 'SINNOH_', 'Sinnoh', 'sinnoh_'


def rj(p):
	with open(p, encoding='utf-8') as f:
		return json.load(f)


def wj(p, o, **kw):
	if not WRITE:
		return
	os.makedirs(os.path.dirname(p), exist_ok=True)
	with open(p, 'w', encoding='utf-8') as f:
		json.dump(o, f, separators=(',', ':'), **kw)


def mangle(name):   # engine.js mangle()
	n = name.replace('gTileset_', '')
	n = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', n)
	n = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', n)
	n = re.sub(r'([A-Za-z])(\d+)', r'\1_\2', n)
	return n.lower().lstrip('_').replace('__', '_')


# ---------- the maps ----------
groups = rj(os.path.join(SRC, 'data', 'maps', 'map_groups.json'))
folder = {}   # MAP_ID -> its folder in the demake
for g in groups['group_order']:
	for name in groups[g]:
		try:
			folder[rj(os.path.join(SRC, 'data', 'maps', name, 'map.json'))['id']] = (name, g)
		except Exception:
			pass
picked = [i for i, (_, g) in folder.items() if GROUP.search(g)]
seen, queue, pulled = set(picked), list(picked), []
maps = {}
while queue:
	mid = queue.pop(0)
	m = rj(os.path.join(SRC, 'data', 'maps', folder[mid][0], 'map.json'))
	maps[mid] = m
	for dest in [c.get('map') for c in (m.get('connections') or [])] + [w.get('dest_map') for w in (m.get('warp_events') or [])]:
		if dest in folder and dest not in seen:
			seen.add(dest); queue.append(dest); pulled.append((dest, folder[dest][1], mid))
new_id = lambda mid: 'MAP_' + PRE_ID + mid[4:]
stem = lambda mid: PRE_STEM + folder[mid][0]
index = rj(os.path.join(DATA, 'map_index.json'))
clash = [new_id(m) for m in maps if new_id(m) in index and index[new_id(m)] != stem(m)]

layouts = {l['id']: l for l in rj(os.path.join(SRC, 'data', 'layouts', 'layouts.json'))['layouts'] if l and l.get('id')}
new_layout = lambda lid: 'LAYOUT_' + PRE_ID + lid[7:]
used_layouts, tilesets, dangling = {}, set(), []


def u16s(path):
	with open(path, 'rb') as f:
		b = f.read()
	return list(struct.unpack('<%dH' % (len(b) // 2), b[:len(b) // 2 * 2]))


for mid, m in maps.items():
	out = dict(m)
	out['id'], out['name'] = new_id(mid), stem(mid)
	L = layouts.get(m['layout'])
	if not L:
		dangling.append(('layout', mid, m['layout'])); continue
	out['layout'] = new_layout(L['id']); used_layouts[L['id']] = L
	for c in out.get('connections') or []:
		if c.get('map') in maps: c['map'] = new_id(c['map'])
		else: dangling.append(('connection', mid, c.get('map')))
	for w in out.get('warp_events') or []:
		d = w.get('dest_map')
		if d in maps: w['dest_map'] = new_id(d)
		elif d not in ('MAP_DYNAMIC', 'MAP_NONE', 'MAP_UNDEFINED'): dangling.append(('warp', mid, d))
	wj(os.path.join(DATA, 'maps', stem(mid) + '_map.json'), out)
	index[new_id(mid)] = stem(mid)

for lid, L in used_layouts.items():
	w, h = L['width'], L['height']
	cells = u16s(os.path.join(SRC, L['blockdata_filepath']))
	border = u16s(os.path.join(SRC, L['border_filepath']))
	bw = L.get('border_width', 2)
	wj(os.path.join(DATA, 'layouts', new_layout(lid) + '.json'), {
		'id': new_layout(lid), 'name': PRE_STEM + L['name'], 'game': 'sinnoh', 'width': w, 'height': h, 'border_width': 0, 'border_height': 0,
		'primary_tileset': L['primary_tileset'], 'secondary_tileset': L['secondary_tileset'],
		'map': [cells[r * w:(r + 1) * w] for r in range(h)], 'border': [border[r * bw:(r + 1) * bw] for r in range(len(border) // bw)]})
	tilesets.add((L['primary_tileset'], True)); tilesets.add((L['secondary_tileset'], False))

# ---------- the tilesets: what each header points at (a tileset may borrow another's tiles or palettes) ----------
src = lambda *p: open(os.path.join(SRC, *p), encoding='utf-8', errors='replace').read()
headers, metas = src('src', 'data', 'tilesets', 'headers.h'), src('src', 'data', 'tilesets', 'metatiles.h')
graphics = src('src', 'data', 'tilesets', 'graphics.h') + src('src', 'graphics.c')   # (the General tileset's are in graphics.c)
field = lambda body, k: (re.search(r'\.' + k + r'\s*=\s*(\w+)', body) or [None, None])[1]
path_of = lambda text, sym: (re.search(r'\b' + re.escape(sym) + r'\[\][^=]*=\s*INC\w+\("([^"]+)"', text) or [None, None])[1]


def pal_paths(sym):
	m = re.search(r'\b' + re.escape(sym) + r'\[\]\[16\]\s*=\s*\{(.*?)\};', graphics, re.S)
	return re.findall(r'INC\w+\("([^"]+)"', m.group(1)) if m else []


def read_pal(p):   # a JASC .pal (the demake lists .gbapal; the .pal beside it is the source)
	p = re.sub(r'\.gbapal$', '.pal', p)
	if not os.path.exists(p): return None
	cols = []
	for ln in open(p).read().split('\n')[3:19]:
		q = ln.split()
		if len(q) >= 3: cols.append(tuple(int(x) for x in q[:3]))
	return (cols + [(0, 0, 0)] * 16)[:16]


stems, bad_ts, n_ts = [], [], 0
for name, primary in sorted(tilesets):
	h = re.search(r'const struct Tileset ' + re.escape(name) + r'\s*=\s*\{(.*?)\};', headers, re.S)
	if not h: bad_ts.append((name, 'no header')); continue
	tiles = path_of(graphics, field(h.group(1), 'tiles') or '')
	pals = pal_paths(field(h.group(1), 'palettes') or '')
	mt, at = path_of(metas, field(h.group(1), 'metatiles') or ''), path_of(metas, field(h.group(1), 'metatileAttributes') or '')
	if not (tiles and pals and mt and at): bad_ts.append((name, 'tiles %s pals %d metatiles %s attrs %s' % (bool(tiles), len(pals), bool(mt), bool(at)))); continue
	png = os.path.join(SRC, re.sub(r'\.4bpp.*$', '.png', tiles) if not tiles.endswith('.png') else tiles)
	img = Image.open(png)
	if img.mode != 'P': bad_ts.append((name, 'tiles.png is ' + img.mode)); continue
	tw, th = img.size
	px = [v & 15 for v in img.getdata()]
	sheet = Image.new('RGBA', (tw, th * 16)); pal_hex = []
	for b in range(16):
		cols = read_pal(os.path.join(SRC, pals[b])) if b < len(pals) else None
		pal_hex.append(['#%02x%02x%02x' % c for c in cols] if cols else ['#000000'] * 16)
		band = Image.new('RGBA', (tw, th), (0, 0, 0, 255))
		if cols: band.putdata([(0, 0, 0, 0) if v == 0 else cols[v] + (255,) for v in px])
		sheet.paste(band, (0, b * th))
	st = PRE_FILE + mangle(name)
	mts = u16s(os.path.join(SRC, mt)); ats = u16s(os.path.join(SRC, at))
	if WRITE:
		sheet.save(os.path.join(DATA, 'tilesets', st + '_tiles.png'), 'PNG')
	wj(os.path.join(DATA, 'tilesets', PRE_FILE + ('primary_' if primary else 'secondary_') + mangle(name) + '_metatiles.json'), {
		'tileset': st, 'metatiles': [mts[i:i + 8] for i in range(0, len(mts) - 7, 8)],
		# (Emerald's u16 -> the u32 layout the engine reads: the 2-bit layer type moves from bits 12-13 to 29-30)
		'attributes': [(v & 0x0FFF) | ((v & 0x3000) << 17) for v in ats]})
	packed = bytes((px[i] << 4) | (px[i + 1] if i + 1 < len(px) else 0) for i in range(0, len(px), 2))
	wj(os.path.join(DATA, 'tilesets', st + '_pal.json'), {'w': tw, 'h': th, 'idx': base64.b64encode(packed).decode(), 'pals': pal_hex})
	stems.append(st); n_ts += 1

# ---------- the people: each graphics id the maps use that the game has no sheet for ----------
# npcs.js asks for data/people/<the id without OBJ_EVENT_GFX_, lower case>.png (unless gfx_map.json or an alias names
# another file). The demake's sheet for an id: its graphics info -> its picture table -> the first picture's PNG, which
# is already an indexed PNG with colour 0 transparent, as the game's own sheets are — so it is copied as it is.
oe = lambda f: src('src', 'data', 'object_events', f)
ptrs, infos, pics, gfxh = oe('object_event_graphics_info_pointers.h'), oe('object_event_graphics_info.h'), oe('object_event_pic_tables.h'), oe('object_event_graphics.h')
gfx_map = rj(os.path.join(DATA, 'gfx_map.json'))
aliases = set(re.findall(r'^	(OBJ_EVENT_GFX_\w+):', open(os.path.join(ROOT, 'overworld', 'trainers.js'), encoding='utf-8').read(), re.M))
used = sorted({o.get('graphics_id') for m in maps.values() for o in (m.get('object_events') or []) if str(o.get('graphics_id', '')).startswith('OBJ_EVENT_GFX_')})
people, no_sheet = [], []
for gid in used:
	if gid in gfx_map or gid in aliases: continue
	fn = gid.replace('OBJ_EVENT_GFX_', '').lower() + '.png'
	if os.path.exists(os.path.join(DATA, 'people', fn)) and not fn.startswith('sinnoh_'): continue   # (the game has this person already)
	info = re.search(r'\[' + gid + r'\]\s*=\s*&(\w+)', ptrs)
	body = info and re.search(r'\b' + info.group(1) + r'\s*=\s*\{(.*?)\};', infos, re.S)
	table = body and field(body.group(1), 'images')
	tb = table and re.search(r'\b' + table + r'\[\]\s*=\s*\{(.*?)\};', pics, re.S)
	sym = tb and re.search(r'\b(gObjectEventPic_\w+)', tb.group(1))
	png = sym and path_of(gfxh, sym.group(1))
	if not png or not os.path.exists(os.path.join(SRC, png)): no_sheet.append(gid); continue
	people.append(fn)
	if WRITE:
		with open(os.path.join(SRC, png), 'rb') as fi, open(os.path.join(DATA, 'people', fn), 'wb') as fo: fo.write(fi.read())

pi_path = os.path.join(DATA, 'tilesets', 'pal_index.json')
wj(pi_path, sorted(set(rj(pi_path)) | set(stems)))
wj(os.path.join(DATA, 'map_index.json'), index)

by_group = {}
for mid in maps: by_group[folder[mid][1]] = by_group.get(folder[mid][1], 0) + 1
print(('WROTE' if WRITE else 'DRY RUN (add --write)') + ': %d maps, %d layouts, %d tilesets' % (len(maps), len(used_layouts), n_ts))
print('  picked by group %d, reached from them %d: %s' % (len(picked), len(pulled), ', '.join('%s (%s, from %s)' % (d[4:], g.replace('gMapGroup_', ''), f[4:]) for d, g, f in pulled[:40])))
print('  people: %d sheets (%d graphics ids in use); no sheet found for %d: %s' % (len(people), len(used), len(no_sheet), ', '.join(g.replace('OBJ_EVENT_GFX_', '') for g in no_sheet[:30])))
if clash: print('  ID CLASH with existing maps:', clash[:10])
if bad_ts: print('  tilesets not exported:', bad_ts)
if dangling: print('  %d references to maps/layouts the demake does not have: %s' % (len(dangling), dangling[:12]))
