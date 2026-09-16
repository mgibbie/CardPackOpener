# gen_badge_art.py — real per-badge art for the Trainer Card badge case.
#
# Sources (the vendored sibling decomps, same checkout the map/story pipeline uses):
#   pokefirered/graphics/trainer_card/badges.png   128x16, 8 Kanto badges (16x16 each)
#   pokeemerald/graphics/trainer_card/badges.png   128x16, 8 Hoenn badges
#   pokecrystal/gfx/trainer_card/badges.png        16x176, rows 0-7 = the 8 Johto
#                                                  badge faces (rows 8+ are the shared
#                                                  spin-animation frames — unused here)
#
# IMPORTANT provenance fact: all three games store the card badges as a GRAYSCALE
# RAMP and colorize at runtime with ONE palette shared by every badge
# (FR/Em: DrawStarsAndBadgesOnCard uses palNum=3 for all 8; Crystal: every badge's
# OAM entry uses palette 0 + PREDEFPAL_CGB_BADGE). So "authentic colors" for the
# card are monochrome silver. We keep the authentic PIXELS (shape + shading ramp)
# and apply a PER-BADGE palette through the games' own White/Col1/../Black ramp
# mechanism, so each badge reads with its iconic color on the dark web card.
# The per-badge base colors below are hand-authored from the badges' official
# depictions; retune the table and re-run to restyle.
#
# Output: overworld/fx/badges/<region>_<id>.png  (24 files, 16x16 RGBA, git-tracked —
# fx/ is the tracked-sprite home, NOT the offloaded overworld/data/).
# Also writes a 4x contact sheet for eyeballing to tools/data/badge_art_contact.png.
#
# Run from the repo root:  python tools/gen_badge_art.py

import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REF = os.path.join(os.path.dirname(ROOT), 'Magepunk66', 'Reference')
OUT = os.path.join(ROOT, 'overworld', 'fx', 'badges')

# per-badge base colors (hand-authored; see header)
COLORS = {
    # Kanto (FireRed sheet order)
    'kanto_boulder': '9aa2ae', 'kanto_cascade': '4aa0e8', 'kanto_thunder': 'f0a838',
    'kanto_rainbow': '58bc6c', 'kanto_soul': 'ee82b0', 'kanto_marsh': 'e0c04c',
    'kanto_volcano': 'ea5c40', 'kanto_earth': '7cb84c',
    # Johto (Crystal sheet rows: zephyr,hive,plain,fog,mineral,storm,glacier,rising)
    'johto_zephyr': 'a9bcd4', 'johto_hive': 'e8685c', 'johto_plain': 'ecd452',
    'johto_fog': '9d78d0', 'johto_storm': 'eb9040', 'johto_mineral': 'b9c0c8',
    'johto_glacier': '7cccec', 'johto_rising': 'd85868',
    # Hoenn (Emerald sheet order)
    'hoenn_stone': 'b0a89c', 'hoenn_knuckle': 'd89478', 'hoenn_dynamo': 'ecc844',
    'hoenn_heat': 'e85838', 'hoenn_balance': '92aac4', 'hoenn_feather': '74b8dc',
    'hoenn_mind': 'e284c8', 'hoenn_rain': '4a7ee0',
}

KANTO_ORDER = ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']
HOENN_ORDER = ['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain']
CRYSTAL_ROWS = ['zephyr', 'hive', 'plain', 'fog', 'mineral', 'storm', 'glacier', 'rising']

OUTLINE = (16, 18, 26, 255)


def hx(s):
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(base):
    """White->Col..->Black ramp, the games' own badge-palette shape."""
    w = (255, 255, 255)
    return {
        'c1': mix(w, base, 0.30),           # highlight
        'c2': mix(w, base, 0.62),           # light
        'c3': base,                          # body
        'c4': mix(base, (0, 0, 0), 0.35),   # shade
    }


def emit(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def gba_badge(sheet, i, base):
    """16x16 slice; palette indices 0=bg, 1..4 light->dark ramp, 15=outline."""
    tile = sheet.crop((i * 16, 0, i * 16 + 16, 16))
    r = ramp(base)
    lut = {1: r['c1'], 2: r['c2'], 3: r['c3'], 4: r['c4'], 15: OUTLINE[:3]}
    out = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    seen = set()
    for y in range(16):
        for x in range(16):
            p = tile.getpixel((x, y))
            seen.add(p)
            if p == 0:
                continue
            if p not in lut:
                raise SystemExit(f'unexpected palette index {p} in GBA badge {i}')
            out.putpixel((x, y), (*lut[p], 255))
    if seen == {0}:
        raise SystemExit(f'GBA badge slice {i} is empty')
    return out


def gb_badge(sheet, row, base):
    """16x16 row; gray levels 255=transparent(color 0), 170/85 ramp, 0=outline."""
    tile = sheet.crop((0, row * 16, 16, row * 16 + 16))
    r = ramp(base)
    lut = {170: r['c2'], 85: r['c4'], 0: OUTLINE[:3]}
    out = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    seen = set()
    for y in range(16):
        for x in range(16):
            p = tile.getpixel((x, y))
            seen.add(p)
            if p == 255:
                continue
            if p not in lut:
                raise SystemExit(f'unexpected gray level {p} in GB badge row {row}')
            out.putpixel((x, y), (*lut[p], 255))
    if seen == {255}:
        raise SystemExit(f'GB badge row {row} is empty')
    return out


def main():
    fr = Image.open(os.path.join(REF, 'pokefirered', 'graphics', 'trainer_card', 'badges.png'))
    em = Image.open(os.path.join(REF, 'pokeemerald', 'graphics', 'trainer_card', 'badges.png'))
    cr = Image.open(os.path.join(REF, 'pokecrystal', 'gfx', 'trainer_card', 'badges.png')).convert('L')
    assert fr.size == (128, 16) and em.size == (128, 16), 'GBA badge sheet shape changed'
    assert cr.size == (16, 176), 'Crystal badge sheet shape changed'

    made = {}
    for i, bid in enumerate(KANTO_ORDER):
        made[f'kanto_{bid}'] = gba_badge(fr, i, hx(COLORS[f'kanto_{bid}']))
    for i, bid in enumerate(HOENN_ORDER):
        made[f'hoenn_{bid}'] = gba_badge(em, i, hx(COLORS[f'hoenn_{bid}']))
    for row, bid in enumerate(CRYSTAL_ROWS):
        made[f'johto_{bid}'] = gb_badge(cr, row, hx(COLORS[f'johto_{bid}']))

    assert set(made) == set(COLORS), 'badge set drifted from the color table'
    for name, img in made.items():
        emit(img, os.path.join(OUT, name + '.png'))

    # 4x contact sheet on the card blue, one row per region, for eyeballing
    order = ([f'kanto_{b}' for b in KANTO_ORDER]
             + [f'johto_{b}' for b in ['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising']]
             + [f'hoenn_{b}' for b in HOENN_ORDER])
    S, PAD = 64, 8
    sheet = Image.new('RGBA', (8 * (S + PAD) + PAD, 3 * (S + PAD) + PAD), (30, 54, 92, 255))
    for n, name in enumerate(order):
        big = made[name].resize((S, S), Image.NEAREST)
        x, y = (n % 8) * (S + PAD) + PAD, (n // 8) * (S + PAD) + PAD
        sheet.alpha_composite(big, (x, y))
    contact = os.path.join(HERE, 'data', 'badge_art_contact.png')
    emit(sheet, contact)
    print(f'wrote {len(made)} badges to {OUT}')
    print(f'contact sheet: {contact}')


if __name__ == '__main__':
    main()
