#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MicaSurvivor batch B1b: FALLBACK sheets for the Pokémon SpriteCollab has no
sheet for, made from the overworld's own 4-direction follower walking sprites
(owner's call, 2026-10-19: only images we already have, cropped, re-packed and
scaled; nothing drawn). Writes micasurvivor/assets/pokemon/{dex}/follow/ and
merges a row with "src":"follow" into micasurvivor/js/data/sprites-meta.js.

    python tools/micasurvivor/follow_sprites.py               # every Pokémon with no real sheet
    python tools/micasurvivor/follow_sprites.py --only 514,516

Which Pokémon: those 1..1025 with no row in sprites-meta.js (or with a fallback
row, which is rebuilt) AND no usable SpriteCollab sheet (fetch_sprites.eligible).
When SpriteCollab adds a sheet, `fetch_sprites.py --only <dex>` fetches it and
the real row replaces this one (fetch_sprites.py ignores fallback rows when it
decides what is "already there"); the real sheets live in {dex}/, these in
{dex}/follow/, so no published file changes. This script never writes a row
for a Pokémon that has a real one, nor for one SpriteCollab now covers.

Source: the overworld follower charsets, data/pokemon_follow/<id>.png (128x128,
4x4 grid of 32 px cells, rows down/left/right/up, columns the walk cycle
stand/step/stand/step; ids from overworld/data/species_index.json). Those were
converted (smoothly downscaled) from the PokemonZero2024 Pokémon Essentials
pack's Following-Pokémon charsets, Graphics/Characters/Followers/<ID>.png, which
are the same drawings at exactly 2x (every 2x2 block one colour). When the pack
is on this PC (ESSENTIALS_ROOT, as tools/gen_form_sprites.py) its sheet is used
at its native 1x instead, so the pixels stay crisp, and its "Followers shiny"
folder gives the shiny. Without the pack: data/pokemon_follow only, no shiny.

