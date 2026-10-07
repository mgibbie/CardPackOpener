#!/usr/bin/env python3
"""crystal_block_cells.py — a Crystal BLOCK's four converted grid cells, computed
from the decomp the same way the tileset converter built them.

Magepunk66/tools/crystal_native_build.py renders EVERY block of each Crystal
tileset (per roof group) into the engine tileset — so every block's art and
metatiles already exist in our converted sheets — but it never saved the
block -> metatile mapping (`block_to_quads`). tools/crystal_blocks.mjs
therefore harvests a block's cells from converted maps where the block appears,
and a `changeblock` to a block that no map uses (a Ruins chamber's opened wall,
the E4 rooms' closed entrance, Route 19's cleared rocks...) could not be built.

This reruns the converter's own build_tileset (with every file write disabled)
and expand_to_layout's collision rule, so the cells are exactly what the
converter would have written for that block.

  stdin:  JSON [{"name": "<crystal map name>", "block": <int>}, ...]
  stdout: JSON {"<name>:<block>": [TL, TR, BL, BR] grid values}
"""
import io, json, os, sys

MP66 = os.environ.get('MAGEPUNK66') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'Magepunk66')
sys.path.insert(0, os.path.join(MP66, 'tools'))
import crystal_native_build as B   # noqa: E402
import crystal_truth_lib as T      # noqa: E402


# --- never write: the converter saves its sheet + metatile JSON as it builds ---
_real_open = open
def _no_write_open(path, mode='r', *a, **k):
    if any(c in mode for c in 'wa+'):
        return io.StringIO()
    return _real_open(path, mode, *a, **k)
B.open = _no_write_open
B.Image.Image.save = lambda self, *a, **k: None


def cells_for(name, block, headers, mm, lk):
    hdr = headers.get(name)
    if not hdr:
        return None
    roof_group = hdr['group'] if hdr['env'] in ('TOWN', 'ROUTE') else None
    ts = B.build_tileset(hdr['tileset'], roof_group)
    if block >= len(ts['block_to_quads']):
        return None
    quads = ts['block_to_quads'][block]
    coll = ts['collision'][block] if block < len(ts['collision']) else ['WALL'] * 4
    # the same collision rule as expand_to_layout (keyed by the map's _crystal_tileset)
    mj_path = os.path.join(B.OVERWORLD, f'{name}_map.json')
    crystal_ts = json.load(_real_open(mj_path)).get('_crystal_tileset') if os.path.exists(mj_path) else None
    config_key = lk.get(crystal_ts, 'johto')
    imp = mm.get(config_key, {}).get('blocks', {}).get(str(block), {}).get('impassable')
    out = []
    for qi in range(4):
        val = quads[qi]
        blocked = imp[qi] if imp else (not B.quad_passable(coll[qi]))
        if blocked:
            val |= B.COLLISION_BITS
        out.append(val)
    return {'cells': out, 'const': ts['const']}


def main():
    req = json.load(sys.stdin)
    real_stdout = sys.stdout
    sys.stdout = sys.stderr   # the converter prints progress; keep stdout for the JSON
    headers = T.load_map_headers()
    mm, lk = B.impassable_lookup()
    res = {}
    for r in req:
        c = cells_for(r['name'], int(r['block']), headers, mm, lk)
        if c:
            res[f"{r['name']}:{r['block']}"] = c
    real_stdout.write(json.dumps(res))


if __name__ == '__main__':
    main()
