// species_basestats_test.mjs — every real species and form in the overworld has
// its true base stats.
//
// 2026-11-03 forms audit: three regional forms carried the wrong numbers —
// Hisuian Zorua (SpA 60 / Spe 65, real 85 / 70), Hisuian Zoroark (SpA 120 /
// Spe 105, the Unovan line's; real 125 / 110) and Hisuian Sliggoo (Def 53 / Spe
// 60, Kalos Sliggoo's; real 83 / 40) — and this check found a fourth, female
// Oinkologne (Spe 50, real 65). Nothing compared species_battle.json with a
// source, so a bad row just shipped.
//
// The source is Pokémon Showdown's pokedex.ts (the owner's Reference folder),
// snapshotted into fixtures/showdown_basestats.json by
// tools/gen_showdown_basestats.mjs so CI can read it. Fakemon (num <= 0) have no
// canonical source and are skipped; any intentional difference goes in
// EXCEPTIONS (species_basestats_map.mjs) with its reason.
//
//   node overworld/tests/species_basestats_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { showdownIdFor, EXCEPTIONS } from './species_basestats_map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const REF = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/showdown_basestats.json'), 'utf8'));
const real = Object.keys(S).filter(id => !id.startsWith('_') && S[id].num > 0);

A(Object.keys(REF).length > 1300, `the Showdown snapshot has ${Object.keys(REF).length} entries`);
A(real.length > 1100, `${real.length} canonical species/forms to check`);

const unmapped = real.filter(id => !REF[showdownIdFor(id)]);
A(unmapped.length === 0, 'every canonical species/form has a Showdown entry (map new ids in species_basestats_map.mjs)', unmapped.join(' '));

const wrongNum = real.filter(id => REF[showdownIdFor(id)] && REF[showdownIdFor(id)].num !== S[id].num);
A(wrongNum.length === 0, 'every one has the right dex number', wrongNum.map(id => `${id} ${S[id].num}->${REF[showdownIdFor(id)].num}`).join(' '));

const wrong = [];
for (const id of real) {
	if (EXCEPTIONS[id]) continue;
	const r = REF[showdownIdFor(id)];
	if (!r) continue;
	const bad = STATS.filter((k, i) => S[id].baseStats?.[k] !== r.bs[i]);
	if (bad.length) wrong.push(`${id}(${bad.map(k => `${k} ${S[id].baseStats?.[k]}!=${r.bs[STATS.indexOf(k)]}`).join(',')})`);
}
A(wrong.length === 0, `every species/form's six base stats match Showdown (${real.length - Object.keys(EXCEPTIONS).length} checked)`, wrong.join(' '));

// the audit's three, spelled out
const want = { zorua_hisui: [35, 60, 40, 85, 40, 70], zoroark_hisui: [55, 100, 60, 125, 60, 110], sliggoo_hisui: [58, 75, 83, 83, 113, 40], oinkologne_f: [115, 90, 70, 59, 90, 65] };
for (const [id, bs] of Object.entries(want)) {
	const got = STATS.map(k => S[id]?.baseStats?.[k]);
	A(got.join('/') === bs.join('/'), `${S[id]?.name || id} is ${bs.join('/')}`, got.join('/'));
}
for (const id of Object.keys(EXCEPTIONS)) A(!!S[id], `exception ${id} still names a real species`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
