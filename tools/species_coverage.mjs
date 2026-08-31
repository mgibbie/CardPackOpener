// species_coverage.mjs — which POKeMON can you actually get, and which can you
// get nowhere at all?
//
// Every acquisition route the game has is walked, in the order a player meets them:
//
//   wild        data/encounters.json land / water / fishing / rock_smash
//   daynight    encounters_daynight.js — the Gen-2 morning/day/night GRASS tables
//               for Johto + JohKanto, which OVERRIDE the base table, so a species
//               that only appears at night lives here and nowhere else
//   starter     the 3x3 region picker (STARTERS in main.js)
//   legendary   LEGENDARY_ENCOUNTERS in main.js
//   trade       trades.json — the mon an NPC hands over
//   gift        `givemon` in any of the 1548 transpiled map scripts (fossils,
//               Eevee, Lapras, the Hitmons, Togepi's egg, ...)
//   rift        the Ransei rift: a 5% slice of post-Champion wild encounters
//               rolls any fakemon (dex num <= 0) that has a learnset
//   evolve      transitive closure through species_extra evos, to a fixed point
//               (a three-stage line needs two passes)
//   breed       the daycare lays the mother's BASE form, so anything reachable
//               also yields its baby — also to a fixed point
//
// This is a report, not a fix. It says what JohKanto's routes would have to hold
// for the dex to be completable.
//
//   node tools/species_coverage.mjs                (summary)
//   node tools/species_coverage.mjs --list         (every unreachable species)
//   node tools/species_coverage.mjs --md=FILE      (write a markdown report)
import fs from 'fs';
import path from 'path';

const D = 'overworld/data';
const read = f => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8'));
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');

const bat = read('species_battle.json');
const ext = read('species_extra.json');
const enc = read('encounters.json');
const index = read('species_index.json');
const regions = JSON.parse(fs.readFileSync('overworld/map_regions.json', 'utf8'));
const main = fs.readFileSync('overworld/main.js', 'utf8');

const ALL = Object.keys(bat).filter(k => !k.startsWith('_'));
const isFake = id => (bat[id]?.num || 0) <= 0;
const nameOf = id => bat[id]?.name || index?.[id]?.name || id;
const regionOf = {};
for (const [r, list] of Object.entries(regions)) for (const m of list) regionOf[m.id] = r;

// HOENN2 is the editable blank region: it is a clone of Hoenn with ZERO entries
// in any runtime registry and zero inbound edges from the rest of the world, so
// nothing in it is actually catchable. Counting it would inflate coverage by a
// whole region's worth of species that no player can reach.
const UNREACHABLE_REGIONS = new Set(['HOENN2']);

// ---------- sources ----------
const via = new Map();                       // species -> how you FIRST get it
const add = (id, how) => { if (bat[id] && !via.has(id)) via.set(id, how); };
const wildRegions = new Map();               // species -> Set(region) it appears wild in
const noteWild = (id, r) => {
	if (!bat[id]) return;
	if (!wildRegions.has(id)) wildRegions.set(id, new Set());
	wildRegions.get(id).add(r);
	if (!UNREACHABLE_REGIONS.has(r)) add(id, 'wild');
};

for (const [mapId, t] of Object.entries(enc)) {
	const r = regionOf[mapId] || 'OTHER';
	for (const kind of ['land', 'water', 'fishing', 'rock_smash']) {
		for (const s of (t[kind]?.slots || [])) noteWild(s.id, r);
	}
}

// the Gen-2 day/night grass tables REPLACE the base table for their map, so a
// night-only species (gastly, hoothoot, ...) may exist only here
{
	const src = fs.readFileSync('overworld/encounters_daynight.js', 'utf8');
	for (const m of src.matchAll(/'(MAP_[A-Z0-9_]+)':\s*\{([\s\S]*?)\n\t\} \},/g)) {
		const r = regionOf[m[1]] || 'OTHER';
		for (const q of m[2].matchAll(/id:'([a-z0-9_]+)'/g)) noteWild(q[1], r);
	}
}

