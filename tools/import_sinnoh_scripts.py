# import_sinnoh_scripts.py — Sinnoh's map scripts and their text into overworld/data.
#
# Reads the staged source (tools/stage_sinnoh.py --write) with the same transpiler the other regions' scripts came
# from (Magepunk66/tools/transpile_scripts.py), and writes data/scripts/Sinnoh<Map>.json and
# data/strings/Sinnoh<Map>.json. Only Sinnoh's files are written; nothing of another region is touched.
#
#   python tools/import_sinnoh_scripts.py [--write]
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))
MP66 = os.environ.get('MAGEPUNK66') or os.path.abspath(os.path.join(REPO, '..', 'Magepunk66'))
if not os.path.isdir(MP66):
    MP66 = os.path.abspath(os.path.join(REPO, '..', '..', '..', 'Magepunk66'))
STAGED = os.path.join(MP66, 'Reference', 'sinnoh-staged', 'data', 'maps')
DATA = os.path.join(REPO, 'overworld', 'data')
WRITE = '--write' in sys.argv

tmp = tempfile.mkdtemp(prefix='sinnoh_scripts_')
try:
    r = subprocess.run([sys.executable, os.path.join(MP66, 'tools', 'transpile_scripts.py'), STAGED, tmp], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stdout + r.stderr)
    print(r.stdout.strip().split('\n')[0])
    # FALL-THROUGH. The source writes its scenes as one run of code cut by local labels ("…_PtAskDex:"), and a label
    # with no `end` runs straight on into the next. The transpiler makes each label its own list and drops that edge
    # (Rowan's scene stopped at its first question). Read each edge off the staged source and write it as a `goto`.
    sys.path.insert(0, os.path.join(MP66, 'tools'))
    import transpile_scripts as T  # noqa: E402
    TERM = {'end', 'return', 'goto', 'step_end', 'releaseall_end'}
    edges = 0
    for stem in sorted(os.listdir(STAGED)):
        sp, jp = os.path.join(STAGED, stem, 'scripts.inc'), os.path.join(tmp, 'scripts', stem + '.json')
        if not os.path.isfile(sp) or not os.path.isfile(jp):
            continue
        out = json.load(open(jp, encoding='utf-8'))
        order, last, count = [], {}, {}
        cur = None
        for raw in open(sp, encoding='utf-8', errors='replace'):
            line = raw.rstrip('\r\n')
            lm = T.LABEL_RE.match(line)
            if lm:
                cur = lm.group(1)
                order.append(cur)
                count[cur] = 0
                continue
            cm = T.CMD_RE.match(line)
            if cm and cur is not None:
                last[cur] = cm.group(1)
                count[cur] += 1
        changed = False
        for i, lab in enumerate(order[:-1]):
            nxt = order[i + 1]
            if not count.get(lab) or last.get(lab) in TERM or lab.endswith('_MapScripts'):
                continue
            if lab not in out and count[lab]:
                # a label whose every command was dropped still has to lead somewhere, if it is a script at all
                if nxt in out and any(('"label": "%s"' % lab) in json.dumps(v) for v in out.values() if isinstance(v, list)):
                    out[lab] = [{'op': 'goto', 'label': nxt}]
                    edges += 1
                    changed = True
                continue
            ops = out.get(lab)
            if not isinstance(ops, list) or nxt not in out or not isinstance(out[nxt], list):
                continue
            if ops and ops[-1].get('op') in ('end', 'return', 'goto'):
                continue
            ops.append({'op': 'goto', 'label': nxt})
            edges += 1
            changed = True
        if changed:
            json.dump(out, open(jp, 'w', encoding='utf-8'))
    print('fall-through edges restored:', edges)

    # LABELS DEFINED ELSEWHERE. The game loads ONE map's file, and the source calls helpers that live in another
    # map's file or in data/scripts (Sinnoh_EventScript_BufferCounterpartName is in Lake Verity's). Each map gets
    # its own copy of what it calls, and of what that calls. Only Sinnoh's OWN labels: a helper pokeemerald or
    # pokefirered also define (Common_EventScript_*) is left to the game's shared tables, so it behaves here
    # exactly as it does in Hoenn.
    import re
    LBL = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)::?', re.M)
    other = set()
    for dec in ('pokeemerald', 'pokefirered'):
        for d, _, fs_ in os.walk(os.path.join(MP66, 'Reference', dec, 'data')):
            for f in fs_:
                if f.endswith(('.inc', '.s')):
                    other.update(LBL.findall(open(os.path.join(d, f), encoding='utf-8', errors='replace').read()))
    sh_out, sh_str = os.path.join(tmp, 'shared.json'), os.path.join(tmp, 'shared_strings.json')
    r2 = subprocess.run([sys.executable, os.path.join(HERE, 'shared_transpile.py'), os.path.dirname(STAGED), sh_out, sh_str],
                        capture_output=True, text=True, env={**os.environ, 'MAGEPUNK66': MP66})
    if r2.returncode:
        sys.exit(r2.stdout + r2.stderr)
    pool, text, home = {}, {}, {}
    files = {}
    for f in sorted(os.listdir(os.path.join(tmp, 'scripts'))):
        if f.startswith('Sinnoh') and f.endswith('.json'):
            files[f[:-5]] = json.load(open(os.path.join(tmp, 'scripts', f), encoding='utf-8'))
    strs = {}
    for f in sorted(os.listdir(os.path.join(tmp, 'strings'))) if os.path.isdir(os.path.join(tmp, 'strings')) else []:
        if f.startswith('Sinnoh') and f.endswith('.json'):
            strs[f[:-5]] = json.load(open(os.path.join(tmp, 'strings', f), encoding='utf-8'))
    for stem, d in files.items():
        for k, v in d.items():
            if k != '__map__' and isinstance(v, list) and k not in pool:
                pool[k] = v
                home[k] = stem
    for k, v in json.load(open(sh_out, encoding='utf-8')).items():
        pool.setdefault(k, v)
    for d in strs.values():
        for k, v in d.items():
            text.setdefault(k, v)
    for k, v in json.load(open(sh_str, encoding='utf-8')).items():
        text.setdefault(k, v)

    def targets(ops):
        out = []
        for o in ops or []:
            if isinstance(o, dict):
                for key in ('label', 'labelTrue', 'labelFalse'):
                    if isinstance(o.get(key), str):
                        out.append(o[key])
                if o.get('op') == 'trainerbattle':
                    out += [a for a in o.get('args', []) if isinstance(a, str) and a in pool]
        return out

    pulled = 0
    for stem, d in files.items():
        todo = [t for v in list(d.values()) if isinstance(v, list) for t in targets(v)]
        added = False
        while todo:
            t = todo.pop()
            if t in d or t not in pool or t in other:
                continue
            d[t] = pool[t]
            pulled += 1
            added = True
            todo += targets(pool[t])
        st = strs.setdefault(stem, {})
        sadd = False
        for v in d.values():
            for o in v if isinstance(v, list) else []:
                if not isinstance(o, dict):
                    continue
                for a in ([o.get('text')] if o.get('op') == 'msg' else []) + (o.get('args', []) if o.get('op') == 'trainerbattle' else []):
                    if isinstance(a, str) and a not in st and a in text:
                        st[a] = text[a]
                        sadd = True
        if added:
            json.dump(d, open(os.path.join(tmp, 'scripts', stem + '.json'), 'w', encoding='utf-8'))
        if sadd:
            os.makedirs(os.path.join(tmp, 'strings'), exist_ok=True)
            json.dump(st, open(os.path.join(tmp, 'strings', stem + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print("labels copied into the maps that call them:", pulled)
    n = {'scripts': 0, 'strings': 0}
    for kind in ('scripts', 'strings'):
        d = os.path.join(tmp, kind)
        for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if not f.startswith('Sinnoh'):
                continue
            n[kind] += 1
            if WRITE:
                shutil.copyfile(os.path.join(d, f), os.path.join(DATA, kind, f))
    if WRITE:   # the index the game reads for "does this map have scripts"
        ip = os.path.join(DATA, 'scripts', '_index.json')
        if os.path.isfile(ip):
            idx = json.load(open(ip, encoding='utf-8'))
            add = json.load(open(os.path.join(tmp, 'scripts', '_index.json'), encoding='utf-8'))
            if isinstance(idx, list):
                idx = sorted(set(idx) | {x for x in add if str(x).startswith('Sinnoh')})
            elif isinstance(idx, dict):
                idx.update({k: v for k, v in add.items() if k.startswith('Sinnoh')})
            json.dump(idx, open(ip, 'w', encoding='utf-8'), separators=(',', ':'))
    print('import_sinnoh_scripts:', json.dumps(n), 'written' if WRITE else '(dry run)')
finally:
    shutil.rmtree(tmp, ignore_errors=True)
