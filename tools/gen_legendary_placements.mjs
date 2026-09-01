// gen_legendary_placements.mjs — put the 87 unplaced legendaries at the bottom of
// the world's dungeons.
//
// These are the species the postgame roster deliberately left alone: BST >= 570
// with no evolution line either side. They do not want a route slot shared with
// Rattata — a legendary is a place you go to, once.
//
// Every one is anchored to the DEEPEST REACHABLE TILE of a real dungeon, found by
// flood-filling from that map's own warps with the engine's `isPassable` and
// skipping water (tools/survey_dungeons.mjs). That matters more than it sounds:
// a legendary sits on a tile and fires when you step on it, so a coordinate
// eyeballed off a layout would be a legendary nobody can reach — and the middle
// of a cave is usually solid rock. Deepest-from-any-entrance also means the
// encounter is at the END of the dungeon rather than inside the doorway.
//
// GATING. Every legendary needs the CHAMPION crown of the region its dungeon is
// in, so the hunt is postgame everywhere. The strongest (BST >= 680: the creation
// trio, the tao dragons, Arceus, the box legendaries) additionally need a count
// of other legendaries already caught, so the top of the ladder is earned rather
// than rushed.
//
// A dungeon holds at most ONE, and dungeons already spoken for by the
// hand-authored LEGENDARY_ENCOUNTERS in main.js are skipped, so nothing is
// double-booked.
//
//   node tools/gen_legendary_placements.mjs           (report)
//   node tools/gen_legendary_placements.mjs --write   (write legendaries_postgame.js)
import fs from 'fs';
import { execSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const D = 'overworld/data';
const bat = JSON.parse(fs.readFileSync(`${D}/species_battle.json`, 'utf8'));
const dungeons = JSON.parse(fs.readFileSync('tools/data/dungeon_tiles.json', 'utf8'));
const main = fs.readFileSync('overworld/main.js', 'utf8');

// ---------- who still needs a home ----------
const out = execSync('node tools/species_coverage.mjs --list', { encoding: 'utf8', maxBuffer: 1e8 });
const missing = out.split('\n').filter(l => /^ {2}#/.test(l)).map(l => l.trim().split(/\s+/).pop().replace(/[()]/g, ''));
const bst = id => Object.values(bat[id].baseStats || {}).reduce((a, b) => a + b, 0);
const nameOf = id => bat[id].name || id;

// ---------- where they can go ----------
// maps the hand-authored table already uses, so a dungeon is never double-booked
const taken = new Set([...main.matchAll(/MAP_[A-Z0-9_]+(?=:\s*[[{])/g)].map(m => m[0]));
const MIN_DEPTH = 12, MIN_REACH = 60;   // a closet is not a dungeon
const sites = Object.entries(dungeons)
	.filter(([id, v]) => !v.error && !taken.has(id) && v.depth >= MIN_DEPTH && v.reach >= MIN_REACH)
	.map(([id, v]) => ({ id, ...v }));

// ---------- thematic anchors ----------
// Where a legendary has an obvious home, it gets one; everything else is paired
// by strength against depth below. Matching is by substring so it survives the
// exact map-id spelling.
// The top of the ladder gets a NAMED home. Pairing purely by flood depth put
// Arceus at the bottom of Rock Tunnel, which is deep but means nothing — depth is
// not the same as significance, and the creator of the universe should not be
// behind a Kanto commute. Exact map ids, all verified present in the survey.
const PRESTIGE = {
	arceus: 'MAP_SILVER_CAVE_ROOM_3',            // the last room of the last mountain
	dialga: 'MAP_SKY_PILLAR_4F',                 // time, at the top of the sky
	palkia: 'MAP_CERULEAN_CAVE_2F',              // space, in the region's deepest cave
	giratina: 'MAP_UNDERWATER_SEALED_CHAMBER',   // the world on the other side of this one
	eternatus: 'MAP_METEOR_FALLS_STEVENS_CAVE',  // it fell out of the sky
	reshiram: 'MAP_MT_EMBER_EXTERIOR',           // truth, on a volcano
	zekrom: 'MAP_DRAGONS_DEN_B1F',               // ideals, in the dragon shrine
	kyurem: 'MAP_ICE_PATH_1F',                   // the empty half of them, in the ice
	zacian: 'MAP_SILVER_CAVE_ROOM_1',
	zamazenta: 'MAP_SILVER_CAVE_ROOM_2',
	koraidon: 'MAP_ALTERING_CAVE',               // the past
	miraidon: 'MAP_SIX_ISLAND_ALTERING_CAVE',    // and the future
	regigigas: 'MAP_SEALED_CHAMBER_INNER_ROOM',  // it sealed the others in rooms like this
	necrozma: 'MAP_MIRAGE_TOWER_4F',
};
const ANCHORS = [
	// the three lake spirits want three separate lakeside caves
	['uxie', 'CAVE'], ['mesprit', 'CAVE'], ['azelf', 'CAVE'],
	// the island guardians want islands
	['tapukoko', 'ISLAND'], ['tapulele', 'ISLAND'], ['tapubulu', 'ISLAND'], ['tapufini', 'ISLAND'],
	// volcano and steel
	['heatran', 'MT_'], ['volcanion', 'MT_'], ['magearna', 'RUINS'],
	// the ruin quartet belong in ruins
	['wochien', 'RUINS'], ['chienpao', 'RUINS'], ['tinglu', 'RUINS'], ['chiyu', 'RUINS'],
	// forest and grass
	['shaymin', 'FOREST'], ['zarude', 'FOREST'], ['virizion', 'FOREST'],
	// towers
	['victini', 'TOWER'], ['marshadow', 'TOWER'], ['spectrier', 'TOWER'], ['glastrier', 'TOWER'],
];

// ---------- assign ----------
// strongest legendary to deepest dungeon, so the climb is worth it
const pool = [...missing].sort((a, b) => bst(b) - bst(a) || bat[a].num - bat[b].num);
const free = [...sites].sort((a, b) => b.depth - a.depth);
const used = new Set();
const placed = [];

const takeSite = pred => {
	const i = free.findIndex(s => !used.has(s.id) && (!pred || pred(s)));
	if (i < 0) return null;
	const s = free[i]; used.add(s.id); return s;
};

// named homes first — nothing else may take them
const claimed = [];
for (const [species, mapId] of Object.entries(PRESTIGE)) {
	if (!missing.includes(species)) continue;
	const s = free.find(x => x.id === mapId && !used.has(x.id));
	if (!s) { claimed.push(`  !! ${species}: ${mapId} is not an available site`); continue; }
	used.add(s.id);
	placed.push({ species, site: s, why: 'named home' });
}
// then thematic anchors, so an obvious home is not eaten by the strength ladder
for (const [species, pat] of ANCHORS) {
	if (!missing.includes(species)) continue;
	const s = takeSite(x => x.id.includes(pat));
	if (s) placed.push({ species, site: s, why: `anchored to ${pat}` });
}
// then everyone else, strongest first into the deepest remaining
for (const species of pool) {
	if (placed.some(p => p.species === species)) continue;
	const s = takeSite(null);
	if (!s) { placed.push({ species, site: null, why: 'NO SITE LEFT' }); continue; }
	placed.push({ species, site: s, why: 'strength/depth' });
}

// ---------- levels and gates ----------
const REGION_OF = { KANTO: 'KANTO', JOHTO: 'JOHTO', HOENN: 'HOENN', JOHKANTO: 'JOHKANTO' };
// A legendary's level tracks its power, in the band the postgame roster tops out
// at (JohKanto's routes end around Lv77).
const levelFor = b => b >= 680 ? 75 : b >= 640 ? 72 : b >= 600 ? 70 : 66;
const CHAIN_AT = 680;      // above this, you must have caught some first
const CHAIN_NEED = 8;

const entries = placed.filter(p => p.site);
const failed = placed.filter(p => !p.site);

// ---------- report ----------
console.log(`legendaries needing a home: ${missing.length}`);
console.log(`dungeons deep enough and unclaimed: ${sites.length}`);
console.log(`placed: ${entries.length}   UNPLACED: ${failed.length}${failed.length ? ' — ' + failed.map(f => f.species).join(', ') : ''}`);
const byRegion = {};
for (const p of entries) byRegion[p.site.region] = (byRegion[p.site.region] || 0) + 1;
console.log('by region: ' + Object.entries(byRegion).map(([r, n]) => `${r} ${n}`).join(', '));
console.log(`chain-gated (BST >= ${CHAIN_AT}, need ${CHAIN_NEED} caught): ${entries.filter(p => bst(p.species) >= CHAIN_AT).length}`);
const noSprite = entries.filter(p => !fs.existsSync(`${D}/pokemon_ow/${p.species}.png`));
console.log(`falling back to a battle sprite (no overworld art): ${noSprite.length}`);
console.log('\nanchored:');
for (const p of entries.filter(p => p.why.startsWith('anchored'))) {
	console.log(`   ${nameOf(p.species).padEnd(14)} -> ${p.site.id.replace('MAP_', '').padEnd(36)} depth ${p.site.depth}`);
}
console.log('\ndeepest five overall:');
for (const p of entries.sort((a, b) => b.site.depth - a.site.depth).slice(0, 5)) {
	console.log(`   ${nameOf(p.species).padEnd(14)} -> ${p.site.id.replace('MAP_', '').padEnd(36)} depth ${p.site.depth} @${p.site.x},${p.site.y}`);
}

// ---------- emit ----------
if (WRITE) {
	const esc = s => s.replace(/'/g, "\\'");
	const intro = id => {
		const n = nameOf(id).toUpperCase();
		const b = bst(id);
		if (b >= 680) return `The air itself buckles. ${esc(n)} has been waiting for someone to come this far.`;
		if (b >= 640) return `Something vast stirs in the dark — ${esc(n)} rises to meet you.`;
		if (b >= 600) return `A presence settles over the chamber. ${esc(n)} regards you without blinking.`;
		return `You are not alone down here. ${esc(n)} steps out of the shadow.`;
	};
	const rows = entries.sort((a, b) => a.site.id.localeCompare(b.site.id)).map(p => {
		const id = p.species, b = bst(id), s = p.site;
		const gate = b >= CHAIN_AT
			? `() => Badges.isChampion('${REGION_OF[s.region]}') && legendsCaught() >= ${CHAIN_NEED}`
			: `() => Badges.isChampion('${REGION_OF[s.region]}')`;
		return `\t'${s.id}': { species: '${id}', dex: ${bat[id].num}, level: ${levelFor(b)}, x: ${s.x}, y: ${s.y},\n`
			+ `\t\tflag: 'legend_caught_${id}', requires: ${gate},\n`
			+ `\t\tintro: '${intro(id)}' },`;
	}).join('\n');

	fs.writeFileSync('overworld/legendaries_postgame.js',
`// legendaries_postgame.js — the ${entries.length} legendaries that had no home anywhere.
// GENERATED by tools/gen_legendary_placements.mjs; re-run it rather than editing.
//
// main.js merges these into LEGENDARY_ENCOUNTERS, so they use the same mechanism
// as the hand-authored ones: a sprite standing on a tile, a real catchable battle
// when you step onto it, and one flag each so a save gets one of everything.
//
// Every tile is the DEEPEST REACHABLE point of its dungeon, found by flood-filling
// from that map's own warps with the engine's own \`isPassable\` and skipping water
// (tools/survey_dungeons.mjs). Eyeballing coordinates off a layout would have
// produced legendaries standing inside solid rock; this way each one is provably
// reachable AND at the far end of the dungeon rather than inside its doorway.
//
// Gating: the CHAMPION crown of the region the dungeon is in, so the whole hunt is
// postgame. Above BST ${CHAIN_AT} you also need ${CHAIN_NEED} legendaries already caught, which
// puts the creation trio, the tao dragons and Arceus at the top of a ladder
// instead of behind the same door as everything else.
//
// One per dungeon, and dungeons already used by main.js's hand-authored table are
// left alone.
import * as Badges from './badges.js';
import * as Story from './events.js';

// how many of the placed legendaries a save has already caught
export function legendsCaught() {
	let n = 0;
	for (const v of Object.values(POSTGAME_LEGENDS)) if (Story.getFlag(v.flag)) n++;
	return n;
}

export const POSTGAME_LEGENDS = {
${rows}
};
`);
	console.log('\nwrote overworld/legendaries_postgame.js');
} else {
	console.log('\n(dry run — pass --write to emit overworld/legendaries_postgame.js)');
}
