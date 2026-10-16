"""gen_base_sprites.py — replace the BASE species' icon-sized battle fronts with the
Pokemon Essentials pack art, the way tools/gen_form_sprites.py did for the forms.

Why: 90 base species (the whole Galar dex, #810-#898, plus Xerneas) wore box-icon
minisprites as their battle FRONT: Urshifu was 33px of art in a 38x46 canvas,
Morpeko 21px, Sinistea 17px. battle.js normalises every sprite to the same 96px
battle box by its visible pixels, so those were blown up 3-5x into a blur of fat
pixels. Their BACK sprites were already the pack's 96x96 art.

Also: the 105 Gen-9 species #906-#1010 had a FRONT-facing picture as their "-b"
back sprite (your own Sprigatito faced the camera); they get the pack's real
back, as-is. #1011-#1025 have no back in either pack and are left (listed).

The size criterion (documented, the same GROW rule as the form fix): a front is
icon-sized when the Essentials pack's front for the same species is more than
1.25x bigger (largest visible side, alpha > 16 — sprite-audit's rule). Over the
1025 numbered species ours/pack falls into two clean groups: 0.28-0.64 (the 90
icons) and >= 0.68. The four between 0.68 and 0.8 are real art in a different
pose, kept on purpose (KEEP below). The in-repo guard is
overworld/tests/base_sprites_test.mjs (it cannot read the packs, so it checks
each front against the species' own back sprite, which IS the pack art).

The replacement is the pack front trimmed to its art (the framing every good
sprite and the form fix use); the battle `crop` in sprite_tuning.json is
re-measured (hand tweaks s/x/y kept). Originals go to backups/base_fronts/
(gitignored). Also re-saves s21696-b.png (Meowstic's back), whose iCCP chunk had
a bad CRC so strict decoders (PIL) refused the file — same pixels, chunk dropped.

  python tools/gen_base_sprites.py            (report)
  python tools/gen_base_sprites.py --write    (apply)
  python tools/gen_base_sprites.py --sheet out.png   (ours | pack | back | walk frame | ow)
"""
import json
import os
import struct
import sys
import zlib

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from gen_form_sprites import D, ROOT, FRONT_SRC, BACK_SRC, GROW, bbox, crop_box, norm  # noqa: E402

WRITE = '--write' in sys.argv
SHEET = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
BACKUP = os.path.join(ROOT, 'backups', 'base_fronts')   # gitignored
# real art that only measures smaller than the pack's because the pack draws
# something extra or a different pose (eyeballed side by side):
KEEP = {
    'koffing': 'FRLG art; the pack front adds the gas puffs (65px) around the same body',
    'gastly': 'FRLG art; the pack front adds the gas haze',
    'gorebyss': 'RSE art in its curled pose; the pack draws it stretched out',
    'crabrawler': 'proper Gen-7 art with the claws tucked; the pack raises them',
}
# Essentials' internal names that are not just the id upper-cased
PACK_NAME = {'nidoranf': 'NIDORANfE', 'nidoranm': 'NIDORANmA'}
GEN9 = 906


def big(b):
    return max(b[2] - b[0], b[3] - b[1]) if b else 0


def strip_bad_chunks(path):
    """drop ancillary chunks whose CRC is wrong; returns the new bytes or None if clean"""
    buf = open(path, 'rb').read()
    out, p, dropped = [buf[:8]], 8, False
    while p < len(buf):
        ln = struct.unpack('>I', buf[p:p + 4])[0]
        typ, data = buf[p + 4:p + 8], buf[p + 8:p + 8 + ln]
        crc = struct.unpack('>I', buf[p + 8 + ln:p + 12 + ln])[0]
        chunk = buf[p:p + 12 + ln]
        if zlib.crc32(typ + data) & 0xffffffff != crc and typ[0:1].islower():
            dropped = True
        else:
            out.append(chunk)
        p += 12 + ln
        if typ == b'IEND':
            break
    return b''.join(out) if dropped else None


def backup(path):
    os.makedirs(BACKUP, exist_ok=True)
    bk = os.path.join(BACKUP, os.path.basename(path))
    if not os.path.exists(bk):
        with open(bk, 'wb') as fh:
            fh.write(open(path, 'rb').read())


