#!/usr/bin/env python3
"""gen_crystal_deco_sprites.py — the player's-room DECORATION object sprites of
pokecrystal, converted for overworld/decorations.js.

PlayersHouse2F's console / doll / big-doll objects use the variable sprites
SPRITE_CONSOLE, SPRITE_DOLL_1/2 and SPRITE_BIG_DOLL; ToggleDecorationsVisibility
points each at the placed decoration's sprite (data/decorations/attributes.asm):
a console (gfx/sprites/*.png), a POKeMON doll (SpriteMons -> the species' party
menu icon, gfx/icons/*.png, the way GetMonSprite loads it) or a big doll, whose
32x32 picture is assembled from its tiles by FacingBigDollSymmetric /
FacingBigDollAsymmetric (data/sprites/facings.asm).

Colours: the sprite's PAL_OW_* palette (data/sprites/sprites.asm; POKeMON
sprites use palette 0) from gfx/overworld/npc_sprites.pal, the DAY set. Colour 0
is transparent.

Writes tracked overworld/deco_gfx/sprites.png + sprites.json
({ SPRITE_X: { x, y, w, h } }).
  python tools/gen_crystal_deco_sprites.py
"""
import json, os, re
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MP66 = os.environ.get('MAGEPUNK66') or os.path.join(HERE, '..', '..', 'Magepunk66')
CR = os.path.join(MP66, 'Reference', 'pokecrystal')
OUT = os.path.join(HERE, '..', 'overworld', 'deco_gfx')


def read(f):
    with open(os.path.join(CR, f), encoding='utf-8') as fh:
        return fh.read()


# the decorations' sprites (attributes.asm, last column)
need = [m.group(1) for m in re.finditer(r'^\s*decoration\s+\w+,\s*\w+,\s*\w+,\s*\w+,\s*(SPRITE_\w+)', read('data/decorations/attributes.asm'), re.M)]

# SPRITE_* numbers: const_def 0, the overworld sprites, then SPRITE_POKEMON's run
consts, n, mon_base = {}, 0, None
for line in read('constants/sprite_constants.asm').splitlines():
    if mon_base is None and 'DEF SPRITE_POKEMON EQU const_value' in line:
        mon_base = n
    if 'DEF SPRITE_VARS' in line:
        break
    m = re.match(r'\s*const\s+(SPRITE_\w+)', line)
    if m:
        consts[m.group(1)] = n
        n += 1
# OverworldSprites (index 0 = SPRITE_CHRIS = 1): gfx label + palette
rows = re.findall(r'^\s*overworld_sprite\s+(\w+),\s*\d+,\s*\w+,\s*(PAL_OW_\w+)', read('data/sprites/sprites.asm'), re.M)
gfx = dict(re.findall(r'^(\w+)::?\s+INCBIN "([^"]+)\.2bpp"', read('gfx/sprites.asm'), re.M))
PALS = ['PAL_OW_RED', 'PAL_OW_BLUE', 'PAL_OW_GREEN', 'PAL_OW_BROWN', 'PAL_OW_PINK', 'PAL_OW_EMOTE', 'PAL_OW_TREE', 'PAL_OW_ROCK']
# POKeMON: SpriteMons -> species -> MonMenuIcons -> IconPointers -> gfx/icons
sprite_mons = re.findall(r'^\s*db\s+(\w+)', read('data/sprites/sprite_mons.asm'), re.M)
species = []
for line in read('constants/pokemon_constants.asm').splitlines():
    m = re.match(r'\s*const\s+(\w+)', line)
    if m:
        species.append(m.group(1))
    if 'NUM_POKEMON' in line:
        break
menu_icons = re.findall(r'^\s*db\s+(ICON_\w+)', read('data/pokemon/menu_icons.asm'), re.M)
icon_consts = ['ICON_NULL'] + [m for m in re.findall(r'^\s*const\s+(ICON_\w+)', read('constants/icon_constants.asm'), re.M) if m != 'ICON_NULL']
icon_ptrs = re.findall(r'^\s*dw\s+(\w+)', read('data/icon_pointers.asm'), re.M)
icon_gfx = dict(re.findall(r'^(\w+):\s+INCBIN "([^"]+)\.2bpp"', read('gfx/icons.asm'), re.M))

