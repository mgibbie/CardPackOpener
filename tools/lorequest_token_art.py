"""lorequest_token_art.py - art for the tokens cards and hero powers summon.

Two specs, one pipeline: tools/data/lorequest_token_art.json (the Lorequest run modes, #1036)
and tools/data/token_art.json (the rest of the card pool: Hearthstone, Duels, Heist, Tombs,
paper/MTG, ... - bug:1794331480267, Bubba's Bloodhounds stuck on the placeholder).

Lorequest run modes (Middle-earth, Sword Coast, Final Fantasy, Multiverse and Lorequest
itself) summon inline tokens ({type:'summon', name:'Goblin of Moria', ...}); the engine
gives each the id token_<slug of name>. 113 of those ids had no art, so the board drew
their procedural fallback forever - a "placeholder" that never finished loading
(bug:1794267812239 / 1794272972983 / 1794273394890).

tools/data/lorequest_token_art.json names each token's art:
  src   - a Scryfall art crop (set/collector[#face]) of that creature, picked by eye;
          this script downloads it and writes battlecards/art/<id>.jpg (+ index.json)
  hs    - a Hearthstone card id (HearthstoneJSON art, picked by eye: usually the token the
          source card really makes); the black side bars are trimmed
  crop  - optional [left, top, right, bottom] fractions trimmed after the fetch
  alias - an existing card whose art already shows the creature; battlecards/cardart.js
          ART_ALIASES points the token at it (nothing to download)

Saga summons (Final Fantasy's Shiva, Ifrit, ...) come as tall strips with a type line at
the bottom: the line is trimmed and the strip is set over a blurred, darkened cover of
itself, so the card's wide art window shows the whole figure.

  python tools/lorequest_token_art.py            # fetch what is missing
  python tools/lorequest_token_art.py --force    # re-fetch everything
  python tools/lorequest_token_art.py token_x    # (re)fetch just these ids
Then: npm run deploy-art (battlecards/art is the gitignored CDN folder).
"""
import io, json, os, sys, time, urllib.request
from PIL import Image, ImageFilter, ImageEnhance, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'battlecards', 'art')
SPECS = [os.path.join(ROOT, 'tools', 'data', n) for n in ('lorequest_token_art.json', 'token_art.json')]
UA = {'User-Agent': 'magepunk-battlecards-art/1.0', 'Accept': 'application/json'}
OUT_W, OUT_H = 626, 457  # the size of a Scryfall art crop, like the rest of the Lorequest art


def get(url, accept_json=True):
	req = urllib.request.Request(url, headers=UA if accept_json else {'User-Agent': UA['User-Agent']})
	with urllib.request.urlopen(req, timeout=30) as r:
		return r.read()


def art_crop(src):
	ref, _, face = src.partition('#')
	set_code, cn = ref.split('/')
	card = json.loads(get(f'https://api.scryfall.com/cards/{set_code}/{cn}'))
	f = card['card_faces'][int(face)] if face else (card if 'image_uris' in card else card['card_faces'][0])
	url = (f.get('image_uris') or card['image_uris'])['art_crop']
	return Image.open(io.BytesIO(get(url, False))).convert('RGB')


def hs_art(hs_id):
	im = Image.open(io.BytesIO(get(f'https://art.hearthstonejson.com/v1/512x/{hs_id}.jpg', False))).convert('RGB')
	# HearthstoneJSON letterboxes the art (black, sometimes grey): keep only the rows/columns
	# that carry picture - a bar is a flat, single-tone strip
	g = im.convert('L')
	w, h = g.size
	flat = lambda box: ImageStat.Stat(g.crop(box)).stddev[0] < 7
	cols = [x for x in range(w) if not flat((x, 0, x + 1, h))]
	rows = [y for y in range(h) if not flat((0, y, w, y + 1))]
	if cols and rows:
		im = im.crop((cols[0] + 2, rows[0] + 2, cols[-1] - 1, rows[-1] - 1))
	return im


def compose(im):
	w, h = im.size
	if w / h >= 0.75:
		return im
	# a Saga strip: drop the type line, centre the figure over a blurred cover of itself
	im = im.crop((0, 0, w, int(h * 0.87)))
	w, h = im.size
	s = max(OUT_W / w, OUT_H / h)
	bg = im.resize((int(w * s) + 1, int(h * s) + 1), Image.LANCZOS)
	bg = bg.crop(((bg.width - OUT_W) // 2, (bg.height - OUT_H) // 2, (bg.width - OUT_W) // 2 + OUT_W, (bg.height - OUT_H) // 2 + OUT_H))
	bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(14))).enhance(0.55)
	fg = im.resize((int(w * OUT_H / h), OUT_H), Image.LANCZOS)
	bg.paste(fg, ((OUT_W - fg.width) // 2, 0))
	return bg


def main():
	force = '--force' in sys.argv
	spec = {}
	for path in SPECS:
		spec.update(json.load(open(path, encoding='utf8'))['tokens'])
	only = [a for a in sys.argv[1:] if not a.startswith('--')]
	idx_path = os.path.join(ART, 'index.json')
	index = json.load(open(idx_path, encoding='utf8'))
	have = set(index)
	wrote = []
	for tid, t in spec.items():
		if 'alias' in t:
			if t['alias'] not in have:
				print(f'!! {tid}: alias {t["alias"]} has no art')
			continue
		if only and tid not in only:
			continue
		path = os.path.join(ART, tid + '.jpg')
		if os.path.exists(path) and tid in have and not force:
			continue
		im = hs_art(t['hs']) if 'hs' in t else compose(art_crop(t['src']))
		if 'crop' in t:  # [left, top, right, bottom] fractions to trim off (a sketch strip the bar test can't see)
			l, tp, r, b = t['crop']
			im = im.crop((int(im.width * l), int(im.height * tp), int(im.width * (1 - r)), int(im.height * (1 - b))))
		im.save(path, 'JPEG', quality=92, optimize=True, progressive=True)
		if tid not in have:
			index.append(tid); have.add(tid)
		wrote.append(tid)
		print(f'ok  {tid} <- {t.get("src") or t.get("hs")} {t.get("source", "")}')
		time.sleep(0.12)  # Scryfall asks for <10 requests/s
	if wrote:
		index = sorted(set(index))
		json.dump(index, open(idx_path, 'w', encoding='utf8'), separators=(',', ':'))
	print(f'{len(wrote)} written; next: npm run deploy-art')


if __name__ == '__main__':
	main()
