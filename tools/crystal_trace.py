"""crystal_trace.py — replay Magepunk66's Crystal transpiler one command at a time.

For every label in every pokecrystal map, print the decomp commands alongside
the ops the transpiler emitted for EACH one (often none). tools/gen_crystal_
scriptvar.mjs uses this to find commands that were silently dropped — and to
know exactly where in our op list to splice them back.

    python tools/crystal_trace.py <Magepunk66/tools> <pokecrystal/maps> > trace.json
"""
import json
import os
import sys
from collections import Counter

sys.path.insert(0, sys.argv[1])
import transpile_crystal as T  # noqa: E402
import re  # noqa: E402

# An exported label (`PlayersHouseDoll1Script::`, 4 in pokecrystal's maps) did
# not match the transpiler's LABEL_RE, so its commands were traced as the tail of
# the label before it. Read both forms.
T.LABEL_RE = re.compile(r'^(\.?[A-Za-z0-9_@]+)::?\s*(;.*)?$')

maps_dir = sys.argv[2]
out = {}
for name in sorted(os.listdir(maps_dir)):
    if not name.endswith('.asm'):
        continue
    scripts, movements, texts = T.parse_map(os.path.join(maps_dir, name), Counter())
    per = {}
    for label, lines in scripts.items():
        if label.endswith('_MapScripts'):
            continue
        pending = {}
        cur_global = label if not label.startswith('.') and '.' not in label else label.split('.')[0]
        rows = []
        for cmd, rest in lines:
            args = [x.strip() for x in rest.split(';')[0].split(',') if x.strip()]
            conv = T.convert(cmd, args, pending, cur_global)
            rows.append([cmd, args, conv or []])
        per[label] = rows
    out[name[:-4]] = per
json.dump(out, sys.stdout, separators=(',', ':'))
