"""gen_form_sprites.py — give every alternate form its own overworld, follower and
battle BACK art, from the Pokemon Essentials packs the base-species art came from.

Why: tools/fix_form_sprites.mjs (#175) gave the 130 forms in species_battle.json
their own battle FRONT sprite, but nothing else followed:
  * data/pokemon/<sprite>-b.png  — 81 forms had no back sprite, so battle.js's
    loadSprite fell back to the FRONT one and your own Hisuian Qwilfish faced
    the camera (and the wrong way) in battle.
  * data/pokemon_follow/<id>.png — no form had a walk sheet, so ow_follower.js
    fell back to the BASE species' sheet: a Hisuian Qwilfish followed you as a
    plain Qwilfish.
  * data/pokemon_ow/<id>.png     — the standing overworld sprite, same gap.
  * data/species_index.json      — still pointed every form at the base sprite.

The original importers (Magepunk66/tools/import_follower_walk.py and
import_follower_sprites.py) matched pack files to species BY NAME, so the form
files (QWILFISH_1.png = Hisuian, VULPIX_1.png = Alolan, ...) never matched. This
maps an Essentials form (SPECIES_<n>.png) to our form id through each pack's own
PBS FormName (the same index can mean different forms in different packs —
DARUMAKA_1 is Galarian in one and Zen Mode in the other), then writes output in
EXACTLY the importers' formats, verified byte-identical against the existing
base-species files:
  pokemon_follow/<id>.png  whole 4x4 charset -> 128x128 (32px frames), LANCZOS
  pokemon_ow/<id>.png      down/rest frame, trimmed, scaled to 40px high, LANCZOS
  pokemon/<sprite>-b.png   the pack's Back sprite (the same art our base backs
                           are), scaled by the base species' measured factor
                           (nearest neighbour) and framed like the base's -b
It also syncs species_index.json's sprites to species_battle.json, and refreshes
the per-form `crop` boxes in overworld/sprite_tuning.json (they were measured on
the BASE sprite when every form still wore it).

Never overwrites an existing file. A form the packs have no art for is listed,
and keeps the renderer's documented fallback (base walk sheet / front sprite).

  python tools/gen_form_sprites.py           (report)
  python tools/gen_form_sprites.py --write   (apply)
  python tools/gen_form_sprites.py --sheet out.png   (contact sheet to eyeball)
"""
import json
import math
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = os.path.join(ROOT, 'overworld', 'data')
PROG = os.environ.get('ESSENTIALS_ROOT', r'C:/Users/guide/Desktop/Projects/Programming')
PZ = os.path.join(PROG, 'PokemonZero2024')
QG = os.path.join(PROG, 'RPGMaker Archive from Old Comp', 'QgameMVP')
WRITE = '--write' in sys.argv
SHEET = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None


def norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def parse_pbs(path):
    """{(SPECIES, n): FormName or ''} from an Essentials pokemon_forms / pokemonforms file."""
    out, key = {}, None
    if not os.path.exists(path):
        return out
    for line in open(path, encoding='utf-8-sig', errors='replace'):
        m = re.match(r'^\[([A-Z0-9_]+),(\d+)\]', line)
        if m:
            key = (m.group(1), int(m.group(2)))
            out[key] = ''
            continue
        m = re.match(r'^FormName\s*=\s*(.*)$', line.strip())
        if m and key:
            out[key] = m.group(1).strip()
    return out


PBS_PZ = parse_pbs(os.path.join(PZ, 'PBS', 'pokemonforms.txt'))
PBS_QG = parse_pbs(os.path.join(QG, 'PBS', 'pokemon_forms.txt'))

# Our id suffix -> the FormName to look for, where the token rule below is ambiguous
# or the names differ. An int is a pack form index that has no FormName (the Gen-9
# entries the PBS files predate). FEMALE = the pack's SPECIES_female.png variant.
FEMALE = 'female'
OVERRIDE = {
    'darmanitan_zen': 'Zen Mode',
    'darmanitan_galar': 'Galarian Standard Mode',
    'darmanitan_galar_zen': 'Galarian Zen Mode',
    'tauros_paldea_combat': 'Combat Breed',
    'tauros_paldea_blaze': 'Blaze Breed',
    'tauros_paldea_aqua': 'Aqua Breed',
    'zygarde_10': '10% Forme',
    'zygarde_complete': 'Complete Forme',
    'minior_core': 'Red Core',            # our minior_core art is the red core
    'necrozma_ultra': 'Ultra Necrozma',
    'unown_question': '?',
    'unown_exclaim': '!',
    'basculegion_f': FEMALE,
    'indeedee_f': 'Female',
    'oinkologne_f': 1,
    'palafin_hero': 1,
}
REGIONAL = {'alola': 'alolan', 'galar': 'galarian', 'hisui': 'hisuian', 'paldea': 'paldean'}


