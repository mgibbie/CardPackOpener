# stage_sinnoh.py — a copy of the Sinnoh source the script tools can read as one more decomp.
#
# Sinnoh's source is a pokeemerald-expansion fork (Reference/sinnoh-pokeemerald-expansion), and it kept Hoenn's
# names: Rowan's lab is the folder LittlerootTown_ProfessorBirchsLab, Roark's badge is FLAG_BADGE01_GET next to
# FLAG_DEFEATED_RUSTBORO_GYM, Roark is `#define TRAINER_ROARK_1 TRAINER_ROXANNE_1`. The game keeps story flags,
# variables, beaten trainers and script labels in ONE namespace for every region, so read as it is, beating Roark
# would beat Roxanne. This writes Reference/sinnoh-staged: the same tree with
#   * each imported map folder renamed  <Folder> -> Sinnoh<Folder>  (the stem tools/import_sinnoh.py gave its map)
#   * MAP_X       -> MAP_SINNOH_X       (where the import made that map)
#   * TRAINER_X   -> TRAINER_SINNOH_X   (an alias first resolved to the trainer it stands for)
#   * FLAG_X/VAR_X that pokeemerald or pokefirered also define -> FLAG_SINNOH_X / VAR_SINNOH_X
#     (not the system ones the engine reads per region: badges, FLAG_SYS_*, temps, the 0x80xx specials)
#   * a map's own label that pokeemerald or pokefirered also define -> Sn_<label>
#   * the source's own path-walking macros (sn_walkto…) written as one applymovement the game plans itself
#   * this game's own changes to the story (see "what this game changes")
# and gives the already-imported maps (overworld/data/maps/Sinnoh*_map.json) the same names, and writes
# overworld/sinnoh_newgame.js (the flags the source sets on a new game). Running it twice changes nothing the
# second time.
#
#   python tools/stage_sinnoh.py            (report only)
#   python tools/stage_sinnoh.py --write
import io
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))
REF = os.path.join(os.environ['MAGEPUNK66'], 'Reference') if os.environ.get('MAGEPUNK66') \
    else os.path.abspath(os.path.join(REPO, '..', 'Magepunk66', 'Reference'))
if not os.path.isdir(REF):   # (a worktree sits two folders deeper)
    REF = os.path.abspath(os.path.join(REPO, '..', '..', '..', 'Magepunk66', 'Reference'))
SRC = os.path.join(REF, 'sinnoh-pokeemerald-expansion')
OUT = os.path.join(REF, 'sinnoh-staged')
DATA = os.path.join(REPO, 'overworld', 'data')
WRITE = '--write' in sys.argv

TOKEN = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')
LABEL = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)::?', re.M)
DEFINE = re.compile(r'^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$', re.M)


def read(p):
    with io.open(p, encoding='utf-8', errors='replace', newline='') as f:
        return f.read()


