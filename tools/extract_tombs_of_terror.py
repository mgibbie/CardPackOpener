# Extract the full Tombs of Terror (Saviors of Uldum solo adventure) card
# pool from hs_cards_full.json into a categorized manifest
# (tools/data/tombs_of_terror_pool.json) for the mode import. Deterministic;
# re-run any time. Mirrors extract_dalaran_heist.py.
import json, io, re, os

HERE = os.path.dirname(os.path.abspath(__file__))
hs = json.load(io.open(os.path.join(HERE, 'data', 'hs_cards_full.json'), encoding='utf-8'))
bc = json.load(io.open(os.path.join(HERE, '..', 'battlecards', 'cards.json'), encoding='utf-8'))['cards']
bc_names = {re.sub(r'’', "'", (c.get('name') or '').lower()) for c in bc}

EXPLORERS = ('Reno', 'Elise', 'Brann', 'Finley')

def clean(c):
    out = {
        'id': c['id'], 'name': c.get('name'), 'type': c.get('type'),
        'cost': c.get('cost'), 'text': re.sub(r'\s+', ' ', (c.get('text') or '').replace('\n', ' ')).strip(),
        'cardClass': c.get('cardClass'), 'mechanics': c.get('mechanics') or [],
    }
    if c.get('type') == 'MINION': out['attack'], out['health'] = c.get('attack'), c.get('health')
    if c.get('type') == 'WEAPON': out['attack'], out['durability'] = c.get('attack'), c.get('durability')
    if c.get('type') == 'HERO': out['health'] = c.get('health')
    out['inBattlecards'] = re.sub(r'’', "'", (c.get('name') or '').lower()) in bc_names
    return out

def num(i):
    m = re.match(r'ULDA_(\d+)', i)
    return int(m.group(1)) if m else None

pool = {
    'explorers': [], 'explorerPowers': [], 'sharedHeroPower': [],
    'treasuresActive': [], 'treasuresPassive': [], 'anomalies': [], 'plagues': [],
    'randomDecks': [], 'tavernSpells': [], 'draftBuckets': [],
    'bossHeroes': [], 'bossPowers': [], 'bossCards': [], 'enchantments': [], 'other': [],
}
for c in hs:
    i = c.get('id', '')
    if not i.startswith('ULDA_'):
        continue
    e = clean(c)
    if i.startswith('ULDA_BOSS_'):
        t = c.get('type')
        if t == 'HERO': pool['bossHeroes'].append(e)
        elif t == 'HERO_POWER': pool['bossPowers'].append(e)
        elif t == 'ENCHANTMENT': pool['enchantments'].append(e)
        else: pool['bossCards'].append(e)
        continue
    if c.get('type') == 'ENCHANTMENT': pool['enchantments'].append(e); continue
    # the four dual-class Explorer heroes (+ the meta 'Saviors of Uldum')
    if c.get('type') == 'HERO':
        if any(i == 'ULDA_' + x for x in EXPLORERS): pool['explorers'].append(e)
        else: pool['other'].append(e)
        continue
    # explorer hero powers: ULDA_<Explorer>_HP1..3
    if re.match(r'ULDA_(' + '|'.join(EXPLORERS) + r')_HP\d', i):
        pool['explorerPowers'].append(e); continue
    # explorer draft buckets: ULDA_<Explorer>_NN
    if re.match(r'ULDA_(' + '|'.join(EXPLORERS) + r')_\d+$', i):
        pool['draftBuckets'].append(e); continue
    n = num(i)
    if c.get('type') == 'HERO_POWER':
        pool['sharedHeroPower'].append(e); continue
    if n is not None and 'DUNGEON_PASSIVE_BUFF' in (c.get('mechanics') or []):
        pool['treasuresPassive'].append(e)
    elif n is not None and 700 <= n < 800:
        pool['anomalies'].append(e)
    elif n is not None and 800 <= n < 900:
        pool['plagues'].append(e)
    elif n is not None and 900 <= n < 910:
        pool['randomDecks'].append(e)
    elif n is not None and 910 <= n < 1000:
        pool['tavernSpells'].append(e)
    elif n is not None:
        pool['treasuresActive'].append(e)   # incl. treasure sub-tokens
    else:
        pool['other'].append(e)

for k in pool: pool[k].sort(key=lambda e: e['id'])
out = os.path.join(HERE, 'data', 'tombs_of_terror_pool.json')
json.dump(pool, io.open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('wrote', out)
for k, v in pool.items():
    known = sum(1 for e in v if e['inBattlecards'])
    print(f'  {k:16} {len(v):4}  ({known} name-matches already in Battlecards)')