def form_index(pbs, SP, our_id, suffix):
    """the pack form index for our form, or None"""
    want = OVERRIDE.get(our_id)
    if isinstance(want, int):
        return want
    if want == FEMALE:
        return FEMALE
    entries = [(n, name) for (sp, n), name in pbs.items() if sp == SP and n > 0]
    if want is not None:
        # exact first: Unown's '?' and '!' normalise to the same empty string
        hit = [n for n, name in entries if name == want] or             ([n for n, name in entries if norm(name) == norm(want)] if norm(want) else [])
        return hit[0] if hit else None
    toks = [REGIONAL.get(t, t) for t in suffix.split('_')]
    if SP == 'UNOWN' and len(toks) == 1 and len(toks[0]) == 1:
        hit = [n for n, name in entries if norm(name) == toks[0]]
        return hit[0] if hit else None
    # every suffix token appears in the FormName; the fewest extra letters wins
    cands = [(len(norm(name)), n) for n, name in entries if name and all(t in norm(name) for t in toks)]
    cands.sort()
    if len(cands) > 1 and cands[0][0] == cands[1][0]:
        return None  # ambiguous: needs an OVERRIDE
    return cands[0][1] if cands else None


def stem_for(SP, idx):
    if idx == FEMALE:
        return f'{SP}_female'
    return f'{SP}_{idx}'


# The follower charset pack numbers Unown's last two the other way round from the
# PBS (and from the battle sprites): its UNOWN_26 is "!" and UNOWN_27 is "?".
FOLLOW_OVERRIDE = {'unown_exclaim': 26, 'unown_question': 27}


def find(dirs_pbs, SP, our_id, suffix, override=None):
    """first existing pack file over [(dir, pbs)] -> (path, idx, dir) or (None, None, None).
    A pack whose PBS lacks the form falls back to PokemonZero's numbering (the
    QgameMVP graphics are newer than its PBS and follow the Gen-9 pack order)."""
    for d, pbs in dirs_pbs:
        idx = (override or {}).get(our_id)
        if idx is None:
            idx = form_index(pbs, SP, our_id, suffix)
        if idx is None and pbs is not PBS_PZ:
            idx = form_index(PBS_PZ, SP, our_id, suffix)
        if idx is None:
            continue
        p = os.path.join(d, stem_for(SP, idx) + '.png')
        if os.path.exists(p):
            return p, idx, d
    return None, None, None


FOLLOW_SRC = [(os.path.join(QG, 'Graphics', 'Characters'), PBS_QG),
              (os.path.join(PZ, 'Graphics', 'Characters', 'Followers'), PBS_PZ)]
BACK_SRC = [(os.path.join(PZ, 'Graphics', 'Pokemon', 'Back'), PBS_PZ),
            (os.path.join(QG, 'Graphics', 'Pokemon', 'Back'), PBS_QG)]
FRONT_SRC = [(os.path.join(PZ, 'Graphics', 'Pokemon', 'Front'), PBS_PZ),
             (os.path.join(QG, 'Graphics', 'Pokemon', 'Front'), PBS_QG)]
# 99 form fronts were box-icon minisprites (Alolan Vulpix: 22x21 visible), which the
# battle scene blows up to a 96px blur; the pack's front is replaced in when it is
# this much bigger than ours
GROW = 1.25
BACKUP = os.path.join(ROOT, 'backups', 'form_fronts')   # gitignored; originals kept here


def bbox(im):
    """visible box, the same alpha > 16 rule as tools/sprite-audit.cjs"""
    a = im.getchannel('A').point(lambda v: 255 if v > 16 else 0)
    return a.getbbox()


