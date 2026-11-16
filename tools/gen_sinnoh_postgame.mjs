// gen_sinnoh_postgame.mjs — SINNOH after its Champion: every fakemon that only the rift had now lives somewhere.
//
// The owner, 2026-11-16: "redo the postgame and place all the fakemon that are only found in the rift on
// random/appropriate routes/locations throughout sinnoh".
//
// 623 fakemon exist (CAP, Uranium, Radical Ransei); 149 are on a wild table somewhere and the other 474 could only
// be met through the Ransei rift (1 wild battle in 20 after a Champion, any fakemon at random). This writes
// overworld/encounters_sinnoh_postgame.js: for each Sinnoh map with wild POKeMON, the table it has once Sinnoh's
// Champion is beaten (encounters.js reads it first, then).
//
//   A map's post-game table = the SOURCE's own post-game table for it (its "gRoute201_PostGame": the national-dex
//   arrivals), or its ordinary one where the source has none, at 60% of the rolls
//   + the fakemon given a home there, sharing the other 40% evenly.
//
// WHERE a fakemon lives is its type's habitat, then chance. Each map has habitats by what it is (a cave: Rock,
// Ground, Steel, Dark, Fighting; Iron Island: Steel; Stark Mountain: Fire; the snow routes and Snowpoint Temple:
// Ice; the Old Chateau, Lost Tower and the ruins: Ghost and Psychic; the Great Marsh: Poison; the Windworks and
// Sunyshore: Electric; the sea routes: Water and Flying; fields: Grass, Bug, Normal, Fairy…). A Water type goes to
// a map's WATER (surfing) where it has some; everything else to its grass or cave floor. Among the maps that suit
// it, a species takes the emptiest, ties broken by a hash of its name: stable between runs, with no hand list.
// Its level is the map's own, raised for a species that is strong for its line (base stat total), and the game
// then scales it to your party as it does all of Sinnoh.
//
//   node tools/gen_sinnoh_postgame.mjs            (report)
//   node tools/gen_sinnoh_postgame.mjs --write
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'overworld/data');
const J = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const imp = f => import(pathToFileURL(path.join(ROOT, 'overworld', f)).href);
const REF = (() => { for (let d = ROOT; ; d = path.dirname(d)) { const p = path.join(d, 'Magepunk66', 'Reference'); if (fs.existsSync(p)) return p; if (path.dirname(d) === d) return null; } })();

