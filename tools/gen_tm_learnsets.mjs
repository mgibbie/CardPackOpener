// gen_tm_learnsets.mjs — build the TM/tutor compatibility table the overworld's
// TM-teaching flow reads. Before this, canLearn() allowed only a species' own
// level-up moves, so TMs could never expand a movepool.
//
// Source: Showdown's learnsets.ts (vendored in Magepunk66/Reference). A species
// can machine-learn a move if any of its learnset codes is a Machine ("9M") or
// Tutor ("8T") flag from any generation. Output: overworld/data/tm_learnsets.json
// as { moveId: [speciesId...] }, restricted to species and moves that exist in
// this game's data. Fakemon absent from Showdown fall back to a type-based rule
// in canLearn() (see overworld/main.js).
//   node tools/gen_tm_learnsets.mjs      (from the repo root; deploy owdata after)
import fs from 'fs';
import path from 'path';

const LS = path.resolve('../Magepunk66/Reference/pokemon-showdown-master/data/learnsets.ts');
const species = JSON.parse(fs.readFileSync('overworld/data/species_battle.json', 'utf8'));
const moves = JSON.parse(fs.readFileSync('overworld/data/moves_battle.json', 'utf8'));

const src = fs.readFileSync(LS, 'utf8');
// walk "\n\tspeciesid: {" blocks; inside, "moveid: [codes]" lines
const out = {};
let cur = null;
for (const raw of src.split('\n')) {
	const line = raw.replace(/\r$/, ''); // vendored file may be CRLF
	const sp = /^\t([a-z0-9]+): \{$/.exec(line);
	if (sp) { cur = species[sp[1]] ? sp[1] : null; continue; }
	if (!cur) continue;
	const mv = /^\t{3}([a-z0-9]+): \[([^\]]*)\]/.exec(line);
	if (!mv || !moves[mv[1]]) continue;
	if (/"\d+[MT]"/.test(mv[2])) (out[mv[1]] = out[mv[1]] || []).push(cur);
}
for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].sort();
// the species Showdown knows at all — fakemon absent from this list use the
// type-based fallback in canLearn() instead of being locked out of TMs
out.__species = [...new Set(Object.values(out).flat())].sort();
fs.writeFileSync('overworld/data/tm_learnsets.json', JSON.stringify(out));
const totals = Object.values(out).reduce((a, b) => a + b.length, 0);
const bytes = fs.statSync('overworld/data/tm_learnsets.json').size;
console.log(`tm_learnsets.json: ${Object.keys(out).length} machine/tutor moves, ${totals} pairs, ${(bytes / 1024).toFixed(0)}KB. Deploy owdata.`);
