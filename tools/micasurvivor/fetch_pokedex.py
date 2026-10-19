#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baja una sola vez los datos de PokeAPI y los deja en js/data/pokedex.js.
A partir de ahi el juego no toca internet: todo es local.

    python tools/micasurvivor/fetch_pokedex.py

Trae nombre en espanol, tipos, stats base y altura, y de ahi deriva los stats
del juego y la rareza para el gacha.

MicaSurvivor: vendored from upstream PokéSurvivor's tools/fetch_pokedex.py (JPTER78, HEAD 5bbc3b2).
Changed for batch B1 "complete the Pokédex" (Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md, owner 2026-10-19):
  - the Pokémon listed are the ones with sheets in micasurvivor/js/data/sprites-meta.js (made by
    tools/micasurvivor/fetch_sprites.py) instead of the SpriteCollab tracker's Idle + Walk + Attack test:
    the sprite generator decides what is usable (its FALLBACK table, its alternate-form folders) and the
    Pokédex follows it, so the two files never disagree;
  - paths point at micasurvivor/, and the file keeps its line endings (CRLF in this repo).
Everything else (stat formula, rarity, starters, row format) is upstream's, unchanged: re-running it
reproduces the original 966 rows byte for byte.
"""
import io
import json
import os
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'https://pokeapi.co/api/v2'
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'micasurvivor')
OUT = os.path.join(ROOT, 'js', 'data', 'pokedex.js')

STARTERS = {1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
            650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912, 54, 79}
# Último Pokémon de cada generación.
GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025]


def gen_of(dex):
    for g, end in enumerate(GEN_END, 1):
        if dex <= end:
            return g
    return 9


def dexes_with_sprites():
    """Sólo los que tienen sprite de Mundo Misterioso: los de sprites-meta.js (fetch_sprites.py)."""
    meta = open(os.path.join(ROOT, 'js', 'data', 'sprites-meta.js'), encoding='utf-8').read()
    return sorted(int(d) for d in re.findall(r'^\s*(\d+): \{', meta, re.M) if 1 <= int(d) <= 1025)


def get(url, retries=3):
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'micasurvivor/1.0'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
    return None


def rarity(bst, dex, is_legendary, is_mythical):
    """5 estrellas = legendarios y pseudolegendarios; 1 = los mas comunes."""
    if is_mythical or is_legendary:
        return 5
    if bst >= 580:
        return 5
    if bst >= 495:
        return 4
    if bst >= 410:
        return 3
    if bst >= 320:
        return 2
    return 1


def one(dex):
    p = get(f'{API}/pokemon/{dex}')
    s = get(f'{API}/pokemon-species/{dex}')
    if not p or not s:
        print(f'  ! {dex} no disponible')
        return None

    base = {st['stat']['name']: st['base_stat'] for st in p['stats']}
    bst = sum(base.values())

    name_es = p['name'].capitalize()
    for n in s.get('names', []):
        if n['language']['name'] == 'es':
            name_es = n['name']
            break

    # --- stats del juego a partir de los stats base ---
    hp = round(70 + base['hp'] * 0.45)
    spd = round(78 + base['speed'] * 0.42)
    atk = round(0.70 + max(base['attack'], base['special-attack']) / 100 * 0.55, 2)

    return {
        'dex': dex,
        'name': name_es,
        'slug': p['name'],
        'types': [t['type']['name'] for t in p['types']],
        'hp': hp,
        'spd': spd,
        'atk': atk,
        'bst': bst,
        'height': p['height'],
        'rarity': rarity(bst, dex, s.get('is_legendary'), s.get('is_mythical')),
        'starter': dex in STARTERS,
        'gen': gen_of(dex),
        'leg': bool(s.get('is_legendary') or s.get('is_mythical')),
    }


def main():
    DEXES = dexes_with_sprites()
    print(f'Bajando {len(DEXES)} Pokemon de PokeAPI...')
    rows = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        for i, r in enumerate(ex.map(one, DEXES), 1):
            if r:
                rows.append(r)
            if i % 100 == 0 or i == len(DEXES):
                print(f'  {i}/{len(DEXES)}')

    rows.sort(key=lambda r: r['dex'])

    lines = [
        '/* ============ pokedex.js — GENERADO, no editar a mano ============',
        ' * Lo produce tools/fetch_pokedex.py. Los datos se bajaron una vez de',
        ' * PokeAPI y viven aqui: el juego no hace ninguna peticion a internet.',
        ' *',
        ' * hp/spd/atk son stats de juego derivados de los stats base.',
        ' * rarity 1-5 para el gacha · gen = generación (banner) · starter = test',
        ' * leg = legendario o singular (sólo salen en las grietas)',
        ' */',
        'G.DEX = [',
    ]
    for r in rows:
        o = {
            'dex': r['dex'], 'name': r['name'], 'types': r['types'],
            'hp': r['hp'], 'spd': r['spd'], 'atk': r['atk'],
            'rarity': r['rarity'], 'bst': r['bst'],
            'starter': r['starter'], 'gen': r['gen'],
        }
        if r['leg']:
            o['leg'] = True
        lines.append('  ' + json.dumps(o, ensure_ascii=False, separators=(',', ':')) + ',')
    lines += [
        '];',
        '',
        'G.DEX_BY = {};',
        'for (const p of G.DEX) G.DEX_BY[p.dex] = p;',
        'G.getPokemon = dex => G.DEX_BY[dex];',
        '',
    ]
    nl = '\r\n' if os.path.exists(OUT) and b'\r\n' in open(OUT, 'rb').read() else '\n'
    with io.open(OUT, 'w', encoding='utf-8', newline=nl) as f:
        f.write('\n'.join(lines))

    print(f'\n{len(rows)} Pokemon escritos en micasurvivor/js/data/pokedex.js')
    print('\nrareza por generacion (1* 2* 3* 4* 5*):')
    for g in range(1, 10):
        c = [sum(1 for x in rows if x['gen'] == g and x['rarity'] == r) for r in range(1, 6)]
        print(f'  gen {g}: {c}  total {sum(c)}')


if __name__ == '__main__':
    main()
