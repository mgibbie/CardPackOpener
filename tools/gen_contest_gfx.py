# gen_contest_gfx.py — pokeemerald's Pokémon Contest graphics, converted for the web port.
#
# Reads pokeemerald graphics/contest/ and composes it the way src/contest.c
# (SetupContestGraphics) and src/contest_util.c (the results screen) lay it out
# on the GBA, into tracked sheets under overworld/minigames/contest/:
#
#   stage.png      240x160  the appeal screen: BG3 = audience.bin over the audience
#                           tiles (VRAM 0x2000, i.e. tile 256+), BG2 = interface.bin on
#                           top (colour 0 of each palette bank cut), palette
#                           interface.gbapal (= interface.png's 256 colours)
#   results_C_R.png         the results board (bg.bin under interface.bin, the rank +
#                           category title rects of LoadContestResultsTitleBarTilemaps
#                           and the category palette on its top four rows), for each
#                           category C 0-4 and rank R 0-3
#   sprites.png + sprites.json   the OBJ pieces and the BG0 symbol tiles the screen draws:
#                           judge, judge speech symbols, applause label + meter, slider
#                           heart, next-turn plates/numbers, appeal hearts (red/black per
#                           contestant palette 5-8), condition star, status symbols
#
#   python tools/gen_contest_gfx.py
import json
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EM = 'C:/Users/guide/Desktop/Magepunk66/Reference/pokeemerald/graphics/contest'
OUT = os.path.join(ROOT, 'overworld', 'minigames', 'contest')
os.makedirs(OUT, exist_ok=True)


def load_tiles(path):
    im = Image.open(path)
    w, h = im.size
    px = im.load()
    tiles = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            tiles.append([[px[tx * 8 + x, ty * 8 + y] for x in range(8)] for y in range(8)])
    return tiles, im.getpalette()


def pal_rgb(pal, i):
    return (pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2])


def read_map(path):
    data = open(path, 'rb').read()
    return [int.from_bytes(data[i:i + 2], 'little') for i in range(0, len(data), 2)]


def draw_entry(img, x, y, e, tiles, pal, transparent=True, pal_override=None):
    idx = e & 0x3FF
    hf = (e >> 10) & 1
    vf = (e >> 11) & 1
    bank = (e >> 12) & 0xF
    if callable(pal_override):
        bank = pal_override(bank)
    elif pal_override is not None:
        bank = pal_override
    if idx >= len(tiles):
        return
    t = tiles[idx]
    for py in range(8):
        for px in range(8):
            c = t[7 - py if vf else py][7 - px if hf else px] & 0xF
            if c == 0 and transparent:
                continue
            r, g, b = pal_rgb(pal, bank * 16 + c)
            img.putpixel((x + px, y + py), (r, g, b, 255))


def render_map(img, entries, tiles, pal, width=32, transparent=True, rows=None, pal_rows=None):
    for i, e in enumerate(entries):
        tx, ty = i % width, i // width
        if tx >= 30 or ty >= 20:
            continue
        if rows is not None and ty not in rows:
            continue
        po = pal_rows.get(ty) if pal_rows else None
        draw_entry(img, tx * 8, ty * 8, e, tiles, pal, transparent, po)


# ---------- the appeal stage ----------
iface_tiles, iface_pal = load_tiles(f'{EM}/interface.png')
aud_tiles, _ = load_tiles(f'{EM}/audience.png')
vram = iface_tiles + aud_tiles  # interface at tile 0, audience at VRAM+0x2000 = tile 256
stage = Image.new('RGBA', (240, 160), pal_rgb(iface_pal, 0) + (255,))
render_map(stage, read_map(f'{EM}/audience.bin'), vram, iface_pal, transparent=False)
render_map(stage, read_map(f'{EM}/interface.bin'), vram, iface_pal)
stage.save(os.path.join(OUT, 'stage.png'))
# the contestant boxes take their contestant's palette (DrawContestantWindows loads
# contestant i's window palette into the slot it appeals from): slot 0's box,
# re-rendered with banks 5-8 mapped to contestant k's bank 5+k
iface_map = read_map(f'{EM}/interface.bin')
for k in range(4):
    box = Image.new('RGBA', (96, 40), (0, 0, 0, 0))
    for ty in range(5):
        for tx in range(18, 30):
            draw_entry(box, (tx - 18) * 8, ty * 8, iface_map[ty * 32 + tx], vram, iface_pal,
                       pal_override=lambda b, k=k: 5 + k if 5 <= b <= 8 else b)
    box.save(os.path.join(OUT, f'box{k}.png'))

