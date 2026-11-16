# import_sinnoh_battles.py — Sinnoh's trainer teams and wild encounters into overworld/data.
#
# Reads the staged source (tools/stage_sinnoh.py --write):
#   src/data/trainers.party      -> data/trainer_teams.json   keys SINNOH_<ID>  {class, name, party:[{s,l,moves}]}
#   src/data/wild_encounters.json -> data/encounters.json     keys MAP_SINNOH_* {land|water|fishing|rock_smash}
# Only Sinnoh's keys are written (and replaced on a re-run); every other region's rows are left as they are.
# A map's second table in the source (gRoute201_PostGame) is not used here.
#
#   python tools/import_sinnoh_battles.py [--write]
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))
MP66 = os.environ.get('MAGEPUNK66') or os.path.abspath(os.path.join(REPO, '..', 'Magepunk66'))
if not os.path.isdir(MP66):
    MP66 = os.path.abspath(os.path.join(REPO, '..', '..', '..', 'Magepunk66'))
STAGED = os.path.join(MP66, 'Reference', 'sinnoh-staged')
DATA = os.path.join(REPO, 'overworld', 'data')
WRITE = '--write' in sys.argv


def load(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


def save(p, o):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        json.dump(o, f, ensure_ascii=False, separators=(',', ':'))


SPECIES = load(os.path.join(DATA, 'species_battle.json'))
MOVES = load(os.path.join(DATA, 'moves_battle.json'))
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
SP_BY = {norm(k): k for k in SPECIES}
MV_BY = {norm(k): k for k in MOVES}
unknown = {'species': {}, 'moves': {}}


def species_id(name):
    n = norm(name.replace('SPECIES_', ''))
    if n in SP_BY:
        return SP_BY[n]
    base = norm(re.split(r'[-_ ]', name.replace('SPECIES_', '').strip())[0])   # a form the game has no row for: its base
    if base in SP_BY:
        return SP_BY[base]
    unknown['species'][name] = unknown['species'].get(name, 0) + 1
    return None


def move_id(name):
    n = norm(name.replace('MOVE_', ''))
    if n in MV_BY:
        return MV_BY[n]
    unknown['moves'][name] = unknown['moves'].get(name, 0) + 1
    return None


# ---- trainers ---------------------------------------------------------------------------------------------------
def parse_party(text):
    out = {}
    for block in re.split(r'^=== (TRAINER_\w+) ===\s*$', text, flags=re.M)[1:]:
        pass
    parts = re.split(r'^=== (TRAINER_\w+) ===\s*$', text, flags=re.M)
    for i in range(1, len(parts), 2):
        tid, body = parts[i], parts[i + 1]
        body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
        chunks = [c for c in re.split(r'\n\s*\n', body.strip()) if c.strip()]
        if not chunks:
            continue
        head = dict(re.findall(r'^([A-Za-z ]+):\s*(.*?)\s*$', chunks[0], flags=re.M))
        party = []
        for c in chunks[1:]:
            lines = [l.strip() for l in c.strip().split('\n') if l.strip() and not l.strip().startswith('//')]
            if not lines:
                continue
            first = lines[0]
            first = first.split('@')[0]                       # "Species @ Item"
            m = re.match(r'^(.*?)\s*\((.*?)\)\s*$', first.strip())    # "Nick (Species)" or "Species (M)"
            name = first.strip()
            if m:
                name = m.group(1) if m.group(2) in ('M', 'F') else m.group(2)
                m2 = re.match(r'^(.*?)\s*\((.*?)\)\s*$', name.strip())
                if m2:
                    name = m2.group(1) if m2.group(2) in ('M', 'F') else m2.group(2)
            sid = species_id(name.strip())
            lv = 5
            moves = []
            for l in lines[1:]:
                ml = re.match(r'^Level:\s*(\d+)', l)
                if ml:
                    lv = int(ml.group(1))
                elif l.startswith('- '):
                    mv = move_id(l[2:].strip())
                    if mv:
                        moves.append(mv)
            if sid:
                e = {'s': sid, 'l': lv}
                if moves:
                    e['moves'] = moves
                party.append(e)
        if party:
            cls = head.get('Class', 'Trainer').replace('TRAINER_CLASS_', '').replace('_', ' ').title()
            cls = {'Leader': 'Gym Leader', 'Boss Frlg': 'Galactic Boss'}.get(cls, cls)   # (the name the game's boss rules know: trainers.js BOSS_CLASSES)
            out[tid.replace('TRAINER_', '', 1)] = {'class': cls, 'name': head.get('Name', '').strip(), 'party': party}
    return out


teams = parse_party(io.open(os.path.join(STAGED, 'src', 'data', 'trainers.party'), encoding='utf-8').read())
teams = {k: v for k, v in teams.items() if k.startswith('SINNOH_')}

# ---- wild encounters --------------------------------------------------------------------------------------------
wild = load(os.path.join(STAGED, 'src', 'data', 'wild_encounters.json'))['wild_encounter_groups'][0]
rates = {f['type']: f['encounter_rates'] for f in wild['fields']}
KIND = {'land_mons': 'land', 'water_mons': 'water', 'rock_smash_mons': 'rock_smash', 'fishing_mons': 'fishing'}
enc = {}
MAP_INDEX = load(os.path.join(DATA, 'map_index.json'))
for e in wild['encounters']:
    mid = e.get('map', '')
    if mid not in MAP_INDEX or not mid.startswith('MAP_SINNOH_') or mid in enc:   # (only maps the import made)
        continue
    row = {}
    for src, kind in KIND.items():
        t = e.get(src)
        if not t or not t.get('mons'):
            continue
        slots = []
        for i, m in enumerate(t['mons']):
            sid = species_id(m['species'])
            if sid:
                slots.append({'id': sid, 'min': m['min_level'], 'max': m['max_level'], 'w': rates[src][i] if i < len(rates[src]) else 1})
        if slots:
            row[kind] = {'rate': t.get('encounter_rate', 20), 'slots': slots}
    if row:
        enc[mid] = row

print('import_sinnoh_battles:', len(teams), 'trainer teams,', len(enc), 'maps with wild Pokemon;',
      'unknown species', dict(sorted(unknown['species'].items(), key=lambda x: -x[1])[:12]),
      'unknown moves', dict(sorted(unknown['moves'].items(), key=lambda x: -x[1])[:12]))

if WRITE:
    p = os.path.join(DATA, 'trainer_teams.json')
    tt = {k: v for k, v in load(p).items() if not k.startswith('SINNOH_')}
    tt.update(teams)
    save(p, tt)
    p = os.path.join(DATA, 'encounters.json')
    ee = {k: v for k, v in load(p).items() if not k.startswith('MAP_SINNOH_')}
    ee.update(enc)
    save(p, ee)
    print('written')
