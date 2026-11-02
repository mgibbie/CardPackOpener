#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MicaSurvivor U3 (coverage sweep): the sheets of the 58 REGIONAL FORMES and the 93 MEGAS, keyed by their PokéAPI form
id like every other row of micasurvivor/js/data/sprites-meta.js (assets/pokemon/<id>/...). The list is
tools/micasurvivor/forms_sprites.json (written by gen_forms.mjs from SpriteCollab's tracker.json).

    python tools/micasurvivor/fetch_form_sprites.py            # every forme and Mega with no row yet
    python tools/micasurvivor/fetch_form_sprites.py --refresh  # all of them again
    python tools/micasurvivor/hover_flags.py                   # then: the hv flags of the new animated rows

Owner decision (Plans/MICASURVIVOR_UNIFIED_PLAN.md #2): ANIMATED SpriteCollab sheets (the form folders, e.g.
sprite/0026/0001 = Alolan Raichu, with its shiny in 0026/0001/0001), fetched exactly as fetch_sprites.py fetches a
species (same FALLBACK table, same anchors, same palette PNGs). Where SpriteCollab has none:
  - a forme (Galarian Stunfisk, Zen Galarian Darmanitan): the overworld's static battle front, made into a sheet exactly as
    battle_sprites.py makes one ({id}/battle/, "src":"battle")
  - a Mega with an overworld battle sprite (js/data/mega-data.js `spr`): the same ({id}/battle/)
  - any other Mega (32: the Legends Z-A ones, the Z forms): an ALIAS row, "al": <species>, its species' own row: the game
    draws the species' sheet with the Mega aura and keystone sign (js/systems/forms.js, js/expedition/mega.js). Existing
    art only, never a placeholder.
"""
import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_sprites as FS  # noqa: E402
import battle_sprites as BS  # noqa: E402
from follow_sprites import heights, ids_by_dex  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LIST = os.path.join(HERE, 'forms_sprites.json')


def main():
    args = sys.argv[1:]
    items = json.load(open(LIST, encoding='utf-8'))['list']
    head, rows, nl = FS.read_existing()
    if '--refresh' not in args:
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

    # 2. the overworld battle fronts (static), battle_sprites.py's sheet
    rest = [it for it in items if it['id'] not in got and it['front']]
    static = []
    if rest:
        hts = heights()
        ids = ids_by_dex()
        cal = BS.calibration(rows, ids, hts)
        osp = BS.sprite_of
        BS.sprite_of = lambda sid: sid[5:] if sid.startswith('file:') else osp(sid)
        for it in rest:
            h = it.get('height') or hts.get(it['sp']) or 10
            meta, sheet = BS.build(it['id'], 'file:' + it['front'], cal, math.log(h))
            if not meta:
                continue
            out_dir = os.path.join(FS.OUT_ASSETS, str(it['id']), 'battle')
            os.makedirs(out_dir, exist_ok=True)
            buf = io.BytesIO()
            sheet.save(buf, 'PNG')
            for anim in ('Idle', 'Walk'):
                FS.save_optimized(buf.getvalue(), os.path.join(out_dir, anim + '.png'))
            base = json.loads(rows[it['sp']]) if it['sp'] in rows else {}
            if base.get('hv'):
                meta['hv'] = 1
            rows[it['id']] = json.dumps(meta, separators=(',', ':'))
            static.append(it['id'])
        BS.sprite_of = osp
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
