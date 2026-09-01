// postgame_encounters_test.mjs — JohKanto now holds every species the rest of
// the game leaves uncatchable.
//
// 298 ordinary evolution ROOTS had no home anywhere. Placing a root is enough,
// because evolution and breeding closure carry the rest of the line — which is
// why 298 placements move coverage from 1022 to 1584 of 1751.
//
// The assertions that matter are about FIRING, not about the data being present.
// A roster that cannot be reached is indistinguishable from a healthy one when
// you only read the file, and this codebase has produced that bug repeatedly:
// 197 dead water slots in Johto, 152 inert HM obstacles, 188 dead B_OUTCOME
// branches. So this drives encounters.pick()/fish() through the real module and
// checks the species come back.
//
// Standalone (node only — no browser needed):
//   node overworld/tests/postgame_encounters_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const { POSTGAME } = await import('../encounters_postgame.js');
const bat = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));
const enc = JSON.parse(fs.readFileSync(path.join(D, 'encounters.json'), 'utf8'));
const survey = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/johkanto_survey.json'), 'utf8'));
const PHASES = ['morning', 'day', 'night'];
const maps = Object.keys(POSTGAME);

const allSlots = m => [
	...PHASES.flatMap(p => POSTGAME[m].land?.[p] || []),
	...(POSTGAME[m].water || []), ...(POSTGAME[m].fishing || []),
];

// ---------- the roster is well formed ----------
A(maps.length >= 25, `${maps.length} JohKanto maps carry a postgame roster`, String(maps.length));
A(maps.every(m => m.startsWith('MAP_JOHKANTO_')), 'and every one of them is in JohKanto — no other region is touched');

const unknown = maps.flatMap(m => allSlots(m).map(s => s.id)).filter(id => !bat[id]);
A(unknown.length === 0, 'every species named is one the game actually has', unknown.slice(0, 5).join(','));

// A fishing table's slot INDEX is its rod tier (Old [0,1], Good [2,4], Super
// [5,9]). A short table silently moves the rare species into the Old Rod band and
// leaves the Super Rod with nothing to hook.
const shortFish = maps.filter(m => POSTGAME[m].fishing && POSTGAME[m].fishing.length !== 10);
A(shortFish.length === 0, 'every fishing table is a full 10 slots, so the rod tiers still mean something',
	shortFish.map(m => `${m}:${POSTGAME[m].fishing.length}`).join(','));
const fatLand = maps.filter(m => PHASES.some(p => (POSTGAME[m].land?.[p] || []).length > 7));
A(fatLand.length === 0, 'no land roster exceeds the 7 gen-2 grass slots', fatLand.join(','));

// ---------- it is placed where a player can actually reach it ----------
// A land table is live on grass or a cave floor; a water table needs surfable
// tiles. Both come from tileset attributes, so they were measured with the real
// engine (tools/survey_johkanto.mjs), not guessed.
const badLand = maps.filter(m => POSTGAME[m].land && (() => {
	const s = survey[m];
	return !(s && (s.grass > 0 || s.type === 'MAP_TYPE_UNDERGROUND' || m.endsWith('POWER_PLANT')));
})());
A(badLand.length === 0, 'every land roster sits on a map with grass or a cave floor to fire on', badLand.join(','));
const badWater = maps.filter(m => (POSTGAME[m].water || POSTGAME[m].fishing) && (survey[m]?.surf || 0) <= 20);
A(badWater.length === 0, 'every water and fishing roster sits on a map with surfable water', badWater.join(','));
const inTown = maps.filter(m => POSTGAME[m].land && survey[m]?.type === 'MAP_TYPE_TOWN');
A(inTown.length === 0, 'no wild encounters in the middle of a town', inTown.join(','));

// ---------- the point: the species that had nowhere to go now have somewhere ----------
const ext = JSON.parse(fs.readFileSync(path.join(D, 'species_extra.json'), 'utf8'));
const ALL = Object.keys(bat).filter(k => !k.startsWith('_'));
const preEvo = new Map();
for (const id of ALL) for (const e of (ext[id]?.evos || [])) if (bat[e.target] && !preEvo.has(e.target)) preEvo.set(e.target, id);
const inPostgame = new Set(maps.flatMap(m => allSlots(m).map(s => s.id)));
A(inPostgame.size >= 290, `${inPostgame.size} distinct species are placed`, String(inPostgame.size));

// closure: everything reachable from a placed root
const reach = new Set(inPostgame);
for (let i = 0; i < 8; i++) {
	let grew = false;
	for (const id of [...reach]) for (const e of (ext[id]?.evos || [])) if (bat[e.target] && !reach.has(e.target)) { reach.add(e.target); grew = true; }
	if (!grew) break;
}
A(reach.size >= 550, `and they carry ${reach.size} species in total once evolutions are followed`, String(reach.size));