# ---------- the results board ----------
res_tiles, res_pal = load_tiles(f'{EM}/results_screen/tiles.png')
RANK_TITLES = ['title_normal', 'title_super', 'title_hyper', 'title_master']
CAT_TITLES = ['title_cool', 'title_beauty', 'title_cute', 'title_smart', 'title_tough']
for c in range(5):
    for r in range(4):
        bg2 = read_map(f'{EM}/results_screen/interface.bin')

        def put(name, x, y, w, h):
            src = read_map(f'{EM}/results_screen/{name}.bin')
            for j in range(h):
                for i in range(w):
                    bg2[(y + j) * 32 + x + i] = src[j * w + i]
        put(RANK_TITLES[r], 5, 1, 10, 2)
        put(CAT_TITLES[c], 15, 1, 5, 2)
        put('title', 20, 1, 6, 2)
        img = Image.new('RGBA', (240, 160), pal_rgb(res_pal, 0) + (255,))
        render_map(img, read_map(f'{EM}/results_screen/bg.bin'), res_tiles, res_pal, transparent=False)
        render_map(img, bg2, res_tiles, res_pal, pal_rows={0: c, 1: c, 2: c, 3: c})
        img.save(os.path.join(OUT, f'results_{c}_{r}.png'))

# ---------- the sprite sheet ----------
sheet = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
rects = {}
cursor = [0, 0, 0]  # x, y, row height


def place(name, im):
    w, h = im.size
    if cursor[0] + w > 256:
        cursor[0] = 0
        cursor[1] += cursor[2]
        cursor[2] = 0
    sheet.paste(im, (cursor[0], cursor[1]))
    rects[name] = [cursor[0], cursor[1], w, h]
    cursor[0] += w
    cursor[2] = max(cursor[2], h)


def obj(path, bank=None):
    im = Image.open(path)
    pal = im.getpalette()
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            i = px[x, y]
            if i % 16 == 0:
                continue
            j = (bank * 16 + i % 16) if bank is not None else i
            out.putpixel((x, y), pal_rgb(pal, j) + (255,))
    return out


def crop(im, x, y, w, h):
    return im.crop((x, y, x + w, y + h))


judge = obj(f'{EM}/judge.png')
place('judge', crop(judge, 0, 0, 64, 64))
syms = obj(f'{EM}/judge_symbols.png')
for i in range(7):
    place(f'symbol{i}', crop(syms, 0, i * 16, 16, 16))
place('applause', obj(f'{EM}/applause.png'))
meter = obj(f'{EM}/applause_meter.png')
place('meter_off', crop(meter, 0, 0, 8, 16))
place('meter_on', crop(meter, 0, 16, 8, 16))
place('slider_heart', obj(f'{EM}/slider_heart.png'))
nt = obj(f'{EM}/nextturn.png')
place('nextturn', nt)
ntn = obj(f'{EM}/nextturn_numbers.png')
for i in range(ntn.size[1] // 8):
    place(f'nextturn_n{i}', crop(ntn, 0, i * 8, 8, 8))
place('nextturn_random', obj(f'{EM}/nextturn_random.png'))


def bg_tile(entry):
    im = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
    draw_entry(im, 0, 0, entry, iface_tiles, iface_pal)
    return im


for k in range(4):
    place(f'heart_red{k}', bg_tile(0x5012 + k * 0x1000))
    place(f'heart_black{k}', bg_tile(0x5014 + k * 0x1000))
    place(f'heart_empty{k}', bg_tile(0x5035 + k * 0x1000))
place('star', bg_tile(0x2034))
for name, off in [('stat_circle', 0x80), ('stat_square', 0x82), ('stat_wave', 0x84), ('stat_x', 0x86), ('stat_swirl', 0x88)]:
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    im.paste(bg_tile(0x9000 + off), (0, 0))
    im.paste(bg_tile(0x9000 + off + 1), (8, 0))
    im.paste(bg_tile(0x9000 + off + 16), (0, 8))
    im.paste(bg_tile(0x9000 + off + 17), (8, 8))
    place(name, im)

sheet = sheet.crop((0, 0, 256, cursor[1] + cursor[2]))
sheet.save(os.path.join(OUT, 'sprites.png'))
json.dump({'generated': 'tools/gen_contest_gfx.py', 'rects': rects}, open(os.path.join(OUT, 'sprites.json'), 'w'))
print('contest gfx ->', OUT, len(rects), 'sprites')
