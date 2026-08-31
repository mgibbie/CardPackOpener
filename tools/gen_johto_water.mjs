// gen_johto_water.mjs — build the missing WATER and FISHING encounter tables for
// JOHTO and JohKanto from the pokecrystal decomp, and write them into
// overworld/data/encounters.json.
//
// Why: those two regions shipped with 66 and 23 land tables and *zero* water,
// fishing or rock-smash tables. Surf had no payoff and all three rods were inert
// across half the game — every Johto water species (Tentacool, Chinchou,
// Qwilfish, Remoraid, Corsola, Mantine) was uncatchable.
//
// Sources (Gen 2):
//   data/wild/johto_water.asm, kanto_water.asm  — 3 slots + an encounter rate
//   data/maps/maps.asm                          — each map's FISHGROUP_* (8th field)
//   data/wild/fish.asm                          — the 13 fishing groups, per rod
//
// Map keying follows tools/gen_johto_daynight.mjs exactly: Johto labels are
// MAP_<label>; Crystal's Kanto is MAP_JOHKANTO_<label>, falling back to the plain
// MAP_<label> for the border maps that live unprefixed (Mt Moon, Diglett's Cave,
// Victory Road, Tohjo Falls, Routes 26-28). A label that resolves to no real map
// is skipped and reported rather than written.
//
// Idempotent: only writes a table where none exists, so a hand-tuned or Gen-3
// table is never clobbered.
//
//   node tools/gen_johto_water.mjs            (dry run)
//   node tools/gen_johto_water.mjs --write
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = path.resolve('../Magepunk66/Reference/pokecrystal');
const WILD = path.join(REF, 'data/wild');
const DATA = path.resolve('overworld/data');
const ENC = path.join(DATA, 'encounters.json');

const speciesId = c => c.toLowerCase().replace(/_/g, '');
// Gen-2 water uses three slots at 60/30/10; the fishing table is reshaped to the
// FRLG 10-slot layout encounters.js.fish() indexes (Old [0,1], Good [2,4], Super [5,9])
const WATER_W = [60, 30, 10];
const ROD_SLOTS = { old: 2, good: 3, super: 5 };

const mapIdx = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(DATA, 'map_index.json'), 'utf8'))));
const enc = JSON.parse(fs.readFileSync(ENC, 'utf8'));

// ---------- water ----------
function parseWater(file) {
	const rows = [];
	let cur = null;
	for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const line = raw.trim();
		let m;
		if ((m = line.match(/^def_water_wildmons\s+(\w+)/))) { cur = { label: m[1], rate: 0, slots: [] }; rows.push(cur); continue; }
		if (line === 'end_water_wildmons') { cur = null; continue; }
		if (!cur) continue;
		if ((m = line.match(/^db\s+(\d+)\s+percent/))) { cur.rate = +m[1]; continue; }
		if ((m = line.match(/^db\s+(\d+),\s*([A-Z0-9_]+)/))) {
			cur.slots.push({ id: speciesId(m[2]), min: +m[1], max: +m[1], w: WATER_W[cur.slots.length] ?? 1 });
		}
	}
	return rows;
}

// ---------- fishing ----------
// fish.asm rows are `db <cumulative chance>, SPECIES, level`; the per-entry weight
// is the gap to the previous row.
function parseFish() {
	const text = fs.readFileSync(path.join(WILD, 'fish.asm'), 'utf8').split(/\r?\n/);
	const groups = [];   // [{ old: '.Shore_Old', good, super }]
	const lists = {};    // '.Shore_Old' -> [{id,min,max,w}]
	let cur = null, prev = 0;
	for (const raw of text) {
		const line = raw.trim();
		let m;
		if ((m = line.match(/^fishgroup\s+[^,]+,\s*(\.\w+),\s*(\.\w+),\s*(\.\w+)/))) {
			groups.push({ old: m[1], good: m[2], super: m[3] });
			continue;
		}
		if ((m = line.match(/^(\.\w+):/))) { cur = m[1]; lists[cur] = []; prev = 0; continue; }
		if (!cur) continue;
		if ((m = line.match(/^db\s+(\d+)\s+percent(?:\s*\+\s*\d+)?,\s*([A-Z0-9_]+),\s*(\d+)/))) {
			const cum = +m[1];
			lists[cur].push({ id: speciesId(m[2]), min: +m[3], max: +m[3], w: Math.max(1, cum - prev) });
			prev = cum;
			continue;
		}
		if (line === '' || line.startsWith(';')) continue;
		if (/^\w/.test(line)) cur = null; // left the fishing tables
	}
	return { groups, lists };
}