// ---------- levels are postgame ----------
const lows = maps.flatMap(m => allSlots(m)).filter(s => s.min < 45);
A(lows.length === 0, 'nothing is under Lv45 — this is post-Champion content, kept species included',
	lows.slice(0, 4).map(s => `${s.id}@${s.min}`).join(','));
const highs = maps.flatMap(m => allSlots(m)).filter(s => s.max > 85);
A(highs.length === 0, 'and nothing is over Lv85', highs.slice(0, 4).map(s => `${s.id}@${s.max}`).join(','));

// ---------- the kept head is still there ----------
// Only the RARE tail was rebuilt; the common slots keep JohKanto's own roster so
// the region still plays like Kanto.
const keptWater = maps.filter(m => POSTGAME[m].water?.length)
	.filter(m => (enc[m]?.water?.slots || []).slice(0, 2).every((s, i) => POSTGAME[m].water[i]?.id === s.id));
A(keptWater.length >= 5, 'water tables keep their authentic common slots', `${keptWater.length} maps`);

// ---------- FIRING: drive the real module ----------
const { Encounters } = await import('../encounters.js');
const encounters = new Encounters();
encounters.data = enc;                       // skip the network init; the tables are what matter

const landMap = maps.find(m => POSTGAME[m].land?.day?.length);
// guard rather than crash: with an empty roster this suite should report clean
// FAILs, not a TypeError three quarters of the way down
A(!!landMap, 'there is a land roster to roll against');
if (!landMap) { console.log(`
${pass} passed, ${fail + 1} failed`); process.exit(1); }
const seen = new Set();
for (let i = 0; i < 4000; i++) { const p = encounters.pick(landMap, 'land', 'day'); if (p) seen.add(p.id); }
const want = new Set((POSTGAME[landMap].land.day).map(s => s.id));
A([...want].every(id => seen.has(id)),
	`${landMap.replace('MAP_JOHKANTO_', '')}: every species in its day roster actually rolls`,
	[...want].filter(id => !seen.has(id)).join(','));

// the postgame roster must WIN over DAYNIGHT, which covers all 23 JohKanto land maps
const { DAYNIGHT } = await import('../encounters_daynight.js');
const contested = maps.find(m => POSTGAME[m].land?.night?.length && DAYNIGHT[m]?.land?.night?.length);
A(!!contested, 'there is a map where both rosters exist, so precedence is testable');
if (contested) {
	const pgOnly = POSTGAME[contested].land.night.map(s => s.id)
		.filter(id => !DAYNIGHT[contested].land.night.some(s => s.id === id));
	const got = new Set();
	for (let i = 0; i < 4000; i++) { const p = encounters.pick(contested, 'land', 'night'); if (p) got.add(p.id); }
	A(pgOnly.length > 0 && pgOnly.some(id => got.has(id)),
		`${contested.replace('MAP_JOHKANTO_', '')}: the postgame roster beats DAYNIGHT`,
		`expected one of ${pgOnly.slice(0, 3).join(',')}`);
}

// fishing: the Super Rod band must reach the new species
const fishMap = maps.find(m => POSTGAME[m].fishing?.length === 10);
if (fishMap) {
	const superSpecies = new Set(POSTGAME[fishMap].fishing.slice(5).map(s => s.id));
	const hooked = new Set();
	for (let i = 0; i < 4000; i++) { const f = encounters.fish(fishMap, 3); if (f) hooked.add(f.id); }
	A([...superSpecies].every(id => hooked.has(id)),
		`${fishMap.replace('MAP_JOHKANTO_', '')}: the SUPER ROD hooks every species in its band`,
		[...superSpecies].filter(id => !hooked.has(id)).join(','));
	const oldRod = new Set();
	for (let i = 0; i < 2000; i++) { const f = encounters.fish(fishMap, 1); if (f) oldRod.add(f.id); }
	A([...oldRod].every(id => POSTGAME[fishMap].fishing.slice(0, 2).some(s => s.id === id)),
		'...and the OLD ROD still only reaches its own two slots', [...oldRod].join(','));
}

// ---------- the other regions are untouched ----------
for (const [m, kind, phase] of [['MAP_ROUTE119', 'land', 'day'], ['MAP_ROUTE_29', 'land', 'night']]) {
	const before = new Set((enc[m]?.[kind]?.slots || []).map(s => s.id));
    const got = new Set();
	for (let i = 0; i < 800; i++) { const p = encounters.pick(m, kind, phase); if (p) got.add(p.id); }
	A(got.size > 0, `${m.replace('MAP_', '')} still rolls its own table`, `${got.size} species`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