The sheet (MicaSurvivor format, js/core/sprites.js):
  - Walk = the 4 follower frames; Idle = walk frame 0. No Attack / Hurt / ...:
    the game's own fallback (animName) plays Idle for them, with the hurt flash.
  - 4 rows, in the order Down, Right, Up, Left; "dm" maps the game's 8
    directions to them (a diagonal takes the side view: DownRight -> Right...).
  - every cell cropped to the union of all frames (same crop for every frame,
    so nothing jitters), the feet 2 px below the ground anchor like most PMD
    walkers (hover_flags.py's measure).
  - "k": art scale. Follower art is smaller than PMD art; k is the median
    ratio (PMD Walk visible height / follower visible height) over the 15
    Pokémon that have both and are most alike in follower height and real
    height (PokeAPI, cached in .cache/heights.json), so it sits at the size of
    its neighbours. "s" (ShadowSize) is the median of the same group. "hv" (floats) comes from a family member already in the
    game (HV_LIKE): the follower art has no ground line to measure it from.
"""
import io
import json
import math
import os
import statistics
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_sprites import OUT_ASSETS, OUT_META, RAW, eligible, fetch, read_existing, save_optimized  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OW = os.path.join(REPO, 'overworld', 'data')
PROG = os.environ.get('ESSENTIALS_ROOT', r'C:/Users/guide/Desktop/Projects/Programming')
PACK = os.path.join(PROG, 'PokemonZero2024', 'Graphics', 'Characters')
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')

SRC_ROWS = [0, 2, 3, 1]                  # our rows Down, Right, Up, Left <- the charset's down/left/right/up
DIR_MAP = [0, 1, 1, 1, 2, 3, 3, 3]       # game dir 0 Down, 1 DownRight ... 7 DownLeft -> our row
WALK_D = [8, 10, 8, 10]                  # the PMD walk rhythm (most sheets: 8,10,8,10)
FEET = 2                                 # px the feet sit below the anchor (the usual PMD walker)
HV_LIKE = {592: 593}                     # Frillish floats like Jellicent; the other 23's families walk
ALPHA = 40                               # "opaque" for measuring, as fetch_sprites / hover_flags


def ids_by_dex():
    idx = json.load(open(os.path.join(OW, 'species_index.json'), encoding='utf-8'))
    out = {}
    for sid, v in idx.items():
        if v.get('num', 0) > 0 and '_' not in sid:
            out.setdefault(v['num'], sid)
    return out


def exact_half(im):
    """The 1x image of a sheet drawn at 2x (every 2x2 block one colour), else None. Each block keeps its
    top-left pixel; a few odd blocks are tolerated (Simisear's shiny has 2 hand-touched ones)."""
    w, h = im.size
    if w % 2 or h % 2:
        return None
    px = im.load()
    half = Image.new('RGBA', (w // 2, h // 2))
    hp, odd = half.load(), 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            p = px[x, y]
            if not (p == px[x + 1, y] == px[x, y + 1] == px[x + 1, y + 1]):
                odd += 1
            hp[x // 2, y // 2] = p
    return half if odd * 100 <= (w // 2) * (h // 2) else None      # over 1 % odd: not a 2x drawing


def follower(sid, shiny=False):
    """(image at 1x, where from) for that species, or (None, None)."""
    pack = os.path.join(PACK, 'Followers shiny' if shiny else 'Followers', sid.upper() + '.png')
    if os.path.exists(pack):
        im = exact_half(Image.open(pack).convert('RGBA'))
        if im is not None:
            return im, 'pack'
    if shiny:
        return None, None
    own = os.path.join(OW, 'pokemon_follow', sid + '.png')
    return (Image.open(own).convert('RGBA'), 'pokemon_follow') if os.path.exists(own) else (None, None)


def mask_bbox(im):
    return im.getchannel('A').point(lambda a: 255 if a > ALPHA else 0).getbbox()


def cells(im):
    c = im.width // 4
    return c, [[im.crop((col * c, row * c, col * c + c, row * c + c)) for col in range(4)] for row in range(4)]


def visible_h(im):
    b = mask_bbox(im)
    return b[3] - b[1] if b else 0


def heights():
    """{dex: height in decimetres} from PokeAPI (the source of pokedex.js), cached in .cache/heights.json."""
    path = os.path.join(CACHE_DIR, 'heights.json')
    if os.path.exists(path):
        return {int(k): v for k, v in json.load(open(path, encoding='utf-8')).items()}

    def one(dex):
        raw = fetch(f'https://pokeapi.co/api/v2/pokemon/{dex}')
        return dex, json.loads(raw.decode('utf-8'))['height'] if raw else None
    with ThreadPoolExecutor(max_workers=10) as ex:
        out = {d: h for d, h in ex.map(one, range(1, 1026)) if h}
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f)
    return out


def calibration(rows, ids, hts):
    """[(follower visible height, PMD visible height, ShadowSize, log real height)] over the real rows with both."""
    out = []
    for dex, raw in rows.items():
        m = json.loads(raw)
        if m.get('src') or dex not in ids or 'Walk' not in m['a'] or not hts.get(dex):
            continue
        im, _ = follower(ids[dex])
        path = os.path.join(OUT_ASSETS, str(dex), 'Walk.png')
        if im is None or not os.path.exists(path):
            continue
        w = m['a']['Walk']
        hp = visible_h(Image.open(path).convert('RGBA').crop((0, 0, w['w'], w['h'])))
        hf = visible_h(cells(im)[1][0][0])
        if hp and hf:
            out.append((hf, hp, m['s'], math.log(hts[dex])))
    return out


def size_of(hf, logh, cal):
    """(k, ShadowSize) from the 15 Pokémon most alike in follower height and real height. The real height
    matters for the big ones: a follower cell is 32 px, so a huge Pokémon's follower is "capped" while its PMD
    sheet is not (leave-one-out over the calibration: mean error 11 % with it; 16 % -> 12 % for the tallest)."""
    near = sorted(cal, key=lambda c: ((c[0] - hf) / 3) ** 2 + (c[3] - logh) ** 2)[:15]
    k = statistics.median(c[1] / c[0] for c in near)
    return round(k * 20) / 20, int(statistics.median(c[2] for c in near))


def build(dex, sid, out_dir, cal, logh):
    """Writes the sheets; returns the meta row (dict) or None."""
    im, src = follower(sid)
    if im is None:
        return None, None
    c, grid = cells(im)
    shiny, _ = follower(sid, True)
    if shiny is not None and shiny.size != im.size:
        shiny = None
    # one crop for every frame: the union of the 16 cells' opaque pixels
    boxes = [mask_bbox(f) for row in grid for f in row]
    boxes = [b for b in boxes if b]
    if not boxes:
        return None, None
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    cx = c / 2
    half = int(max(cx - x0, x1 - cx)) + 2
    left, top, w = int(cx - half), max(0, y0 - 2), 2 * half
    h = y1 + 1 - top
    ax, ay = w / 2 - 0.5, (y1 - 1) - FEET - top          # y1 - 1 = the lowest opaque row

    def sheet(g, cols, path):
        out = Image.new('RGBA', (w * len(cols), h * 4), (0, 0, 0, 0))
        for r, srow in enumerate(SRC_ROWS):
            for i, col in enumerate(cols):
                out.paste(g[srow][col].crop((left, top, left + w, top + h)), (i * w, r * h))
        buf = io.BytesIO()
        out.save(buf, 'PNG')
        save_optimized(buf.getvalue(), path)

    os.makedirs(out_dir, exist_ok=True)
    sheet(grid, [0], os.path.join(out_dir, 'Idle.png'))
    sheet(grid, [0, 1, 2, 3], os.path.join(out_dir, 'Walk.png'))
    if shiny is not None:
        os.makedirs(os.path.join(out_dir, 's'), exist_ok=True)
        sgrid = cells(shiny)[1]
        sheet(sgrid, [0], os.path.join(out_dir, 's', 'Idle.png'))
        sheet(sgrid, [0, 1, 2, 3], os.path.join(out_dir, 's', 'Walk.png'))

    k, s = size_of(visible_h(grid[0][0]), logh, cal)
    geo = {'w': w, 'h': h, 'ax': ax, 'ay': ay}
    meta = {'s': s, 'a': {'Idle': dict(geo, n=1, r=4, d=[8]), 'Walk': dict(geo, n=4, r=4, d=WALK_D)}}
    for a in meta['a'].values():                          # the key order of the PMD rows
        for key in ('ax', 'ay'):
            a[key] = a.pop(key)
    if shiny is not None:
        meta['sh'] = 1
    meta.update(src='follow', k=k, dm=DIR_MAP)
    return meta, src + ('' if shiny is not None else ', no shiny')


HEAD_DOC = [
    ' *                 (B1b) src "follow": hoja de respaldo hecha con los sprites de seguidor del',
    ' *                 overworld (tools/micasurvivor/follow_sprites.py) en assets/pokemon/{dex}/follow/;',
    ' *                 k escala del arte · dm fila de la hoja para cada una de las 8 direcciones',
]


CREDITS = os.path.join(os.path.dirname(OUT_META), '..', '..', 'CREDITS.md')
CREDITS_HEAD = '## Sprites de respaldo (lote B1b)'


def write_credits(rows):
    """(Re)writes the CREDITS.md section of the fallback sheets (every row with src "follow"); the rest of the
    file, the SpriteCollab table included, is left exactly as it is."""
    dexes = sorted(d for d, raw in rows.items() if '"src":"follow"' in raw)
    shiny = sorted(d for d in dexes if '"sh":1' in rows[d])
    block = [
        CREDITS_HEAD,
        '',
        'Los Pokémon que todavía no tienen hoja en SpriteCollab usan sus sprites de *seguidor* del overworld de',
        'Magepunk (4 direcciones, 4 fotogramas de andar; recortados, reordenados y escalados por',
        '`tools/micasurvivor/follow_sprites.py`, sin dibujar nada). Vienen del paquete "Following Pokémon" del',
        'proyecto de Pokémon Essentials **PokemonZero2024** (Zerokid; `Graphics/Characters/Followers` y',
        '`Followers shiny`), sprites de estilo HGSS. Su `credits.txt` atribuye los sprites de Pokémon del overworld',
        'a **Neo-Spriteman** (<https://www.pokecommunity.com/showthread.php?t=250115>) y no nombra a cada artista',
        'de los de Gen 5–8. Pokémon © Nintendo / Creatures Inc. / GAME FREAK.',
        '',
        '| Fuente | Sprites (nº de Pokédex) |',
        '|---|---|',
        f'| PokemonZero2024, Followers | {", ".join(map(str, dexes))} |',
        f'| PokemonZero2024, Followers shiny | {", ".join(map(str, shiny))} |',
        '',
    ]
    raw = open(CREDITS, 'rb').read().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    lines = raw.replace('\r\n', '\n').split('\n')
    if CREDITS_HEAD in lines:
        a = lines.index(CREDITS_HEAD)
        b = next((i for i in range(a + 1, len(lines)) if lines[i].startswith('## ')), len(lines))
    else:                                     # new: right before "## Datos" (after the SpriteCollab table)
        a = b = next(i for i, ln in enumerate(lines) if ln.startswith('## Datos'))
    lines[a:b] = block if dexes else []
    with io.open(CREDITS, 'w', encoding='utf-8', newline='') as f:
        f.write(nl.join(lines))


def main():
    args = sys.argv[1:]
    only = None
    if '--only' in args:
        only = {int(x) for x in args[args.index('--only') + 1].split(',') if x.strip()}
    head, rows, nl = read_existing()
    ids = ids_by_dex()
    wanted = [d for d in range(1, 1026) if (only is None or d in only)
              and (d not in rows or '"src":"follow"' in rows[d])]
    print('Reading SpriteCollab tracker.json...')
    tracker = json.loads(fetch(RAW + '/tracker.json').decode('utf-8'))
    now_real = [d for d in wanted if eligible(tracker, d)]
    if now_real:
        print(f'SpriteCollab has sheets now for {now_real}: run fetch_sprites.py --only {",".join(map(str, now_real))}')
    wanted = [d for d in wanted if d not in now_real]

    hts = heights()
    cal = calibration(rows, ids, hts)
    print(f'size calibration: {len(cal)} Pokémon with both a PMD sheet and a follower sheet')
    done, none = [], []
    for dex in wanted:
        sid = ids.get(dex)
        meta, how = build(dex, sid, os.path.join(OUT_ASSETS, str(dex), 'follow'), cal, math.log(hts.get(dex) or 10)) if sid else (None, None)
        if not meta:
            none.append(dex)
            continue
        if dex in HV_LIKE:
            rel = rows.get(HV_LIKE[dex])
            if rel and json.loads(rel).get('hv'):
                meta['hv'] = 1
        rows[dex] = json.dumps(meta, separators=(',', ':'))
        done.append(dex)
        print(f'  {dex} {sid}: {meta["a"]["Walk"]["w"]}x{meta["a"]["Walk"]["h"]} k={meta["k"]} s={meta["s"]}'
              f'{" hv" if meta.get("hv") else ""} ({how})')

    if not any('(B1b) src "follow"' in ln for ln in head):
        at = next((i for i, ln in enumerate(head) if 'hv=1 si flota' in ln), None)
        at = at + 2 if at is not None else next(i for i, ln in enumerate(head) if 'sm animaciones' in ln) + 1
        head = head[:at] + HEAD_DOC + head[at:]
    lines = head + [f'  {d}: {rows[d]},' for d in sorted(rows)] + ['};', '']
    with io.open(OUT_META, 'w', encoding='utf-8', newline='') as f:
        f.write(nl.join(lines))
    write_credits(rows)
    print(f'\n{len(done)} fallback sheets (follower art), {len(rows)} Pokemon in sprites-meta.js')
    if none:
        print(f'No follower sprite either ({len(none)}): {none}')


if __name__ == '__main__':
    main()
