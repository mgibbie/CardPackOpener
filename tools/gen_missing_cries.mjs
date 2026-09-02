// gen_missing_cries.mjs — the cry worklist for the design wiki.
//
// 391 species have no cry file at all, and 63 groups of (mostly form) species
// share one byte-identical file. The user records original cries by hand, so
// the wiki's "Missing Cries" page lists both buckets as a chip-away worklist.
// Borrowed/donor cries were tried and explicitly rejected (user call:
// "the ones without original cries should just have no cry").
//
// Output is id-only — the wiki resolves names/sprites/types from its own
// pokemon.json, so this file stays tiny and never drifts from the dex.
//
//   node tools/gen_missing_cries.mjs           (report)
//   node tools/gen_missing_cries.mjs --write   (write designwiki/data/missing_cries.json)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const WRITE = process.argv.includes('--write');
const D = path.resolve('overworld/data');

const species = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));
const criesDir = path.join(D, 'sounds/cries');
const have = new Set(fs.readdirSync(criesDir).filter(f => f.endsWith('.ogg')).map(f => f.slice(0, -4)));

const dexNum = id => Math.abs(species[id]?.num || 9999);
const missing = Object.keys(species).filter(id => !have.has(id))
	.sort((a, b) => dexNum(a) - dexNum(b) || a.localeCompare(b));

// byte-identical files = one recording shared by several species
const byHash = {};
for (const id of have) {
	if (!species[id]) continue;   // a cry for a species the dex no longer has
	const h = crypto.createHash('md5').update(fs.readFileSync(path.join(criesDir, id + '.ogg'))).digest('hex');
	(byHash[h] = byHash[h] || []).push(id);
}
const shared = Object.values(byHash).filter(g => g.length > 1)
	.map(g => g.sort((a, b) => dexNum(a) - dexNum(b) || a.localeCompare(b)))
	.sort((a, b) => dexNum(a[0]) - dexNum(b[0]));

console.log(`species with NO cry file: ${missing.length}`);
console.log(`groups sharing one file:  ${shared.length} (${shared.reduce((s, g) => s + g.length, 0)} species)`);
console.log('  e.g.', missing.slice(0, 5).join(', '));
console.log('  e.g. shared:', JSON.stringify(shared.find(g => g.length > 3) || shared[0]));

if (WRITE) {
	const out = { missing, shared };
	fs.writeFileSync(path.resolve('designwiki/data/missing_cries.json'), JSON.stringify(out));
	console.log('\nwrote designwiki/data/missing_cries.json (committed with the repo — no owdata step)');
} else {
	console.log('\n(dry run — pass --write)');
}
