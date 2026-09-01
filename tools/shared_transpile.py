# shared_transpile.py — transpile the decomps' SHARED script sources.
#
# Magepunk66/tools/transpile_scripts.py only ever walks data/maps/<Map>/scripts.inc.
# FireRed and Emerald also keep script bodies in data/scripts/*.inc (96 files) and
# data/event_scripts.s (the Common_EventScript_* family), and NONE of it was ever
# read — the FireRed/Emerald analogue of Crystal's dropped `jumpstd`.
#
# This reuses the upstream parser rather than reimplementing it, so the shared
# bodies come out in exactly the same shape as the per-map ones.
#
# It emits STRINGS as well as ops, and that is not optional: a `msg` whose text
# label is in neither the map's strings nor the common table falls through to
# printing THE LABEL ITSELF. Shipping the bodies without their text would put ~490
# NPCs on screen reciting "gText_PokemonCenterSign" — worse than leaving them mute.
#
#   python tools/shared_transpile.py <decomp_data_dir> <out.json> <strings.json>
import json
import os
import sys
from collections import Counter

MP66_TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'Magepunk66', 'tools')
sys.path.insert(0, os.path.abspath(MP66_TOOLS))

import transpile_scripts as T  # noqa: E402


def main():
    data_dir, out_path = sys.argv[1], sys.argv[2]
    str_path = sys.argv[3] if len(sys.argv) > 3 else None
    unhandled = Counter()
    sources = []
    sh = os.path.join(data_dir, 'scripts')
    if os.path.isdir(sh):
        sources += [os.path.join(sh, f) for f in sorted(os.listdir(sh)) if f.endswith('.inc')]
    ev = os.path.join(data_dir, 'event_scripts.s')
    if os.path.isfile(ev):
        sources.append(ev)

    out = {}
    for src in sources:
        scripts, movements = T.parse_scripts(src, unhandled)
        got = T.transpile_map(scripts, movements, unhandled)
        for label, ops in got.items():
            if label == '__map__':
                continue
            out.setdefault(label, ops)   # first definition wins

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{len(sources)} shared files -> {len(out)} labels -> {out_path}')
    print(f'unhandled: {sum(unhandled.values())} ({len(unhandled)} distinct)')

    if not str_path:
        return
    # Text lives beside the scripts in those same files, and also in data/text/.
    text_sources = list(sources)
    td = os.path.join(data_dir, 'text')
    if os.path.isdir(td):
        for root, _dirs, files in os.walk(td):
            text_sources += [os.path.join(root, f) for f in sorted(files) if f.endswith('.inc')]
    strings = {}
    for src in text_sources:
        try:
            for label, s in T.resolve_text(src).items():
                strings.setdefault(label, s)
        except Exception:
            continue
    with open(str_path, 'w', encoding='utf-8') as f:
        json.dump(strings, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(text_sources)} text sources -> {len(strings)} strings -> {str_path}')


if __name__ == '__main__':
    main()