// fit a rod's Crystal list to the exact slot count encounters.js indexes, keeping
// the total weight of every species intact (extras fold into the last kept slot;
// a short list repeats with its weight split).
function resize(list, n) {
	if (!list?.length) return null;
	if (list.length >= n) {
		const kept = list.slice(0, n).map(s => ({ ...s }));
		for (const extra of list.slice(n)) kept[n - 1].w += extra.w;
		return kept;
	}
	const out = [];
	for (let i = 0; i < n; i++) out.push({ ...list[i % list.length] });
	const reps = new Map();
	out.forEach((_, i) => reps.set(i % list.length, (reps.get(i % list.length) || 0) + 1));
	out.forEach((s, i) => { s.w = Math.max(1, Math.round(s.w / reps.get(i % list.length))); });
	return out;
}

const { groups, lists } = parseFish();
// FISHGROUP_QWILFISH_SWARM <-> .Qwilfish_Swarm_Old — match on the squashed name
const byName = new Map();
groups.forEach(g => byName.set(g.old.replace(/^\./, '').replace(/_Old$/, '').replace(/_/g, '').toLowerCase(), g));
// maps.asm names maps in CamelCase (UnionCave1F) while the wild tables use
// SCREAMING_SNAKE (UNION_CAVE_1F) — squash both to compare.
const squash = s => s.replace(/^MAP_/, '').replace(/^JOHKANTO_/, '').replace(/_/g, '').toLowerCase();
const fishGroupOf = new Map();  // squashed map name -> group
for (const raw of fs.readFileSync(path.join(REF, 'data/maps/maps.asm'), 'utf8').split(/\r?\n/)) {
	const m = raw.trim().match(/^map\s+(\w+),.*,\s*(FISHGROUP_\w+)\s*$/);
	if (!m) continue;
	const g = byName.get(m[2].replace(/^FISHGROUP_/, '').replace(/_/g, '').toLowerCase());
	if (g) fishGroupOf.set(squash(m[1]), g);
}

function fishingFor(label) {
	const g = fishGroupOf.get(squash(label));
	if (!g) return null;
	const old = resize(lists[g.old], ROD_SLOTS.old);
	const good = resize(lists[g.good], ROD_SLOTS.good);
	const sup = resize(lists[g.super], ROD_SLOTS.super);
	if (!old || !good || !sup) return null;
	return { rate: 10, slots: [...old, ...good, ...sup] };  // rate = bite chance, matching the Gen-3 tables
}

// ---------- resolve + write ----------
const skipped = [];
const johtoKeys = new Set();   // the MAP_ ids this run touched, for the fishing sweep
let water = 0, fishing = 0;
function keyFor(label, johto) {
	if (johto) return mapIdx.has('MAP_' + label) ? 'MAP_' + label : null;
	const jk = 'MAP_JOHKANTO_' + label, plain = 'MAP_' + label;
	if (mapIdx.has(jk)) return jk;
	if (mapIdx.has(plain)) return plain;
	return null;
}
for (const [file, johto] of [['johto_water.asm', true], ['kanto_water.asm', false]]) {
	for (const row of parseWater(path.join(WILD, file))) {
		const key = keyFor(row.label, johto);
		if (!key) { skipped.push(`${file}:${row.label}`); continue; }
		johtoKeys.add(key);
		const t = enc[key] || (enc[key] = {});
		if (!t.water && row.slots.length) { t.water = { rate: row.rate, slots: row.slots }; water++; }
		if (!t.fishing) { const f = fishingFor(row.label); if (f) { t.fishing = f; fishing++; } }
	}
}
// Any Johto/JohKanto map that HAS water should also be fishable — Crystal assigns
// a fish group to every map, so drive this off the map ids we just gave water to.
for (const key of Object.keys(enc)) {
	if (enc[key].fishing || !enc[key].water) continue;
	if (!/^MAP_JOHKANTO_/.test(key) && !johtoKeys.has(key)) continue;
	const f = fishingFor(key);
	if (f) { enc[key].fishing = f; fishing++; }
}

console.log(`water tables added:   ${water}`);
console.log(`fishing tables added: ${fishing}`);
if (skipped.length) console.log(`skipped (no such map): ${skipped.length} — ${skipped.slice(0, 6).join(', ')}`);
if (WRITE) { fs.writeFileSync(ENC, JSON.stringify(enc)); console.log('written to ' + ENC); }
else console.log('(dry run — pass --write)');
