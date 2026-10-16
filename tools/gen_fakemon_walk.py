"""gen_fakemon_walk.py — real overworld walking art for the fakemon that have any.

The 623 fakemon (CAP, Uranium, Radical Ransei) have no Following-Pokemon charsets: none of the
Essentials packs on this PC carry them (PokemonZero2024, QgameMVP), Radical Ransei's own
Graphics/Characters holds 49 charsets that are all real Pokemon, and nothing turned up online
(2026-10-16). So overworld/ow_follower.js shows a fakemon follower as a shrunken battle sprite
(followMini). The one exception is Sakurovix: Radical Ransei ships
Graphics/Characters/sakurovix.png, a 48x96 sheet of 2 walk frames x 4 rows of 24px
(rows: down, up, left, right — the right row is the left row mirrored).

Writes, in the same formats the real species use:
  data/pokemon_follow/<id>.png  128x128, a 4x4 grid of 32px frames, rows down/left/right/up,
                                cols the walk cycle (stand, step, stand, step); each 24px frame
                                is placed at native size, bottom-centred (no non-integer scaling)
  data/pokemon_ow/<id>.png      the down/stand frame, trimmed, x2 nearest (~40px tall like the rest)
and adds <id> to overworld/pokemon_ow_index.json. ow_follower.js lists the ids in FAKEMON_SHEETS.

  python tools/gen_fakemon_walk.py            (report)
  python tools/gen_fakemon_walk.py --write    (apply)
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = os.path.join(ROOT, 'overworld', 'data')
RANSEI = os.path.join(os.path.expanduser('~'), 'Desktop', 'Projects', 'Programming', 'RPGMaker Archive from Old Comp', 'Radical Ransei', 'Graphics', 'Characters')
WRITE = '--write' in sys.argv

# id -> (source file, frame px, row index for each of our rows down/left/right/up, walk cols)
SOURCES = {
    'sakurovix': ('sakurovix.png', 24, {'down': 0, 'left': 2, 'right': 3, 'up': 1}, [0, 1, 0, 1]),
}
OUR_ROWS = ['down', 'left', 'right', 'up']
CELL = 32


def build(sid, fname, fpx, rows, cols):
    src = Image.open(os.path.join(RANSEI, fname)).convert('RGBA')
    sheet = Image.new('RGBA', (CELL * 4, CELL * 4), (0, 0, 0, 0))
    for r, name in enumerate(OUR_ROWS):
        for c, sc in enumerate(cols):
            fr = src.crop((sc * fpx, rows[name] * fpx, (sc + 1) * fpx, (rows[name] + 1) * fpx))
            sheet.alpha_composite(fr, (c * CELL + (CELL - fpx) // 2, r * CELL + (CELL - fpx)))
    stand = src.crop((0, rows['down'] * fpx, fpx, (rows['down'] + 1) * fpx))
    stand = stand.crop(stand.getbbox())
    ow = stand.resize((stand.width * 2, stand.height * 2), Image.NEAREST)
    return sheet, ow


def main():
    bat = json.load(open(os.path.join(D, 'species_battle.json'), encoding='utf-8'))
    idx_path = os.path.join(ROOT, 'overworld', 'pokemon_ow_index.json')
    idx = json.load(open(idx_path, encoding='utf-8'))
    for sid, (fname, fpx, rows, cols) in SOURCES.items():
        assert sid in bat and bat[sid]['num'] < 0, sid
        sheet, ow = build(sid, fname, fpx, rows, cols)
        print(f'{sid}: follow sheet {sheet.size}, ow sprite {ow.size}')
        if WRITE:
            sheet.save(os.path.join(D, 'pokemon_follow', sid + '.png'))
            ow.save(os.path.join(D, 'pokemon_ow', sid + '.png'))
            if sid not in idx:
                idx.append(sid)
    if WRITE:
        idx.sort()
        with open(idx_path, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(idx, separators=(',', ':')))  # the file has no trailing newline
    print(f'{len(SOURCES)} fakemon with real walking art {"written" if WRITE else "(dry run)"}')


if __name__ == '__main__':
    main()