def main():
    bat = json.load(open(os.path.join(D, 'species_battle.json'), encoding='utf-8'))
    base_by_num = {}
    for i in bat:
        if i.startswith('_'):
            continue
        n = bat[i].get('num', 0)
        if n > 0 and '_' not in i and n not in base_by_num:
            base_by_num[n] = i
    bases = [base_by_num[n] for n in sorted(base_by_num)]

    replaced, kept, nopack, rows = [], [], [], []
    for sid in bases:
        spr = bat[sid]['sprite']
        path = os.path.join(D, 'pokemon', spr)
        cur = Image.open(path).convert('RGBA')
        SP = PACK_NAME.get(sid, norm(sid).upper())
        src = next((os.path.join(d, SP + '.png') for d, _ in FRONT_SRC if os.path.exists(os.path.join(d, SP + '.png'))), None)
        if not src:
            nopack.append(sid)
            continue
        im = Image.open(src).convert('RGBA')
        new = im.crop(bbox(im))
        o, p = big(bbox(cur)), big(bbox(new))
        if p <= o * GROW:
            continue
        if sid in KEEP:
            kept.append(f'{sid} ({o}px vs pack {p}px): {KEEP[sid]}')
            continue
        replaced.append(f'{sid} #{bat[sid]["num"]} {spr}: {o}px in {cur.width}x{cur.height} -> {p}px ({'PokemonZero2024' if 'PokemonZero2024' in src else 'QgameMVP'})')
        rows.append((sid, cur, new))
        if WRITE:
            backup(path)
            new.save(path)

    # Gen-9 (#906+) "-b" sprites were FRONT-facing pictures: your own Sprigatito
    # faced the camera. The packs have the real back for #906-#1010; it goes in
    # as-is (96x96, the same framing as every other species' pack back).
    backs, back_rows = [], []
    for sid in bases:
        if bat[sid]['num'] < GEN9:
            continue
        SP = PACK_NAME.get(sid, norm(sid).upper())
        src = next((os.path.join(d, SP + '.png') for d, _ in BACK_SRC if os.path.exists(os.path.join(d, SP + '.png'))), None)
        bp = os.path.join(D, 'pokemon', bat[sid]['sprite'].replace('.png', '-b.png'))
        new = Image.open(src).convert('RGBA') if src else None
        cur = Image.open(bp).convert('RGBA')
        if new is None or cur.tobytes() == new.tobytes():
            continue
        backs.append(f'{sid} #{bat[sid]["num"]}')
        back_rows.append((sid, cur, new))
        if WRITE:
            backup(bp)
            new.save(bp)

    # Meowstic's back (and anything like it): a corrupt ancillary chunk
    fixed_png = []
    for sid in bases:
        for f in (bat[sid]['sprite'], bat[sid]['sprite'].replace('.png', '-b.png')):
            fp = os.path.join(D, 'pokemon', f)
            if not os.path.exists(fp):
                continue
            clean = strip_bad_chunks(fp)
            if clean is None:
                continue
            fixed_png.append(f'{sid}: {f}')
            if WRITE:
                backup(fp)
                with open(fp, 'wb') as fh:
                    fh.write(clean)

    # re-measure the battle crop of every changed sprite (hand tweaks kept)
    tpath = os.path.join(ROOT, 'overworld', 'sprite_tuning.json')
    tun = json.load(open(tpath, encoding='utf-8'))
    tuned = []
    touched = [(sid, 'front', new) for sid, _, new in rows] + [(sid, 'back', new) for sid, _, new in back_rows]
    for line in fixed_png:
        sid, f = line.split(': ')
        side = 'back' if f.endswith('-b.png') else 'front'
        touched.append((sid, side, None))
    for sid, side, img in touched:
        if img is None:
            fp = os.path.join(D, 'pokemon', bat[sid]['sprite'].replace('.png', '-b.png' if side == 'back' else '.png'))
            from io import BytesIO
            data = strip_bad_chunks(fp) or open(fp, 'rb').read()
            img = Image.open(BytesIO(data)).convert('RGBA')
        want = crop_box(img)
        ent = tun.setdefault(sid, {}).setdefault(side, {})
        if ent.get('crop') == want or (want is None and 'crop' not in ent):
            continue
        tuned.append(f'{sid}.{side}: {ent.get("crop")} -> {want}')
        if want is None:
            ent.pop('crop', None)
        else:
            ent['crop'] = want
    if WRITE and tuned:
        with open(tpath, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(tun, separators=(',', ':')) + '\n')

    print(f'numbered base species: {len(bases)}')
    print(f'  icon-sized fronts replaced with pack art: {len(rows)}')
    print(f'  kept (real art, different pose): {len(kept)}')
    print(f'  no pack art (the #1011+ DLC species: HD fronts kept): {len(nopack)}')
    print(f'  Gen-9 front-facing backs replaced with the pack back: {len(backs)}')
    print(f'  PNGs with a corrupt chunk re-saved: {len(fixed_png)} {fixed_png}')
    print(f'  sprite_tuning crops re-measured: {len(tuned)}')
    if '-v' in sys.argv:
        for line in replaced:
            print('  front', line)
        for line in kept:
            print('  keep ', line)
        for t in tuned:
            print('  tune ', t)
    if not WRITE:
        print('\n(dry run - pass --write to apply)')

    if SHEET:
        cell = 100
        W = Image.new('RGBA', (cell * 5 + 110, cell * len(rows)), (214, 230, 214, 255))
        dr = ImageDraw.Draw(W)
        for i, (sid, cur, new) in enumerate(rows):
            y = i * cell
            dr.text((4, y + 4), sid, fill=(0, 0, 0, 255))
            bp = os.path.join(D, 'pokemon', bat[sid]['sprite'].replace('.png', '-b.png'))
            fp = os.path.join(D, 'pokemon_follow', sid + '.png')
            op = os.path.join(D, 'pokemon_ow', sid + '.png')
            imgs = [cur, new, Image.open(bp).convert('RGBA') if os.path.exists(bp) else None,
                    Image.open(fp).convert('RGBA').crop((0, 0, 32, 32)).resize((64, 64), Image.NEAREST) if os.path.exists(fp) else None,
                    Image.open(op).convert('RGBA') if os.path.exists(op) else None]
            for j, im in enumerate(imgs):
                if im is None:
                    dr.text((110 + j * cell + 30, y + 40), '--', fill=(200, 0, 0, 255))
                    continue
                im = im.copy()
                im.thumbnail((cell - 4, cell - 4))
                W.alpha_composite(im, (110 + j * cell + 2, y + 2))
        W.save(SHEET)
        print('contact sheet ->', SHEET)


if __name__ == '__main__':
    main()
