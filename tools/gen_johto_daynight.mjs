// gen_johto_daynight.mjs — extract AUTHENTIC per-map morning/day/night GRASS encounter
// tables for Johto (Gen-2) from the pokecrystal decomp, and emit them as a tracked JS
// module (overworld/encounters_daynight.js). The base wild data (data/encounters.json) is
// served read-only from owdata and has no time-of-day split, so these live in code.
//
// Source: pokecrystal data/wild/johto_grass.asm — each map has 3 tables (morn/day/nite),
// 7 slots each ("db LEVEL, SPECIES"), with the fixed Gen-2 grass slot rates below.
// Kanto (FireRed) / Hoenn (Emerald) are Gen-3 with no vanilla day/night split, so they are
// NOT emitted here — encounters.js keeps its code reweighting/overlay for them.
//
// Run from the CardPackOpener repo root (needs the pokecrystal checkout at the path below):
//   node tools/gen_johto_daynight.mjs
import fs from 'fs';
import path from 'path';

// the pokecrystal reference lives in the sibling (Lua) project's gitignored Reference/ dir
const ASM = path.resolve('../Magepunk66/Reference/pokecrystal/data/wild/johto_grass.asm');
const OUT = path.resolve('overworld/encounters_daynight.js');
const SLOT_W = [30, 30, 20, 10, 5, 4, 1]; // Gen-2 grass encounter-slot probabilities (%)
const speciesId = c => c.toLowerCase().replace(/_/g, ''); // RATTATA->rattata, NIDORAN_F->nidoranf, FARFETCH_D->farfetchd

const asm = fs.readFileSync(ASM, 'utf8').split(/\r?\n/);
const out = {};
let cur = null, section = null, slots = null;
for (const raw of asm) {
	const line = raw.trim();
	let m;
	if ((m = line.match(/^def_grass_wildmons\s+(\w+)/))) { cur = 'MAP_' + m[1]; out[cur] = { land: { morning: [], day: [], night: [] } }; continue; }
	if (line === 'end_grass_wildmons') { cur = section = slots = null; continue; }
	if (!cur) continue;
	if (line === '; morn') { section = 'morning'; slots = out[cur].land.morning; continue; }
	if (line === '; day') { section = 'day'; slots = out[cur].land.day; continue; }
	if (line === '; nite') { section = 'night'; slots = out[cur].land.night; continue; }
	if ((m = line.match(/^db\s+(\d+),\s*([A-Z0-9_]+)\s*$/)) && slots) {
		slots.push({ id: speciesId(m[2]), min: +m[1], max: +m[1], w: SLOT_W[slots.length] ?? 1 });
	}
}

const maps = Object.keys(out);
// sanity: every map should have 7 slots in each of the 3 tables
for (const k of maps) for (const ph of ['morning', 'day', 'night']) {
	const n = out[k].land[ph].length;
	if (n !== 7) console.warn(`WARN ${k} ${ph}: ${n} slots (expected 7)`);
}

const body = maps.map(k => {
	const tbl = ph => '[' + out[k].land[ph].map(s => `{id:'${s.id}',min:${s.min},max:${s.max},w:${s.w}}`).join(',') + ']';
	return `\t'${k}': { land: {\n\t\tmorning: ${tbl('morning')},\n\t\tday: ${tbl('day')},\n\t\tnight: ${tbl('night')},\n\t} },`;
}).join('\n');

const header = `// encounters_daynight.js — AUTHENTIC per-map day/night GRASS tables for JOHTO (Gen-2),
// extracted from pokecrystal data/wild/johto_grass.asm by tools/gen_johto_daynight.mjs.
// The base wild data (owdata data/encounters.json) is read-only and has no time-of-day
// split, so the real morning/day/night species lists live here in code. encounters.js
// prefers DAYNIGHT[map][kind][phase] over the base table (no reweighting — these are already
// time-specific). Slot weights are the Gen-2 grass rates [30,30,20,10,5,4,1]. Kanto(FR) and
// Hoenn(Em) are Gen-3 (no vanilla day/night) — they keep encounters.js's reweighting/overlay.
// GENERATED — do not edit by hand; re-run the tool to regenerate.\n`;

fs.writeFileSync(OUT, `${header}export const DAYNIGHT = {\n${body}\n};\n`);
console.log(`Wrote ${OUT} — ${maps.length} Johto grass maps (morning/day/night).`);