// starters — the 3x3 region picker
{
	const at = main.indexOf('const STARTERS');
	const body = main.slice(at, main.indexOf('\n];', at));
	for (const m of body.matchAll(/'([a-z0-9_]+)'/g)) add(m[1], 'starter');
}
// legendaries
{
	const at = main.indexOf('const LEGENDARY_ENCOUNTERS');
	const body = main.slice(at, main.indexOf('\n};', at));
	for (const m of body.matchAll(/species:\s*'([a-z0-9_]+)'/g)) add(m[1], 'legendary');
}
// in-game trades hand over a real mon
{
	const tr = JSON.parse(fs.readFileSync('overworld/trades.json', 'utf8'));
	for (const t of Object.values(tr.trades || {})) if (t.give) add(t.give, 'trade');
}
// script gifts: `givemon` / `giveegg` anywhere in the transpiled scripts.
//
// The species is often INDIRECT: Saffron's Dojo and the Game Corner prize counter
// both branch on a choice, `setvar VAR_TEMP_1, SPECIES_HITMONLEE`, then `givemon
// VAR_TEMP_1`. events.js `speciesId()` resolves that at runtime (it reads the var
// back), so matching only on a literal species field silently under-reports —
// it drops Hitmonlee, Hitmonchan and the whole Game Corner counter. When a
// givemon reads a var, credit every SPECIES_ the same file writes into a var.
const speciesKey = sym => {
	const k = String(sym).replace(/^SPECIES_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
	return bat[k] ? k : ALL.find(x => x.replace(/[^a-z0-9]/g, '') === k);
};
const scriptGifts = new Map();               // species -> the script file that gives it
{
	const dir = `${D}/scripts`;
	for (const f of fs.readdirSync(dir)) {
		if (!f.endsWith('.json')) continue;
		const raw = fs.readFileSync(path.join(dir, f), 'utf8');
		if (!/"(givemon|giveegg)"/.test(raw)) continue;
		// every species this file ever puts in a var — the indirect candidates
		const viaVar = [...raw.matchAll(/"value":\s*"(SPECIES_[A-Z0-9_]+)"/g)].map(m => m[1]);
		for (const m of raw.matchAll(/"(?:givemon|giveegg)"[\s\S]{0,140}?"species":\s*"([A-Za-z0-9_]+)"/g)) {
			const syms = /^VAR_/.test(m[1]) ? viaVar : [m[1]];
			for (const s of syms) {
				const hit = speciesKey(s);
				if (hit) { add(hit, 'gift'); if (!scriptGifts.has(hit)) scriptGifts.set(hit, f.replace('.json', '')); }
			}
		}
	}
}
// the Ransei rift: any fakemon with a learnset, post-Champion
for (const id of ALL) if (isFake(id) && bat[id]?.learnset?.length) add(id, 'rift');

// ---------- closure: evolution, then breeding ----------
const evosOf = id => (ext[id]?.evos || []).map(e => e.target).filter(t => bat[t]);
const preEvoOf = new Map();
for (const id of ALL) for (const t of evosOf(id)) if (!preEvoOf.has(t)) preEvoOf.set(t, id);

for (let pass = 0; pass < 8; pass++) {
	let grew = false;
	for (const id of [...via.keys()]) {
		for (const t of evosOf(id)) if (!via.has(t)) { add(t, 'evolve'); grew = true; }
	}
	for (const id of [...via.keys()]) {              // daycare gives you the base form
		let base = id, guard = 0;
		while (preEvoOf.has(base) && guard++ < 6) base = preEvoOf.get(base);
		if (base !== id && !via.has(base)) { add(base, 'breed'); grew = true; }
	}
	if (!grew) break;
}

// ---------- report ----------
const missing = ALL.filter(id => !via.has(id));
const realMissing = missing.filter(id => !isFake(id));
const fakeMissing = missing.filter(isFake);
const bySource = {};
for (const how of via.values()) bySource[how] = (bySource[how] || 0) + 1;

const gen = id => {
	const n = bat[id]?.num || 0;
	return n <= 0 ? 'imported' : n <= 151 ? 'gen 1' : n <= 251 ? 'gen 2' : n <= 386 ? 'gen 3'
		: n <= 493 ? 'gen 4' : n <= 649 ? 'gen 5' : n <= 721 ? 'gen 6' : n <= 809 ? 'gen 7'
		: n <= 905 ? 'gen 8' : 'gen 9';
};
// an "alternate form" is an id that shares its dex number with a base species we
// also have — mega/gmax/regional. Those are a different problem from a missing
// base species: many are unobtainable BY DESIGN in the real games.
const baseByNum = new Map();
for (const id of ALL) { const n = bat[id].num; if (n > 0 && !/_/.test(id) && !baseByNum.has(n)) baseByNum.set(n, id); }
const isForm = id => /_/.test(id) && baseByNum.has(bat[id].num) && baseByNum.get(bat[id].num) !== id;

const baseMissing = realMissing.filter(id => !isForm(id));
const formMissing = realMissing.filter(isForm);

const L = [];
const say = s => { L.push(s); console.log(s); };
const pad = n => String(n).padStart(5);

say(`species in the battle table   ${pad(ALL.length)}   (real ${ALL.filter(i => !isFake(i)).length}, imported ${ALL.filter(isFake).length})`);
say(`obtainable                    ${pad(via.size)}`);
say(`UNREACHABLE                   ${pad(missing.length)}   (real ${realMissing.length}, imported ${fakeMissing.length})`);
say('');
say('first route that reaches each one  (sources checked wild > starter > legendary >');
say('trade > gift > rift, then evolution and breeding closure — so a small number');
say('here means that route is rarely the ONLY way to get something)');
for (const [k, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) say(`  ${pad(n)}  ${k}`);
say('');
say(`unreachable real species: ${baseMissing.length} BASE species + ${formMissing.length} alternate forms`);
say('');
say('  base species, by generation');
{
	const by = {};
	for (const id of baseMissing) by[gen(id)] = (by[gen(id)] || 0) + 1;
	for (const [k, n] of Object.entries(by).sort()) say(`  ${pad(n)}  ${k}`);
}
// gens 1-3 are the three regions the game actually ships. Anything missing there
// is a GAP in content we already have, not content we never imported — so each
// one was traced back to source. The causes fall into three buckets, and only
// the first two are ours to fix.
const CAUSE = {
	snorlax: 'STATIC BATTLE DROPPED — pokefirered Route12/Route16 `setwildbattle SPECIES_SNORLAX, 30`; our transpiled script keeps the `setflag FLAG_HIDE_..._SNORLAX` that follows it, so the Poke Flute makes the Snorlax vanish with no fight',
	sudowoodo: 'STATIC BATTLE DROPPED — pokeemerald Route111 `setwildbattle` and pokecrystal Route36 `loadwildmon SUDOWOODO, 20` + `startbattle`; same drop, tree just disappears',
	togepi: 'GIVEEGG DROPPED — pokecrystal VioletPokecenter1F `giveegg TOGEPI, EGG_LEVEL`; transpile_crystal.py has no handler for giveegg, so the Egg is never handed over',
	togetic: 'evolves from Togepi (above)',
	latias: 'NOT IN LEGENDARY_ENCOUNTERS — the list has latios but not latias; Emerald starts the pair through the unhandled `BattleSetup_StartLatiBattle` special',
	jirachi: 'event-only in Emerald — unobtainable by design in the source game',
	surskit: 'FAITHFUL — absent from pokeemerald wild_encounters.json (Ruby/Sapphire-side content Emerald dropped)',
	masquerain: 'evolves from Surskit (above)',
	meditite: 'FAITHFUL — absent from pokeemerald wild_encounters.json',
	medicham: 'evolves from Meditite (above)',
	roselia: 'FAITHFUL — absent from pokeemerald wild_encounters.json',
	zangoose: 'FAITHFUL — Emerald is the Seviper side of that exclusive pair; Route114 has Seviper only, which we match',
	lunatone: 'FAITHFUL — Emerald is the Solrock side of that exclusive pair; Meteor Falls has Solrock only, which we match',
	feebas: 'FAITHFUL-ish — Emerald delivers Feebas through six secret Route119 fishing tiles in code, not through a wild table, so there was nothing to import',
	milotic: 'evolves from Feebas (above)',
};
{
	const g13 = baseMissing.filter(id => bat[id].num <= 386).sort((a, b) => bat[a].num - bat[b].num);
	say('');
	say(`  gen 1-3 gaps — the three regions we actually ship (${g13.length}):`);
	for (const id of g13) {
		const why = (CAUSE[id] || 'UNTRACED').split(' — ')[0];
		say(`         #${String(bat[id].num).padStart(3)}  ${nameOf(id).padEnd(11)} ${why}`);
	}
}
say('');
say('  alternate forms, by kind');
{
	const kind = id => /_mega/.test(id) ? 'mega' : /_gmax/.test(id) ? 'gigantamax'
		: /_(alola|galar|hisui|paldea)/.test(id) ? 'regional' : /_totem/.test(id) ? 'totem' : 'other form';
	const by = {};
	for (const id of formMissing) by[kind(id)] = (by[kind(id)] || 0) + 1;
	for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) say(`  ${pad(n)}  ${k}`);
}

say('');
say('wild-encounter species per region  (what JohKanto has to compete with)');
const perRegion = {};
for (const [id, rs] of wildRegions) for (const r of rs) (perRegion[r] ||= new Set()).add(id);
for (const [r, set] of Object.entries(perRegion).sort((a, b) => b[1].size - a[1].size)) {
	say(`  ${pad(set.size)}  ${r}${UNREACHABLE_REGIONS.has(r) ? '   <- not runtime-wired, NOT counted as obtainable' : ''}`);
}
{
	const dead = [...wildRegions].filter(([id, rs]) => [...rs].every(r => UNREACHABLE_REGIONS.has(r)) && !via.has(id));
	say(`  ${pad(dead.length)}  species whose only wild table is in an unwired region`);
}
say('');
say('species found in exactly ONE region (wild)');
const only = {};
for (const [id, rs] of wildRegions) if (rs.size === 1) (only[[...rs][0]] ||= []).push(id);
for (const [r, list] of Object.entries(only).sort((a, b) => b[1].length - a[1].length)) say(`  ${pad(list.length)}  ${r}`);

say('');
say(`script gifts (givemon/giveegg): ${scriptGifts.size}`);
say('  ' + [...scriptGifts.keys()].map(nameOf).join(', '));

if (process.argv.includes('--list')) {
	say('');
	say('UNREACHABLE base species');
	for (const id of baseMissing.sort((a, b) => bat[a].num - bat[b].num)) say(`  #${String(bat[id].num).padStart(4)}  ${nameOf(id)}  (${id})`);
}

const md = arg('md');
if (md) {
	const rows = list => list.sort((a, b) => bat[a].num - bat[b].num)
		.map(id => `| ${bat[id].num} | ${nameOf(id)} | \`${id}\` |`).join('\n');
	const g13 = baseMissing.filter(id => bat[id].num <= 386).sort((a, b) => bat[a].num - bat[b].num);
	fs.writeFileSync(md,
		`# Species coverage\n\nGenerated by \`tools/species_coverage.mjs\`. Re-run it after any encounter-table change.\n\n\`\`\`\n${L.join('\n')}\n\`\`\`\n\n`
		+ `## The gen 1-3 gaps, traced\n\nThese are the only misses inside content we actually ship. Each was traced back to the decomp it came from.\n\n`
		+ `| # | name | cause |\n|---|---|---|\n`
		+ g13.map(id => `| ${bat[id].num} | ${nameOf(id)} | ${CAUSE[id] || 'untraced'} |`).join('\n') + '\n\n'
		+ `## Unreachable base species (${baseMissing.length})\n\nThese have no wild table, no gift, no trade, no evolution parent and no baby form anywhere in the game.\n\n`
		+ `| # | name | id |\n|---|---|---|\n${rows(baseMissing)}\n\n`
		+ `## Unreachable alternate forms (${formMissing.length})\n\nMegas, Gigantamax, regional variants and other forms. Most are unobtainable by design in the source games; they need a mechanic, not a route.\n\n`
		+ `| # | name | id |\n|---|---|---|\n${rows(formMissing)}\n`);
	console.log('\nwrote ' + md);
}
