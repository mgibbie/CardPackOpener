// gen_unown.mjs — give Unown its 27 missing letters.
//
// Only ONE Unown entry ships in the species data ("unown" = letter A, sprite
// s6432). Its 28 letter sprites all exist on disk (s6432..s6459 = num 201*32 +
// formeOrder), but B..Z, ! and ? have no species entry, so a wild Unown could
// only ever be the base A. This injects the other 27 as their own species —
// identical to A in every way except name + sprite — so the encounter roll,
// party, PC, battle art and the Unown Dex all work by speciesId with no special
// casing. Idempotent: re-running overwrites the generated entries in place.
//
//   node tools/gen_unown.mjs
//
// The data files are offloaded (gitignored), so after running this, deploy:
//   npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --commit-dirty=true
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../overworld/data');
const BASE_NUM = 201, BASE_SPRITE = 6432; // A = 201*32

// formeOrder: A(0) B(1) ... Z(25) !(26) ?(27)
const LETTERS = []; // { id, name, sprite }
for (let i = 1; i <= 25; i++) { // B..Z
	const ch = String.fromCharCode(65 + i); // 'B'..'Z'
	LETTERS.push({ id: 'unown_' + ch.toLowerCase(), name: 'Unown ' + ch, sprite: `s${BASE_SPRITE + i}.png` });
}
LETTERS.push({ id: 'unown_exclaim', name: 'Unown !', sprite: `s${BASE_SPRITE + 26}.png` });
LETTERS.push({ id: 'unown_question', name: 'Unown ?', sprite: `s${BASE_SPRITE + 27}.png` });

const readJSON = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const writeJSON = (f, o) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(o));

// clone the base "unown" record in each file, overriding name/sprite where present
const FILES = {
	'species_index.json': (base, L) => ({ ...base, name: L.name, sprite: L.sprite }),
	'species_battle.json': (base, L) => ({ ...base, name: L.name, sprite: L.sprite }),
	'species_abilities.json': base => base,     // ["levitate"]
	'species_extra.json': base => base,         // {catch,exp,learn}
	'genders.json': base => base,               // -1
	'ev_yields.json': base => base,             // {atk:1,spa:1}
};

let added = 0;
for (const [file, clone] of Object.entries(FILES)) {
	const data = readJSON(file);
	const base = data['unown'];
	if (base === undefined) { console.error(`! ${file}: no base "unown" entry — skipped`); continue; }
	for (const L of LETTERS) {
		data[L.id] = clone(JSON.parse(JSON.stringify(base)), L);
	}
	writeJSON(file, data);
	added += LETTERS.length;
}
console.log(`Injected ${LETTERS.length} Unown letters (B..Z, !, ?) into ${Object.keys(FILES).length} data files (${added} records).`);
console.log('Remember to deploy overworld/data to magepunk-owdata.');