def make_back(base_ours, base_pack, form_pack):
    """frame the pack's form Back sprite the way our base -b frames the pack's base Back."""
    ob, pb = bbox(base_ours), bbox(base_pack)
    if not ob or not pb:
        return None, None
    # scale our base back has relative to the pack's (1.0 for nearly every species)
    f = ((ob[3] - ob[1]) / (pb[3] - pb[1]) + (ob[2] - ob[0]) / (pb[2] - pb[0])) / 2
    if abs(f - 1) < 0.06:
        f = 1.0
    src = form_pack
    if f != 1.0:
        src = form_pack.resize((max(1, round(form_pack.width * f)), max(1, round(form_pack.height * f))), Image.NEAREST)
        pb = tuple(round(v * f) for v in pb)
    # our base canvas, expressed in pack pixels: base -b origin sits at pb - ob
    ox, oy = pb[0] - ob[0], pb[1] - ob[1]
    frame = (ox, oy, ox + base_ours.width, oy + base_ours.height)
    fb = bbox(src)
    if not fb:
        return None, None
    # grow the frame to hold the form if it is bigger than the base
    frame = (min(frame[0], fb[0]), min(frame[1], fb[1]), max(frame[2], fb[2]), max(frame[3], fb[3]))
    out = Image.new('RGBA', (frame[2] - frame[0], frame[3] - frame[1]), (0, 0, 0, 0))
    out.alpha_composite(src.crop((max(0, frame[0]), max(0, frame[1]), min(src.width, frame[2]), min(src.height, frame[3]))),
                        (max(0, -frame[0]), max(0, -frame[1])))
    return out, f


def crop_box(im):
    """sprite-audit.cjs's crop rule: [x,y,w,h] canvas fractions, or None when 'close enough'."""
    b = bbox(im)
    if not b:
        return None
    w, h = im.size
    bw, bh = b[2] - b[0], b[3] - b[1]
    gap = h - b[3]
    cx_off = (b[0] + b[2]) / 2 - w / 2
    coverage = max(bw, bh) / max(w, h)
    if coverage >= 0.9 and gap / h <= 0.03 and abs(cx_off) / w <= 0.05:
        return None
    r = lambda v: math.floor(v * 1000 + 0.5) / 1000   # JS Math.round, not banker's rounding
    return [r(b[0] / w), r(b[1] / h), r(bw / w), r(bh / h)]


