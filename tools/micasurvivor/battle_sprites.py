#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MicaSurvivor batch B1c: FALLBACK sheets for the last Pokémon with neither a
SpriteCollab sheet nor an overworld follower sprite (the 18 Gen 9 ones), made
from the overworld's own transparent BATTLE sprites (owner's call, 2026-10-19:
only images we already have, cropped, scaled and re-packed; nothing drawn).
Writes micasurvivor/assets/pokemon/{dex}/battle/ and merges a row with
"src":"battle" into micasurvivor/js/data/sprites-meta.js.

    python tools/micasurvivor/battle_sprites.py               # every Pokémon that still has no sheet
    python tools/micasurvivor/battle_sprites.py --only 931,942
    python tools/micasurvivor/battle_sprites.py --preview out.png   # a contact sheet, writes nothing else

    MAGEPUNK_ASSET_ROOT=<checkout>   where the gitignored micasurvivor/assets/ and overworld/data/ are
                                     (a git worktree has neither; see fetch_sprites.py)

Which Pokémon: those 1..1025 with no row in sprites-meta.js (or a "battle" row,
which is rebuilt) that SpriteCollab still has no sheet for (fetch_sprites.eligible)
and that have no follower sprite (follow_sprites.py's source, which walks, so it
wins). Precedence when better art appears: SpriteCollab (fetch_sprites.py
--only <dex>) > follower (follow_sprites.py) > battle; each one's files live in
their own folder ({dex}/, {dex}/follow/, {dex}/battle/), so no published file
ever changes.