def put(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def defines(decomp, rel):
    p = os.path.join(REF, decomp, rel)
    return {m.group(1): m.group(2).strip() for m in DEFINE.finditer(read(p))} if os.path.isfile(p) else {}


def labels_of(root):
    out = set()
    for d, _, fs in os.walk(root):
        for f in fs:
            if f.endswith(('.inc', '.s')):
                out.update(LABEL.findall(read(os.path.join(d, f))))
    return out


# ---- the names -------------------------------------------------------------------------------------------------
map_index = json.load(open(os.path.join(DATA, 'map_index.json'), encoding='utf-8'))
SINNOH_IDS = {k for k in map_index if k.startswith('MAP_SINNOH_')}
STEMS = sorted(v for k, v in map_index.items() if k in SINNOH_IDS)          # SinnohTwinleafTown, …
FOLDERS = {s[len('Sinnoh'):]: s for s in STEMS}                              # source folder -> stem
# every map the SOURCE has, imported or not: a script that warps to one the import left out (a Battle Frontier hall,
# a harbour) must not land on the Hoenn map of the same name
SRC_MAP_IDS = set()
for _d in os.listdir(os.path.join(SRC, 'data', 'maps')):
    _p = os.path.join(SRC, 'data', 'maps', _d, 'map.json')
    if os.path.isfile(_p):
        _m = re.search(r'"id"\s*:\s*"(MAP_[A-Z0-9_]+)"', read(_p))
        if _m:
            SRC_MAP_IDS.add(_m.group(1))

OTHER_FLAGS = set()
for dec in ('pokeemerald', 'pokefirered'):
    for rel in ('include/constants/flags.h', 'include/constants/vars.h'):
        OTHER_FLAGS.update(defines(dec, rel))
KEEP = re.compile(r'^(FLAG_SYS_|FLAG_BADGE0\d_GET$|FLAG_TEMP_|VAR_TEMP_|VAR_0x80|VAR_RESULT$|VAR_FACING$|VAR_LAST_TALKED$|'
                  r'VAR_OBJ_GFX_ID_|VAR_SPECIAL_|VAR_DAYS$|VAR_UNUSED_|FLAG_UNUSED_|FLAG_HIDDEN_ITEMS_START$|FLAG_SINNOH_|VAR_SINNOH_|'
                  r'FLAGS_COUNT$|VARS_START$|VARS_END$|SPECIAL_VARS_|FLAG_0x|FLAG_SPECIAL_|TEMP_FLAGS_|TRAINER_FLAGS_|SYSTEM_FLAGS$|DAILY_FLAGS_)')

OPP = defines('sinnoh-pokeemerald-expansion', 'include/constants/opponents.h')
TRAINERS = {k for k in OPP if k.startswith('TRAINER_') and not re.match(r'^TRAINER_(PARTNER|NONE$)', k)
            and not k.startswith('TRAINERS_')}
ALIAS = {k: v for k, v in OPP.items() if k in TRAINERS and v in TRAINERS}

OTHER_LABELS = labels_of(os.path.join(REF, 'pokeemerald', 'data')) | labels_of(os.path.join(REF, 'pokefirered', 'data'))
MAP_LABELS = set()
for folder in FOLDERS:
    for f in ('scripts.inc', 'text.inc'):
        p = os.path.join(SRC, 'data', 'maps', folder, f)
        if os.path.isfile(p):
            MAP_LABELS.update(LABEL.findall(read(p)))
RENAME_LABELS = MAP_LABELS & OTHER_LABELS


def canon_trainer(t):
    seen = set()
    while t in ALIAS and t not in seen:
        seen.add(t)
        t = ALIAS[t]
    return t


# ITEMS the source numbers or names its own way. Its TMs are pokeemerald-expansion's list (TM51 and up exist, and
# the numbers are not Gen 3's), so a numbered TM/HM is written by its MOVE, which the game teaches by name
# (ow_menukeys.js tmMoveId); and its X items carry the later games' names.
def _tmhm():
    h = read(os.path.join(SRC, 'include', 'constants', 'tms_hms.h'))
    out = {}
    for kind in ('TM', 'HM'):
        m = re.search(r'#define FOREACH_%s\(F\)(.*?)\n\s*\n' % kind, h.replace('\r', ''), re.S)
        for i, mv in enumerate(re.findall(r'F\(([A-Z0-9_]+)\)', m.group(1) if m else '')):
            out['ITEM_%s%02d' % (kind, i + 1)] = 'ITEM_%s_%s' % (kind, mv)
    return out


ITEM_ALIAS = dict(_tmhm(), ITEM_X_DEFENSE='ITEM_X_DEFEND', ITEM_X_SP_ATK='ITEM_X_SPECIAL', ITEM_X_SP_DEF='ITEM_X_SPECIAL')


def rename(tok):
    if tok in ITEM_ALIAS:
        return ITEM_ALIAS[tok]
    if tok.startswith('MAP_'):
        return 'MAP_SINNOH_' + tok[4:] if ('MAP_SINNOH_' + tok[4:] in SINNOH_IDS or tok in SRC_MAP_IDS) else tok
    if tok in TRAINERS:
        return 'TRAINER_SINNOH_' + canon_trainer(tok)[len('TRAINER_'):]
    if (tok.startswith('FLAG_') or tok.startswith('VAR_')) and tok in OTHER_FLAGS and not KEEP.match(tok):
        head, rest = tok.split('_', 1)
        return head + '_SINNOH_' + rest
    if tok in RENAME_LABELS:
        return 'Sn_' + tok
    return tok


def retoken(s):
    return TOKEN.sub(lambda m: rename(m.group(0)), s)


# ---- the source's own macros, written out (asm/macros/event.inc) ------------------------------------------------
def args_of(rest):
    rest = rest.split('@')[0]
    return [a.strip() for a in rest.split(',')] if rest.strip() else []


def kw(args, names, defaults):
    """positional + name=value macro arguments -> dict"""
    out = dict(defaults)
    i = 0
    for a in args:
        if '=' in a:
            k, v = a.split('=', 1)
            out[k.strip()] = v.strip()
        elif i < len(names):
            out[names[i]] = a
            i += 1
    return out


SN = re.compile(r'^([ \t]*)(sn_walktoplayer|sn_walkto_vars|sn_walkto|sn_playerface)\b([^\r\n]*)(\r?)$', re.M)


def expand_sn(m):
    ind, cmd, a, cr = m.group(1), m.group(2), args_of(m.group(3)), m.group(4)
    nl = cr + '\n'
    # (each becomes ONE applymovement the game's own script runner plans when it gets there: events.js _planMove)
    if cmd == 'sn_walkto':
        v = kw(a, ['localid', 'x', 'y', 'speed', 'face', 'flags', 'buf'], {'face': '0'})
        lines = ['applymovement %s, SnPath_%s_%s_%s' % (v['localid'], v['x'], v['y'], v['face'])]
    elif cmd == 'sn_walkto_vars':   # (the target is in VAR_0x8008 / VAR_0x8009)
        v = kw(a, ['localid', 'speed', 'face', 'flags', 'buf'], {'face': '0'})
        lines = ['applymovement %s, SnPathVars_%s' % (v['localid'], v['face'])]
    elif cmd == 'sn_walktoplayer':
        v = kw(a, ['localid', 'speed', 'flags', 'buf'], {})
        lines = ['applymovement %s, SnPathPlayer' % v['localid']]
    else:
        v = kw(a, ['localid', 'buf'], {})
        lines = ['applymovement LOCALID_PLAYER, SnFace_%s' % v['localid']]
    return nl.join(ind + l for l in lines) + cr


# SCRIPTED WILD BATTLES AND ROAMERS name their species on one line and act on another, and the transpiler keeps
# neither `setwildbattle` nor `dowildbattle`. Each act is written as ONE special that carries what was named
# (overworld/ow_sinnoh.js runs them): `special SnWild__<SPECIES>__<LEVEL>`, `special SnWildHoney` where a honey tree
# picked the species itself, `special SinnohAddRoamer__<SPECIES>__<LEVEL>`.
SETWILD = re.compile(r'^[ \t]*setwildbattle\s+(SPECIES_[A-Z0-9_]+)\s*,\s*([0-9]+)')
SETV = re.compile(r'^[ \t]*setvar\s+VAR_0x800([45])\s*,\s*([A-Z0-9_]+)')


def carry_named(s):
    out, wild, honey, v = [], None, False, {}
    for line in s.split(chr(10)):
        body = line.rstrip(chr(13))
        cr = chr(13) if line.endswith(chr(13)) else ''
        m = SETWILD.match(body)
        if m:
            wild, honey = (m.group(1), m.group(2)), False
        m = SETV.match(body)
        if m:
            v[m.group(1)] = m.group(2)
        t = body.strip().split('@')[0].strip()
        ind = body[:len(body) - len(body.lstrip())]
        if t == 'special SinnohHoneyTreeMon':
            honey = True
        elif t == 'special BattleSetup_StartLegendaryBattle' and wild:   # (the script's own waitstate follows)
            body = ind + 'special SnWild__%s__%s' % (wild[0][len('SPECIES_'):], wild[1])
        elif t == 'dowildbattle' and (wild or honey):
            body = ind + ('special SnWildHoney' if honey else 'special SnWild__%s__%s' % (wild[0][len('SPECIES_'):], wild[1]))
            body += chr(10) + ind + 'waitstate'
        elif t == 'special SinnohAddRoamer' and v.get('4', '').startswith('SPECIES_'):
            body = ind + 'special SinnohAddRoamer__%s__%s' % (v['4'][len('SPECIES_'):], v.get('5', '50'))
        out.append(body + cr)
    return chr(10).join(out)


def stage_text(s):
    return retoken(SN.sub(expand_sn, carry_named(s)))


# ---- what this game changes in the source's scripts --------------------------------------------------------------
# Sinnoh is reached as a Champion with a full party, so its opening (your room, the lake, the bag on Route 201) is
# not played: the story starts at PROF. ROWAN's lab (overworld/ow_story.js seedSinnoh), and where the source has him
# admire the POKeMON you took from his bag, he offers one of Sinnoh's three instead (special SinnohChooseStarter).
LAB = 'LittlerootTown_ProfessorBirchsLab'
LAB_OLD = re.compile(r'[ \t]*bufferleadmonspeciesname STR_VAR_2\r?\n.*?msgbox SandgemLab_Text_PtSomething, MSGBOX_DEFAULT\r?\n', re.S)
LAB_NEW = '\n'.join([
    '\tmsgbox SandgemLab_Text_MpWelcome, MSGBOX_DEFAULT',
    '\tclosemessage',
    '\tspecial SinnohChooseStarter',
    '\twaitstate',
    '\tmsgbox SandgemLab_Text_MpChosen, MSGBOX_DEFAULT',
    ''])
LAB_TEXT = '\n'.join([
    '',
    'SandgemLab_Text_MpWelcome:',
    '\t.string "ROWAN: Hm. So you are {PLAYER}, the\\n"',
    '\t.string "CHAMPION I have heard so much about.\\p"',
    '\t.string "SINNOH’s POKéMON will be new to you.\\n"',
    '\t.string "A trainer should begin a new land with\\l"',
    '\t.string "a POKéMON of that land.\\p"',
    '\t.string "I have three here. Choose one.$"',
    '',
    'SandgemLab_Text_MpChosen:',
    '\t.string "ROWAN: A fine choice. Raise it well.\\p"',
    '\t.string "Now, I have a request for you.$"',
    ''])


def our_changes(folder, name, s):
    if folder == LAB and name == 'scripts.inc':
        s, n = LAB_OLD.subn(lambda m: LAB_NEW, s, count=1)
        if n != 1:
            sys.exit('stage_sinnoh: the lab scene was not found; the source changed')
        s += LAB_TEXT
    return s


# ---- the staged tree ---------------------------------------------------------------------------------------------
report = {'maps': 0, 'files': 0, 'labels renamed': len(RENAME_LABELS), 'trainer aliases': len(ALIAS)}
if WRITE:
    if os.path.isdir(OUT):
        shutil.rmtree(OUT, ignore_errors=True)   # (a folder held open by a shell is left; its files are rewritten below)
    for folder, stem in FOLDERS.items():
        d = os.path.join(SRC, 'data', 'maps', folder)
        for f in os.listdir(d):
            p = os.path.join(d, f)
            if os.path.isfile(p) and f.endswith(('.inc', '.json', '.pory')):
                put(os.path.join(OUT, 'data', 'maps', stem, f), stage_text(our_changes(folder, f, read(p))))
                report['files'] += 1
        report['maps'] += 1
    for rel in ('data/scripts', 'data/text', 'include/constants', 'src/data'):
        d = os.path.join(SRC, rel)
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f)
            if os.path.isfile(p) and f.endswith(('.inc', '.h', '.s', '.json', '.party')):
                put(os.path.join(OUT, rel, f), stage_text(read(p)))
                report['files'] += 1
    put(os.path.join(OUT, 'data', 'event_scripts.s'), stage_text(read(os.path.join(SRC, 'data', 'event_scripts.s'))))
    put(os.path.join(OUT, 'asm', 'macros', 'event.inc'), read(os.path.join(SRC, 'asm', 'macros', 'event.inc')))

    # the flags the source sets on a new game (data/scripts/new_game.inc), for the game to set once (seedSinnoh)
    ng = read(os.path.join(OUT, 'data', 'scripts', 'new_game.inc'))
    m = re.search(r'^EventScript_ResetAllMapFlags::\r?\n(.*?)^\s*(?:end|return)\s*$', ng, re.S | re.M)
    flags = []
    for f in re.findall(r'^\s*setflag\s+([A-Z0-9_]+)', m.group(1) if m else '', re.M):
        if f not in flags:
            flags.append(f)
    # …and the flags of its once-a-day events (the daily block of flags.h), for the game's daily reset
    fh = read(os.path.join(OUT, 'include', 'constants', 'flags.h'))
    daily = sorted(set(re.findall(r'#define\s+(FLAG_(?:SINNOH_)?DAILY_[A-Z0-9_]+)', fh))
                   - {'FLAG_DAILY_FLAGS_START', 'FLAG_DAILY_FLAGS_END', 'FLAG_SINNOH_DAILY_FLAGS_START', 'FLAG_SINNOH_DAILY_FLAGS_END'})
    NL = chr(10)
    put(os.path.join(REPO, 'overworld', 'sinnoh_newgame.js'),
        "// GENERATED by tools/stage_sinnoh.py --write, from Sinnoh's source under the names this game gives its flags." + NL
        + '// SINNOH_NEW_GAME_FLAGS: what it sets on a new game (data/scripts/new_game.inc EventScript_ResetAllMapFlags).' + NL
        + '// SINNOH_DAILY_FLAGS: its once-a-day events (the daily block of include/constants/flags.h).' + NL
        + 'export const SINNOH_NEW_GAME_FLAGS = ' + json.dumps(flags, indent=chr(9)) + ';' + NL
        + 'export const SINNOH_DAILY_FLAGS = ' + json.dumps(daily, indent=chr(9)) + ';' + NL)
    report['new-game flags'] = len(flags)
    report['daily flags'] = len(daily)

    # the imported maps take the same names (their events name flags, vars, scripts and trainers)
    changed = 0
    for stem in STEMS:
        p = os.path.join(DATA, 'maps', stem + '_map.json')
        s = read(p)
        t = retoken(s)
        if t != s:
            put(p, t)
            changed += 1
    report['imported maps renamed'] = changed

print('stage_sinnoh:', json.dumps(report), '->' if WRITE else '(dry run; --write to stage)', OUT if WRITE else '')