def main():
    bat = json.load(open(os.path.join(D, 'species_battle.json'), encoding='utf-8'))
    ids = [k for k in bat if not k.startswith('_')]
    base_by_num = {}
    for i in ids:
        n = bat[i].get('num', 0)
        if n > 0 and '_' not in i and n not in base_by_num:
            base_by_num[n] = i
    forms = [i for i in ids if '_' in i and bat[i].get('num', 0) > 0 and base_by_num.get(bat[i]['num']) not in (None, i)]

    rep = {'follow': [], 'ow': [], 'back': [], 'follow_missing': [], 'back_missing': [], 'exists': 0,
           'front': [], 'front_missing': [], 'trimmed': []}
    rows = []
    for fid in sorted(forms):
        base = base_by_num[bat[fid]['num']]
        suffix = fid[len(base) + 1:] if fid.startswith(base + '_') else fid.split('_', 1)[1]
        # the internal name is the base id upper-cased (FARFETCHD, MRMIME); the
        # display name is no good — Farfetch'd's carries an escaped apostrophe
        SP = norm(base).upper()
        row = {'id': fid, 'base': base}
        # ---- walk sheet + standing overworld sprite ----
        fpath = os.path.join(D, 'pokemon_follow', fid + '.png')
        opath = os.path.join(D, 'pokemon_ow', fid + '.png')
        src, idx, sdir = find(FOLLOW_SRC, SP, fid, suffix, FOLLOW_OVERRIDE)
        row['follow_src'] = src
        if src:
            im = Image.open(src).convert('RGBA')
            sheet = im.resize((128, 128), Image.LANCZOS)
            fw, fh = im.width // 4, im.height // 4
            fr = im.crop((0, 0, fw, fh))
            bb = fr.getbbox()
            if bb:
                fr = fr.crop(bb)
            if fr.height != 40:
                fr = fr.resize((max(1, round(fr.width * 40 / fr.height)), 40), Image.LANCZOS)
            row['follow_img'], row['ow_img'] = sheet, fr
            for path, img, key in ((fpath, sheet, 'follow'), (opath, fr, 'ow')):
                if os.path.exists(path):
                    rep['exists'] += 1
                    continue
                rep[key].append(fid)
                if WRITE:
                    img.save(path)
        elif not os.path.exists(fpath):
            rep['follow_missing'].append(fid)
        # ---- battle front: replace a minisprite / a copy of the base with the pack's art ----
        spr = bat[fid]['sprite']
        fr_path = os.path.join(D, 'pokemon', spr)
        cur = Image.open(fr_path).convert('RGBA')
        cb = bbox(cur)
        is_dup = open(fr_path, 'rb').read() == open(os.path.join(D, 'pokemon', bat[base]['sprite']), 'rb').read()
        row['front_img'] = cur
        big = lambda b: max(b[2] - b[0], b[3] - b[1]) if b else 0
        fsrc, _, _ = find(FRONT_SRC, SP, fid, suffix)
        if fsrc:
            im = Image.open(fsrc).convert('RGBA')
            new = im.crop(bbox(im))
            nb = bbox(new)
            # the pack's art replaces ours only when ours is a minisprite: the
            # pack's is clearly bigger (Alolan Vulpix 22px -> 53px). The HD Hisui /
            # Paldea art (95-200px) is bigger than the pack's and stays.
            if is_dup or big(nb) > big(cb) * GROW:
                rep['front'].append(f'{fid} ({os.path.basename(fsrc)}, {big(cb)}px -> {big(nb)}px)')
                row['front_img'] = new
                if WRITE:
                    os.makedirs(BACKUP, exist_ok=True)
                    bk = os.path.join(BACKUP, spr)
                    if not os.path.exists(bk):
                        with open(bk, 'wb') as fh:
                            fh.write(open(fr_path, 'rb').read())
                    new.save(fr_path)
        elif is_dup or big(cb) < 40:
            rep['front_missing'].append(fid)
        # the HD Hisui/Paldea fronts sit at the bottom of 110x244-style canvases
        # (Hisuian Qwilfish: 108x95 of art in 110x244) — a tall empty box on the
        # wiki and in every menu. Trim them to their art (same pixels).
        img = row['front_img']
        tb = bbox(img)
        if tb and row['front_img'] is cur and big(tb) < 0.9 * max(img.size):
            trimmed = img.crop(tb)
            rep['trimmed'].append(f'{fid} {img.size[0]}x{img.size[1]} -> {trimmed.size[0]}x{trimmed.size[1]}')
            row['front_img'] = trimmed
            if WRITE:
                os.makedirs(BACKUP, exist_ok=True)
                bk = os.path.join(BACKUP, spr)
                if not os.path.exists(bk):
                    with open(bk, 'wb') as fh:
                        fh.write(open(fr_path, 'rb').read())
                trimmed.save(fr_path)
        # ---- battle back sprite ----
        bpath = os.path.join(D, 'pokemon', re.sub(r'\.(png|gif)$', r'-b.\1', spr))
        bsrc, bidx, bdir = find(BACK_SRC, SP, fid, suffix)
        row['back_src'] = bsrc
        if os.path.exists(bpath):
            row['back_img'] = Image.open(bpath).convert('RGBA')
        elif bsrc:
            base_b = os.path.join(D, 'pokemon', re.sub(r'\.(png|gif)$', r'-b.\1', bat[base]['sprite']))
            base_pack = os.path.join(bdir, SP + '.png')
            if os.path.exists(base_b) and os.path.exists(base_pack):
                out, f = make_back(Image.open(base_b).convert('RGBA'), Image.open(base_pack).convert('RGBA'),
                                   Image.open(bsrc).convert('RGBA'))
            else:  # no base to match: the pack sprite, trimmed
                im = Image.open(bsrc).convert('RGBA')
                out, f = im.crop(bbox(im)), 1.0
            if out is not None:
                rep['back'].append(f'{fid} ({os.path.basename(bsrc)}, x{f:.2f})')
                row['back_img'] = out
                if WRITE:
                    out.save(bpath)
            else:
                rep['back_missing'].append(fid)
        else:
            rep['back_missing'].append(fid)
        rows.append(row)

    # ---- species_index.json: a form's sprite is its own ----
    si_path = os.path.join(D, 'species_index.json')
    si = json.load(open(si_path, encoding='utf-8'))
    stale = [k for k in si if k in bat and bat[k].get('sprite') and si[k].get('sprite') != bat[k]['sprite']]
    for k in stale:
        si[k]['sprite'] = bat[k]['sprite']
    if WRITE and stale:
        raw = open(si_path, encoding='utf-8').read()
        indent = None if '\n' not in raw.strip() else 1
        with open(si_path, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(si, fh, ensure_ascii=False, indent=indent, separators=(',', ':') if indent is None else None)

    # ---- pokemon_ow_index.json (git-tracked manifest npcs.js reads) ----
    owi_path = os.path.join(ROOT, 'overworld', 'pokemon_ow_index.json')
    owi = json.load(open(owi_path, encoding='utf-8'))
    have = sorted(set(owi) | {r['id'] for r in rows if r.get('ow_img') is not None})
    if WRITE and len(have) != len(owi):
        raw = open(owi_path, encoding='utf-8').read()
        with open(owi_path, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(have, indent=None if '\n' not in raw.strip() else 1, separators=(',', ':')) + ('\n' if raw.endswith('\n') else ''))

    # ---- sprite_tuning crops, re-measured on each form's OWN files ----
    tpath = os.path.join(ROOT, 'overworld', 'sprite_tuning.json')
    tun = json.load(open(tpath, encoding='utf-8'))
    tuned = []
    for r in rows:
        fid = r['id']
        files = {'front': r['front_img']}
        if r.get('back_img') is not None:
            files['back'] = r['back_img']
        for side, f in files.items():
            im = f if isinstance(f, Image.Image) else Image.open(f).convert('RGBA')
            want = crop_box(im)
            e = tun.get(fid, {}).get(side, {})
            if e.get('crop') == want or (want is None and 'crop' not in e):
                continue
            tuned.append(f'{fid}.{side}: {e.get("crop")} -> {want}')
            ent = tun.setdefault(fid, {}).setdefault(side, {})
            if want is None:
                ent.pop('crop', None)
            else:
                ent['crop'] = want
    if WRITE and tuned:
        with open(tpath, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(tun, separators=(',', ':')) + '\n')

    print(f'alternate forms: {len(forms)}')
    print(f'  front sprites replaced {len(rep["front"])}   minisprite with no pack art {len(rep["front_missing"])}')
    print(f'  fronts trimmed of empty canvas {len(rep["trimmed"])}')
    print(f'  walk sheets   new {len(rep["follow"])}   no pack art {len(rep["follow_missing"])}')
    print(f'  overworld     new {len(rep["ow"])}')
    print(f'  back sprites  new {len(rep["back"])}   no pack art {len(rep["back_missing"])}')
    print(f'  (already present, left alone: {rep["exists"]})')
    print(f'  species_index sprites synced: {len(stale)}')
    print(f'  sprite_tuning crops refreshed: {len(tuned)}')
    if rep['follow_missing']:
        print('\nno walk sheet in either pack (renderer falls back to the base sheet):\n  ' + ', '.join(rep['follow_missing']))
    if rep['front_missing']:
        print('\nminisprite fronts with no pack art:\n  ' + ', '.join(rep['front_missing']))
    if rep['back_missing']:
        print('\nno back sprite in either pack:\n  ' + ', '.join(rep['back_missing']))
    if '-v' in sys.argv:
        for line in rep['front']:
            print('  front', line)
        for line in rep['trimmed']:
            print('  trim', line)
        for line in rep['back']:
            print('  back', line)
        for r in rows:
            print('  ', r['id'].ljust(24), os.path.basename(r['follow_src'] or '-').ljust(22), os.path.basename(r['back_src'] or '-'))
        for t in tuned:
            print('  tune', t)
    if not WRITE:
        print('\n(dry run - pass --write to apply)')

    if SHEET:
        # one row per form: base front | form front | form back | follower down frame | standing ow
        cell = 100
        W = Image.new('RGBA', (cell * 5 + 170, cell * len(rows)), (214, 230, 214, 255))
        from PIL import ImageDraw
        dr = ImageDraw.Draw(W)
        for i, r in enumerate(rows):
            y = i * cell
            dr.text((4, y + 4), r['id'], fill=(0, 0, 0, 255))
            imgs = [Image.open(os.path.join(D, 'pokemon', bat[r['base']]['sprite'])).convert('RGBA'),
                    r['front_img'],
                    r.get('back_img'),
                    r['follow_img'].crop((0, 0, 32, 32)).resize((64, 64), Image.NEAREST) if r.get('follow_img') else None,
                    r.get('ow_img')]
            for j, im in enumerate(imgs):
                if im is None:
                    dr.text((170 + j * cell + 30, y + 40), '--', fill=(200, 0, 0, 255))
                    continue
                im = im.copy()
                im.thumbnail((cell - 4, cell - 4))
                W.alpha_composite(im, (170 + j * cell + 2, y + 2))
        W.save(SHEET)
        print('contact sheet ->', SHEET)


if __name__ == '__main__':
    main()
