#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MicaSurvivor: adds the SpriteCollab artists of newly fetched sprites to the
"| Artista | Contacto | Sprites |" table of micasurvivor/CREDITS.md (which the
in-game Credits screen reads, js/mica/credits.js).

    python tools/micasurvivor/fetch_credits.py --only 593,618,870

Based on upstream PokéSurvivor's tools/fetch_credits.py (JPTER78, HEAD 5bbc3b2).
Upstream rewrote the whole CREDITS.md from a template; ours has sections added
by hand since, and the credits of the original 966 sheets must stay as they
were when those sheets were downloaded. So this one (batch B1) only MERGES:
it reads the existing table, adds the artists of the listed Pokémon (new rows
or new numbers on existing rows) and rewrites only the table's lines.

Each SpriteCollab folder has a credits.txt (no header) with lines
    date <TAB> author <TAB> ...
where the author is a name or a Discord ID ("<@!123...>"), translated with
the credit_names.txt at the repo root. Alternate-form folders (fetch_sprites.FORMS)
are credited from their own folder.
"""
import io
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_sprites import FORMS, ROOT  # noqa: E402

RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'
ASSETS = os.path.join(ROOT, 'assets', 'pokemon')
OUT = os.path.join(ROOT, 'CREDITS.md')


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'micasurvivor/1.0'})
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception:
        return ''


def main():
    if '--only' not in sys.argv:
        print(__doc__)
        sys.exit(1)
    dexes = sorted({int(x) for x in sys.argv[sys.argv.index('--only') + 1].split(',') if x.strip()})

    names = {}
    for line in fetch(f'{RAW}/credit_names.txt').splitlines()[1:]:
        parts = line.split('\t')
        if len(parts) >= 2:
            display = parts[0].strip()
            contact = parts[2].strip() if len(parts) > 2 else ''
            names[parts[1].strip()] = (display, contact)
            names[display] = (display, contact)

    def one(dex):
        base = f'{dex:04d}/{FORMS[dex]}' if dex in FORMS else f'{dex:04d}'
        shiny = f'{base}/0001' if dex in FORMS else f'{base}/0000/0001'
        txt = fetch(f'{RAW}/sprite/{base}/credits.txt')
        if os.path.isdir(os.path.join(ASSETS, str(dex), 's')):
            txt += '\n' + fetch(f'{RAW}/sprite/{shiny}/credits.txt')
        authors = []
        for line in txt.splitlines():
            parts = line.split('\t')
            a = parts[1].strip() if len(parts) > 1 else ''
            if a and names.get(a, (a, ''))[0]:
                authors.append(a)
        return dex, authors

    raw = open(OUT, 'rb').read().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    lines = raw.replace('\r\n', '\n').split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('| Artista |')) + 2
    end = start
    while end < len(lines) and lines[end].startswith('|'):
        end += 1
    rows = {}
    for l in lines[start:end]:
        c = [x.strip() for x in l.split('|')[1:-1]]
        rows[(c[0], c[1])] = [int(x) for x in c[2].split(',') if x.strip()]

    added = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for dex, authors in ex.map(one, dexes):
            if not authors:
                print(f'  ! {dex}: no credits.txt')
            for a in set(authors):
                key = names.get(a, (a, ''))
                got = rows.setdefault(key, [])
                if dex not in got:
                    got.append(dex)
                    added += 1

    table = [f'| {d} | {c} | {", ".join(str(x) for x in sorted(nums))} |'
             for (d, c), nums in sorted(rows.items(), key=lambda kv: kv[0][0].lower())]
    lines[start:end] = table
    with io.open(OUT, 'w', encoding='utf-8', newline='') as f:
        f.write(nl.join(lines))
    print(f'{added} credits added for {len(dexes)} Pokemon; {len(rows)} artists -> micasurvivor/CREDITS.md')


if __name__ == '__main__':
    main()
