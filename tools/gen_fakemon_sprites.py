"""gen_fakemon_sprites.py — real back sprites (and crisp fronts) for the 623 fakemon.

The fakemon are the species with num <= 0 in overworld/data/species_battle.json. They
come from three places (classified here by name, the same way their importers matched):
  cap      Smogon Create-A-Pokemon (num -1..-78). Art: Showdown's gen5 / gen5-back.
  uranium  Pokemon Uranium (num -100..-265). Art: the Uranium Fandom wiki's
           File:<ndex>.png / File:<ndex>b.png (our files are that art fitted to 96px).
  ransei   everything else (Radical Ransei's own fakemon, num <= -266; imported by
           Magepunk66/tools/import_ransei_fakemon.py from Graphics/Battlers/<dex>.png
           and <dex>b.png).

What was wrong (2026-10-16 audit, every fakemon eyeballed front | back | source art):
  * 214 backs were exactly the front MIRRORED: Radical Ransei itself ships its
    "<dex>b.png" that way for most of them, and five Uranium legendaries had the mirror
    fallback although the Uranium wiki has their real backs. (A silhouette-only check
    counts 218: Tactite, Germuck, Garbadjinn and Carabomb have real backs drawn on the
    front's mirrored outline.)
  * 9 Ransei "backs" were a FRONT-facing picture that is not an exact mirror (a redraw
    facing the camera, a different pose, or Laughing Shadow's recoloured front):
    your own mon looked at the camera. Listed in FRONT_FACING below.
  * 177 Ransei fronts/backs were shrunk from their 160/192px source art to 128px with
    LANCZOS by the importer (its height cap), blurring the pixel art. They are now the
    source pixels, trimmed (battle.js fits every sprite to the same 96px box anyway).

What this does, per fakemon:
  back  a REAL back view when one exists: the species' own source back if it is not its
        front / mirrored front (automatic: normalized distance < MIRROR_EPS) and not in
        FRONT_FACING; else another source's real back (BORROW_BACK / Radical Ransei's copy of a
        CAP or Uranium mon, scaled to our pixel size). If no real back exists
        anywhere (Ransei, Showdown, the Uranium wiki, QgameMVP, Pokengine were checked) the
        back is EXACTLY the mirrored front — the owner's accepted fallback, never an
        unmirrored front-facing picture.
  front CAP / Uranium fronts are kept (they are already the source art); Ransei fronts are
        the source pixels, trimmed (unchanged where the importer did not resample them).
It re-measures the battle `crop` in overworld/sprite_tuning.json for every changed file
(hand tweaks s/x/y kept; the file's compact one-line format), and writes
tools/data/fakemon_sprites.json (source + back kind + sha1 of each file) for
overworld/tests/fakemon_sprites_test.mjs. Originals go to backups/fakemon/ (gitignored);
downloads are cached in backups/fakemon/src/.

  python tools/gen_fakemon_sprites.py            (report)
  python tools/gen_fakemon_sprites.py --write    (apply)
  python tools/gen_fakemon_sprites.py --sheet DIR   (contact sheets: front | back | source back)
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

from PIL import Image, ImageDraw, ImageOps

sys.path.insert(0, os.path.dirname(__file__))
from gen_form_sprites import D, ROOT, crop_box  # noqa: E402

WRITE = '--write' in sys.argv
SHEET = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
BACKUP = os.path.join(ROOT, 'backups', 'fakemon')                      # gitignored
CACHE = os.path.join(BACKUP, 'src')
PROG = os.environ.get('ESSENTIALS_ROOT', r'C:/Users/guide/Desktop/Projects/Programming')
RANSEI = os.path.join(PROG, 'RPGMaker Archive from Old Comp', 'Radical Ransei')
URANIUM_WIKI_CACHE = r'C:/Users/guide/Desktop/Magepunk66/wiki/uranium_cache'  # source_uranium_moves.py's cache
UA = 'Mozilla/5.0'   # the Fandom CDN 403s fuller browser strings from curl; this one works
SD = 'https://play.pokemonshowdown.com/sprites/{dir}/{id}.png'
UR_API = 'https://pokemon-uranium.fandom.com/api.php'
OUT_JSON = os.path.join(ROOT, 'tools', 'data', 'fakemon_sprites.json')
MIRROR_EPS = 1.0     # normalized distance (0-255 scale) under which a "back" is its front / mirrored front
CAP_MIN = -99        # num > CAP_MIN and Showdown has it -> CAP

# Ransei "<dex>b.png" files that face the camera without being an exact mirror of the
# front (eyeballed at 260px; 'real' backs that show a side-on eye — fish, birds — are kept):
FRONT_FACING = {
    'uvulentil': 'the front redrawn facing right, face and mouth to camera',
    'rocmynah': 'the front mirrored with a shifted pixel or two',
    'radenza': 'the front mirrored (offset by a pixel)',
    'cackleburn': 'the front mirrored, re-shaded',
    'muzafara': 'a second FRONT pose: grinning face to camera',
    'conifur': 'the front mirrored, face to camera',
    'poddit': 'the front mirrored, face to camera',
    'kobblegon': 'the front redrawn facing right, eyes to camera',
    'laughingshadow': 'its recoloured (shiny-like) FRONT, grin to camera',
}
# a real back taken from another source than the species' own (id -> source)
# (none needed today: Tactite, Germuck, Garbadjinn and Carabomb only LOOKED mirrored to a
# silhouette-only check — their backs are real art with the front's outline)
BORROW_BACK = {}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def curl(url):
    return subprocess.run(['curl', '-s', '-L', '-A', UA, url], capture_output=True, timeout=120).stdout


def cached(path, url, delay=0.0):
    """bytes of a PNG from the cache, downloading it once; None when the server has none"""
    if os.path.exists(path):
        data = open(path, 'rb').read()
        return data if data[:4] == b'\x89PNG' else None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = b''
    for _ in range(4):
        data = curl(url)
        if data[:4] == b'\x89PNG' or data[:9] == b'<!DOCTYPE' and b'404' in data[:400] or not data:
            break
        time.sleep(30)   # 403 = rate-limited: back off
    if delay:
        time.sleep(delay)
    ok = data[:4] == b'\x89PNG'
    open(path, 'wb').write(data if ok else b'missing')
    return data if ok else None


def load(data_or_path):
    if data_or_path is None:
        return None
    if isinstance(data_or_path, bytes):
        return Image.open(io.BytesIO(data_or_path)).convert('RGBA')
    return Image.open(data_or_path).convert('RGBA') if os.path.exists(data_or_path) else None


def trim(im, thr=0):
    b = im.getchannel('A').point(lambda v: 255 if v > thr else 0).getbbox()
    return im.crop(b) if b else im


def clean(im):
    """RGB of fully transparent pixels zeroed, so pixel comparisons see only what is drawn"""
    px = im.copy()
    a = px.getchannel('A').point(lambda v: 255 if v else 0)
    blank = Image.new('RGBA', px.size, (0, 0, 0, 0))
    return Image.composite(px, blank, a)


def same(a, b):
    return a.size == b.size and clean(a).tobytes() == clean(b).tobytes()


def dist(a, b):
    """mean |difference| of two pictures, each trimmed to its art and scaled to 48x48"""
    def prep(im):
        im = trim(im, 16).resize((48, 48), Image.BILINEAR)
        r, g, bl, al = [list(c.getdata()) for c in im.split()]
        return [(x * al[i] // 255, y * al[i] // 255, z * al[i] // 255, al[i]) for i, (x, y, z) in enumerate(zip(r, g, bl))]
    pa, pb = prep(a), prep(b)
    return sum(abs(p - q) for u, v in zip(pa, pb) for p, q in zip(u, v)) / (48 * 48 * 4)


def faces_camera(back, front):
    return dist(back, front) < MIRROR_EPS or dist(back, ImageOps.mirror(front)) < MIRROR_EPS


def fit96(im):
    """the Uranium importer's framing: art trimmed, scaled (nearest) to fill a 96px box"""
    im = trim(im)
    s = 96 / max(im.size)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.NEAREST)


