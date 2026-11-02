#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MicaSurvivor U3 (coverage sweep): the sheets of the 58 REGIONAL FORMES and the 93 MEGAS, keyed by their PokéAPI form
id like every other row of micasurvivor/js/data/sprites-meta.js (assets/pokemon/<id>/...). The list is
tools/micasurvivor/forms_sprites.json (written by gen_forms.mjs from SpriteCollab's tracker.json).

    python tools/micasurvivor/fetch_form_sprites.py            # every forme and Mega with no row yet
    python tools/micasurvivor/fetch_form_sprites.py --refresh  # all of them again
    python tools/micasurvivor/fetch_form_sprites.py --static   # only re-size the battle-front rows
    python tools/micasurvivor/hover_flags.py                   # then: the hv flags of the new animated rows

Owner decision (Plans/MICASURVIVOR_UNIFIED_PLAN.md #2): ANIMATED SpriteCollab sheets (the form folders, e.g.
sprite/0026/0001 = Alolan Raichu, with its shiny in 0026/0001/0001), fetched exactly as fetch_sprites.py fetches a
species (same FALLBACK table, same anchors, same palette PNGs). Where SpriteCollab has none:
  - a forme (Galarian Stunfisk, Zen Galarian Darmanitan): the overworld's static battle front, laid out as
    battle_sprites.py lays one out but SIZED TO ITS SPECIES' SHEET ({id}/front/, "src":"front"; build_matched)
  - a Mega with an overworld battle sprite (js/data/mega-data.js `spr`): the same, x1.12 ({id}/front/)
  - any other Mega (32: the Legends Z-A ones, the Z forms): an ALIAS row, "al": <species>, its species' own row: the game
    draws the species' sheet with the Mega aura and keystone sign (js/systems/forms.js, js/expedition/mega.js). Existing
    art only, never a placeholder.
"""
import io
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_sprites as FS  # noqa: E402
import battle_sprites as BS  # noqa: E402


HERE = os.path.dirname(os.path.abspath(__file__))
LIST = os.path.join(HERE, 'forms_sprites.json')


MEGA_K = 1.12   # a Mega stands this much taller than its species (js/expedition/mega.js K.H_K)


def species_height(sp, rows):
    """The visible height (art px x its art scale k) of species sp's Walk, first frame, facing down."""
    m = json.loads(rows[sp])
    w = m['a'].get('Walk') or m['a']['Idle']
    path = os.path.join(FS.OUT_ASSETS, str(m.get('al') or sp), m.get('src') or '', 'Walk.png')
    if not os.path.exists(path):
        path = path.replace('Walk.png', 'Idle.png')
    im = Image.open(path).convert('RGBA').crop((0, 0, w['w'], w['h']))
    b = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    return ((b[3] - b[1]) if b else w['h']) * (m.get('k') or 1), m


def fit(im, th):
    """im cropped to its pixels at visible height th: nearest-neighbour up (pixel art stays crisp), battle_sprites' down."""
    im = im.crop(im.getchannel('A').getbbox())
    f = th / im.height
    if f < 1:
        return BS.scaled(im, f)
    return im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.NEAREST)


