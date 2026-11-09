"""Micatro Multiplayer art (stage 7): OUR OWN pixel art for the multiplayer cards, composed in Balatro's style.

Owner rule (Desktop/BalatroMultiplayer_ref/DECISIONS.md D6): the multiplayer cards get our own art, never the mod's (GPL)
and never placeholders. Each card is drawn here at Balatro's 1x size (71 x 95), then doubled (nearest) like the game's
2x sheets:
  * the Joker frame is Balatro's own blank joker card (the base Jokers.png sheet Micatro ships: the border and the
    vertical JOKER lettering), its centre cleared; the background colour / pattern and the motif are drawn here;
  * every motif is drawn from primitives (ellipses, polygons, lines) and hand-placed pixels, flat 2-3 tone shading, and
    an automatic 1-pixel dark outline (Balatro's #4F6367) around each shape group, as the base jokers have;
  * the Asteroid is on Balatro's Planet card frame (Pluto's card, its planet and name cleared), its name in a pixel font
    matching the planet banners, the asteroid drawn here.

  python tools/micatro/gen_mp_art.py      -> micatro/assets/textures/pvp/MPJokers.png (5 x 2 cells, 142 x 190 each)
                                             micatro/assets/textures/pvp/MPPlanets.png (1 cell)
                                             + a 3x preview sheet in $MP_ART_PREVIEW (optional)
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'micatro', 'assets', 'textures')
OUT = os.path.join(TEX, 'pvp')
W, H = 71, 95
OUTLINE = (79, 99, 103, 255)
WHITE = (255, 255, 255, 255)
T = (0, 0, 0, 0)


def rgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def cell(sheet, cx, cy):
    """A 1x cell of a 2x Balatro sheet."""
    return sheet.crop((cx * 142, cy * 190, cx * 142 + 142, cy * 190 + 190)).resize((W, H), Image.NEAREST)


# ------------------------------------------------------------------ the joker frame
def joker_frame(bg='#ffffff', border=None, letters=None, pattern=None):
    """Balatro's joker card: border + JOKER lettering, the centre cleared, the background recoloured."""
    jk = cell(Image.open(os.path.join(TEX, 'Jokers.png')).convert('RGBA'), 0, 0)
    px = jk.load()
    B0, BG0, TX0 = (191, 199, 213), (255, 255, 255), (79, 99, 103)
    bgc = rgb(bg)
    bc = rgb(border) if border else tuple(max(0, int(c * 0.78)) for c in bgc[:3]) + (255,)
    tc = rgb(letters) if letters else OUTLINE
    out = Image.new('RGBA', (W, H), T)
    o = out.load()
    for y in range(H):
        for x in range(W):
            p = px[x, y]
            if p[3] == 0:
                continue
            in_centre = 13 <= x <= 56 and 2 <= y <= 92
            k = p[:3]
            if k == B0:
                o[x, y] = bc
            elif k == TX0 and not in_centre:
                o[x, y] = tc
            else:
                o[x, y] = bgc
    if pattern:
        pattern(out)
    # (the lettering stays on top of any pattern)
    for y in range(H):
        for x in range(W):
            p = px[x, y]
            if p[3] and p[:3] == TX0 and not (13 <= x <= 56 and 2 <= y <= 92):
                o[x, y] = tc
    return out


def inside_card(img, x, y):
    """Is (x, y) on the card's face (not the border, not outside the rounded corners)?"""
    p = img.getpixel((x, y))
    return p[3] > 0 and 2 <= x <= 68 and 2 <= y <= 92


def pat_diamonds(c1, c2, size=6):
    def f(img):
        d = img.load()
        a, b = rgb(c1), rgb(c2)
        for y in range(H):
            for x in range(W):
                if not inside_card(img, x, y):
                    continue
                u, v = (x + y) // size, (x - y + 200) // size
                d[x, y] = a if (u + v) % 2 else b
    return f