def sha(path):
    return hashlib.sha1(open(path, 'rb').read()).hexdigest()[:12]


# ---------------- the sources ----------------
def ransei_index():
    out = {}
    txt = open(os.path.join(RANSEI, 'PBS', 'pokemon.txt'), encoding='utf-8', errors='replace').read()
    for block in re.split(r'\n#-+\n', txt):
        m = re.search(r'^\[(\d+)\]', block, re.M)
        if not m:
            continue
        for key in ('Name', 'InternalName'):
            k = re.search(rf'^{key}=(.*)$', block, re.M)
            if k:
                out.setdefault(norm(k.group(1)), int(m.group(1)))
    return out


def uranium_ndex(ids_names):
    """{id: '001'} from the wiki pages (cached by Magepunk66/tools/source_uranium_moves.py)"""
    out = {}
    for sid, name in ids_names:
        p = os.path.join(URANIUM_WIKI_CACHE, norm(sid) + '.json')
        wt = json.load(open(p, encoding='utf-8'))['wikitext'] if os.path.exists(p) else ''
        if not wt:
            q = f'{UR_API}?action=parse&prop=wikitext&format=json&page=' + urllib.parse.quote(name)
            try:
                wt = json.loads(curl(q))['parse']['wikitext']['*']
            except Exception:
                wt = ''
            time.sleep(2)
        m = re.search(r'\|\s*ndex\s*=\s*([^\s|}]+)', wt)
        if m:
            out[sid] = m.group(1)
    return out


