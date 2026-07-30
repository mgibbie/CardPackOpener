# Extract the full Hearthstone DUELS card pool (set prefix PVPDR_) from
# hs_cards_full.json into a categorized manifest (tools/data/duels_pool.json)
# for the Duels run-mode import. Deterministic; re-run any time. Mirrors
# extract_tombs_of_terror.py.
import json, io, re, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
hs = json.load(io.open(os.path.join(HERE, 'data', 'hs_cards_full.json'), encoding='utf-8'))
bc = json.load(io.open(os.path.join(HERE, '..', 'battlecards', 'cards.json'), encoding='utf-8'))['cards']
bc_names = {re.sub(r'’', "'", (c.get('name') or '').lower()) for c in bc}

def clean(c):
    out = {
        'id': c['id'], 'name': c.get('name'), 'type': c.get('type'),
        'cost': c.get('cost'),
        'text': re.sub(r'\s+', ' ', (c.get('text') or '').replace('\n', ' ')).replace('[x]', '').strip(),
        'cardClass': c.get('cardClass'), 'mechanics': c.get('mechanics') or [],
        'rarity': c.get('rarity'),
    }
    if c.get('type') == 'MINION': out['attack'], out['health'], out['race'] = c.get('attack'), c.get('health'), c.get('race')
    if c.get('type') == 'WEAPON': out['attack'], out['durability'] = c.get('attack'), c.get('durability')
    if c.get('type') == 'HERO': out['health'] = c.get('health')
    out['inBattlecards'] = re.sub(r'’', "'", (c.get('name') or '').lower()) in bc_names
    return out

pool = {
    'heroes': [], 'heroPowers': [], 'treasuresPassive': [], 'treasuresActive': [],
    'treasureMinions': [], 'treasureWeapons': [], 'enchantments': [], 'other': [],
}
for c in hs:
    i = str(c.get('id', ''))
    if not i.startswith('PVPDR'):
        continue
    t = c.get('type')
    e = clean(c)
    mech = c.get('mechanics') or []
    if t == 'HERO':
        pool['heroes'].append(e)
    elif t == 'HERO_POWER':
        pool['heroPowers'].append(e)
    elif t == 'ENCHANTMENT':
        pool['enchantments'].append(e)
    elif t == 'MINION':
        pool['treasureMinions'].append(e)
    elif t == 'WEAPON':
        pool['treasureWeapons'].append(e)
    elif t == 'SPELL':
        if 'DUNGEON_PASSIVE_BUFF' in mech or (e['text'] or '').lower().startswith('passive'):
            pool['treasuresPassive'].append(e)
        else:
            pool['treasuresActive'].append(e)
    else:
        pool['other'].append(e)

# stable sort by id within each bucket for reproducible diffs
for k in pool:
    pool[k].sort(key=lambda x: x['id'])

out_path = os.path.join(HERE, 'data', 'duels_pool.json')
io.open(out_path, 'w', encoding='utf-8').write(json.dumps(pool, indent=2, ensure_ascii=False))

total = sum(len(v) for v in pool.values())
print('wrote', out_path)
print('PVPDR cards categorized:', total)
for k, v in pool.items():
    overlap = sum(1 for e in v if e['inBattlecards'])
    print('  %-18s %4d  (%d already in Battlecards by name)' % (k, len(v), overlap))
# class distribution of the importable treasures
importable = pool['treasuresPassive'] + pool['treasuresActive'] + pool['treasureMinions'] + pool['treasureWeapons']
print('\nimportable treasures by class:', dict(Counter(e['cardClass'] for e in importable)))
print('hero powers by class:', dict(Counter(e['cardClass'] for e in pool['heroPowers'])))
