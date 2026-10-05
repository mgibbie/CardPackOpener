// gen_crystal_callbacks.mjs — which pokecrystal MAP CALLBACKS the port runs.
//
// pokecrystal runs `callback MAPCALLBACK_<KIND>, Label` scripts as a map loads:
// NEWMAP on entry (setflag/clearflag), TILES while the blocks load (changeblock),
// OBJECTS while the objects load (appear/disappear by day, time and story flags),
// CMDQUEUE for stone tables. The port ran one (the Goldenrod move tutor); the
// Day-of-Week siblings, the Mahogany Mart staircase, the Rocket HQ doors and the
// rest never ran. This lists every callback of every converted Crystal map, in
// the order the port runs them (NEWMAP, TILES, OBJECTS), minus a DENY list of the
// ones that would fight a system the port runs natively or that need a mechanism
// the port doesn't have. Their changeblocks are restored by
// tools/gen_crystal_scriptvar.mjs (only whole callbacks; see there).
//
// Writes tracked overworld/crystal_callbacks.json:
//   { callbacks: { stem: [[kind, label], ...] }, denied: { "stem:label": reason } }
//
//   node tools/gen_crystal_callbacks.mjs
import fs from 'fs';
import path from 'path';

const D = path.join('overworld', 'data');
const MP66 = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66');
		if (fs.existsSync(path.join(p, 'Reference', 'pokecrystal', 'maps'))) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66 not found above ' + path.resolve('.'));
	}
})();
const CR = path.join(MP66, 'Reference', 'pokecrystal');

// callbacks the port must NOT run, and why (map name as pokecrystal spells it)
const DENY = {
	DayCare: 'the Day-Care Man is run by the native daycare (daycare.js)',
	Route34: 'the Day-Care Man is run by the native daycare (daycare.js)',
	Route35NationalParkGate: 'the Bug-Catching Contest is run natively (ow_venues.js)',
	Route36NationalParkGate: 'the Bug-Catching Contest is run natively (ow_venues.js)',
	IcePathB1F: 'CMDQUEUE stone tables (boulders into holes) are not implemented',
	BlackthornGym2F: 'CMDQUEUE stone tables (boulders into holes) are not implemented',
	IlexForest: 'reads wFarfetchdPosition, which nothing in the port sets (the Farfetch\'d puzzle)',
	PlayersHouse2F: 'decoration specials (ToggleDecorationsVisibility / ToggleMaptileDecorations) are not implemented',
	TradeCenter: 'link play', Colosseum: 'link play', TimeCapsule: 'link play',
	TinTowerRoof: 'HO-OH is encountered through the native legendary system (ow_legendaries.js)',
	WhirlIslandLugiaChamber: 'LUGIA is encountered through the native legendary system (ow_legendaries.js)',
	TinTower1F: 'gates the stairs on EVENT_GOT_RAINBOW_WING, but the port hands the RAINBOW WING to the Johto Champion without that flag (ow_progression.js) — running it would hide the way to HO-OH',
};
const ORDER = { NEWMAP: 0, TILES: 1, OBJECTS: 2, CMDQUEUE: 3, SPRITES: 4 };

const byName = {};   // crystal map name -> [[kind, label]]
for (const f of fs.readdirSync(path.join(CR, 'maps')).filter(f => f.endsWith('.asm'))) {
	const name = f.replace('.asm', '');
	for (const m of fs.readFileSync(path.join(CR, 'maps', f), 'utf8').matchAll(/callback MAPCALLBACK_(\w+),\s*(\w+)/g))
		(byName[name] = byName[name] || []).push([m[1], m[2]]);
}

const callbacks = {}, denied = {}, missing = [];
let run = 0;
for (const f of fs.readdirSync(path.join(D, 'maps')).filter(f => f.endsWith('_map.json'))) {
	const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
	if (!j._crystal_tileset || !j.name || !byName[j.name]) continue;
	const stem = f.replace('_map.json', '');
	const sf = path.join(D, 'scripts', stem + '.json');
	const prog = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
	for (const [kind, label] of byName[j.name]) {
		if (DENY[j.name]) { denied[`${stem}:${label}`] = DENY[j.name]; continue; }
		if (!prog[label]) { missing.push(`${stem}:${label}`); continue; }
		(callbacks[stem] = callbacks[stem] || []).push([kind, label]);
		run++;
	}
	if (callbacks[stem]) callbacks[stem].sort((a, b) => (ORDER[a[0]] ?? 9) - (ORDER[b[0]] ?? 9));
}
const OUT = path.join('overworld', 'crystal_callbacks.json');
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_crystal_callbacks.mjs', callbacks, denied }, null, 1) + '\n');
const total = Object.values(byName).reduce((n, l) => n + l.length, 0);
console.log(`${total} callbacks in pokecrystal; running ${run} on ${Object.keys(callbacks).length} maps; denied ${Object.keys(denied).length}; label missing in our scripts ${missing.length}`);
for (const [k, why] of Object.entries(denied)) console.log('  deny ' + k + ' — ' + why);
if (missing.length) console.log('  missing: ' + missing.join(' '));
console.log('wrote ' + OUT);