def pat_checks(c1, c2, size=5):
    def f(img):
        d = img.load()
        a, b = rgb(c1), rgb(c2)
        for y in range(H):
            for x in range(W):
                if inside_card(img, x, y):
                    d[x, y] = a if ((x // size) + (y // size)) % 2 else b
    return f


def pat_stripes(c1, c2, w=3):
    def f(img):
        d = img.load()
        a, b = rgb(c1), rgb(c2)
        for y in range(H):
            for x in range(W):
                if inside_card(img, x, y):
                    d[x, y] = a if ((x + y) // w) % 2 else b
    return f


def pat_dots(c1, c2, step=6):
    def f(img):
        d = img.load()
        a, b = rgb(c1), rgb(c2)
        for y in range(H):
            for x in range(W):
                if inside_card(img, x, y):
                    d[x, y] = b if (x % step == 0 and y % step == 0) or (x % step == step // 2 and y % step == step // 2) else a
    return f


# ------------------------------------------------------------------ drawing on a motif layer
class Layer:
    """A transparent motif layer; shapes are drawn in flat colours, then outlined as one group."""

    def __init__(self):
        self.img = Image.new('RGBA', (W, H), T)
        self.d = ImageDraw.Draw(self.img)

    def ell(self, box, c):
        self.d.ellipse(box, fill=rgb(c) if isinstance(c, str) else c)

    def rect(self, box, c):
        self.d.rectangle(box, fill=rgb(c) if isinstance(c, str) else c)

    def poly(self, pts, c):
        self.d.polygon(pts, fill=rgb(c) if isinstance(c, str) else c)

    def line(self, pts, c, w=1):
        self.d.line(pts, fill=rgb(c) if isinstance(c, str) else c, width=w)

    def px(self, pts, c):
        col = rgb(c) if isinstance(c, str) else c
        for (x, y) in pts:
            if 0 <= x < W and 0 <= y < H:
                self.img.putpixel((x, y), col)

    def art(self, x0, y0, rows, pal):
        """Hand-placed pixels: rows of characters, each a palette key ('.' = leave)."""
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in pal:
                    self.img.putpixel((x0 + i, y0 + j), rgb(pal[ch]) if isinstance(pal[ch], str) else pal[ch])

    def mask_from(self, other_mask_fn):
        pass

    def outlined(self, col=OUTLINE, diag=False):
        """The layer with a 1-pixel outline around everything drawn (4-neighbours; 8 with diag)."""
        src = self.img.load()
        out = self.img.copy()
        o = out.load()
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if diag else [])
        for y in range(H):
            for x in range(W):
                if src[x, y][3]:
                    continue
                for dx, dy in nb:
                    X, Y = x + dx, y + dy
                    if 0 <= X < W and 0 <= Y < H and src[X, Y][3]:
                        o[x, y] = col
                        break
        return out


def stack(base, *layers):
    out = base.copy()
    for l in layers:
        out.alpha_composite(l)
    return out


def shade_ellipse(L, box, base, light, dark, hl=None):
    """An ellipse with a lit upper-left and a shaded lower-right (Balatro's flat 3-tone look)."""
    x0, y0, x1, y1 = box
    L.ell(box, dark)
    L.ell((x0, y0, x1 - max(1, (x1 - x0) // 8), y1 - max(1, (y1 - y0) // 8)), base)
    w, h = x1 - x0, y1 - y0
    L.ell((x0 + w // 6, y0 + h // 7, x0 + w // 2, y0 + h // 2), light)
    if hl:
        L.ell((x0 + w // 4, y0 + h // 5, x0 + w // 4 + max(1, w // 8), y0 + h // 5 + max(1, h // 8)), hl)


# ------------------------------------------------------------------ the nine jokers
def defensive_joker():
    """Defensive Joker: a knight's heater shield (a heart on its field) with a jester's cap peeking over it."""
    base = joker_frame('#ffffff')
    cap = Layer()
    # the jester cap: three floppy points, red / gold / red, bells
    cap.poly([(26, 26), (20, 14), (16, 18), (24, 30)], '#e8473a')
    cap.poly([(29, 27), (36, 9), (42, 27)], '#fda200')
    cap.poly([(46, 30), (52, 18), (48, 14), (43, 26)], '#e8473a')
    cap.poly([(22, 31), (49, 31), (46, 25), (25, 25)], '#e8473a')
    cap.poly([(36, 9), (37, 12), (40, 27), (38, 27)], '#c97f00')
    cap.ell((13, 15, 17, 19), '#fda200'); cap.ell((34, 6, 38, 10), '#e8473a'); cap.ell((50, 15, 54, 19), '#fda200')
    cap.rect((23, 30, 48, 33), '#ffffff')
    # the shield: silver rim, deep-blue field, a red heart
    sh = Layer()
    rim = [(17, 34), (54, 34), (54, 56), (50, 66), (43, 74), (35.5, 79), (28, 74), (21, 66), (17, 56)]
    sh.poly(rim, '#c9d3dc')
    field = [(20, 37), (51, 37), (51, 56), (47.5, 64), (41.5, 71), (35.5, 75), (29.5, 71), (23.5, 64), (20, 56)]
    sh.poly(field, '#2f6fb5')
    sh.poly([(36, 37), (51, 37), (51, 56), (47.5, 64), (41.5, 71), (36, 75)], '#24599a')
    sh.poly([(20, 37), (27, 37), (20, 46)], '#5d97d6')
    sh.line([(18, 35), (53, 35)], '#eef3f7')
    sh.line([(18, 35), (18, 55)], '#eef3f7')
    # the heart
    sh.ell((26, 46, 35, 55), '#fd5f55'); sh.ell((36, 46, 45, 55), '#fd5f55')
    sh.poly([(26, 51), (45, 51), (35.5, 64)], '#fd5f55')
    sh.poly([(36, 50), (45, 51), (35.5, 64)], '#d8423a')
    sh.px([(29, 48), (30, 48), (28, 49), (28, 50)], '#ffd0cc')
    # rivets
    sh.px([(19, 36), (52, 36), (19, 54), (52, 54), (35, 77)], '#7d8a96')
    return stack(base, cap.outlined(), sh.outlined())


def skip_off():
    """Skip-Off: a Blind chip, and a sneaker bounding over it on a dashed arc."""
    base = joker_frame('#d8f1d0', border='#9cc490', pattern=pat_dots('#d8f1d0', '#bfe3b4'))
    chip = Layer()
    shade_ellipse(chip, (16, 56, 39, 79), '#3d6fd8', '#6d98ec', '#2a52a8')
    chip.ell((21, 61, 34, 74), '#ffffff')
    chip.ell((23, 63, 32, 72), '#3d6fd8')
    for (x, y) in [(27, 56), (27, 78), (16, 67), (38, 67)]:
        chip.rect((x - 1, y - 1, x + 1, y + 1), '#ffffff')
    chip.px([(26, 66), (27, 66), (28, 66), (27, 65), (27, 67), (27, 68), (26, 68), (28, 68)], '#ffffff')  # a little 'S'
    arc = Layer()
    import math
    pts = []
    for i in range(0, 41):
        t = i / 40
        x = 14 + t * 38
        y = 64 - math.sin(t * math.pi) * 40
        pts.append((round(x), round(y)))
    for i, (x, y) in enumerate(pts):
        if (i // 3) % 2 == 0:
            arc.px([(x, y), (x, y + 1)], '#3c9a43')
    # the arrow head (landing)
    arc.poly([(48, 60), (54, 59), (51, 66)], '#3c9a43')
    shoe = Layer()
    # a high-top sneaker in mid-leap, at the top of the arc
    shoe.poly([(27, 16), (37, 16), (38, 26), (46, 28), (48, 32), (48, 36), (25, 36), (25, 26)], '#fd5f55')
    shoe.poly([(25, 33), (48, 33), (48, 36), (25, 36)], '#ffffff')
    shoe.poly([(25, 36), (48, 36), (47, 38), (26, 38)], '#c9d3dc')
    shoe.poly([(27, 16), (37, 16), (37, 18), (27, 18)], '#ffffff')
    shoe.poly([(37, 26), (46, 28), (48, 32), (40, 31)], '#d8423a')
    shoe.px([(30, 21), (31, 21), (32, 21), (30, 24), (31, 24), (32, 24), (30, 27), (31, 27), (32, 27)], '#ffffff')
    shoe.ell((33, 28, 37, 32), '#ffffff')
    shoe.px([(34, 29), (35, 30)], '#3d6fd8')
    lines = Layer()
    for y, x0 in [(22, 12), (27, 9), (32, 13)]:
        lines.line([(x0, y), (x0 + 9, y)], '#7fb876')
    return stack(base, lines.img, chip.outlined(), arc.img, shoe.outlined())


def lets_go_gambling():
    """Let's Go Gambling: a one-armed bandit showing 7 7 7, its lever pulled."""
    base = joker_frame('#5a2a6e', border='#3b1a49', letters='#ffffff', pattern=pat_diamonds('#5a2a6e', '#6b3583', 6))
    m = Layer()
    # the cabinet
    m.rect((14, 26, 46, 78), '#d8423a')
    m.rect((14, 26, 17, 78), '#fd7a6f')
    m.rect((43, 26, 46, 78), '#a8302a')
    m.poly([(14, 26), (46, 26), (42, 18), (18, 18)], '#fda200')
    m.poly([(18, 18), (42, 18), (40, 15), (20, 15)], '#ffc94a')
    # the marquee lights
    for x in range(20, 41, 4):
        m.px([(x, 21), (x + 1, 21)], '#ffffff')
    # the reels window
    m.rect((16, 33, 44, 50), '#4f6367')
    for i, x0 in enumerate((17, 26, 35)):
        m.rect((x0, 34, x0 + 7, 49), '#ffffff')
        m.rect((x0, 34, x0 + 7, 36), '#d9e1e8')
        m.rect((x0, 47, x0 + 7, 49), '#d9e1e8')
        # a red 7
        m.art(x0 + 1, 37, [
            'aaaaaa',
            '....aa',
            '...aa.',
            '...aa.',
            '..aa..',
            '..aa..',
            '..aa..',
            '.aa...',
        ], {'a': '#e0282e'})
    # the payout tray + coins
    m.rect((18, 60, 42, 70), '#7a1f1a')
    m.rect((19, 61, 41, 64), '#4f6367')
    for x in (20, 25, 30, 35):
        m.ell((x, 64, x + 4, 68), '#fda200')
        m.px([(x + 1, 65)], '#ffe28a')
    m.rect((16, 54, 44, 56), '#fda200')
    # the lever
    lev = Layer()
    lev.rect((47, 50, 49, 55), '#c9d3dc')
    lev.line([(50, 52), (53, 38)], '#c9d3dc', 2)
    lev.ell((50, 31, 56, 37), '#e0282e')
    lev.px([(52, 33)], '#ffb3ad')
    return stack(base, m.outlined(), lev.outlined())


def speedrun():
    """SPEEDRUN: a stopwatch at the start of its run, a lightning bolt across it."""
    base = joker_frame('#ffffff')
    w = Layer()
    w.rect((32, 15, 39, 19), '#c9d3dc')
    w.rect((30, 12, 41, 15), '#e0282e')
    w.poly([(46, 20), (50, 17), (53, 20), (49, 23)], '#c9d3dc')
    shade_ellipse(w, (14, 20, 57, 63), '#c9d3dc', '#eef3f7', '#8d9aa6')
    w.ell((19, 25, 52, 58), '#ffffff')
    w.ell((19, 25, 52, 58), '#ffffff')
    face = Layer()
    import math
    for k in range(12):
        a = k * math.pi / 6
        x, y = 35.5 + math.sin(a) * 14, 41.5 - math.cos(a) * 14
        face.px([(round(x), round(y))], '#4f6367')
        if k % 3 == 0:
            face.px([(round(35.5 + math.sin(a) * 12.5), round(41.5 - math.cos(a) * 12.5))], '#4f6367')
    # a red sweep hand and its trail
    face.line([(35, 41), (45, 32)], '#e0282e', 1)
    face.line([(36, 41), (46, 33)], '#e0282e', 1)
    for i, (x, y) in enumerate([(38, 30), (41, 30), (43, 31)]):
        face.px([(x, y)], '#ffb3ad')
    face.ell((33, 39, 38, 44), '#4f6367')
    face.px([(35, 41)], '#c9d3dc')
    bolt = Layer()
    bolt.poly([(22, 55), (34, 62), (29, 66), (46, 79), (31, 70), (35, 66), (18, 59)], '#fda200')
    bolt.poly([(22, 55), (34, 62), (31, 63), (20, 57)], '#ffd84a')
    return stack(base, w.outlined(), face.img, bolt.outlined())


def conjoined_joker():
    """Conjoined Joker: two jesters' heads on one shared ruff (one red cap, one blue)."""
    base = joker_frame('#ffffff')
    L = Layer()
    # the shared ruff
    for i, x in enumerate(range(15, 50, 7)):
        L.poly([(x, 58), (x + 7, 58), (x + 3.5, 72)], '#fda200' if i % 2 == 0 else '#e8473a')
    L.rect((15, 54, 55, 59), '#ffffff')
    L.ell((31, 66, 40, 75), '#ffffff')
    L.px([(35, 70), (36, 70)], '#4f6367')
    heads = Layer()
    for cx, hat, hat2 in ((25, '#e8473a', '#b8352b'), (46, '#3d6fd8', '#2a52a8')):
        # face
        heads.ell((cx - 9, 34, cx + 9, 56), '#ffe9d6')
        heads.ell((cx - 9, 34, cx + 7, 54), '#fff4ea')
        # cap: two points + band
        heads.poly([(cx - 10, 37), (cx - 14, 20), (cx - 2, 31)], hat)
        heads.poly([(cx + 10, 37), (cx + 13, 20), (cx + 2, 31)], hat2)
        heads.poly([(cx - 3, 32), (cx, 15), (cx + 3, 32)], hat)
        heads.rect((cx - 10, 33, cx + 10, 37), hat)
        heads.ell((cx - 16, 17, cx - 12, 21), '#fda200'); heads.ell((cx + 11, 17, cx + 15, 21), '#fda200'); heads.ell((cx - 2, 12, cx + 2, 16), '#fda200')
        # eyes + grin
        heads.px([(cx - 4, 42), (cx - 4, 43), (cx + 3, 42), (cx + 3, 43)], '#4f6367')
        heads.poly([(cx - 5, 47), (cx + 5, 47), (cx + 3, 51), (cx - 3, 51)], '#fd5f55')
        heads.line([(cx - 4, 48), (cx + 4, 48)], '#ffffff')
        heads.px([(cx - 7, 46), (cx + 6, 46)], '#ffb3ad')
    return stack(base, L.outlined(), heads.outlined())


def penny_pincher():
    """Penny Pincher: a copper penny squeezed in a pair of pincers."""
    base = joker_frame('#f4e4c4', border='#c8b48c', pattern=pat_checks('#f4e4c4', '#efdcb6', 4))
    coin = Layer()
    shade_ellipse(coin, (18, 42, 53, 77), '#d07a36', '#eaa161', '#9c5420')
    coin.ell((23, 47, 48, 72), '#c26c2a')
    coin.ell((24, 48, 47, 71), '#d98a45')
    # a big '1' + a cent mark
    coin.art(30, 52, [
        '.aa..',
        'aaa..',
        '.aa..',
        '.aa..',
        '.aa..',
        '.aa..',
        '.aa..',
        'aaaa.',
    ], {'a': '#7a3c12'})
    coin.art(37, 55, [
        '.a..',
        'aaa.',
        'a...',
        'a...',
        'aaa.',
        '.a..',
    ], {'a': '#7a3c12'})
    coin.px([(25, 50), (26, 49), (27, 49)], '#ffd2a0')
    pin = Layer()
    # the pincers: two arms from a hinge (top), their tips biting the coin's rim
    pin.poly([(33, 12), (38, 12), (33, 46), (29, 46)], '#aab6c2')
    pin.poly([(38, 12), (42, 14), (45, 46), (41, 46)], '#8d9aa6')
    pin.poly([(26, 44), (33, 44), (33, 49), (28, 49)], '#aab6c2')
    pin.poly([(41, 44), (48, 44), (46, 49), (41, 49)], '#8d9aa6')
    pin.ell((33, 9, 42, 18), '#c9d3dc')
    pin.ell((36, 12, 39, 15), '#4f6367')
    pin.line([(32, 20), (31, 40)], '#eef3f7')
    # strain marks
    sm = Layer()
    sm.px([(22, 40), (21, 39), (20, 38), (50, 40), (51, 39), (52, 38), (19, 44), (18, 44), (53, 44), (54, 44)], '#9c5420')
    return stack(base, coin.outlined(), pin.outlined(), sm.img)


def taxes():
    """Taxes: a tax form with a red 'paid' stamp, a stack of coins and a pen."""
    base = joker_frame('#dfe9f0', border='#a9bccb', pattern=pat_stripes('#dfe9f0', '#d3e0ea', 3))
    paper = Layer()
    paper.poly([(17, 14), (47, 14), (54, 21), (54, 74), (17, 74)], '#ffffff')
    paper.poly([(47, 14), (54, 21), (47, 21)], '#d9e1e8')
    # the form's lines + boxes
    form = Layer()
    form.rect((21, 18, 38, 20), '#4f6367')
    for y in range(26, 64, 5):
        form.line([(21, y), (48, y)], '#b8c6d2')
        form.rect((44, y - 3, 48, y - 1), '#eef3f7')
    form.px([(45, 22), (46, 23), (47, 22)], '#3c9a43')
    # the stamp: a red box with TAX in it
    st2 = Layer()
    st2.rect((22, 44, 45, 57), '#e0282e')
    st2.rect((24, 46, 43, 55), (0, 0, 0, 0))
    st2.art(26, 47, [
        'aaa.aa..a.a',
        '.a.a..a.a.a',
        '.a.aaaa..a.',
        '.a.a..a.a.a',
        '.a.a..a.a.a',
    ], {'a': '#e0282e'})
    # coins
    c = Layer()
    for i, y in enumerate((76, 73, 70, 67)):
        c.ell((40, y, 55, y + 6), '#fda200')
        c.line([(41, y + 4), (54, y + 4)], '#c97f00')
    c.px([(44, 68), (45, 68)], '#ffe28a')
    # the pen
    pen = Layer()
    pen.poly([(15, 70), (19, 66), (34, 81), (30, 85)], '#3d6fd8')
    pen.poly([(30, 85), (34, 81), (36, 87)], '#ffe9d6')
    pen.px([(35, 86)], '#4f6367')
    return stack(base, paper.outlined(), form.img, st2.img, c.outlined(), pen.outlined())


def pizza():
    """Pizza: a slice (crust, cheese, pepperoni) lifting from the pie, a string of cheese."""
    base = joker_frame('#ffffff', pattern=pat_checks('#ffffff', '#fbe2e0', 6))
    s = Layer()
    # the crust (top) and the slice pointing down
    s.poly([(14, 22), (57, 22), (35.5, 80)], '#ffd25a')
    s.poly([(36, 22), (57, 22), (36, 80)], '#f2bd3c')
    s.poly([(13, 17), (58, 17), (58, 24), (13, 24)], '#d48a3c')
    s.poly([(13, 17), (58, 17), (57, 19), (14, 19)], '#e9a95a')
    s.px([(18, 21), (24, 21), (31, 20), (39, 21), (47, 20), (53, 21)], '#a8642a')
    # cheese drips past the edge
    s.poly([(20, 38), (24, 38), (22, 46)], '#ffd25a')
    s.poly([(48, 44), (51, 40), (52, 50)], '#f2bd3c')
    pep = Layer()
    for (x, y, r) in ((25, 30, 4), (41, 31, 4), (33, 45, 4), (38, 60, 3), (27, 44, 2)):
        pep.ell((x - r, y - r, x + r, y + r), '#d8423a')
        pep.px([(x - 1, y - 1)], '#fd7a6f')
        pep.px([(x + 1, y + 1)], '#a8302a')
    basil = Layer()
    basil.px([(31, 36), (32, 36), (32, 37), (45, 47), (46, 47), (29, 56), (30, 55)], '#3c9a43')
    return stack(base, s.outlined(), pep.img, basil.img)


def pacifist():
    """Pacifist: a white dove carrying an olive branch, over a peace sign."""
    base = joker_frame('#cfe7f7', border='#8fb6cf', pattern=pat_dots('#cfe7f7', '#e6f3fb', 7))
    ps = Layer()
    ps.ell((16, 30, 56, 70), '#3d6fd8')
    d = ImageDraw.Draw(ps.img)
    d.ellipse((20, 34, 52, 66), fill=(0, 0, 0, 0))
    ps.rect((34, 32, 37, 68), '#3d6fd8')
    ps.line([(35, 50), (23, 62)], '#3d6fd8', 3)
    ps.line([(36, 50), (48, 62)], '#3d6fd8', 3)
    dove = Layer()
    # body
    dove.ell((22, 16, 46, 32), '#ffffff')
    dove.ell((40, 14, 51, 24), '#ffffff')
    # wings up
    dove.poly([(28, 22), (18, 8), (36, 18)], '#eef3f7')
    dove.poly([(32, 21), (38, 4), (42, 19)], '#ffffff')
    # tail
    dove.poly([(24, 24), (13, 30), (15, 33), (25, 29)], '#eef3f7')
    # beak + eye
    dove.poly([(51, 18), (55, 19), (51, 21)], '#fda200')
    dove.px([(46, 18)], '#4f6367')
    dove.px([(30, 27), (31, 27), (32, 28), (35, 28), (36, 28)], '#d9e1e8')
    branch = Layer()
    branch.line([(53, 21), (58, 30)], '#7a5a2a')
    branch.ell((55, 22, 59, 25), '#3c9a43'); branch.ell((52, 26, 56, 29), '#3c9a43'); branch.ell((57, 28, 61, 31), '#57b85e')
    return stack(base, ps.outlined(), dove.outlined(), branch.outlined())


# ------------------------------------------------------------------ the Asteroid (a Planet card)
BANNER_FONT = {
    'A': ['.bb.', 'b..b', 'b..b', 'bbbb', 'b..b', 'b..b'],
    'S': ['.bbb', 'b...', '.bb.', '...b', '...b', 'bbb.'],
    'T': ['bbbb', '.bb.', '.bb.', '.bb.', '.bb.', '.bb.'],
    'E': ['bbbb', 'bb..', 'bbb.', 'bb..', 'bb..', 'bbbb'],
    'R': ['bbb.', 'bb.b', 'bb.b', 'bbb.', 'bb.b', 'bb.b'],
    'O': ['.bb.', 'b..b', 'b..b', 'b..b', 'b..b', '.bb.'],
    'I': ['bb', 'bb', 'bb', 'bb', 'bb', 'bb'],
    'D': ['bbb.', 'bb.b', 'bb.b', 'bb.b', 'bb.b', 'bbb.'],
}


def asteroid():
    pl = cell(Image.open(os.path.join(TEX, 'Tarots.png')).convert('RGBA'), 8, 3)   # Pluto's card: the planet frame
    px = pl.load()
    SPACE, STAR, BANNER, INK = (91, 155, 170, 255), (79, 99, 103, 255), (223, 245, 252, 255), (79, 99, 103, 255)
    # clear the planet (rows 36-66, the space between the banner and the bottom panel) to plain space, keep a few stars
    for y in range(29, 76):
        for x in range(6, 65):
            p = px[x, y]
            if p[:3] != (91, 155, 170) and not (p[:3] == (79, 99, 103) and (x <= 4 or x >= 66)):
                px[x, y] = SPACE
    # the name: clear the banner text (rows 19-24), write ASTEROID centred
    for y in range(18, 26):
        for x in range(12, 59):
            if px[x, y][:3] == (79, 99, 103):
                px[x, y] = BANNER
    word = 'ASTEROID'
    widths = [len(BANNER_FONT[c][0]) for c in word]
    total = sum(widths) + (len(word) - 1)
    x = 35 - total // 2
    for c, w in zip(word, widths):
        for j, row in enumerate(BANNER_FONT[c]):
            for i, ch in enumerate(row):
                if ch == 'b':
                    px[x + i, 19 + j] = INK
        x += w + 1
    # the bottom panel's box: a down arrow (a level taken away)
    for y in range(80, 90):
        for x in range(28, 35):
            if px[x, y][:3] == (223, 245, 252):
                pass
    arrow = [(31, 82), (31, 83), (31, 84), (31, 85), (30, 85), (32, 85), (29, 84), (33, 84), (31, 86)]
    for (x, y) in arrow:
        px[x, y] = (224, 40, 46, 255)
    out = pl
    # stars
    stars = Layer()
    for (x, y) in [(10, 33), (57, 35), (14, 62), (55, 66), (22, 70), (48, 31), (9, 50), (61, 52)]:
        stars.px([(x, y)], '#ffffff')
    stars.px([(57, 34), (56, 35), (58, 35), (57, 36)], '#dff5fc')
    # the asteroid: an irregular rock, lit from the upper left, craters, trailing fragments
    rock = Layer()
    body = [(22, 42), (30, 35), (40, 34), (48, 39), (51, 47), (49, 57), (42, 64), (31, 65), (23, 59), (19, 50)]
    rock.poly(body, '#8a7f74')
    rock.poly([(22, 42), (30, 35), (40, 34), (44, 37), (33, 41), (25, 48), (20, 52), (19, 50)], '#b3a89b')
    rock.poly([(49, 57), (42, 64), (31, 65), (38, 60), (46, 52), (51, 47)], '#6b6158')
    for (x, y, r) in ((31, 46, 3), (42, 52, 3), (27, 56, 2), (40, 42, 2)):
        rock.ell((x - r, y - r, x + r, y + r), '#6b6158')
        rock.px([(x - r + 1, y - r + 1)], '#5a5149')
        rock.px([(x + r - 1, y + r - 1)], '#a39889')
    frags = Layer()
    for (x, y, s) in ((54, 63, 2), (14, 38, 2), (57, 45, 1), (17, 66, 1)):
        frags.ell((x - s, y - s, x + s, y + s), '#8a7f74')
    trail = Layer()
    for i, (x, y) in enumerate([(52, 36), (55, 33), (58, 30), (54, 39), (57, 36)]):
        trail.px([(x, y)], '#dff5fc' if i % 2 else '#ffffff')
    return stack(out, stars.img, trail.img, rock.outlined(), frags.outlined())


JOKERS = [
    ('j_mp_defensive_joker', defensive_joker),
    ('j_mp_skip_off', skip_off),
    ('j_mp_lets_go_gambling', lets_go_gambling),
    ('j_mp_speedrun', speedrun),
    ('j_mp_conjoined_joker', conjoined_joker),
    ('j_mp_penny_pincher', penny_pincher),
    ('j_mp_taxes', taxes),
    ('j_mp_pizza', pizza),
    ('j_mp_pacifist', pacifist),
]


def x2(img):
    return img.resize((img.width * 2, img.height * 2), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.new('RGBA', (142 * 5, 190 * 2), T)
    for i, (key, fn) in enumerate(JOKERS):
        sheet.alpha_composite(x2(fn()), ((i % 5) * 142, (i // 5) * 190))
    sheet.save(os.path.join(OUT, 'MPJokers.png'))
    planets = Image.new('RGBA', (142, 190), T)
    planets.alpha_composite(x2(asteroid()), (0, 0))
    planets.save(os.path.join(OUT, 'MPPlanets.png'))
    prev = os.environ.get('MP_ART_PREVIEW')
    if prev:
        cards = [fn() for _, fn in JOKERS] + [asteroid()]
        p = Image.new('RGBA', (W * 5 + 24, H * 2 + 12), (40, 44, 52, 255))
        for i, c in enumerate(cards):
            p.alpha_composite(c, (4 + (i % 5) * (W + 4), 4 + (i // 5) * (H + 4)))
        p.resize((p.width * 3, p.height * 3), Image.NEAREST).save(prev)
    print('wrote', os.path.join(OUT, 'MPJokers.png'), os.path.join(OUT, 'MPPlanets.png'))


if __name__ == '__main__':
    sys.exit(main())
