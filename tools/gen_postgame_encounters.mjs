// gen_postgame_encounters.mjs — give JohKanto a reason to exist: every species
// the rest of the game leaves uncatchable lives there.
//
// The coverage report says 298 ordinary evolution ROOTS have no home anywhere.
// Placing a root is enough — evolution and breeding closure carry the rest of
// each line for free, which is why 298 placements reach 631 species.
//
// WHY A NEW FILE rather than editing the existing tables:
//   - All 23 JohKanto maps that carry a land table are ALSO in
//     encounters_daynight.js, and DAYNIGHT takes precedence for land
//     (encounters.js pick()). Adding species to the base table would be inert —
//     the exact "data with no consumer" failure this codebase keeps producing.
//   - encounters_daynight.js is generated from pokecrystal by
//     gen_johto_daynight.mjs and covers Johto too; writing into it means the next
//     regeneration silently eats this.
//   So the postgame roster is its own module with its own owner, consulted first.
//
// DESIGN — the eight gyms are the index.
// JohKanto's gyms are Gen-2 Kanto's, so each has a type, and each leader's
// territory holds the roots of that type. Between them the eight cover all
// eighteen types, which is what makes "every mon is catchable somewhere" true by
// construction rather than by accident:
//
//   Brock    rock/ground/steel      Pewter, Routes 2-3, Rock Tunnel
//   Misty    water/ice              Cerulean, Routes 4/9/24/25
//   Surge    electric/flying        Vermilion, Routes 6/10/11
//   Erika    grass/bug              Celadon, Routes 7/16/17/18
//   Janine   poison/dark            Fuchsia, Routes 12-15
//   Sabrina  psychic/fairy          Saffron, Lavender, Routes 5/8
//   Blaine   fire/dragon            Cinnabar, Pallet, Routes 19-21
//   Blue     fighting/ghost         Viridian, Routes 1/22
//
// NORMAL is deliberately not a territory. It is the one type that lives
// everywhere in these games, and confining 35 of them to Viridian's two grassy
// routes would have overflowed that territory by a third while others sat half
// empty — so Normal fills the rare slots left over region-wide.
//
// Time of day is real capacity here: a land map carries three 7-slot rosters
// (morning/day/night), so one route can hold ~21 species and the region does not
// have to be a soup. Water types prefer water and fishing slots.
//
// Levels run 50-77 by gym order — this is post-Champion content, entered by a
// team that just won a League.
//
//   node tools/gen_postgame_encounters.mjs           (report)
//   node tools/gen_postgame_encounters.mjs --write   (write encounters_postgame.js)
import fs from 'fs';
import { execSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const D = 'overworld/data';
const bat = JSON.parse(fs.readFileSync(`${D}/species_battle.json`, 'utf8'));
const ext = JSON.parse(fs.readFileSync(`${D}/species_extra.json`, 'utf8'));
const enc = JSON.parse(fs.readFileSync(`${D}/encounters.json`, 'utf8'));
const survey = JSON.parse(fs.readFileSync('tools/data/johkanto_survey.json', 'utf8'));

// ---------- the roots that need a home ----------
const ALL = Object.keys(bat).filter(k => !k.startsWith('_'));
const bst = id => Object.values(bat[id].baseStats || {}).reduce((a, b) => a + b, 0);
const preEvo = new Map();
for (const id of ALL) for (const e of (ext[id]?.evos || [])) if (bat[e.target] && !preEvo.has(e.target)) preEvo.set(e.target, id);

// --ignore-postgame so this stays idempotent: without it the coverage tool would
// count the roster this script wrote last time and report nothing left to place.
const out = execSync('node tools/species_coverage.mjs --list --ignore-postgame', { encoding: 'utf8', maxBuffer: 1e8 });
const missing = new Set(out.split('\n').filter(l => /^ {2}#/.test(l)).map(l => l.trim().split(/\s+/).pop().replace(/[()]/g, '')));
const roots = [...missing].filter(id => !preEvo.has(id) || !missing.has(preEvo.get(id)));
// legendaries and mythicals are a different job (task #84): they want one placed
// encounter each, not a route slot shared with Rattata
const isLegendary = id => bst(id) >= 570 && !preEvo.has(id) && !(ext[id]?.evos || []).length;
const ordinary = roots.filter(id => !isLegendary(id));

// ---------- territories ----------
const TERRITORIES = [
	{ gym: 'Brock', types: ['Rock', 'Ground', 'Steel'], lvl: 50,
		maps: ['PEWTER_CITY', 'ROUTE_2', 'ROUTE_3', 'ROCK_TUNNEL_1F', 'ROCK_TUNNEL_B1F'] },
	{ gym: 'Misty', types: ['Water', 'Ice'], lvl: 53,
		maps: ['CERULEAN_CITY', 'CERULEAN_GYM', 'ROUTE_4', 'ROUTE_24', 'ROUTE_25', 'ROUTE_9'] },
	{ gym: 'Lt. Surge', types: ['Electric', 'Flying'], lvl: 56,
		maps: ['VERMILION_CITY', 'POWER_PLANT', 'ROUTE_6', 'ROUTE_11', 'ROUTE_10_NORTH', 'ROUTE_10_SOUTH'] },
	{ gym: 'Erika', types: ['Grass', 'Bug'], lvl: 59,
		maps: ['CELADON_CITY', 'ROUTE_7', 'ROUTE_16', 'ROUTE_17', 'ROUTE_18'] },
	{ gym: 'Janine', types: ['Poison', 'Dark'], lvl: 62,
		maps: ['FUCHSIA_CITY', 'ROUTE_12', 'ROUTE_13', 'ROUTE_14', 'ROUTE_15'] },
	{ gym: 'Sabrina', types: ['Psychic', 'Fairy'], lvl: 65,
		maps: ['SAFFRON_CITY', 'LAVENDER_TOWN', 'ROUTE_5', 'ROUTE_8'] },
	{ gym: 'Blaine', types: ['Fire', 'Dragon'], lvl: 68,
		maps: ['CINNABAR_ISLAND', 'PALLET_TOWN', 'ROUTE_19', 'ROUTE_20', 'ROUTE_21'] },
	{ gym: 'Blue', types: ['Fighting', 'Ghost'], lvl: 71,
		maps: ['VIRIDIAN_CITY', 'ROUTE_1', 'ROUTE_22'] },
];
const MAPID = m => 'MAP_JOHKANTO_' + m;

// Indoor by map_type, a dungeon in practice: 216 walkable tiles, Zapdos at the
// end of it, and Voltorb/Electrode wild in every game it appears in. The
// grassless cave rule is exactly right here.
const DUNGEONS = new Set(['POWER_PLANT']);

// ---------- what each map can actually host ----------
// From the engine-driven survey: a land table is live on a grassy map OR on a
// grassless non-indoor one (the gen-3 cave rule), and a water table needs
// surfable tiles. Both facts come out of tileset ATTRIBUTES, not the map JSON,
// which is why they are measured rather than assumed.
function capacity(mapName) {
	const s = survey[MAPID(mapName)];
	if (!s || s.error) return null;
	// The gen-3 cave rule ("no grass at all -> the floor is the encounter tile")
	// is what makes Rock Tunnel work, but applied naively it also makes CITIES
	// valid land hosts, because a city has no grass and plenty of walkable floor.
	// That would put wild battles on Saffron's streets. Grass, or an actual cave.
	// Grass on a ROUTE, a cave floor, or one of the allowlisted dungeons. Towns are
	// excluded even when they have a patch (Pallet has four tiles) — a wild battle
	// in the middle of a town reads as a bug, and the region has slots to spare.
	const land = (s.grass > 0 && s.type === 'MAP_TYPE_ROUTE')
		|| (s.grass === 0 && s.type === 'MAP_TYPE_UNDERGROUND' && s.walk > 40)
		|| DUNGEONS.has(mapName);
	// likewise water: Cerulean Gym has 58 surfable tiles and is a building
	const water = s.surf > 20 && s.type !== 'MAP_TYPE_INDOOR';
	return { land, water, fishing: water, surf: s.surf, grass: s.grass };
}

// Gen-2 grass weights (7 slots) and the gen-3 water/fishing shapes
const LAND_W = [30, 30, 20, 10, 5, 4, 1];
const WATER_W = [60, 30, 5, 4, 1];
const FISH_W = [70, 30, 60, 20, 20, 40, 40, 15, 4, 1];
const PHASES = ['morning', 'day', 'night'];
// Only the RARE tail of each table is rebuilt. The common slots keep whatever
// JohKanto already had, so the region still plays like Kanto and the new species
// are a reward for looking rather than a wall of strangers: on land that leaves
// 80% of rolls authentic (weights 30/30/20 of 100), and it keeps the Old and Good
// Rod bands intact so early fishing is unchanged.
const KEEP = { land: 3, water: 2, fishing: 5 };

// what JohKanto already has for a map+kind+phase, so the tail can be grafted on
const dnSrc = fs.readFileSync('overworld/encounters_daynight.js', 'utf8');
function existingLand(mapId, phase) {
	const block = new RegExp(`'${mapId}':\\s*\\{ land: \\{([\\s\\S]*?)\\n\\t\\} \\},`).exec(dnSrc);
	if (!block) return [];
	const row = new RegExp(`${phase}:\\s*\\[([^\\]]*)\\]`).exec(block[1]);
	if (!row) return [];
    return [...row[1].matchAll(/\{id:'([a-z0-9_]+)',min:(\d+),max:(\d+),w:(\d+)\}/g)]
		.map(m => ({ id: m[1], min: +m[2], max: +m[3], w: +m[4] }));
}
const existingWet = (mapId, kind) => (enc[mapId]?.[kind]?.slots || []).map(s => ({ ...s }));

// ---------- assign roots to territories ----------
const typeOf = id => (bat[id].types || ['Normal'])[0];
const byTerritory = TERRITORIES.map(() => []);
const spill = [];
for (const id of ordinary) {
	const i = TERRITORIES.findIndex(t => t.types.includes(typeOf(id)));
	if (i >= 0) byTerritory[i].push(id); else spill.push(id);   // Normal + anything typeless
}
spill.sort((a, b) => bst(a) - bst(b));
// weakest first, so a route's common slots hold the small fry and its rare slots
// hold the heavy hitters — the shape a real table has
for (const list of byTerritory) list.sort((a, b) => bst(a) - bst(b));

// ---------- build the slots ----------
const POSTGAME = {};
const placed = new Map();          // species -> "MAP/kind/phase"
const report = [];

function levelFor(base, rank, n) {
	// a small climb across a territory's rarity ladder, so the rare slot is also
	// the strong one
	const lo = base + Math.round((rank / Math.max(1, n - 1)) * 5);
	return [lo, lo + 3];
}

for (let ti = 0; ti < TERRITORIES.length; ti++) {
	const t = TERRITORIES[ti];
	const pool = byTerritory[ti];
	// Every rebuildable slot in this territory, ordered SLOT-INDEX FIRST so the
	// whole territory gets its commonest new slot before any map gets its rarest.
	// Filling map-by-map instead would stuff the first route with 21 species and
	// leave the rest of the territory as vanilla Kanto.
	const landSlots = [], waterSlots = [], fishSlots = [];
	for (let i = KEEP.land; i < LAND_W.length; i++)
		for (const m of t.maps) { if (capacity(m)?.land) for (const ph of PHASES) landSlots.push({ m, kind: 'land', ph, i }); }
	// Water and fishing tails are only offered where a table ALREADY exists. A
	// fishing table's slot INDEX is its rod tier (Old [0,1], Good [2,4], Super
	// [5,9]), so emitting a tail with no head would shift every Super Rod species
	// into the Old Rod band and leave the Super Rod with nothing to hook.
	for (let i = KEEP.water; i < WATER_W.length; i++)
		for (const m of t.maps) { if (capacity(m)?.water && existingWet(MAPID(m), 'water').length >= KEEP.water) waterSlots.push({ m, kind: 'water', i }); }
	for (let i = KEEP.fishing; i < FISH_W.length; i++)
		for (const m of t.maps) { if (capacity(m)?.fishing && existingWet(MAPID(m), 'fishing').length >= KEEP.fishing) fishSlots.push({ m, kind: 'fishing', i }); }
	for (const m of t.maps) if (!capacity(m)) report.push(`  !! ${m}: not in the survey`);

	// water and ice want to be IN the water — water tables first (5 slots each, so
	// they actually fill), then fishing, then land as the fallback
	const wet = pool.filter(id => ['Water', 'Ice'].includes(typeOf(id)));
	const dry = pool.filter(id => !['Water', 'Ice'].includes(typeOf(id)));
	const queues = [
		[wet, [...waterSlots, ...fishSlots, ...landSlots]],
		[dry, [...landSlots, ...fishSlots, ...waterSlots]],
	];
	const used = new Set();
	const key = s => s.m + s.kind + (s.ph || '') + s.i;
	for (const [list, slots] of queues) {
		let si = 0;
		for (let k = 0; k < list.length; k++) {
			while (si < slots.length && used.has(key(slots[si]))) si++;
			if (si >= slots.length) { spill.push(list[k]); continue; }
			const s = slots[si];
			used.add(key(s));
			const [min, max] = levelFor(t.lvl, k, list.length);
			const node = (POSTGAME[MAPID(s.m)] ??= {});
			const bucket = s.kind === 'land'
				? ((node.land ??= {})[s.ph] ??= [])
				: (node[s.kind] ??= []);
			const w = s.kind === 'land' ? LAND_W[s.i] : s.kind === 'water' ? WATER_W[s.i] : FISH_W[s.i];
			bucket.push({ id: list[k], min, max, w, _slot: s.i });
			placed.set(list[k], `${s.m}/${s.kind}${s.ph ? '/' + s.ph : ''}`);
		}
	}
	report.push(`  ${t.gym.padEnd(10)} ${String(pool.length).padStart(3)} roots  ->  ${t.maps.length} maps, ` +
		`${landSlots.length} land + ${waterSlots.length} water + ${fishSlots.length} fishing rare slots  (Lv${t.lvl}-${t.lvl + 8})`);
}

// ---------- spill: anything a territory could not seat goes wherever there is room ----------
if (spill.length) {
	const taken = new Set();
	for (const [m, n] of Object.entries(POSTGAME)) {
		for (const ph of PHASES) for (const s of (n.land?.[ph] || [])) taken.add(`${m}land${ph}${s._slot}`);
		for (const k of ['water', 'fishing']) for (const s of (n[k] || [])) taken.add(`${m}${k}${s._slot}`);
	}
	const free = [];
	for (let i = KEEP.land; i < LAND_W.length; i++)
		for (const t of TERRITORIES) for (const m of t.maps) { if (capacity(m)?.land) for (const ph of PHASES)
			if (!taken.has(`${MAPID(m)}land${ph}${i}`)) free.push({ m, kind: 'land', ph, i, lvl: t.lvl }); }
	for (let i = KEEP.fishing; i < FISH_W.length; i++)
		for (const t of TERRITORIES) for (const m of t.maps) { if (capacity(m)?.fishing && existingWet(MAPID(m), 'fishing').length >= KEEP.fishing && !taken.has(`${MAPID(m)}fishing${i}`)) free.push({ m, kind: 'fishing', i, lvl: t.lvl }); }
	for (let i = KEEP.water; i < WATER_W.length; i++)
		for (const t of TERRITORIES) for (const m of t.maps) { if (capacity(m)?.water && existingWet(MAPID(m), 'water').length >= KEEP.water && !taken.has(`${MAPID(m)}water${i}`)) free.push({ m, kind: 'water', i, lvl: t.lvl }); }
	let fi = 0;
	for (const id of spill.splice(0)) {
		if (fi >= free.length) { spill.push(id); continue; }
		const s = free[fi++];
		const node = (POSTGAME[MAPID(s.m)] ??= {});
		const bucket = s.kind === 'land' ? ((node.land ??= {})[s.ph] ??= []) : (node[s.kind] ??= []);
		const w = s.kind === 'land' ? LAND_W[s.i] : s.kind === 'water' ? WATER_W[s.i] : FISH_W[s.i];
		bucket.push({ id, min: s.lvl + 4, max: s.lvl + 8, w, _slot: s.i });
		placed.set(id, `${s.m}/${s.kind}${s.ph ? '/' + s.ph : ''} (spill)`);
	}
}

// ---------- graft each rebuilt tail onto the roster JohKanto already had ----------
// A table this file emits REPLACES the one the engine would otherwise use, so a
// partial table would silently delete the common slots. Rebuild each one whole:
// the kept head comes from the existing roster, the tail from the roots above.
let grafted = 0, headless = 0;
// which territory a map belongs to, for the level lift below
const bandOf = {};
for (const t of TERRITORIES) for (const m of t.maps) bandOf[MAPID(m)] = t.lvl;
// The kept species stay authentic, but their LEVELS do not: a Lv10 Goldeen next
// to a Lv56 Bergmite reads as a bug, and this is post-Champion content. Lift the
// head into the territory's band, preserving each entry's relative spread.
const lift = (s, base) => ({ ...s, min: base + (s.min - s.max), max: base + 2 });
for (const [mapId, node] of Object.entries(POSTGAME)) {
	const base = bandOf[mapId] ?? 50;
	if (node.land) for (const ph of PHASES) {
		if (!node.land[ph]?.length) { delete node.land[ph]; continue; }
		// POSITIONAL overwrite, not head+tail concat: a territory does not always
		// have enough roots to fill every rare slot it was offered, and concatenating
		// would then emit a SHORT table. Start from the roster the map already had
		// and replace only the slots that got a new species, so an unfilled rare slot
		// keeps its original occupant instead of vanishing.
		const full = existingLand(mapId, ph).map(x => lift(x, base));
		if (!full.length) headless++;
		for (const s of node.land[ph]) full[s._slot] = { id: s.id, min: s.min, max: s.max, w: LAND_W[s._slot] };
		node.land[ph] = full.filter(Boolean);
		grafted++;
	}
	for (const k of ['water', 'fishing']) {
		if (!node[k]?.length) continue;
		const W = k === 'water' ? WATER_W : FISH_W;
		const full = existingWet(mapId, k).map(x => lift(x, base));
		for (const s of node[k]) full[s._slot] = { id: s.id, min: s.min, max: s.max, w: W[s._slot] ?? 1 };
		node[k] = full.filter(Boolean);
		grafted++;
	}
	if (node.land && !Object.keys(node.land).length) delete node.land;
}

// ---------- report ----------
console.log(`ordinary roots needing a home: ${ordinary.length}`);
console.log(`legendaries/mythicals (task #84, not placed here): ${roots.length - ordinary.length}`);
console.log('');
for (const line of report) console.log(line);
console.log('');
console.log(`placed:   ${placed.size}`);
console.log(`UNPLACED: ${spill.length}${spill.length ? '  ' + spill.slice(0, 10).join(', ') : ''}`);
const maps = Object.keys(POSTGAME);
let nLand = 0, nWater = 0, nFish = 0;
for (const m of maps) {
	for (const ph of PHASES) nLand += (POSTGAME[m].land?.[ph] || []).length;
	nWater += (POSTGAME[m].water || []).length;
	nFish += (POSTGAME[m].fishing || []).length;
}
console.log(`maps written: ${maps.length}   slots: land ${nLand}, water ${nWater}, fishing ${nFish}`);
console.log(`tables grafted onto their existing roster: ${grafted}` + (headless ? `  (${headless} had no existing land roster to keep)` : ''));

// ---------- emit ----------
if (WRITE) {
	const slotStr = s => `{id:'${s.id}',min:${s.min},max:${s.max},w:${s.w}}`; // _slot is internal, never emitted
	const body = maps.sort().map(m => {
		const n = POSTGAME[m];
		const parts = [];
		if (n.land) {
			const ph = PHASES.filter(p => n.land[p]?.length)
				.map(p => `\n\t\t\t${p}: [${n.land[p].sort((a, b) => a._slot - b._slot).map(slotStr).join(',')}],`).join('');
			parts.push(`\n\t\tland: {${ph}\n\t\t}`);
		}
		for (const k of ['water', 'fishing']) {
			if (n[k]?.length) parts.push(`\n\t\t${k}: [${n[k].sort((a, b) => a._slot - b._slot).map(slotStr).join(',')}]`);
		}
		return `\t'${m}': {${parts.join(',')},\n\t},`;
	}).join('\n');

	fs.writeFileSync('overworld/encounters_postgame.js',
`// encounters_postgame.js — JOHKANTO's postgame roster. GENERATED by
// tools/gen_postgame_encounters.mjs; re-run it rather than editing by hand.
//
// Every species the rest of the game leaves uncatchable lives here. The coverage
// report (Plans/SPECIES_COVERAGE.md) found ${ordinary.length} ordinary evolution ROOTS with no
// home anywhere; placing a root is enough, because evolution and breeding closure
// carry the rest of each line.
//
// Laid out by GYM. JohKanto's eight are Gen-2 Kanto's, and between them their
// types cover all eighteen, so "every mon is catchable somewhere" holds by
// construction:
//   Brock rock/ground/steel · Misty water/ice · Surge electric/flying
//   Erika grass/bug · Janine poison/dark · Sabrina psychic/fairy
//   Blaine fire/dragon · Blue normal/fighting/ghost
//
// A land map carries three 7-slot rosters (morning/day/night), so time of day is
// real capacity and a route holds up to 21 species without becoming a soup.
// Levels run 50-77 by gym order: this is post-Champion content.
//
// encounters.js consults this FIRST, ahead of DAYNIGHT and the base table. It has
// to be a separate module: all 23 JohKanto maps with a land table are already in
// encounters_daynight.js, which wins for land, so adding these to the base table
// would have been inert — and encounters_daynight.js is itself generated from
// pokecrystal, so writing here would be eaten by the next regeneration.
export const POSTGAME = {
${body}
};
`);
	console.log('\nwrote overworld/encounters_postgame.js');
} else {
	console.log('\n(dry run — pass --write to emit overworld/encounters_postgame.js)');
}