def uranium_file(ndex, back):
    name = f'{ndex}{"b" if back else ""}.png'
    path = os.path.join(CACHE, 'uranium', name)
    if os.path.exists(path):
        return cached(path, None)
    q = f'{UR_API}?action=query&prop=imageinfo&iiprop=url&format=json&titles=' + urllib.parse.quote('File:' + name)
    try:
        pg = next(iter(json.loads(curl(q))['query']['pages'].values()))
        url = pg['imageinfo'][0]['url']
    except Exception:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'wb').write(b'missing')
        return None
    return cached(path, url + ('&' if '?' in url else '?') + 'format=original', delay=2.2)


def main():
    bat = json.load(open(os.path.join(D, 'species_battle.json'), encoding='utf-8'))
    fk = sorted(((v['num'], k) for k, v in bat.items() if not k.startswith('_') and not (v.get('num', 0) > 0)), reverse=True)
    rr = ransei_index()
    battlers = os.path.join(RANSEI, 'Graphics', 'Battlers')
    names = {k: bat[k]['name'] for _, k in fk}
    ur_ids = [(k, names[k]) for n, k in fk if -266 < n <= CAP_MIN]
    nd = uranium_ndex(ur_ids)

    plan, report = {}, {'cap': [0, 0, 0], 'uranium': [0, 0, 0], 'ransei': [0, 0, 0]}   # real back / mirror / front replaced
    rows = []
    for num, sid in fk:
        spr = bat[sid]['sprite']
        fpath = os.path.join(D, 'pokemon', spr)
        bpath = fpath.replace('.png', '-b.png')
        cur_f, cur_b = load(fpath), load(bpath)
        rdex = rr.get(norm(names[sid]))
        rf = load(os.path.join(battlers, f'{rdex:03d}.png')) if rdex else None
        rb = load(os.path.join(battlers, f'{rdex:03d}b.png')) if rdex else None
        if num > CAP_MIN:
            src = 'cap'
            sf = load(cached(os.path.join(CACHE, 'cap', sid + '.png'), SD.format(dir='gen5', id=sid)))
            sb = load(cached(os.path.join(CACHE, 'cap', sid + '-b.png'), SD.format(dir='gen5-back', id=sid)))
        elif sid in nd:
            src = 'uranium'
            sf, sb = load(uranium_file(nd[sid], False)), load(uranium_file(nd[sid], True))
        elif rdex:
            src = 'ransei'
            sf, sb = rf, rb
        else:
            raise SystemExit(f'{sid}: no source')

        # ---- front ----
        new_f = cur_f
        if src == 'ransei':
            new_f = trim(rf)   # the source pixels (the importer LANCZOS-shrank art taller than 128px)
        front_changed = not same(new_f, cur_f)

        # ---- back: the species' own source back, else a borrowed one, else the mirror ----
        back_kind, back_from, new_b, why = 'mirror', None, None, None
        cands = []
        if src in ('cap', 'uranium') and cur_b is not None:
            # their backs were imported from that source (fitted to 96px); kept when they face away
            # (Gellin's real back is not on the wiki any more, so the file is the only copy)
            cands.append(('current', cur_b, cur_f))
        if sid in BORROW_BACK and BORROW_BACK[sid] == 'ransei':
            cands.append(('ransei', rb, rf))
        cands.append((src, sb, sf))
        if src != 'ransei' and rb is not None:
            cands.append(('ransei', rb, rf))
        for cname, cb, cf in cands:
            if cb is None or cf is None:
                continue
            if cname == 'ransei' and sid in FRONT_FACING:
                why = FRONT_FACING[sid]
                continue
            if faces_camera(cb, cf):
                why = f'{cname} back is its front mirrored'
                continue
            if cname == 'current':
                new_b, cname = cur_b, src
            elif cname == 'ransei' and src != 'ransei':
                # another pack's back, drawn at Ransei's scale: bring it to our front's pixel size
                k = max(trim(cur_f, 16).size) / max(trim(cf, 16).size)
                t = trim(cb)
                new_b = t.resize((max(1, round(t.width * k)), max(1, round(t.height * k))), Image.NEAREST)
            elif cname == 'uranium':
                new_b = fit96(cb)
            elif cname == 'cap':
                new_b = trim(cb)
            else:
                new_b = trim(cb)
            back_kind, back_from = 'real', cname
            break
        if new_b is None:
            new_b = ImageOps.mirror(new_f)
        back_changed = cur_b is None or not same(new_b, cur_b)

        report[src][0 if back_kind == 'real' else 1] += 1
        report[src][2] += 1 if front_changed else 0
        plan[sid] = {'num': num, 'src': src, 'back': back_kind, **({'backFrom': back_from} if back_from and back_from != src else {}),
                     **({'why': why} if back_kind == 'mirror' and why else {}),
                     **({'srcFront': list(trim(rf).size)} if src == 'ransei' else {})}
        rows.append((sid, num, src, back_kind, cur_f, cur_b, new_f, new_b, front_changed, back_changed))
        if WRITE:
            os.makedirs(BACKUP, exist_ok=True)
            for changed, path, im in ((front_changed, fpath, new_f), (back_changed, bpath, new_b)):
                if not changed:
                    continue
                bk = os.path.join(BACKUP, os.path.basename(path))
                if os.path.exists(path) and not os.path.exists(bk):
                    open(bk, 'wb').write(open(path, 'rb').read())
                im.save(path, optimize=True)

    # ---- battle crops for the changed files (hand tweaks kept) ----
    tpath = os.path.join(ROOT, 'overworld', 'sprite_tuning.json')
    tun = json.load(open(tpath, encoding='utf-8'))
    tuned = 0
    for sid, num, src, kind, cf, cb, nf, nb, fc, bc in rows:
        for side, im, ch in (('front', nf, fc), ('back', nb, bc)):
            want = crop_box(im)
            ent = tun.setdefault(sid, {}).setdefault(side, {})
            if ent.get('crop') == want or (want is None and 'crop' not in ent):
                continue
            tuned += 1
            if want is None:
                ent.pop('crop', None)
            else:
                ent['crop'] = want
    if WRITE:
        with open(tpath, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(tun, separators=(',', ':')) + '\n')   # the file's own compact format
        for sid in plan:
            spr = bat[sid]['sprite']
            plan[sid]['frontSha'] = sha(os.path.join(D, 'pokemon', spr))
            plan[sid]['backSha'] = sha(os.path.join(D, 'pokemon', spr.replace('.png', '-b.png')))
        with open(OUT_JSON, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write('{\n' + ',\n'.join(f'"{k}":{json.dumps(v, separators=(",", ":"))}' for k, v in plan.items()) + '\n}\n')

    print(f'fakemon: {len(rows)}')
    for s, (r, m, f) in report.items():
        print(f'  {s:8} {r + m:4}: real back {r}, mirrored front (no back art) {m}, front replaced {f}')
    print(f'  files changed: {sum(fc for *_, fc, _ in rows)} fronts, {sum(bc for *_, bc in rows)} backs; crops re-measured {tuned}')
    if '-v' in sys.argv:
        print('  no back art anywhere (mirrored front):', ' '.join(k for k, v in plan.items() if v['back'] == 'mirror'))
        print('  borrowed backs:', {k: v['backFrom'] for k, v in plan.items() if 'backFrom' in v})
    if not WRITE:
        print('\n(dry run - pass --write to apply)')

    if SHEET:
        os.makedirs(SHEET, exist_ok=True)
        ch = [r for r in rows if r[8] or r[9]]
        cell, per = 90, 40
        for s in range(0, len(ch), per):
            part = ch[s:s + per]
            W = Image.new('RGBA', (2 * (100 + 4 * cell), ((len(part) + 1) // 2) * cell), (200, 222, 200, 255))
            dr = ImageDraw.Draw(W)
            for i, (sid, num, src, kind, cf, cb, nf, nb, fc, bc) in enumerate(part):
                x0, y0 = (i % 2) * (100 + 4 * cell), (i // 2) * cell
                dr.text((x0 + 2, y0 + 4), f'{sid}\n{num} {src}\n{kind}', fill=(0, 0, 0, 255))
                for j, im in enumerate((cf, cb, nf, nb)):
                    if im is None:
                        continue
                    im = trim(im, 16)
                    k = (cell - 6) / max(im.size)
                    im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.NEAREST)
                    W.alpha_composite(im, (x0 + 100 + j * cell + 3, y0 + cell - 3 - im.height))
            W.save(os.path.join(SHEET, f'fakemon_{s // per:02d}.png'))
        print('contact sheets (old front | old back | new front | new back) ->', SHEET)


if __name__ == '__main__':
    main()
