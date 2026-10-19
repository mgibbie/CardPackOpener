#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MicaSurvivor: downloads the Mystery Dungeon style sprites from SpriteCollab
(normal and shiny) into micasurvivor/assets/pokemon/ and (re)writes
micasurvivor/js/data/sprites-meta.js.

Vendored from upstream PokéSurvivor (tools/fetch_sprites.py, JPTER78, HEAD
5bbc3b2), which made the 966 sheets the game shipped with. Extended for batch
B1 "complete the Pokédex" (Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md, owner
2026-10-19):

  - a Pokémon is fetched when its SpriteCollab entry has ANY of Idle / Walk /
    Attack (upstream asked for all three in the job filter, although do_dex
    itself only ever needed one); the missing ones are filled by the FALLBACK
    table below, which is upstream's own (Walk <- Idle, Attack <- Strike /
    Swing / Shoot / Idle, ...);
  - FORMS: a few species have their only complete sheets in an alternate form
    folder of SpriteCollab (sprite/<dex>/<form>/); those are used instead;
  - the meta of Pokémon NOT fetched in this call is kept from the existing
    sprites-meta.js (upstream merged from its tools/cache/, which we don't
    have for the original 966), so fetching a range never drops the others;
  - the cache lives in tools/micasurvivor/.cache/ (gitignored);
  - (B1b) rows with a "src" (follow_sprites.py's fallback sheets) don't count as
    already there: once SpriteCollab has a sheet, this fetches it and the real
    row replaces the fallback.

    python tools/micasurvivor/fetch_sprites.py              # everything (1-1025)
    python tools/micasurvivor/fetch_sprites.py 514 1025     # one dex range
    python tools/micasurvivor/fetch_sprites.py --only 514,516,593
    (Pokémon already in sprites-meta.js are skipped; --refresh fetches them again)
    python tools/micasurvivor/hover_flags.py                # then: the hv flags

Source: https://github.com/PMDCollab/SpriteCollab  (CC BY-NC 4.0)
Credits: python tools/micasurvivor/fetch_credits.py

SpriteCollab layout:
  sprite/{dex}/            normal sprite
  sprite/{dex}/0000/0001/  shiny (form 0000, variant 0001)
  sprite/{dex}/{form}/     an alternate form; its shiny is {form}/0001/
  - columns = frames, rows = 8 directions
    (Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft)
  - each animation has its own frame size, so they are aligned on the ground
    anchor, taken from the -Shadow.png

Sheets are saved as palette PNGs (lossless): half the size.
"""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'
BASE = RAW + '/sprite'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'micasurvivor')
OUT_ASSETS = os.path.join(ROOT, 'assets', 'pokemon')
OUT_META = os.path.join(ROOT, 'js', 'data', 'sprites-meta.js')
CACHE = os.path.join(HERE, '.cache', 'sprites')

WANT = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint']
FALLBACK = {
    'Idle': ['Walk'],
    'Walk': ['Idle'],
    'Attack': ['Strike', 'Swing', 'Shoot', 'Idle'],
    'Shoot': ['Attack', 'Strike', 'Idle'],
    'Charge': ['DeepBreath', 'Idle'],
    'Hurt': ['Cringe', 'Idle'],
    'Faint': ['Hurt', 'Idle'],
}
REQUIRED = {'Idle', 'Walk', 'Attack'}

# (B1) Species whose base folder has no usable sheets but an alternate form folder has a complete set.
# dex -> form folder. All four are the same species, so the Pokédex entry is unchanged.
FORMS = {
    870: '0002',    # Falinks: the "Brass" (the leader); the base folder is empty, 0003 is a lone Trooper
    999: '0001',    # Gimmighoul: Roaming Form (the base Chest Form has no sprite yet)
    1003: '0001',   # Ting-Lu: the full sheet SpriteCollab files as "Temp" (the base folder has a 1-frame Idle only)
    1008: '0001',   # Miraidon: Low-Power Mode (the base folder is empty)
}


def fetch(url, retries=4):
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'micasurvivor/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:
            last = e
    print(f'    ! {url.split("/sprite/")[-1]} -> {last}')
    return None


def parse_animdata(xml):
    anims = {}
    for blk in re.findall(r'<Anim>(.*?)</Anim>', xml, re.S):
        name = re.search(r'<Name>(\w+)</Name>', blk)
        if not name:
            continue
        name = name.group(1)
        copy = re.search(r'<CopyOf>(\w+)</CopyOf>', blk)
        if copy:
            anims[name] = {'copyOf': copy.group(1)}
            continue
        fw = re.search(r'<FrameWidth>(\d+)</FrameWidth>', blk)
        fh = re.search(r'<FrameHeight>(\d+)</FrameHeight>', blk)
        if not (fw and fh):
            continue
        durs = [int(x) for x in re.findall(r'<Duration>(\d+)</Duration>', blk)]
        anims[name] = {'w': int(fw.group(1)), 'h': int(fh.group(1)), 'n': len(durs), 'd': durs}
    shadow = re.search(r'<ShadowSize>(\d+)</ShadowSize>', xml)
    return anims, int(shadow.group(1)) if shadow else 1


def resolve(anims, name, seen=None):
    seen = seen or set()
    if name not in anims or name in seen:
        return None, None
    seen.add(name)
    a = anims[name]
    if 'copyOf' in a:
        return resolve(anims, a['copyOf'], seen)
    return name, a


def ground_anchor(png, w, h):
    try:
        im = Image.open(io.BytesIO(png)).convert('RGBA')
    except Exception:
        return None
    px = im.crop((0, 0, w, h)).load()
    xs = ys = n = 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                xs += x; ys += y; n += 1
    return (round(xs / n, 1), round(ys / n, 1)) if n else None


def save_optimized(png, path):
    """Saves as an exact-palette PNG (lossless). Returns (width, height)."""
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    cols = im.getcolors(256)
    if cols is None:                          # more than 256 colours: as is
        im.save(path, 'PNG', optimize=True)
        return im.size
    colors = [c for _, c in cols]
    colors.sort(key=lambda c: c[3])           # transparent first
    idx = {c: i for i, c in enumerate(colors)}
    pim = Image.new('P', im.size)
    data = im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()
    pim.putdata([idx[p] for p in data])
    flat = []
    for c in colors:
        flat += c[:3]
    pim.putpalette(flat + [0] * (768 - len(flat)))
    pim.save(path, 'PNG', optimize=True, transparency=bytes(c[3] for c in colors))
    return im.size


def download_set(url_base, out_dir, anims, geometry_from=None):
    """Downloads the WANT animations from url_base. `geometry_from` reuses the
    normal sprite's anchors (the shiny is the same drawing recoloured)."""
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for want in WANT:
        src, geom = None, None
        for cand in [want] + FALLBACK[want]:
            src, geom = resolve(anims, cand)
            if geom:
                break
        if not geom:
            continue
        png = fetch(f'{url_base}/{src}-Anim.png')
        if not png:
            continue
        path = os.path.join(out_dir, want + '.png')
        w, h = save_optimized(png, path)
        cols, rows = w // geom['w'], h // geom['h']
        if rows < 1 or cols < 1:
            os.remove(path)
            continue

        ref = geometry_from.get(want) if geometry_from else None
        if ref and ref['w'] == geom['w'] and ref['h'] == geom['h']:
            ax, ay = ref['ax'], ref['ay']
        else:
            sh = fetch(f'{url_base}/{src}-Shadow.png')
            anchor = ground_anchor(sh, geom['w'], geom['h']) if sh else None
            ax, ay = (anchor if anchor else (geom['w'] / 2, geom['h'] * 0.78))
        meta[want] = {'w': geom['w'], 'h': geom['h'], 'n': min(geom['n'], cols), 'r': rows,
                      'd': geom['d'][:cols], 'ax': ax, 'ay': ay}
    return meta


def folder(dex):
    tag = f'{dex:04d}'
    return f'{tag}/{FORMS[dex]}' if dex in FORMS else tag


def shiny_folder(dex):
    return f'{folder(dex)}/0001' if dex in FORMS else f'{dex:04d}/0000/0001'


def do_dex(job):
    dex, want_shiny = job
    cache_file = os.path.join(CACHE, f'{dex}.json')
    out_dir = os.path.join(OUT_ASSETS, str(dex))
    if os.path.exists(cache_file):
        meta = json.load(open(cache_file, encoding='utf-8'))
        if all(os.path.exists(os.path.join(out_dir, a + '.png')) for a in meta['a']):
            return dex, meta

    xml = fetch(f'{BASE}/{folder(dex)}/AnimData.xml')
    if not xml:
        return dex, None
    anims, shadow = parse_animdata(xml.decode('utf-8', 'replace'))
    normal = download_set(f'{BASE}/{folder(dex)}', out_dir, anims)
    if not REQUIRED & set(normal):
        return dex, None
    meta = {'s': shadow, 'a': normal}

    if want_shiny:
        sxml = fetch(f'{BASE}/{shiny_folder(dex)}/AnimData.xml')
        sanims = parse_animdata(sxml.decode('utf-8', 'replace'))[0] if sxml else anims
        shiny = download_set(f'{BASE}/{shiny_folder(dex)}', os.path.join(out_dir, 's'), sanims, normal)
        if REQUIRED <= set(shiny) or ('Idle' in shiny and 'Walk' in shiny):
            meta['sh'] = 1
            diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
            if diff:
                meta['sa'] = diff
            missing_s = [k for k in normal if k not in shiny]
            if missing_s:
                meta['sm'] = missing_s

    os.makedirs(CACHE, exist_ok=True)
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(meta, f, separators=(',', ':'))
    return dex, meta


def tracker_entry(tracker, dex):
    e = tracker.get(f'{dex:04d}') or {}
    if dex in FORMS:
        e = e.get('subgroups', {}).get(FORMS[dex], {})
    return e


def shiny_files(entry, dex):
    if dex in FORMS:
        return set(entry.get('subgroups', {}).get('0001', {}).get('sprite_files', {}))
    return set(entry.get('subgroups', {}).get('0000', {}).get('subgroups', {}).get('0001', {}).get('sprite_files', {}))


def eligible(tracker, dex):
    """(B1) Fetched when the folder has ANY of Idle / Walk / Attack (the FALLBACK table fills the rest)."""
    return bool(REQUIRED & set(tracker_entry(tracker, dex).get('sprite_files', {})))


HEADER = [
    '/* ============ sprites-meta.js — GENERADO, no editar a mano ============',
    ' * Lo produce tools/fetch_sprites.py a partir de los AnimData.xml de',
    ' * SpriteCollab. Va en un .js y no en un .json porque fetch() está',
    ' * bloqueado en file:// y el juego se abre con doble clic.',
    ' *',
    ' * Por Pokémon:    s ShadowSize · a animaciones · sh=1 si hay shiny',
    ' *                 sa geometría shiny que difiera de la normal (raro)',
    ' *                 sm animaciones que le faltan al shiny',
    ' * Por animación:  w,h fotograma · n fotogramas · r filas',
    ' *                 d duración de cada fotograma (1/60 s)',
    ' *                 ax,ay ancla al suelo dentro del fotograma',
    ' * Filas: 0 Down · 1 DownRight · 2 Right · 3 UpRight',
    ' *        4 Up   · 5 UpLeft    · 6 Left  · 7 DownLeft',
    ' */',
    'G.SPRITE_META = {',
]
LINE = re.compile(r'^\s*(\d+): (\{.*\}),\s*$')


def read_existing():
    """The current sprites-meta.js: (header lines, {dex: raw json text}, newline)."""
    if not os.path.exists(OUT_META):
        return HEADER, {}, '\n'
    raw = open(OUT_META, 'rb').read().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    lines = raw.replace('\r\n', '\n').split('\n')
    head, rows = [], {}
    for ln in lines:
        m = LINE.match(ln)
        if m:
            rows[int(m.group(1))] = m.group(2)
        elif not rows:
            head.append(ln)
    return head, rows, nl


def main():
    args = sys.argv[1:]
    pos = [a for a in args if not a.startswith('--')]
    if '--only' in args:
        wanted = sorted({int(x) for x in args[args.index('--only') + 1].split(',') if x.strip()})
    else:
        lo = int(pos[0]) if len(pos) > 0 else 1
        hi = int(pos[1]) if len(pos) > 1 else 1025
        wanted = list(range(lo, hi + 1))
    os.makedirs(OUT_ASSETS, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)

    # Pokémon already in sprites-meta.js are kept as they are (their sheets are published and never
    # change: a new sheet gets a new path), unless --refresh is given.
    # (B1b) A FALLBACK row ("src": follow_sprites.py's overworld follower sheets) does not count: when
    # SpriteCollab gets a real sheet for that Pokémon, this fetches it and the real row replaces the fallback
    # (the real sheets live in {dex}/, the fallback ones in {dex}/follow/, so no published file changes).
    if '--refresh' not in args:
        have = {d for d, raw in read_existing()[1].items() if '"src":' not in raw}
        kept = [d for d in wanted if d in have]
        wanted = [d for d in wanted if d not in have]
        if kept:
            print(f'{len(kept)} already in sprites-meta.js: kept (use --refresh to fetch them again)')

    print('Reading SpriteCollab tracker.json...')
    tracker = json.loads(fetch(RAW + '/tracker.json').decode('utf-8'))
    jobs = []
    for dex in wanted:
        if not eligible(tracker, dex):
            continue
        e = tracker_entry(tracker, dex)
        # (B1) a shiny with only Idle counts too: the FALLBACK table fills its other animations
        jobs.append((dex, 'Idle' in shiny_files(e, dex)))
    print(f'{len(jobs)} Pokemon with sprites in the request ({sum(1 for _, s in jobs if s)} with shiny)')

    metas, missing, done = {}, [], 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for dex, meta in ex.map(do_dex, jobs):
            done += 1
            if meta:
                metas[dex] = meta
            else:
                missing.append(dex)
            if done % 10 == 0 or done == len(jobs):
                print(f'  {done}/{len(jobs)}', flush=True)

    for dex, m in metas.items():
        if m.get('sh') and 'sm' not in m:
            sdir = os.path.join(OUT_ASSETS, str(dex), 's')
            miss = [k for k in m['a'] if not os.path.exists(os.path.join(sdir, k + '.png'))]
            if miss:
                m['sm'] = miss

    # Merge: keep every existing row not fetched now (and its hv flag, which hover_flags.py owns).
    head, rows, nl = read_existing()
    for dex, m in metas.items():
        old = json.loads(rows[dex]) if dex in rows else {}
        if old.get('hv') and not old.get('src'):      # (B1b) a fallback row's flag isn't about this sheet
            m = dict(m, hv=1)
        rows[dex] = json.dumps(m, separators=(',', ':'))

    lines = head + [f'  {dex}: {rows[dex]},' for dex in sorted(rows)] + ['};', '']
    with io.open(OUT_META, 'w', encoding='utf-8', newline='') as f:
        f.write(nl.join(lines))

    print(f'\n{len(metas)} fetched now, {len(rows)} Pokemon in sprites-meta.js')
    if missing:
        print(f'Failed ({len(missing)}): {missing}')
    skipped = [d for d in wanted if not eligible(tracker, d)]
    if skipped and len(skipped) < 100:
        print(f'No usable SpriteCollab sheet ({len(skipped)}): {skipped}')


if __name__ == '__main__':
    main()
