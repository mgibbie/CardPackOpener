"""gen_mega_wave1_art.py — battle art and item icons for the overworld's Mega Evolutions.

Wave 1 (the 48 X/Y + ORAS Megas and the two Primals, overworld/mega_data.js) draws
from the QgameMVP Pokemon Essentials pack, the same pack the base species' battle
art came from (tools/gen_form_sprites.py):

  overworld/mega_sprites/<form>.png     the pack's FRONT, trimmed to its art (as
                                        the base fronts in data/pokemon are)
  overworld/mega_sprites/<form>-b.png   the pack's BACK, framed the way our base
                                        species' -b frames the pack's base back
                                        (gen_form_sprites.make_back)
  overworld/sprite_tuning.json          a measured `crop` per form where needed
  overworld/item_icons/<id>.png         the Mega Stones, the KEY STONE and the RED /
                                        BLUE ORBS from PokemonZero's item icons: its
                                        48x48 icons are pixel-doubled 24x24 art, so
                                        every other pixel IS the native icon
  overworld/item_icons_index.json       bag id -> icon file

The fronts already in data/pokemon (s97.png ...) are box-icon minisprites (~30px)
that the battle scene would blow up to a blur, so the pack's art is used instead.
The folder is git-tracked and served by the main deploy (like people_extra/).

  python tools/gen_mega_wave1_art.py [--write] [-v]
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import gen_form_sprites as G  # noqa: E402  (bbox, make_back, crop_box, pack roots)

ROOT = G.ROOT
D = G.D
OUT = os.path.join(ROOT, 'overworld', 'mega_sprites')
ICONS = os.path.join(ROOT, 'overworld', 'item_icons')
PZ_ITEMS = os.path.join(G.PZ, 'Graphics', 'Items')
WRITE = '--write' in sys.argv


def mega_data():
    js = subprocess.check_output(['node', '-e',
        "import('./overworld/mega_data.js').then(m=>process.stdout.write(JSON.stringify(m)))"], cwd=ROOT)
    return json.loads(js)


def pbs_forms(path):
    """{(SPECIES, n): {FormName, MegaStone, MegaMove, ...}}"""
    out, key = {}, None
    for line in open(path, encoding='utf-8-sig', errors='replace'):
        m = re.match(r'^\[([A-Z0-9_]+),(\d+)\]', line)
        if m:
            key = (m.group(1), int(m.group(2)))
            out[key] = {}
            continue
        m = re.match(r'^(\w+)\s*=\s*(.*)$', line.strip())
        if m and key:
            out[key][m.group(1)] = m.group(2).strip()
    return out


def main():
    md = mega_data()
    forms = {k: v for k, v in md['MEGA_FORMS'].items() if v['wave'] == 1}
    bat = json.load(open(os.path.join(D, 'species_battle.json'), encoding='utf-8'))
    pbs = pbs_forms(os.path.join(G.QG, 'PBS', 'pokemon_forms.txt'))
    tun_path = os.path.join(ROOT, 'overworld', 'sprite_tuning.json')
    tun = json.load(open(tun_path, encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    done, missing = [], []
    for fid, f in sorted(forms.items()):
        SP = G.norm(f['base']).upper()
        want = (f.get('stone') or f.get('orb') or '').upper()
        cands = [(n, e) for (sp, n), e in pbs.items() if sp == SP and n > 0
                 and (e.get('MegaStone') == want
                      or (f.get('move') and e.get('MegaMove') == f['move'].upper())
                      or (f.get('primal') and e.get('FormName', '').startswith('Primal')))]
        if len(cands) != 1:
            missing.append(f'{fid} (pack forms {[c[0] for c in cands]})')
            continue
        n = cands[0][0]
        front = os.path.join(G.QG, 'Graphics', 'Pokemon', 'Front', f'{SP}_{n}.png')
        back = os.path.join(G.QG, 'Graphics', 'Pokemon', 'Back', f'{SP}_{n}.png')
        if not (os.path.exists(front) and os.path.exists(back)):
            missing.append(f'{fid} (no {SP}_{n}.png)')
            continue
        fim = Image.open(front).convert('RGBA')
        fim = fim.crop(G.bbox(fim))
        base_b = os.path.join(D, 'pokemon', re.sub(r'\.png$', '-b.png', bat[f['base']]['sprite']))
        base_pack = os.path.join(G.QG, 'Graphics', 'Pokemon', 'Back', SP + '.png')
        bsrc = Image.open(back).convert('RGBA')
        bim = None
        if os.path.exists(base_b) and os.path.exists(base_pack):
            bim, _ = G.make_back(Image.open(base_b).convert('RGBA'), Image.open(base_pack).convert('RGBA'), bsrc)
        if bim is None:
            bim = bsrc.crop(G.bbox(bsrc))
        done.append(f'{fid} <- {SP}_{n}  front {fim.size}  back {bim.size}')
        for side, im in (('front', fim), ('back', bim)):
            want_crop = G.crop_box(im)
            ent = tun.setdefault(fid, {}).setdefault(side, {})
            if want_crop is None:
                ent.pop('crop', None)
            else:
                ent['crop'] = want_crop
            if not ent:
                tun[fid].pop(side)
        if not tun.get(fid):
            tun.pop(fid, None)
        if WRITE:
            fim.save(os.path.join(OUT, os.path.basename(f['sprite'])))
            bim.save(os.path.join(OUT, re.sub(r'\.png$', '-b.png', os.path.basename(f['sprite']))))

    # ---- item icons ----
    idx_path = os.path.join(ROOT, 'overworld', 'item_icons_index.json')
    raw = open(idx_path, encoding='utf-8').read()
    idx = json.loads(raw)
    icon_ids = [k for k, v in md['MEGA_STONES'].items() if v['wave'] == 1] + list(md['PRIMAL_ORBS']) + ['keystone']
    icons, icon_missing = [], []
    for iid in icon_ids:
        src = os.path.join(PZ_ITEMS, iid.upper() + '.png')
        if not os.path.exists(src):
            icon_missing.append(iid)
            continue
        im = Image.open(src).convert('RGBA')
        native = im.resize((im.width // 2, im.height // 2), Image.NEAREST)   # undo the 2x pixel doubling
        if native.size != (24, 24):
            icon_missing.append(f'{iid} {native.size}')
            continue
        icons.append(iid)
        idx[iid] = iid + '.png'
        if WRITE:
            native.save(os.path.join(ICONS, iid + '.png'))
    if WRITE:
        with open(tun_path, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(tun, separators=(',', ':')) + '\n')
        multiline = '\n' in raw.strip()
        with open(idx_path, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write((json.dumps(idx, indent=1) if multiline else json.dumps(idx, separators=(',', ':')))
                     + ('\n' if raw.endswith('\n') else ''))

    print(f'wave-1 forms: {len(forms)}   art: {len(done)}   missing: {len(missing)}')
    print(f'item icons: {len(icons)}/{len(icon_ids)}   missing: {icon_missing}')
    for m in missing:
        print('  MISSING', m)
    if '-v' in sys.argv:
        for d in done:
            print('  ', d)
    if not WRITE:
        print('(dry run - pass --write)')
    return 1 if (missing or icon_missing) else 0


if __name__ == '__main__':
    sys.exit(main())
