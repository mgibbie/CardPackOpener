// tune_johkanto_gyms.mjs — make JohKanto's eight gyms the region's spine.
//
// They shipped as Crystal's Kanto rematch rosters, which have three problems for
// a postgame region:
//
//   1. THE RAMP IS INVERTED. Janine, the fifth gym, was Lv33-39 — lower than
//      Brock at the first (41-44). Five of the eight sat inside four levels of
//      each other, so there was no ladder at all.
//   2. TEAM SIZES RUN 3 TO 6. Sabrina and Blaine had three POKeMON. That is a
//      route trainer, not the sixth and seventh gym of the endgame region.
//   3. THEY DO NOT MATCH THEIR OWN TERRITORY. gen_postgame_encounters.mjs gave
//      each leader's routes a type pair, and between the eight they cover all
//      eighteen — that is what makes every species catchable. But a leader whose
//      team ignores half its own territory teaches the player nothing about what
//      lives out there.
//
// So: six POKeMON each, drawn from the leader's OWN territory types, keeping every
// authentic member the Crystal roster had. The additions come from what actually
// lives in that territory (encounters_postgame.js), so a gym is a preview of the
// routes around it.
//
// LEVELS ARE NOT SET HERE. main.js levels a JohKanto gym off the player — the team
// one above your strongest, the ace two — so the roster's numbers only decide
// WHICH mon is the ace. They are still made to ascend, because that is what picks
// the ace and because the roster should read correctly outside the scaler.
//
//   node tools/tune_johkanto_gyms.mjs           (report)
//   node tools/tune_johkanto_gyms.mjs --write   (apply)
import fs from 'fs';

const WRITE = process.argv.includes('--write');
const D = 'overworld/data';
const path = `${D}/trainers.json`;
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
const bat = JSON.parse(fs.readFileSync(`${D}/species_battle.json`, 'utf8'));
const ext = JSON.parse(fs.readFileSync(`${D}/species_extra.json`, 'utf8'));

// The eight, in badge order, with the territory types gen_postgame_encounters.mjs
// gave each of them. `add` names the species brought in to fill to six — all of
// them found in that leader's own routes.
const GYMS = [
	{ script: 'PewterGymBrockScript',    leader: 'BROCK',    types: ['Rock', 'Ground', 'Steel'],
		add: ['steelix', 'rhydon'] },
	{ script: 'CeruleanGymMistyScript',  leader: 'MISTY',    types: ['Water', 'Ice'],
		add: ['cloyster', 'dewgong'] },
	{ script: 'VermilionGymSurgeScript', leader: 'LT.SURGE', types: ['Electric', 'Flying'],
		add: ['jolteon'] },
	{ script: 'CeladonGymErikaScript',   leader: 'ERIKA',    types: ['Grass', 'Bug'],
		add: ['vileplume', 'scyther'] },
	{ script: 'FuchsiaGymJanineScript',  leader: 'JANINE',   types: ['Poison', 'Dark'],
		add: ['muk'] },
	{ script: 'SaffronGymSabrinaScript', leader: 'SABRINA',  types: ['Psychic', 'Fairy'],
		add: ['slowbro', 'hypno', 'wigglytuff'] },
	{ script: 'SeafoamGymBlaineScript',  leader: 'BLAINE',   types: ['Fire', 'Dragon'],
		add: ['arcanine', 'ninetales', 'dragonite'] },
	// BLUE is the exception the type rule needs. Viridian is a mixed gym and his
	// team is the rival's, not a specialist's — that IS his identity, so his
	// territory bucket (the leftover types) never described his roster and the
	// off-type check does not apply to him.
	{ script: 'ViridianGymBlueScript',   leader: 'BLUE',     types: ['Normal', 'Fighting', 'Ghost'],
		mixed: true, add: [] },
];
const TEAM_SIZE = 6;
// An ascending ladder, only so the ace is unambiguous and the roster reads right
// on its own. The player never meets these numbers — see the header.
const BASE = [55, 58, 61, 64, 67, 70, 73, 76];

const typesOf = id => bat[id]?.types || [];
const bst = id => Object.values(bat[id]?.baseStats || {}).reduce((a, b) => a + b, 0);
const nameOf = id => bat[id]?.name || id;
// the strongest move a species knows by this level, for a quick sanity read
const movesOf = id => (ext[id]?.moves || []).length;

const report = [];
let changed = 0, problems = [];

GYMS.forEach((g, i) => {
	const r = doc.rosters[g.script];
	if (!r) { problems.push(`${g.script}: no roster`); return; }
	const before = (r.party || []).map(p => `${p.s}@${p.l}`);

	// keep every authentic member, then fill from the territory
	const kept = (r.party || []).map(p => ({ ...p }));
	const have = new Set(kept.map(p => p.s));
	const fill = g.add.filter(s => {
		if (!bat[s]) { problems.push(`${g.leader}: ${s} is not a species`); return false; }
		if (have.has(s)) { problems.push(`${g.leader}: ${s} already on the team`); return false; }
		if (!typesOf(s).some(t => g.types.includes(t))) {
			problems.push(`${g.leader}: ${s} is ${typesOf(s).join('/')}, not ${g.types.join('/')}`);
			return false;
		}
		return true;
	});
	const party = [...kept, ...fill.map(s => ({ s, l: 0 }))].slice(0, TEAM_SIZE);
	if (party.length < TEAM_SIZE) problems.push(`${g.leader}: only ${party.length} POKeMON — needs ${TEAM_SIZE - party.length} more`);

	// weakest first, ace last: the ladder inside the team, and the ace is the
	// strongest thing the leader owns rather than whatever the decomp listed last
	party.sort((a, b) => bst(a.s) - bst(b.s));
	const base = BASE[i];
	party.forEach((p, k) => { p.l = base + Math.round((k / Math.max(1, party.length - 1)) * 4); });

	// every member must belong to the territory, or the gym is teaching the wrong lesson
	const offType = g.mixed ? [] : party.filter(p => !typesOf(p.s).some(t => g.types.includes(t)));
	report.push({
		leader: g.leader, types: g.types.join('/'), before, offType: offType.map(p => `${p.s}(${typesOf(p.s).join('/')})`),
		after: party.map(p => `${p.s}@${p.l}`), ace: nameOf(party[party.length - 1].s),
	});
	r.party = party;
	changed++;
});

console.log(`gyms retuned: ${changed}\n`);
for (const r of report) {
	console.log(`${r.leader.padEnd(9)} ${r.types}`);
	console.log(`   was  ${r.before.join(' ')}`);
	console.log(`   now  ${r.after.join(' ')}   ace ${r.ace}`);
	if (r.offType.length) console.log(`   !! off-type: ${r.offType.join(' ')}`);
}
if (problems.length) { console.log('\nproblems:'); for (const p of problems) console.log('  ' + p); }

if (WRITE) {
	fs.writeFileSync(path, JSON.stringify(doc));
	console.log('\nWRITTEN to overworld/data/trainers.json');
	console.log('owdata is gitignored — deploy with:');
	console.log('  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
} else {
	console.log('\n(dry run — pass --write to apply)');
}
