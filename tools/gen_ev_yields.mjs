// gen_ev_yields.mjs — real per-species EV yields, from pokeemerald.
//
// awardEvs used a heuristic (+2 to the fallen species' highest base stat), which
// channels roughly right but makes targeted EV training impossible: every yield
// is 2 of one stat, and split yields (1 HP + 1 SpA) don't exist. The real table
// lives in pokeemerald's src/data/pokemon/species_info.h as evYield_* fields.
//
// Species the decomp doesn't know (fakemon, gens past III) are simply absent
// from the output, and awardEvs keeps the heuristic for them — a wrong-but-
// plausible yield beats none.
//
//   node tools/gen_ev_yields.mjs           (report)
//   node tools/gen_ev_yields.mjs --write   (write overworld/data/ev_yields.json)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const SRC = path.resolve('../Magepunk66/Reference/pokeemerald/src/data/pokemon/species_info.h');
const D = path.resolve('overworld/data');

if (!fs.existsSync(SRC)) { console.error('missing: ' + SRC); process.exit(1); }
const species = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));

const KEY = { evYield_HP: 'hp', evYield_Attack: 'atk', evYield_Defense: 'def',
	evYield_SpAttack: 'spa', evYield_SpDefense: 'spd', evYield_Speed: 'spe' };

const out = {};
let blocks = 0, matched = 0;
const src = fs.readFileSync(SRC, 'utf8');
for (const m of src.matchAll(/\[SPECIES_([A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s*\}/g)) {
	blocks++;
	const id = m[1].toLowerCase().replace(/_/g, '');
	if (!species[id]) continue;                        // not a species this game has
	const y = {};
	for (const f of m[2].matchAll(/\.(evYield_\w+)\s*=\s*(\d+)/g)) {
		const k = KEY[f[1]];
		if (k && +f[2] > 0) y[k] = +f[2];
	}
	if (Object.keys(y).length) { out[id] = y; matched++; }
}
console.log(`decomp species blocks: ${blocks}   matched to our dex with a yield: ${matched}`);
// spot checks against known canon
for (const [id, want] of [['zubat', { spe: 1 }], ['shuckle', { def: 1, spd: 1 }], ['chansey', { hp: 2 }]]) {
	console.log(`  ${id}: ${JSON.stringify(out[id])}  (canon ${JSON.stringify(want)})`);
}
if (WRITE) {
	fs.writeFileSync(path.join(D, 'ev_yields.json'), JSON.stringify(out));
	console.log('\nwrote overworld/data/ev_yields.json — owdata deploys separately:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
} else {
	console.log('\n(dry run — pass --write)');
}
