# Extract the full Dalaran Heist card pool from hs_cards_full.json into a
# categorized manifest (tools/data/dalaran_heist_pool.json) for the Heist
# mode import. Re-run any time; output is deterministic.
import json, io, re, collections, os

HERE = os.path.dirname(os.path.abspath(__file__))
hs = json.load(io.open(os.path.join(HERE, 'data', 'hs_cards_full.json'), encoding='utf-8'))
bc = json.load(io.open(os.path.join(HERE, '..', 'battlecards', 'cards.json'), encoding='utf-8'))['cards']
bc_names = {re.sub(r'’', "'", (c.get('name') or '').lower()) for c in bc}

def clean(c):
    out = {
        'id': c['id'], 'name': c.get('name'), 'type': c.get('type'),
        'cost': c.get('cost'), 'text': (c.get('text') or '').replace('\n', ' '),
        'cardClass': c.get('cardClass'), 'mechanics': c.get('mechanics') or [],
    }
    if c.get('type') == 'MINION': out['attack'], out['health'] = c.get('attack'), c.get('health')
    if c.get('type') == 'WEAPON': out['attack'], out['durability'] = c.get('attack'), c.get('durability')
    if c.get('type') == 'HERO': out['health'] = c.get('health')
    out['inBattlecards'] = re.sub(r'’', "'", (c.get('name') or '').lower()) in bc_names
    return out

def num(i):
    m = re.match(r'DALA_(\d+)', i)
    return int(m.group(1)) if m else None

pool = {
    'heroes': [], 'classHeroPowers': [], 'treasuresActive': [], 'treasuresPassive': [],
    'twists': [], 'tavernSpells': [], 'twistDeckCards': [], 'draftBuckets': [],
    'bossHeroes': [], 'bossPowers': [], 'bossCards': [], 'enchantments': [], 'other': [],
}
for c in hs:
    i = c.get('id', '')
    if not i.startswith('DALA_'):
        continue
    e = clean(c)
    if i.startswith('DALA_BOSS_'):
        t = c.get('type')
        if t == 'HERO': pool['bossHeroes'].append(e)
        elif t == 'HERO_POWER': pool['bossPowers'].append(e)
        elif t == 'ENCHANTMENT': pool['enchantments'].append(e)
        else: pool['bossCards'].append(e)
        continue
    if c.get('type') == 'ENCHANTMENT': pool['enchantments'].append(e); continue
    if c.get('type') == 'HERO': pool['heroes'].append(e); continue
    if re.match(r'DALA_(Druid|Hunter|Mage|Paladin|Priest|Rogue|Shaman|Warlock|Warrior)_HP\d', i):
        pool['classHeroPowers'].append(e); continue
    if re.match(r'DALA_(Druid|Hunter|Mage|Paladin|Priest|Rogue|Shaman|Warlock|Warrior)_\d+$', i):
        pool['draftBuckets'].append(e); continue  # the 12 named loot buckets per class
    n = num(i)
    if n is not None and 'DUNGEON_PASSIVE_BUFF' in (c.get('mechanics') or []):
        pool['treasuresPassive'].append(e)
    elif n is not None and 500 <= n < 600:
        pool['twistDeckCards'].append(e)
    elif n is not None and 700 <= n < 800:
        pool['treasuresActive'].append(e)   # incl. treasure sub-tokens (714a/b/c etc.)
    elif n is not None and 800 <= n < 900:
        pool['twists'].append(e)            # run modifiers + random-deck starters + twist tokens
    elif n is not None and 900 <= n < 1000:
        pool['tavernSpells'].append(e)      # Bar (tavern) encounter actions
    else:
        pool['other'].append(e)

for k in pool: pool[k].sort(key=lambda e: e['id'])
out = os.path.join(HERE, 'data', 'dalaran_heist_pool.json')
json.dump(pool, io.open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('wrote', out)
for k, v in pool.items():
    known = sum(1 for e in v if e['inBattlecards'])
    print(f'  {k:16} {len(v):4}  ({known} name-matches already in Battlecards)')
