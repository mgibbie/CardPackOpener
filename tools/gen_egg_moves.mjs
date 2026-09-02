// gen_egg_moves.mjs — true egg moves, from pokeemerald.
//
// Inheritance only passed a father's move to the baby when `canLearn(baby, mid)`
// was true — i.e. moves the baby could learn ANYWAY by level/TM/tutor. Genuine
// egg moves (breeding-exclusive: Dragon Dance on a Charmander line, Mirror Coat
// on Squirtle) were therefore impossible: "egg moves" were really "inherited
// already-learnable moves". The real lists live in egg_moves.h.
//
//   node tools/gen_egg_moves.mjs           (report)
//   node tools/gen_egg_moves.mjs --write   (write overworld/data/egg_moves.json)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const SRC = path.resolve('../Magepunk66/Reference/pokeemerald/src/data/pokemon/egg_moves.h');
const D = path.resolve('overworld/data');

if (!fs.existsSync(SRC)) { console.error('missing: ' + SRC); process.exit(1); }
const species = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));
const moves = JSON.parse(fs.readFileSync(path.join(D, 'moves_battle.json'), 'utf8'));

const out = {};
let blocks = 0, matched = 0, unknownMoves = new Set();
const src = fs.readFileSync(SRC, 'utf8');
for (const m of src.matchAll(/egg_moves\(([A-Z0-9_]+),([\s\S]*?)\)/g)) {
	blocks++;
	const id = m[1].toLowerCase().replace(/_/g, '');
	if (!species[id]) continue;
	const list = [...m[2].matchAll(/MOVE_([A-Z0-9_]+)/g)]
		.map(x => x[1].toLowerCase().replace(/_/g, ''))
		.filter(mid => { if (moves[mid]) return true; unknownMoves.add(mid); return false; });
	if (list.length) { out[id] = list; matched++; }
}
console.log(`egg_move blocks: ${blocks}   matched species with usable moves: ${matched}`);
console.log(`move ids not in moves_battle.json (dropped): ${unknownMoves.size}  ${[...unknownMoves].slice(0, 6).join(', ')}`);
for (const [id, want] of [['charmander', 'dragondance'], ['squirtle', 'mirrorcoat'], ['dratini', 'dragonrush']]) {
	console.log(`  ${id}: ${out[id]?.includes(want) ? 'has' : 'MISSING'} ${want}  (${(out[id] || []).length} egg moves)`);
}
if (WRITE) {
	fs.writeFileSync(path.join(D, 'egg_moves.json'), JSON.stringify(out));
	console.log('\nwrote overworld/data/egg_moves.json — owdata deploys separately');
} else {
	console.log('\n(dry run — pass --write)');
}