Source: overworld/data/pokemon/<sprite> (the battle FRONT: a large, transparent,
smoothly drawn picture, bottom-aligned in its canvas, facing the viewer's left)
and <sprite>-b (the BACK: 96x96 pixel art; for 931-1002 the PokemonZero2024
Essentials pack's back, for 1014 / 1022 / 1023 PokeAPI's, see
tools/gen_base_sprites.py and tools/gen_dlc_backs.py). Ids from
overworld/data/species_index.json. The battle set has no shiny pictures, so
these rows have no shiny (the game then shows the normal sheet).

The sheet (MicaSurvivor format, js/core/sprites.js):
  - Idle and Walk, ONE frame each (the same picture): a one-frame Walk gets B1's
    walking hop (Animator.draw), Attack / Hurt / ... fall back to Idle
    (animName), with the usual hurt flash.
  - 2 rows: 0 = the front, 1 = the back. "dm" maps the game's 8 directions to
    them (only straight Up shows the back; the diagonals take the side view,
    as B1b's), and "fx" says which directions are drawn mirrored: the fronts
    face the viewer's left, so every direction with a rightward part is the
    front flipped (FACES_RIGHT lists any front drawn the other way: none).
  - the front is scaled down (premultiplied alpha, Lanczos) to its on-field
    size and its edge alpha snapped (alpha >= 128 -> opaque, else clear) so it
    reads as pixel art next to the PMD sheets; the back gets the same height
    relation to the front that the Essentials pack has between its own front
    and back (1 when the pack lacks the species). Both sit on the same ground
    line, centred, the feet 2 px below the anchor (the usual PMD walker).
  - size: the target height is the front's visible height times the median
    ratio (PMD Walk visible height / battle front visible height) over the 15
    Pokémon most alike in front height and real height (PokeAPI, cached in
    .cache/heights.json) among those with both a SpriteCollab sheet and a large
    battle front of the same kind (the Gen 9 art); "s" (ShadowSize) is that
    group's median. No "k": the sheet is already at PMD pixel scale.
  - "hv" (floats) for the ones whose battle picture is airborne and that
    levitate or fly in the games (HOVER): Rabsca, Bombirdier, Iron Jugulis.
"""
import io
import json
import math
import os
import statistics
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_sprites import ASSET_ROOT, OUT_ASSETS, OUT_META, RAW, eligible, fetch, read_existing, save_optimized  # noqa: E402
from follow_sprites import ALPHA, follower, heights, ids_by_dex, mask_bbox  # noqa: E402

OW = os.path.join(ASSET_ROOT, 'overworld', 'data')
PROG = os.environ.get('ESSENTIALS_ROOT', r'C:/Users/guide/Desktop/Projects/Programming')
PACK = os.path.join(PROG, 'PokemonZero2024', 'Graphics', 'Pokemon')

DIR_MAP = [0, 0, 0, 0, 1, 0, 0, 0]       # game dir 0 Down, 1 DownRight ... 7 DownLeft -> row (0 front, 1 back)
FLIP = [0, 1, 1, 1, 0, 0, 0, 0]          # drawn mirrored: the directions with a rightward part (fronts face left)
FACES_RIGHT = set()                      # fronts drawn facing right (their FLIP is the other way round): none
FEET = 2                                 # px the feet sit below the anchor (the usual PMD walker)
BIG_FRONT = 128                          # canvas height of the large smooth fronts (Gen 9: 222-256), the calibration set
HOVER = {954, 962, 993}                  # Rabsca levitates, Bombirdier flies, Iron Jugulis flies: airborne pictures


def sprite_of(sid):
    idx = json.load(open(os.path.join(OW, 'species_index.json'), encoding='utf-8'))
    return idx[sid]['sprite']


def visible(im):
    b = mask_bbox(im)
    return (b[2] - b[0], b[3] - b[1]) if b else (0, 0)


def scaled(im, f):
    """im cropped to its pixels and scaled by f: premultiplied Lanczos, then the alpha snapped (pixel-art edges)."""
    im = im.crop(im.getchannel('A').getbbox())
    w, h = max(1, round(im.width * f)), max(1, round(im.height * f))
    out = im.convert('RGBa').resize((w, h), Image.LANCZOS, reducing_gap=3.0).convert('RGBA')
    a = out.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    out.putalpha(a)
    b = a.getbbox()
    return out.crop(b) if b else out


def pack_ratio(sid):
    """The Essentials pack's back height / front height for that species (same scale in the pack), else 1."""
    f, b = (os.path.join(PACK, d, sid.upper() + '.png') for d in ('Front', 'Back'))
    if not (os.path.exists(f) and os.path.exists(b)):
        return 1.0
    hf, hb = visible(Image.open(f).convert('RGBA'))[1], visible(Image.open(b).convert('RGBA'))[1]
    return hb / hf if hf and hb else 1.0


def calibration(rows, ids, hts):
    """[(log battle front visible height, PMD Walk visible height / front height, ShadowSize, log real height)] over
    the SpriteCollab rows whose battle front is one of the large smooth pictures."""
    out = []
    idx = json.load(open(os.path.join(OW, 'species_index.json'), encoding='utf-8'))
    for dex, raw in rows.items():
        m = json.loads(raw)
        if m.get('src') or dex not in ids or 'Walk' not in m['a'] or not hts.get(dex):
            continue
        front = os.path.join(OW, 'pokemon', idx[ids[dex]]['sprite'])
        path = os.path.join(OUT_ASSETS, str(dex), 'Walk.png')
        if not (os.path.exists(front) and os.path.exists(path)):
            continue
        fim = Image.open(front)
        if fim.height < BIG_FRONT:
            continue
        hf = visible(fim.convert('RGBA'))[1]
        w = m['a']['Walk']
        hp = visible(Image.open(path).convert('RGBA').crop((0, 0, w['w'], w['h'])))[1]
        if hp and hf:
            out.append((math.log(hf), hp / hf, m['s'], math.log(hts[dex])))
    return out


def size_of(hf, logh, cal):
    """(scale factor, ShadowSize) from the 15 Pokémon most alike in battle-front height and real height."""
    near = sorted(cal, key=lambda c: (c[0] - math.log(hf)) ** 2 + (c[3] - logh) ** 2)[:15]
    return statistics.median(c[1] for c in near), int(statistics.median(c[2] for c in near))


def build(dex, sid, cal, logh):
    """(meta row, [(name, image)]) or (None, None)."""
    sprite = sprite_of(sid)
    fpath = os.path.join(OW, 'pokemon', sprite)
    bpath = fpath.replace('.png', '-b.png')
    if not os.path.exists(fpath):
        return None, None
    front = Image.open(fpath).convert('RGBA')
    hf = visible(front)[1]
    f, s = size_of(hf, logh, cal)
    fr = scaled(front, f)
    back = None
    if os.path.exists(bpath):
        bim = Image.open(bpath).convert('RGBA')
        bh = visible(bim)[1]
        if bh:
            back = scaled(bim, fr.height * pack_ratio(sid) / bh)
    if back is None:                     # no back picture: the front again (mirrored by fx where it applies)
        back = fr
    w = max(fr.width, back.width) + 2
    w += w % 2
    h = max(fr.height, back.height) + 2
    sheet = Image.new('RGBA', (w, h * 2), (0, 0, 0, 0))
    for r, im in enumerate((fr, back)):
        sheet.paste(im, ((w - im.width) // 2, r * h + h - im.height), im)
    ax, ay = w / 2 - 0.5, (h - 1) - FEET
    geo = {'w': w, 'h': h, 'n': 1, 'r': 2, 'd': [8], 'ax': ax, 'ay': ay}
    meta = {'s': s, 'a': {'Idle': dict(geo), 'Walk': dict(geo)}, 'src': 'battle', 'dm': DIR_MAP,
            'fx': [1 - x for x in FLIP] if dex in FACES_RIGHT else FLIP}
    if dex in HOVER:
        meta['hv'] = 1
    return meta, sheet


HEAD_DOC = [
    ' *                 (B1c) src "battle": hoja de respaldo hecha con los sprites de combate del overworld',
    ' *                 (tools/micasurvivor/battle_sprites.py) en assets/pokemon/{dex}/battle/: 2 filas (frente,',
    ' *                 espalda); fx=1 en las direcciones que se dibujan en espejo',
]

CREDITS = os.path.join(os.path.dirname(OUT_META), '..', '..', 'CREDITS.md')
CREDITS_HEAD = '## Sprites de respaldo (lote B1c)'


def write_credits(rows):
    """(Re)writes the CREDITS.md section of the battle-sprite fallbacks (every row with src "battle"), right after
    B1b's section; the rest of the file is left exactly as it is."""
    dexes = sorted(d for d, raw in rows.items() if '"src":"battle"' in raw)
    pack = [d for d in dexes if d <= 1010]
    api = [d for d in dexes if d > 1010]
    block = [
        CREDITS_HEAD,
        '',
        'Los Pokémon que no tienen hoja en SpriteCollab ni sprite de seguidor usan los sprites de *combate* del',
        'overworld de Magepunk (`overworld/data/pokemon/`): el frente para andar (en espejo según hacia dónde van) y la',
        'espalda para ir hacia arriba; recortados, escalados y reordenados por `tools/micasurvivor/battle_sprites.py`,',
        'sin dibujar nada. El frente es el dibujo que Pokémon Showdown sirve como sprite de Pokédex',
        '(<https://play.pokemonshowdown.com/sprites/dex/>), en mayor tamaño; llegó con el juego de escritorio de',
        'Magepunk y el repositorio no anota su autor. Las espaldas son del paquete de Pokémon Essentials',
        '**PokemonZero2024** (Zerokid; `Graphics/Pokemon/Back`) y, las de los tres últimos, de **PokeAPI/sprites**',
        '(<https://github.com/PokeAPI/sprites>, `sprites/pokemon/back/`). Sin shiny: el juego de combate no tiene',
        'versión shiny de estos dibujos. Pokémon © Nintendo / Creatures Inc. / GAME FREAK.',
        '',
        '| Fuente | Sprites (nº de Pokédex) |',
        '|---|---|',
        f'| Combate del overworld, frente | {", ".join(map(str, dexes))} |',
        f'| Espalda: PokemonZero2024, Back | {", ".join(map(str, pack))} |',
        f'| Espalda: PokeAPI/sprites, back | {", ".join(map(str, api))} |',
        '',
    ]
    raw = open(CREDITS, 'rb').read().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    lines = raw.replace('\r\n', '\n').split('\n')
    if CREDITS_HEAD in lines:
        a = lines.index(CREDITS_HEAD)
        b = next((i for i in range(a + 1, len(lines)) if lines[i].startswith('## ')), len(lines))
    else:                                     # new: right before "## Datos" (after B1b's section)
        a = b = next(i for i, ln in enumerate(lines) if ln.startswith('## Datos'))
    lines[a:b] = block if dexes else []
    with io.open(CREDITS, 'w', encoding='utf-8', newline='') as f:
        f.write(nl.join(lines))


def main():
    args = sys.argv[1:]
    only = None
    if '--only' in args:
        only = {int(x) for x in args[args.index('--only') + 1].split(',') if x.strip()}
    preview = args[args.index('--preview') + 1] if '--preview' in args else None
    head, rows, nl = read_existing()
    ids = ids_by_dex()
    wanted = [d for d in range(1, 1026) if (only is None or d in only)
              and (d not in rows or '"src":"battle"' in rows[d])]
    print('Reading SpriteCollab tracker.json...')
    tracker = json.loads(fetch(RAW + '/tracker.json').decode('utf-8'))
    now_real = [d for d in wanted if eligible(tracker, d)]
    if now_real:
        print(f'SpriteCollab has sheets now for {now_real}: run fetch_sprites.py --only {",".join(map(str, now_real))}')
    has_follow = [d for d in wanted if d not in now_real and ids.get(d) and follower(ids[d])[0] is not None]
    if has_follow:
        print(f'Follower sprites exist for {has_follow}: run follow_sprites.py --only {",".join(map(str, has_follow))}')
    wanted = [d for d in wanted if d not in now_real and d not in has_follow]

    hts = heights()
    cal = calibration(rows, ids, hts)
    print(f'size calibration: {len(cal)} Pokémon with both a SpriteCollab sheet and a large battle front')
    done, none, sheets = [], [], []
    for dex in wanted:
        sid = ids.get(dex)
        meta, sheet = build(dex, sid, cal, math.log(hts.get(dex) or 10)) if sid else (None, None)
        if not meta:
            none.append(dex)
            continue
        sheets.append((dex, sheet))
        if not preview:
            out_dir = os.path.join(OUT_ASSETS, str(dex), 'battle')
            os.makedirs(out_dir, exist_ok=True)
            buf = io.BytesIO()
            sheet.save(buf, 'PNG')
            for anim in ('Idle', 'Walk'):
                save_optimized(buf.getvalue(), os.path.join(out_dir, anim + '.png'))
        rows[dex] = json.dumps(meta, separators=(',', ':'))
        done.append(dex)
        a = meta['a']['Walk']
        print(f'  {dex} {sid}: {a["w"]}x{a["h"]} (x2 rows) s={meta["s"]}{" hv" if meta.get("hv") else ""}')

    if preview:
        W = sum(s.width + 8 for _, s in sheets) + 8
        H = max(s.height for _, s in sheets) + 16
        out = Image.new('RGBA', (W, H), (96, 140, 96, 255))
        x = 8
        for _, s in sheets:
            out.alpha_composite(s, (x, 8))
            x += s.width + 8
        out.resize((W * 3, H * 3), Image.NEAREST).save(preview)
        print(f'preview: {preview}')
        return

    if not any('(B1c) src "battle"' in ln for ln in head):
        at = next(i for i, ln in enumerate(head) if 'k escala del arte' in ln) + 1
        head = head[:at] + HEAD_DOC + head[at:]
    lines = head + [f'  {d}: {rows[d]},' for d in sorted(rows)] + ['};', '']
    with io.open(OUT_META, 'w', encoding='utf-8', newline='') as f:
        f.write(nl.join(lines))
    write_credits(rows)
    print(f'\n{len(done)} fallback sheets (battle art), {len(rows)} Pokemon in sprites-meta.js')
    if none:
        print(f'No battle sprite either ({len(none)}): {none}')


if __name__ == '__main__':
    main()
