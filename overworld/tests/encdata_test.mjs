// encdata_test.mjs — integrity of the GENERATED night-encounter data modules
// (encounters_frem_night.js + encounters_daynight.js) against the live species
// data. A dangling species id here is a silent no-show (or a broken battle) at
// night on that map, and nothing else reads these files end-to-end. Node-only.
//   node overworld/tests/encdata_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const { FREM_NIGHT } = await import('../encounters_frem_night.js');
const { DAYNIGHT } = await import('../encounters_daynight.js');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// walk every slot list in a {MAP: {land: {night|day|morning: [...]}}}-shaped table
function slots(table) {
	const out = [];
	for (const [map, kinds] of Object.entries(table)) {
		for (const [kind, phases] of Object.entries(kinds)) {
			for (const [phase, list] of Object.entries(phases)) {
				if (Array.isArray(list)) out.push({ map, kind, phase, list });
			}
		}
	}
	return out;
}

for (const [name, table] of [['FREM_NIGHT', FREM_NIGHT], ['DAYNIGHT', DAYNIGHT]]) {
	const all = slots(table);
	A(all.length > 50, `${name} carries a real map set`, `lists=${all.length}`);
	const badSpecies = new Set(), badLevels = [], badWeights = [], empty = [];
	for (const { map, list } of all) {
		if (!list.length) { empty.push(map); continue; }
		for (const s of list) {
			if (!S[s.id]) badSpecies.add(`${map}:${s.id}`);
			if (!(s.min >= 1 && s.max >= s.min && s.max <= 255)) badLevels.push(`${map}:${s.id} ${s.min}-${s.max}`);
			if (!(s.w > 0)) badWeights.push(`${map}:${s.id}`);
		}
	}
	A(badSpecies.size === 0, `${name}: every slot species exists in species_battle.json (${badSpecies.size} dangling)`, [...badSpecies].slice(0, 6).join(','));
	A(badLevels.length === 0, `${name}: every slot has a sane level band`, badLevels.slice(0, 4).join(','));
	A(badWeights.length === 0, `${name}: every slot has a positive weight`, badWeights.slice(0, 4).join(','));
	A(empty.length === 0, `${name}: no empty encounter lists`, empty.slice(0, 4).join(','));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
