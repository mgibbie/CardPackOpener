"""gen_mega_sprites.py — battle FRONT + BACK sprites for the 49 Legends Z-A / Mega Dimension Megas
("wave 2" of the overworld's Mega Evolution), into overworld/data/pokemon/ under the same numbering every
other form uses: s{dex*32 + Showdown formeOrder index}.png and ...-b.png (tools/fix_form_sprites.mjs).

Why: the overworld had 50 Gen 6 Mega fronts on disk and NO art at all for the 49 newer ones, and MicaSurvivor
drew 32 of those as their base species' sheet plus an aura (sprites-meta.js "al" rows) because there was no
Mega picture to use.

Sources (checked 2026-11-03):
  * PokeAPI/sprites (github.com/PokeAPI/sprites, sprites/pokemon/<id>.png + back/<id>.png): Gen 5-style pixel
    fronts AND backs for 48 of the 49 ("Added Z-A mega sprites", PR #236, 2026-06-22) by kyledovey / DoveKyle,
    credited in that repo's README. Same 96x96 B&W-style format as the community sprites the repo already ships.
    Pokemon is (c) Nintendo / Creatures / GAME FREAK; the fan pixel art is credited to its artist, used
    non-commercially like the rest of the game's art.
  * Not used: Showdown's gen5/ folder has some of them but as blurry downscaled 3D renders, not pixel art; its
    ani/ GIFs are 3D renders with no backs. SpriteCollab (MicaSurvivor's PMD sheets) has none of the 32 yet.
  * Mega Zygarde (PokeAPI id 10301) has no pixel sprite anywhere (PokeAPI, Showdown, smogon/sprites). It is
    COMPOSED here: the official Legends Z-A model renders PokeAPI ships (versions/generation-ix/legends-za/
    10301.webp + back/10301.webp) reduced to a Gen 5 sprite: trimmed, scaled to a 96px battle box,
    hard alpha, a saturation / contrast lift, a 24-colour palette and the dark one-pixel outline Gen 5 sprites have.

Writes tools/data/mega_sprites.json (the list the tests read) and the PNGs (trimmed to their art, like every
other form front). Never overwrites an existing PNG unless --force.

  python tools/gen_mega_sprites.py            (report)
  python tools/gen_mega_sprites.py --write    (download / compose + write)
  python tools/gen_mega_sprites.py --sheet out.png   (contact sheet to eyeball)
"""
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = os.path.join(ROOT, 'overworld', 'data', 'pokemon')
_DEX_REL = os.path.join('Magepunk66', 'Reference', 'pokemon-showdown-master', 'data', 'pokedex.ts')
DEX = os.environ.get('SHOWDOWN_DEX') or next(
    (p for p in (os.path.join(ROOT, '..', _DEX_REL), os.path.join(ROOT, '..', '..', '..', _DEX_REL)) if os.path.exists(p)),
    os.path.join(ROOT, '..', _DEX_REL))   # (the main checkout, or a .worktrees/<name> checkout inside it)
PAPI = os.path.join(ROOT, 'tools', 'micasurvivor', 'megas_pokeapi.json')
LIST = os.path.join(ROOT, 'tools', 'data', 'mega_sprites.json')
CACHE = os.path.join(ROOT, 'tools', 'micasurvivor', '.cache', 'mega_sprites')   # gitignored
RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'
WRITE = '--write' in sys.argv
FORCE = '--force' in sys.argv
SHEET = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
COMPOSE = {10301: 'Mega Zygarde'}   # no pixel sprite anywhere: built from the Legends Z-A renders


def norm(s):
    s = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)
    return re.sub(r'[^a-z0-9]', '', s.lower())


def showdown_megas():
    """every Mega / Primal forme in Showdown's pokedex: name, dex number, sprite number (num*32 + formeOrder index)."""
    src = open(DEX, encoding='utf-8').read()
    idx = {}
    for m in re.finditer(r'formeOrder:\s*\[([^\]]*)\]', src):
        for i, n in enumerate(re.findall(r'"([^"]+)"', m.group(1))):
            idx.setdefault(norm(n), i)
    out = []
    for m in re.finditer(r'\n\t(\w+): \{([\s\S]*?)\n\t\},', src):
        body = m.group(2)
        g = lambda k: (re.search(r'\n\t\t' + k + r': ([^\n]*),', body) or [None, None])[1]
        forme, num = g('forme'), g('num')
        if not forme or not re.search(r'Mega|Primal', forme) or int(num) <= 0:
            continue
        name = json.loads(g('name'))
        out.append({'name': name, 'num': int(num), 'sprite': 's%d.png' % (int(num) * 32 + idx[norm(name)])})
    return out


def papi_name(sd):
    """Showdown 'Meowstic-M-Mega' / 'Absol-Mega-Z' -> PokeAPI 'meowstic-male-mega' / 'absol-mega-z'."""
    n = sd.lower().replace('-m-mega', '-male-mega').replace('-f-mega', '-female-mega')
    return n


def get(url):
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, re.sub(r'[^a-z0-9.]+', '_', url[len(RAW):].lower()))
    if not os.path.exists(f):
        req = urllib.request.Request(url, headers={'User-Agent': 'magepunk-sprite-import'})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        open(f, 'wb').write(data)
    return Image.open(f).convert('RGBA')


def bbox(im):
    """visible box, the alpha > 16 rule of tools/sprite-audit.cjs"""
    return im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()


def trim(im):
    b = bbox(im)
    return im.crop(b) if b else im