# the DAY palettes: npc_sprites.pal's second block of 8
pal_lines = [l for l in read('gfx/overworld/npc_sprites.pal').splitlines() if l.strip().startswith('RGB')]
def rgb(v):
    return v * 8 + v // 4
day = []
for l in pal_lines[8:16]:
    nums = [int(x) for x in re.findall(r'\d+', l)]
    day.append([tuple(rgb(c) for c in nums[i:i + 3]) for i in range(0, 12, 3)])


def tiles_of(png):
    """the 2bpp tile order rgbgfx uses: 8x8 tiles, row-major across the width"""
    im = Image.open(png).convert('L')
    w, h = im.size
    out = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            out.append(im.crop((tx * 8, ty * 8, tx * 8 + 8, ty * 8 + 8)))
    return out


def shade(v):
    """grayscale 255/170/85/0 -> colour index 0..3"""
    return 3 - round(v / 85)


def paint(gray, pal):
    w, h = gray.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px, gp = out.load(), gray.load()
    for y in range(h):
        for x in range(w):
            i = gp[x, y]
            if i == 255:   # transparent marker (colour 0)
                continue
            c = pal[shade(i)]
            px[x, y] = (c[0], c[1], c[2], 255)
    return out


def facing(name):
    """FacingBigDollSymmetric / Asymmetric -> [(y, x, xflip, tile)]"""
    src = read('data/sprites/facings.asm')
    body = src[src.index(name + ':'):]
    body = body[body.index('\n') + 1:]
    count = int(re.match(r'\s*db (\d+)', body).group(1))
    rows = re.findall(r'^\s*db\s+(\d+),\s*(\d+),\s*(\w+),\s*\$([0-9a-f]+)', body, re.M)[:count]
    return [(int(y), int(x), 'XFLIP' in a, int(t, 16)) for y, x, a, t in rows]


def assemble(png, layout):
    tiles = tiles_of(png)
    im = Image.new('L', (32, 32), 255)
    for y, x, flip, t in layout:
        tile = tiles[t]
        if flip:
            tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
        im.paste(tile, (x, y))
    return im


def picture(sprite):
    n = consts[sprite]
    if mon_base is not None and n >= mon_base:
        mon = sprite_mons[n - mon_base]
        icon = menu_icons[species.index(mon)]
        path = icon_gfx[icon_ptrs[icon_consts.index(icon)]]
        pal = 'PAL_OW_RED'   # _GetSpritePalette: a POKeMON sprite is palette 0
    else:
        label, pal = rows[n - 1]
        path = gfx[label]
    png = os.path.join(CR, path + '.png')
    im = Image.open(png).convert('L')
    if sprite in ('SPRITE_BIG_SNORLAX', 'SPRITE_BIG_LAPRAS'):
        gray = assemble(png, facing('FacingBigDollSymmetric'))
    elif sprite == 'SPRITE_BIG_ONIX':
        # the Makefile builds big_onix.2bpp with --remove-whitespace --remove-xflip,
        # so FacingBigDollAsymmetric's tile numbers index that deduplicated set and
        # rebuild exactly the 32x32 picture the png already holds
        gray = im.crop((0, 0, 32, 32))
    else:
        gray = im.crop((0, 0, 16, 16))   # the still / first frame
    # colour 0 is transparent: mark it before painting (255 = colour 0 = white)
    return paint(gray, day[PALS.index(pal)])


os.makedirs(OUT, exist_ok=True)
pics = {s: picture(s) for s in dict.fromkeys(need)}
width = sum(p.size[0] for p in pics.values())
sheet = Image.new('RGBA', (width, 32), (0, 0, 0, 0))
meta, x = {}, 0
for s, p in pics.items():
    sheet.paste(p, (x, 0))
    meta[s] = {'x': x, 'y': 0, 'w': p.size[0], 'h': p.size[1]}
    x += p.size[0]
sheet.save(os.path.join(OUT, 'sprites.png'))
with open(os.path.join(OUT, 'sprites.json'), 'w', encoding='utf-8') as fh:
    json.dump(meta, fh, indent=1)
    fh.write('\n')
print(f'{len(meta)} decoration sprites -> overworld/deco_gfx/sprites.png')
