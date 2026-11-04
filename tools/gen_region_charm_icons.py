"""gen_region_charm_icons.py - bag icons for the ALOLA / GALAR / HISUI CHARMS.

No game ever drew these items (they are this port's stand-in for "evolve while in
that region"), so each one is composed the way PR #293 built 43 other icons: the
decomp's real OVAL CHARM sprite (pokeemerald-expansion graphics/items/icons/
oval_charm.png, a 16-colour indexed PNG) re-paletted per region:
  ALOLA  hibiscus coral charm, sea-green cord, sun-yellow bead
  GALAR  crimson charm, navy cord, gold bead
  HISUI  indigo charm, bronze cord, jade bead
Template slots: 0 transparent, 1 outline, 2/8 cord dark/light, 3 bead,
4/5/7 charm light/mid/dark, 6 highlight.

  python tools/gen_region_charm_icons.py      (from the repo root)
Writes overworld/item_icons/<region>_charm.png and maps them in item_icons_index.json.
"""
import io, os, urllib.request
from PIL import Image

SRC = 'https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/master/graphics/items/icons/oval_charm.png'
OUT = 'overworld/item_icons'
PALS = {
	'alola': {2: (32, 128, 104), 8: (88, 200, 152), 3: (248, 208, 64), 4: (255, 184, 120), 5: (240, 120, 80), 7: (184, 64, 48), 6: (255, 244, 208)},
	'galar': {2: (40, 48, 136), 8: (96, 112, 224), 3: (232, 192, 64), 4: (248, 128, 136), 5: (208, 48, 72), 7: (136, 24, 48), 6: (255, 224, 224)},
	'hisui': {2: (112, 72, 32), 8: (176, 128, 64), 3: (96, 184, 120), 4: (160, 176, 240), 5: (88, 104, 192), 7: (48, 56, 128), 6: (232, 240, 255)},
}
CR, LF = chr(13), chr(10)


def main():
	tpl = Image.open(io.BytesIO(urllib.request.urlopen(SRC, timeout=30).read()))
	assert tpl.mode == 'P' and tpl.size == (24, 24), (tpl.mode, tpl.size)
	base = tpl.getpalette()[:48]
	for region, pal in PALS.items():
		p = list(base)
		for slot, rgb in pal.items():
			p[slot * 3:slot * 3 + 3] = rgb
		im = tpl.copy()
		im.putpalette(p + [0] * (768 - len(p)))
		im.info['transparency'] = 0
		im.convert('RGBA').save(os.path.join(OUT, f'{region}_charm.png'))
		print('wrote', f'{region}_charm.png')
	# add the entries in the index's own layout: one "id": "file" per line
	idx_path = os.path.join('overworld', 'item_icons_index.json')
	raw = open(idx_path, encoding='utf8', newline='').read()
	nl = CR + LF if CR + LF in raw else LF
	for region in PALS:
		if f'"{region}charm"' not in raw:
			raw = raw.rstrip().rstrip('}').rstrip() + f',{nl}"{region}charm": "{region}_charm.png"{nl}}}'
	open(idx_path, 'w', encoding='utf8', newline='').write(raw)


if __name__ == '__main__':
	main()
