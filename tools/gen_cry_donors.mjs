// gen_cry_donors.mjs — donor cries for the 391 species with no cry file.
//
// The Ransei/Uranium fakemon (and a couple of forms) shipped silent: no
// data/sounds/cries/<id>.ogg exists, so every "appeared!" was mute. Real cry
// audio can't be conjured, but silence loses to a borrowed voice: each
// silent species borrows the cry of its nearest real relative — same primary
// type, closest base-stat total (a rough proxy for body mass, which is what a
// cry's register tracks), secondary-type match as the tiebreak.
//
//   node tools/gen_cry_donors.mjs           (report)
//   node tools/gen_cry_donors.mjs --write   (write overworld/data/cry_donors.json)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const D = path.resolve('overworld/data');

const species = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));
const have = new Set(fs.readdirSync(path.join(D, 'sounds/cries'))
	.filter(f => f.endsWith('.ogg')).map(f => f.slice(0, -4)));

const bst = sp => Object.values(sp.baseStats || {}).reduce((a, b) => a + (b || 0), 0);
const donors = Object.entries(species)
	.filter(([id]) => have.has(id))
	.map(([id, sp]) => ({ id, types: sp.types || [], bst: bst(sp) }));

const out = {};
let mapped = 0;
for (const [id, sp] of Object.entries(species)) {
	if (have.has(id)) continue;
	const t = sp.types || [];
	const total = bst(sp);
	let best = null, bestScore = Infinity;
	for (const d of donors) {
		if (d.types[0] !== t[0]) continue;                       // primary type must match
		const score = Math.abs(d.bst - total)
			+ ((d.types[1] || '') === (t[1] || '') ? 0 : 40);    // secondary-type tiebreak
		if (score < bestScore) { bestScore = score; best = d; }
	}
	// no primary-type match at all (shouldn't happen): closest stat total wins
	if (!best) for (const d of donors) {
		const score = Math.abs(d.bst - total);
		if (score < bestScore) { bestScore = score; best = d; }
	}
	out[id] = best.id;
	mapped++;
}

console.log(`silent species: ${mapped}   donors drawn from ${donors.length} real cries`);
for (const probe of ['shox', 'draggalong', 'mobipup', 'aardart']) {
	if (out[probe]) console.log(`  ${probe} (${(species[probe].types || []).join('/')}, bst ${bst(species[probe])})`
		+ ` -> ${out[probe]} (${(species[out[probe]].types || []).join('/')}, bst ${bst(species[out[probe]])})`);
}
const bad = Object.values(out).filter(d => !have.has(d)).length;
console.log(`donors without a cry file (must be 0): ${bad}`);
if (WRITE) {
	fs.writeFileSync(path.join(D, 'cry_donors.json'), JSON.stringify(out));
	console.log('\nwrote overworld/data/cry_donors.json — owdata deploys separately:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
} else {
	console.log('\n(dry run — pass --write)');
}
