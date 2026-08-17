// gen_johto_daynight.mjs — extract AUTHENTIC per-map morning/day/night GRASS encounter
// tables from the pokecrystal decomp (Gen-2) and emit them as a tracked JS module
// (overworld/encounters_daynight.js). Covers JOHTO (johto_grass.asm) and JohKanto — the
// Crystal Gen-2 Kanto (kanto_grass.asm). The base wild data (data/encounters.json) is served
// read-only from owdata with no time-of-day split, so these live in code.
//
// Kanto (FireRed) / Hoenn (Emerald) are Gen-3 with no vanilla day/night split, so they are
// NOT emitted here — encounters.js keeps its code reweighting/overlay for them.
//
// Map keying:
//   johto_grass.asm  LABEL -> MAP_LABEL
//   kanto_grass.asm  LABEL -> MAP_JOHKANTO_LABEL (the namespaced JohKanto map), or the plain
//                    MAP_LABEL for the shared border maps (Mt Moon / Diglett's / Victory Road /
//                    Tohjo Falls / Routes 26-28) that live in the Crystal id-space unprefixed.
//   Resolution is validated against data/map_index.json + a base `land` entry so a bad label
//   is skipped, and the Johto pass wins any overlap.
//
// Run from the CardPackOpener repo root (needs the pokecrystal checkout at the path below):
//   node tools/gen_johto_daynight.mjs
import fs from 'fs';
import path from 'path';

const REF = path.resolve('../Magepunk66/Reference/pokecrystal/data/wild');
const JOHTO_ASM = path.join(REF, 'johto_grass.asm');
const KANTO_ASM = path.join(REF, 'kanto_grass.asm');
const DATA = path.resolve('overworld/data');
const OUT = path.resolve('overworld/encounters_daynight.js');
const SLOT_W = [30, 30, 20, 10, 5, 4, 1]; // Gen-2 grass encounter-slot probabilities (%)
const speciesId = c => c.toLowerCase().replace(/_/g, ''); // RATTATA->rattata, NIDORAN_F->nidoranf, FARFETCH_D->farfetchd

const mapIdx = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(DATA, 'map_index.json'), 'utf8'))));
const enc = JSON.parse(fs.readFileSync(path.join(DATA, 'encounters.json'), 'utf8'));
const hasLand = k => !!(enc[k] && enc[k].land);

// parse a *_grass.asm into [{ label, tables: { morning, day, night } }] (7 slots each)
function parseGrass(file) {
	const rows = [];
	let cur = null, slots = null;
	for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const line = raw.trim();
		let m;
		if ((m = line.match(/^def_grass_wildmons\s+(\w+)/))) { cur = { label: m[1], tables: { morning: [], day: [], night: [] } }; rows.push(cur); continue; }
		if (line === 'end_grass_wildmons') { cur = slots = null; continue; }
		if (!cur) continue;
		if (line === '; morn') { slots = cur.tables.morning; continue; }
		if (line === '; day') { slots = cur.tables.day; continue; }
		if (line === '; nite') { slots = cur.tables.night; continue; }
		if ((m = line.match(/^db\s+(\d+),\s*([A-Z0-9_]+)\s*$/)) && slots) {
			slots.push({ id: speciesId(m[2]), min: +m[1], max: +m[1], w: SLOT_W[slots.length] ?? 1 });
		}
	}
	return rows;
}

const out = {}; // web MAP_id -> { land: { morning, day, night } }
// JOHTO — always MAP_<label>
for (const { label, tables } of parseGrass(JOHTO_ASM)) out['MAP_' + label] = { land: tables };
// JohKanto (Crystal Gen-2 Kanto) — namespaced, or the plain border maps
let jkCount = 0;
for (const { label, tables } of parseGrass(KANTO_ASM)) {
	const jk = 'MAP_JOHKANTO_' + label, plain = 'MAP_' + label;
	let key = null;
	if (mapIdx.has(jk) && hasLand(jk)) key = jk;
	else if (mapIdx.has(plain) && hasLand(plain) && !out[plain]) key = plain; // shared border (not already in the Johto pass)
	if (key) { out[key] = { land: tables }; jkCount++; }
	else console.warn(`skip kanto_grass ${label} (no MAP_JOHKANTO_${label} / MAP_${label} with a land table)`);
}

const maps = Object.keys(out);
for (const k of maps) for (const ph of ['morning', 'day', 'night']) {
	const n = out[k].land[ph].length;
	if (n !== 7) console.warn(`WARN ${k} ${ph}: ${n} slots (expected 7)`);
}

const body = maps.map(k => {
	const tbl = ph => '[' + out[k].land[ph].map(s => `{id:'${s.id}',min:${s.min},max:${s.max},w:${s.w}}`).join(',') + ']';
	return `\t'${k}': { land: {\n\t\tmorning: ${tbl('morning')},\n\t\tday: ${tbl('day')},\n\t\tnight: ${tbl('night')},\n\t} },`;
}).join('\n');

const header = `// encounters_daynight.js — AUTHENTIC per-map day/night GRASS tables for JOHTO + JohKanto
// (Gen-2), extracted from pokecrystal data/wild/{johto,kanto}_grass.asm by
// tools/gen_johto_daynight.mjs. The base wild data (owdata data/encounters.json) is read-only
// and has no time-of-day split, so the real morning/day/night species lists live here in
// code. encounters.js prefers DAYNIGHT[map][kind][phase] over the base table (no reweighting —
// these are already time-specific). Slot weights are the Gen-2 grass rates [30,30,20,10,5,4,1].
// Kanto(FR) and Hoenn(Em) are Gen-3 (no vanilla day/night) — they keep encounters.js's
// reweighting/overlay. GENERATED — do not edit by hand; re-run the tool to regenerate.\n`;

fs.writeFileSync(OUT, `${header}export const DAYNIGHT = {\n${body}\n};\n`);
console.log(`Wrote ${OUT} — ${maps.length} maps (${maps.length - jkCount} Johto + ${jkCount} JohKanto), morning/day/night.`);