const species = J('species_battle.json'), base = J('encounters.json');
const norm = s => String(s).replace(/^SPECIES_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const SP_BY = Object.fromEntries(Object.keys(species).map(k => [norm(k), k]));

// ---- 1. the fakemon no wild table holds ----
const onATable = new Set();
const note = slots => { for (const s of slots || []) if (s && s.id) onATable.add(s.id); };
for (const [map, t] of Object.entries(base)) if (!map.startsWith('MAP_SINNOH_') || true) for (const g of Object.values(t)) note(g && g.slots);
const { DAYNIGHT } = await imp('encounters_daynight.js');
for (const t of Object.values(DAYNIGHT)) for (const ph of Object.values(t)) for (const slots of Object.values(ph || {})) note(slots);
const { FREM_NIGHT } = await imp('encounters_frem_night.js');
for (const t of Object.values(FREM_NIGHT)) note(t.land && t.land.night);
const { POSTGAME } = await imp('encounters_postgame.js');
for (const t of Object.values(POSTGAME)) for (const v of Object.values(t)) { if (Array.isArray(v)) note(v); else for (const slots of Object.values(v || {})) note(slots); }
const { HEADBUTT_SETS } = await imp('headbutt_data.js');
for (const tiers of Object.values(HEADBUTT_SETS)) for (const rows of Object.values(tiers || {})) for (const r of rows || []) if (Array.isArray(r)) onATable.add(r[1]);
const riftOnly = Object.keys(species).filter(id => (species[id].num || 0) <= 0 && (species[id].learnset || []).length && !onATable.has(id)).sort();

// ---- 2. the maps, and what lives on each ----
const maps = Object.keys(base).filter(k => k.startsWith('MAP_SINNOH_')).sort();
const HABITAT = [   // first match wins; the types are that place's, most its own first
	[/IRON_ISLAND/, ['Steel', 'Rock', 'Ground', 'Fighting']],
	[/STARK_MOUNTAIN/, ['Fire', 'Rock', 'Ground', 'Dragon']],
	[/FUEGO_IRONWORKS/, ['Fire', 'Steel', 'Electric']],
	[/SNOWPOINT_TEMPLE|ROUTE216|ROUTE217|ACUITY/, ['Ice', 'Steel', 'Fighting', 'Dark']],
	[/OLD_CHATEAU|LOST_TOWER|TURNBACK_CAVE|SENDOFF_SPRING/, ['Ghost', 'Dark', 'Psychic', 'Poison']],
	[/SOLACEON_RUINS|MANIAC_TUNNEL|CELESTIC/, ['Psychic', 'Ghost', 'Rock', 'Fairy']],
	[/GREAT_MARSH|ROUTE212_SOUTH|PASTORIA/, ['Poison', 'Bug', 'Grass', 'Ground', 'Water']],
	[/VALLEY_WINDWORKS|SUNYSHORE|ROUTE222/, ['Electric', 'Flying', 'Steel', 'Water']],
	[/MT_CORONET_OUTSIDE/, ['Ice', 'Dragon', 'Flying', 'Rock']],
	[/MT_CORONET/, ['Dragon', 'Rock', 'Psychic', 'Fighting', 'Ground']],
	[/VICTORY_ROAD|POKMON_LEAGUE/, ['Dragon', 'Fighting', 'Dark', 'Rock', 'Steel']],
	[/ARTISAN_CAVE|RAVAGED_PATH|OREBURGH_GATE|OREBURGH_MINE|WAYWARD_CAVE/, ['Rock', 'Ground', 'Dark', 'Fighting', 'Steel']],
	[/ETERNA_FOREST|ETERNA_CITY|ROUTE205/, ['Bug', 'Grass', 'Poison', 'Fairy']],
	[/TROPHY_GARDEN|ROUTE209|ROUTE210|ROUTE215/, ['Fairy', 'Normal', 'Psychic', 'Fighting', 'Grass']],
	[/ROUTE22[4-9]|ROUTE230|RESORT_AREA/, ['Dragon', 'Fire', 'Dark', 'Ground', 'Fighting', 'Flying']],
	[/ROUTE21[89]|ROUTE22[0-3]|CANALAVE|LAKE_|LAKEFRONT/, ['Water', 'Flying', 'Normal', 'Fairy', 'Grass']],
	[/ROUTE21[134]|ROUTE20[678]/, ['Fighting', 'Rock', 'Ground', 'Normal', 'Flying']],
	[/./, ['Normal', 'Grass', 'Bug', 'Flying', 'Fairy']],
];
const habitat = id => HABITAT.find(([re]) => re.test(id.replace('MAP_SINNOH_', '')))[1];
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---- 3. a home for each ----
const home = {};   // map -> { land: [id], water: [id] }
for (const m of maps) home[m] = { land: [], water: [] };
const kindsOf = m => ({ land: !!(base[m].land && base[m].land.slots.length), water: !!(base[m].water && base[m].water.slots.length) });
const unplaced = [];
for (const id of riftOnly) {
	const types = species[id].types || ['Normal'];
	const watery = types[0] === 'Water' || (types.includes('Water') && hash(id) % 2 === 0);
	let best = null;
	for (const kind of watery ? ['water', 'land'] : ['land']) {
		for (const m of maps) {
			if (!kindsOf(m)[kind]) continue;
			const hab = habitat(m);
			// how well this place suits it: its first type counts most, and so does the place's own first type
			let fit = -1;
			types.forEach((t, ti) => { const hi = hab.indexOf(t); if (hi >= 0) fit = Math.max(fit, (ti === 0 ? 10 : 6) - hi); });
			if (kind === 'water' && watery) fit = Math.max(fit, 5);   // any water will do for a Water type
			if (fit < 0) continue;
			const load = home[m][kind].length;
			const score = [-Math.min(load, 9), fit, -(hash(id + m) % 1000)];   // the emptiest first, then the best suited, then chance
			if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && (score[1] > best.score[1] || (score[1] === best.score[1] && score[2] > best.score[2])))) best = { m, kind, score };
		}
		if (best) break;
	}
	if (!best) { unplaced.push(id); continue; }
	home[best.m][best.kind].push(id);
}