def pixelize(im, box=92, colours=24, sat=1.4, contrast=1.2):
    """a model render -> a Gen 5-style sprite: trimmed, scaled into a box-px square, hard alpha, a small palette and
    the dark one-pixel outline (each edge pixel is its own colour darkened, as the hand-made sprites shade theirs)."""
    from PIL import ImageEnhance
    im = trim(im)
    # game renders are soft-lit; Gen 5 sprites are flat and saturated (a 1.4 / 1.2 lift keeps Mega Zygarde's red and blue
    # core marks from greying out in the palette cut; chosen by eye against variants, scratch contact sheet)
    a0 = im.getchannel('A')
    im = ImageEnhance.Contrast(ImageEnhance.Color(im.convert('RGB')).enhance(sat)).enhance(contrast).convert('RGBA')
    im.putalpha(a0)
    f = box / max(im.size)
    w, h = max(1, round(im.width * f)), max(1, round(im.height * f))
    # premultiply before the resize so the transparent background doesn't bleed grey into the edges
    r, g, b, a = im.split()
    from PIL import ImageChops
    pm = Image.merge('RGB', [ImageChops.multiply(c, a) for c in (r, g, b)])
    small = pm.resize((w, h), Image.LANCZOS)
    sa = a.resize((w, h), Image.LANCZOS)
    px, ap = small.load(), sa.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            al = ap[x, y]
            if al >= 110:
                k = 255 / max(al, 1)
                c = px[x, y]
                op[x, y] = (min(255, round(c[0] * k)), min(255, round(c[1] * k)), min(255, round(c[2] * k)), 255)
    # palette: median cut over the opaque pixels only
    rgb = out.convert('RGB')
    q = rgb.quantize(colors=colours, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    qp = q.load()
    for y in range(h):
        for x in range(w):
            if op[x, y][3]:
                op[x, y] = qp[x, y] + (255,)
    # outline: an opaque pixel with a transparent 4-neighbour, darkened
    edge = []
    for y in range(h):
        for x in range(w):
            if not op[x, y][3]:
                continue
            if any(not (0 <= x + dx < w and 0 <= y + dy < h) or not op[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                edge.append((x, y))
    for x, y in edge:
        c = op[x, y]
        op[x, y] = (round(c[0] * 0.35), round(c[1] * 0.35), round(c[2] * 0.4), 255)
    return out


def main():
    sd = showdown_megas()
    papi = {f['name']: f for f in json.load(open(PAPI, encoding='utf-8'))['forms']}
    rows = []
    for m in sd:
        pn = papi_name(m['name'])
        p = papi.get(pn)
        wave = 2 if p and p['id'] >= 10278 else 1
        rows.append({'name': m['name'], 'num': m['num'], 'sprite': m['sprite'], 'pokeapi': p['id'] if p else None, 'wave': wave})
    w2 = [r for r in rows if r['wave'] == 2]
    if len(w2) != 49:
        raise SystemExit('expected 49 wave-2 Megas, got %d' % len(w2))
    rep = {'written': [], 'exists': [], 'composed': []}
    sheet = []
    for r in w2:
        pid = r['pokeapi']
        r['src'] = 'composed' if pid in COMPOSE else 'pokeapi'
        fp = os.path.join(D, r['sprite'])
        bp = fp.replace('.png', '-b.png')
        if pid in COMPOSE:
            fr = pixelize(get(RAW + 'versions/generation-ix/legends-za/%d.webp' % pid))
            bk = pixelize(get(RAW + 'versions/generation-ix/legends-za/back/%d.webp' % pid))
            rep['composed'].append(r['name'])
        else:
            fr, bk = trim(get(RAW + '%d.png' % pid)), trim(get(RAW + 'back/%d.png' % pid))
        sheet.append((r, fr, bk))
        for path, img in ((fp, fr), (bp, bk)):
            if os.path.exists(path) and not FORCE:
                rep['exists'].append(os.path.basename(path))
                continue
            rep['written'].append(os.path.basename(path))
            if WRITE:
                img.save(path, optimize=True)
    if WRITE:
        doc = {'generated': 'tools/gen_mega_sprites.py',
               'about': 'Every Mega / Primal forme (Showdown pokedex.ts) and its battle sprite numbers in overworld/data/pokemon '
                        '(front s<n>.png, back s<n>-b.png). wave 1 = X/Y, ORAS, Primal (fronts from the Essentials packs); '
                        'wave 2 = Legends Z-A + Mega Dimension (src pokeapi = PokeAPI/sprites by kyledovey, composed = built from '
                        'the official Legends Z-A renders).',
               'megas': rows}
        with open(LIST, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(doc, fh, indent=1, ensure_ascii=False)
            fh.write('\n')
    print('wave 2: %d Megas; %d PNGs %s, %d already there; composed: %s' % (
        len(w2), len(rep['written']), 'written' if WRITE else 'to write', len(rep['exists']), ', '.join(rep['composed'])))
    if SHEET:
        cw, ch, cols = 200, 104, 7
        rowsn = (len(sheet) + cols - 1) // cols
        S = Image.new('RGBA', (cw * cols, ch * rowsn), (200, 220, 200, 255))
        for i, (r, fr, bk) in enumerate(sheet):
            x, y = (i % cols) * cw, (i // cols) * ch
            for j, im in enumerate((fr, bk)):
                k = min(1, 96 / max(im.size))
                im2 = im if k == 1 else im.resize((round(im.width * k), round(im.height * k)), Image.NEAREST)
                S.alpha_composite(im2, (x + j * 100 + (96 - im2.width) // 2, y + 100 - im2.height))
        S.save(SHEET)
        print('sheet ->', SHEET)


if __name__ == '__main__':
    main()
