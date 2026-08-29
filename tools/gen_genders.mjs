// gen_genders.mjs — per-species gender data from Showdown's pokedex.ts
// (vendored in Magepunk66/Reference). Output overworld/data/genders.json:
// { speciesId: maleChance } with -1 = genderless; species absent from the
// map are 50/50. Deploy owdata after running.
//   node tools/gen_genders.mjs      (from the repo root)
import fs from 'fs';
import path from 'path';

const SRC = path.resolve('../Magepunk66/Reference/pokemon-showdown-master/data/pokedex.ts');
const raw = fs.readFileSync(SRC, 'utf8').replace(/\r/g, ''); // CRLF-vendored, like learnsets.ts
const out = {};
const blocks = raw.split(/\n\t([a-z0-9]+): \{/).slice(1);
for (let i = 0; i + 1 < blocks.length; i += 2) {
	const id = blocks[i], body = blocks[i + 1];
	const g = body.match(/\n\t\tgender: "([MFN])"/);
	const gr = body.match(/genderRatio: \{ ?M: ([\d.]+)/); // both "{M:" and "{ M:" appear in the source
	if (g) out[id] = g[1] === 'N' ? -1 : g[1] === 'M' ? 1 : 0;
	else if (gr) out[id] = +gr[1];
}
fs.writeFileSync('overworld/data/genders.json', JSON.stringify(out));
const genderless = Object.values(out).filter(v => v === -1).length;
console.log(`genders.json: ${Object.keys(out).length} species with non-50/50 data (${genderless} genderless). Deploy owdata.`);
