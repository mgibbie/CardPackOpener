"""gen_dlc_backs.py — real back sprites for the last 15 species (#1011 Dipplin .. #1025 Pecharunt).

Neither Essentials pack that tools/gen_base_sprites.py draws from has them, so their "-b"
battle sprite was a FRONT-facing picture: your own Okidogi looked at the camera. Showdown's
gen5-back/<name>.png is no help either — for these 15 it is the gen5 front, mirrored.
PokeAPI's sprites/pokemon/back/<num>.png are real back views in the same 96x96 pixel style
as the pack backs, so they are used as-is (like the pack backs), and the battle `crop` in
overworld/sprite_tuning.json is re-measured on each new file (hand tweaks kept).

Refuses any download that equals its front or mirrored front (the Showdown failure mode).
Originals go to backups/dlc_backs/ (gitignored).

  python tools/gen_dlc_backs.py            (report)
  python tools/gen_dlc_backs.py --write    (apply)
"""
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageChops, ImageOps

sys.path.insert(0, os.path.dirname(__file__))
from gen_form_sprites import D, ROOT, crop_box  # noqa: E402

WRITE = '--write' in sys.argv
BACKUP = os.path.join(ROOT, 'backups', 'dlc_backs')
URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{side}{num}.png'
FIRST, LAST = 1011, 1025


def fetch(num, back):
    req = urllib.request.Request(URL.format(side='back/' if back else '', num=num), headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def same(a, b):
    return a.size == b.size and ImageChops.difference(a, b).getbbox() is None


def main():
    bat = json.load(open(os.path.join(D, 'species_battle.json'), encoding='utf-8'))
    ids = sorted((v['num'], k) for k, v in bat.items() if not k.startswith('_') and FIRST <= v.get('num', 0) <= LAST and '_' not in k)
    tpath = os.path.join(ROOT, 'overworld', 'sprite_tuning.json')
    tun = json.load(open(tpath, encoding='utf-8'))
    done = []
    for num, sid in ids:
        raw = fetch(num, True)
        back = Image.open(io.BytesIO(raw)).convert('RGBA')
        front = Image.open(io.BytesIO(fetch(num, False))).convert('RGBA')
        if same(back, front) or same(back, ImageOps.mirror(front)):
            print(f'  SKIP {sid}: PokeAPI back is its front')
            continue
        dest = os.path.join(D, 'pokemon', bat[sid]['sprite'].replace('.png', '-b.png'))
        ent = tun.setdefault(sid, {}).setdefault('back', {})
        want = crop_box(back)
        done.append(f'{num} {sid}: {os.path.basename(dest)} crop {ent.get("crop")} -> {want}')
        if WRITE:
            os.makedirs(BACKUP, exist_ok=True)
            bk = os.path.join(BACKUP, os.path.basename(dest))
            if os.path.exists(dest) and not os.path.exists(bk):
                open(bk, 'wb').write(open(dest, 'rb').read())
            back.save(dest)
            if want is None:
                ent.pop('crop', None)
            else:
                ent['crop'] = want
    if WRITE:
        with open(tpath, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(tun, separators=(',', ':')) + '\n')  # the file's own compact format
    print('\n'.join(done))
    print(f'{len(done)} backs {"written" if WRITE else "would be written (dry run)"}')


if __name__ == '__main__':
    main()