// ---- 4. the tables ----
// the source's own post-game table of a map, where it has one (the staged source: tools/stage_sinnoh.py)
const srcPost = {};
const sw = REF && path.join(REF, 'sinnoh-staged', 'src', 'data', 'wild_encounters.json');
if (sw && fs.existsSync(sw)) {
	const g = JSON.parse(fs.readFileSync(sw, 'utf8')).wild_encounter_groups[0];
	const rates = Object.fromEntries(g.fields.map(f => [f.type, f.encounter_rates]));
	for (const e of g.encounters) {
		if (!/_PostGame$/.test(e.base_label || '') || !base[e.map]) continue;
		for (const [src, kind] of [['land_mons', 'land'], ['water_mons', 'water']]) {
			const t = e[src]; if (!t || !t.mons) continue;
			const slots = t.mons.map((m, i) => ({ id: SP_BY[norm(m.species)], min: m.min_level, max: m.max_level, w: rates[src][i] || 1 })).filter(s => s.id);
			if (slots.length) (srcPost[e.map] = srcPost[e.map] || {})[kind] = slots;
		}
	}
}
const bst = id => Object.values(species[id].baseStats || {}).reduce((a, b) => a + b, 0);
const out = {};
let placed = 0, fromSource = 0;
for (const m of maps) {
	for (const kind of ['land', 'water']) {
		const own = base[m][kind] && base[m][kind].slots; if (!own || !own.length) continue;
		const post = srcPost[m] && srcPost[m][kind];
		if (post) fromSource++;
		const core = post || own, total = core.reduce((a, s) => a + s.w, 0);
		const lo = Math.min(...own.map(s => s.min)), hi = Math.max(...own.map(s => s.max));
		const guests = home[m][kind];
		if (!guests.length && !post) continue;   // nothing changes here after the League
		const each = guests.length ? Math.round(total * (40 / 60) / guests.length * 10) / 10 : 0;
		const slots = core.map(s => ({ id: s.id, min: s.min, max: s.max, w: s.w }));
		for (const id of guests) {
			const up = bst(id) >= 480 ? 8 : bst(id) >= 380 ? 4 : 0;   // a strong one sits above the map's own
			slots.push({ id, min: Math.max(2, lo + up), max: Math.max(lo + up, hi + up), w: each });
			placed++;
		}
		(out[m] = out[m] || {})[kind] = slots;
	}
}
const perMap = maps.map(m => home[m].land.length + home[m].water.length);
console.log(`fakemon no wild table held: ${riftOnly.length}; given a home in Sinnoh: ${placed}; with nowhere that suits: ${unplaced.length} ${unplaced.slice(0, 8).join(' ')}`);
console.log(`maps with a post-game table: ${Object.keys(out).length} of ${maps.length} (the source's own post-game table on ${fromSource} of their tables); fakemon a map: ${Math.min(...perMap)}-${Math.max(...perMap)}`);
if (!REF || !fs.existsSync(sw)) console.log('(no staged Sinnoh source: the ordinary tables stand in for its post-game ones)');

if (WRITE) {
	const head = `// encounters_sinnoh_postgame.js — SINNOH's wild POKeMON once its Champion is beaten. GENERATED by
// tools/gen_sinnoh_postgame.mjs; re-run it rather than editing by hand.
//
// Each map's table is the source's own post-game table (or its ordinary one) at 60% of the rolls, and the fakemon
// given a home there at the other 40%. Every fakemon that only the Ransei rift held is on exactly one of these:
// ${placed} of them, by type (a Steel type on Iron Island, an Ice type in the snow, a Water type in the water).
// encounters.js reads this first on a Sinnoh map, when Badges.isChampion('SINNOH').
export const SINNOH_POSTGAME = `;
	fs.writeFileSync(path.join(ROOT, 'overworld', 'encounters_sinnoh_postgame.js'), head + JSON.stringify(out, null, '\t').replace(/\{\n\t+"id": "([^"]+)",\n\t+"min": (\d+),\n\t+"max": (\d+),\n\t+"w": ([\d.]+)\n\t+\}/g, '{ id: \'$1\', min: $2, max: $3, w: $4 }').replace(/"(\w+)":/g, '$1:').replace(/"/g, "'") + ';\n');
	console.log('wrote overworld/encounters_sinnoh_postgame.js');
} else console.log('(dry run — pass --write)');