def build_matched(it, rows):
    """(meta, sheet) of a static battle front at its species' size; None when there's nothing to size it by."""
    if it['sp'] not in rows:
        return None, None
    fpath = os.path.join(BS.OW, 'pokemon', it['front'])
    if not os.path.exists(fpath):
        return None, None
    hb, bm = species_height(it['sp'], rows)
    th = max(12, round(hb * (MEGA_K if it['kind'] == 'mega' else 1)))
    fr = fit(Image.open(fpath).convert('RGBA'), th)
    bpath = fpath.replace('.png', '-b.png')
    back = fit(Image.open(bpath).convert('RGBA'), th) if os.path.exists(bpath) else fr
    w = max(fr.width, back.width) + 2
    w = max(w, round((bm['a'].get('Idle') or bm['a']['Walk'])['w'] * (bm.get('k') or 1)))   # (the frame as wide as the species': the same body radius)
    w += w % 2
    h = max(fr.height, back.height) + 2
    sheet = Image.new('RGBA', (w, h * 2), (0, 0, 0, 0))
    for r, im in enumerate((fr, back)):
        sheet.paste(im, ((w - im.width) // 2, r * h + h - im.height), im)
    geo = {'w': w, 'h': h, 'n': 1, 'r': 2, 'd': [8], 'ax': w / 2 - 0.5, 'ay': (h - 1) - BS.FEET}
    meta = {'s': bm.get('s', 1), 'a': {'Idle': dict(geo), 'Walk': dict(geo)}, 'src': 'front', 'dm': BS.DIR_MAP, 'fx': BS.FLIP}
    if bm.get('hv'):
        meta['hv'] = 1
    return meta, sheet


def main():
    args = sys.argv[1:]
    items = json.load(open(LIST, encoding='utf-8'))['list']
    head, rows, nl = FS.read_existing()
    if '--static' in args:     # rebuild only the battle-front rows (their sizes), nothing fetched
        items = [it for it in items if it['id'] in rows and ('"src":"battle"' in rows[it['id']] or '"src":"front"' in rows[it['id']])]
    elif '--refresh' not in args:
        items = [it for it in items if it['id'] not in rows]
    print(f'{len(items)} formes / Megas to do')

    # 1. SpriteCollab (animated): fetch_sprites.do_dex with the form folder in place of the species folder
    collab = {it['id']: it['collab'] for it in items if it['collab']}
    of, osf = FS.folder, FS.shiny_folder
    FS.folder = lambda d: collab[d] if d in collab else of(d)
    FS.shiny_folder = lambda d: collab[d] + '/0001' if d in collab else osf(d)
    from concurrent.futures import ThreadPoolExecutor
    jobs = [(it['id'], bool(it['shiny'])) for it in items if it['collab']]
    got, failed = {}, []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for d, meta in ex.map(FS.do_dex, jobs):
            if meta:
                got[d] = meta
            else:
                failed.append(d)
    for d, m in got.items():
        if m.get('sh') and 'sm' not in m:
            sdir = os.path.join(FS.OUT_ASSETS, str(d), 's')
            miss = [k for k in m['a'] if not os.path.exists(os.path.join(sdir, k + '.png'))]
            if miss:
                m['sm'] = miss
        rows[d] = json.dumps(m, separators=(',', ':'))
    print(f'  SpriteCollab: {len(got)} animated' + (f', failed {failed}' if failed else ''))

    # 2. the overworld battle fronts (static): battle_sprites.py's sheet layout, SIZED TO THE SPECIES' OWN SHEET (its Walk's
    #    visible height x its art scale; a Mega x MEGA_K, as js/expedition/mega.js draws its fronts), so it stands as tall as
    #    its species on the field (B1c's calibration over the large Gen 9 fronts shrank these small ones to a speck)
    rest = [it for it in items if it['id'] not in got and it['front']]
    static = []
    for it in rest:
        meta, sheet = build_matched(it, rows)
        if not meta:
            continue
        out_dir = os.path.join(FS.OUT_ASSETS, str(it['id']), 'front')   # (U3 fix: a new folder: published sheets never change, the old {id}/battle/ stays as it was)
        os.makedirs(out_dir, exist_ok=True)
        buf = io.BytesIO()
        sheet.save(buf, 'PNG')
        for anim in ('Idle', 'Walk'):
            FS.save_optimized(buf.getvalue(), os.path.join(out_dir, anim + '.png'))
        rows[it['id']] = json.dumps(meta, separators=(',', ':'))
        static.append(it['id'])
    print(f'  battle fronts: {len(static)} static {static}')

    # 3. the alias rows: the species' own sheet
    alias = []
    for it in items:
        if it['id'] in got or it['id'] in static:
            continue
        if it['kind'] != 'mega' or it['sp'] not in rows:
            print(f'  ! {it["id"]}: no art at all')
            continue
        m = json.loads(rows[it['sp']])
        m['al'] = it['sp']
        rows[it['id']] = json.dumps(m, separators=(',', ':'))
        alias.append(it['id'])
    print(f'  alias (the species\' sheet): {len(alias)}')

    doc = ' *                 (U3) al: fila "alias" de una megaevolución sin hoja propia: dibuja la hoja de la especie al'
    if not any('(U3) al:' in ln for ln in head):
        at = next(i for i, ln in enumerate(head) if ln.startswith(' * Por animación'))
        head = head[:at] + [doc, ' *                 (U3) las filas > 10000 son formas regionales y megaevoluciones (id de PokéAPI)'] + head[at:]
    lines = head + [f'  {d}: {rows[d]},' for d in sorted(rows)] + ['};', '']
    with io.open(FS.OUT_META, 'w', encoding='utf-8', newline='') as f:
        f.write(nl.join(lines))
    print(f'{len(rows)} rows in sprites-meta.js')


if __name__ == '__main__':
    main()
