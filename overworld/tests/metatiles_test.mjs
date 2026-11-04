// metatiles_test.mjs — every scripted tile edit names a real tile.
//
// All 1,098 `setmetatile` ops in the transpiled scripts name their tile the decomp
// way ("METATILE_VermilionGym_Floor"). The engine ANDed that string to 0, the
// "outside the map" metatile, so every scripted door, wall and gym puzzle across 95
// maps opened into impassable void (playtest 2026-09-25: Vermilion's beams stayed
// shut). World.setMetatile now resolves names through metatile_labels.js
// (tools/gen_metatile_labels.mjs), and REFUSES a name it can't resolve rather than
// writing void. This keeps the table complete: a re-transpile or a new script using
// a name the table lacks fails here, not in someone's playthrough.
//
//   node overworld/tests/metatiles_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { metatileId, METATILE_LABELS } from '../metatile_labels.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const D = path.join(ROOT, 'overworld/data/scripts');
let ops = 0; const bad = [], outOfRange = [];
for (const f of fs.readdirSync(D).filter(f => f.endsWith('.json'))) {
	let p; try { p = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch { continue; }
	const map = f.replace(/\.json$/, '');
	for (const v of Object.values(p)) if (Array.isArray(v)) for (const o of v) {
		if (!o || o.op !== 'setmetatile') continue;
		ops++;
		const id = metatileId(o.tile, map);
		if (id == null) bad.push(`${map}: ${o.tile}`);
		else if (!(id > 0 && id < 0x400)) outOfRange.push(`${map}: ${o.tile}=${id}`);
	}
}
A(ops > 1000, `scanned every scripted setmetatile (${ops})`);
A(!bad.length, 'every tile name resolves (else run tools/gen_metatile_labels.mjs)', bad.slice(0, 6).join(' | '));
A(!outOfRange.length, 'every resolved id is a real metatile (1..0x3FF), never the 0 "outside" tile', outOfRange.slice(0, 6).join(' | '));

// spot values straight from the decomps' metatile_labels.h
A(metatileId('METATILE_VermilionGym_Floor', 'VermilionCity_Gym') === 0x281, 'VermilionGym_Floor is FireRed 0x281');
A(metatileId('METATILE_General_CalmWater', 'SeafoamIslands_B4F') === 299, 'a name the games define differently resolves by the map\'s own game (Seafoam = FireRed 299, not Emerald 368)');
A(metatileId('METATILE_NoSuchTile', 'VermilionCity_Gym') === undefined, 'an unknown name resolves to nothing (the engine then leaves the tile alone)');
A(metatileId(0x21A, 'x') === 0x21A && metatileId('0x21A', 'x') === 0x21A, 'numeric tiles pass through');
A(Object.keys(METATILE_LABELS).length > 250, `the table covers the scripts' names (${Object.keys(METATILE_LABELS).length})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
