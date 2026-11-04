// gen_regional_forms.mjs — every regional form's OWN movepool, from Showdown.
//
// The 58 regional forms (Alolan, Galarian incl. Zen, Hisuian, Paldean) shipped
// with their BASE species' moves: species_battle.json's level-up `learnset` was
// copied from the base, and tm_learnsets.json never matched a form at all
// (Showdown keys are `vulpixalola`, ours `vulpix_alola`). So Alolan Vulpix learned
// Ember and Flamethrower and could not be taught Ice Beam.
//
// Source: Showdown's learnsets.ts (vendored in Magepunk66/Reference). Per form:
//   level  the level-up moves of the NEWEST generation that has any for the form
//          (Showdown codes "<gen>L<level>"; level 0 = learned on evolving)
//   tm     every move with a Machine or Tutor code in any generation ("8M", "9T"),
//          the same rule tools/gen_tm_learnsets.mjs applies to every other species
//   egg    every Egg code in any generation ("7E")
// Battle-only forms with no learnset block of their own use their base form's
// (Darmanitan-Galar-Zen -> Darmanitan-Galar), as Showdown itself does.
//
// The SOURCE move ids are written as-is. overworld/regional_forms.js maps them at
// load time: a move this engine lacks goes through MOVE_SUBS (nearest implemented
// move) or is dropped, and UNIMPLEMENTED lists them for the record.
//
// Output: overworld/regional_forms_data.js (git-tracked, so no owdata deploy).
//   node tools/gen_regional_forms.mjs           (from the repo root; dry run)
//   node tools/gen_regional_forms.mjs --write
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = process.env.MAGEPUNK_REF || [
	path.resolve('..', 'Magepunk66', 'Reference'),
	path.resolve('..', '..', '..', 'Magepunk66', 'Reference'), // from a .worktrees/<name> checkout
	'C:/Users/guide/Desktop/Magepunk66/Reference',
].find(p => fs.existsSync(path.join(p, 'pokemon-showdown-master', 'data', 'learnsets.ts')));
if (!REF) { console.error('Showdown reference not found (set MAGEPUNK_REF)'); process.exit(1); }
const LS_FILE = path.join(REF, 'pokemon-showdown-master', 'data', 'learnsets.ts');

const species = JSON.parse(fs.readFileSync('overworld/data/species_battle.json', 'utf8'));
const moves = JSON.parse(fs.readFileSync('overworld/data/moves_battle.json', 'utf8'));
// Showdown moves this engine has no data for -> the nearest implemented move.
// EERIE SPELL (Galarian Slowking): 80-power special Psychic, 100% accurate, that
// also drains 3 PP. EXTRASENSORY is the same type, category, power and accuracy.
const MOVE_SUBS = { eeriespell: 'extrasensory' };

const REGIONAL_RE = /_(alola|galar|hisui|paldea)(_|$)/;
const squash = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// learnsets.ts: "\tkey: {" ... "\t\tlearnset: {" ... "\t\t\tmove: [codes]"
function parseLearnsets(src) {
	const out = {};
	let cur = null, inLs = false;
	for (const raw of src.split('\n')) {
		const line = raw.replace(/\r$/, '');
		const sp = /^\t([a-z0-9]+): \{$/.exec(line);
		if (sp) { cur = sp[1]; out[cur] = {}; inLs = false; continue; }
		if (!cur) continue;
		if (/^\t\tlearnset: \{$/.test(line)) { inLs = true; continue; }
		if (/^\t\t\}/.test(line)) { inLs = false; continue; }
		const mv = inLs && /^\t{3}([a-z0-9]+): \[([^\]]*)\]/.exec(line);
		if (mv) out[cur][mv[1]] = mv[2].replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean);
	}
	return out;
}

function formSource(ls) {
	let gen = 0;
	for (const codes of Object.values(ls)) for (const c of codes) { const m = /^(\d)L/.exec(c); if (m) gen = Math.max(gen, +m[1]); }
	const level = [];
	for (const [mid, codes] of Object.entries(ls)) for (const c of codes) {
		const m = /^(\d)L(\d+)$/.exec(c);
		if (m && +m[1] === gen) level.push([+m[2], mid]);
	}
	level.sort((a, b) => a[0] - b[0]); // stable: Showdown's (alphabetical) order within a level
	const tm = Object.keys(ls).filter(mid => ls[mid].some(c => /^\d[MT]$/.test(c))).sort();
	const egg = Object.keys(ls).filter(mid => ls[mid].some(c => /^\dE$/.test(c))).sort();
	return { gen, level, tm, egg };
}

const LS = parseLearnsets(fs.readFileSync(LS_FILE, 'utf8'));
const forms = Object.keys(species).filter(id => REGIONAL_RE.test(id)).sort();
const SHARE = { darmanitan_galar_zen: 'darmanitan_galar' }; // battle-only form -> its base's block
const SOURCE = {};
const missing = {};
for (const id of forms) {
	const key = squash(SHARE[id] || id);
	const ls = LS[key];
	if (!ls || !Object.keys(ls).length) { console.error(`no Showdown learnset for ${id} (${key})`); process.exit(1); }
	const src = formSource(ls);
	SOURCE[id] = src;
	for (const mid of new Set([...src.level.map(x => x[1]), ...src.tm, ...src.egg])) {
		if (!moves[mid]) (missing[mid] = missing[mid] || []).push(id);
	}
}
const unimplemented = Object.keys(missing).sort().map(mid => ({ move: mid, sub: MOVE_SUBS[mid] || null, forms: missing[mid] }));
for (const u of unimplemented) {
	if (u.sub && !moves[u.sub]) { console.error(`MOVE_SUBS.${u.move} -> ${u.sub}, which is not implemented either`); process.exit(1); }
}

// ---------- evolutions, from pokedex.ts ----------
// Every evolution INTO a regional form, and every evolution OUT of one, as
// Showdown records it. overworld/regional_forms.js REGIONAL_EVOS encodes them for
// this engine; regional_forms_test checks the two agree, in CI too (no decomps there).
const DEX_SRC = fs.readFileSync(path.join(REF, 'pokemon-showdown-master', 'data', 'pokedex.ts'), 'utf8').replace(/\r/g, '');
const dex = {};
{
	const starts = [];
	const re = /^\t([a-z0-9]+): \{$/gm;
	let m;
	while ((m = re.exec(DEX_SRC))) starts.push([m[1], m.index]);
	for (let i = 0; i < starts.length; i++) {
		const [k, at] = starts[i];
		const body = DEX_SRC.slice(at, i + 1 < starts.length ? starts[i + 1][1] : DEX_SRC.length);
		const f = name => { const r = new RegExp('\n\t\t' + name + ': ([^\n]*),\n').exec(body); return r ? JSON.parse(r[1]) : undefined; };
		dex[k] = { name: f('name'), prevo: f('prevo'), evos: f('evos'), evoType: f('evoType'), evoLevel: f('evoLevel'),
			evoItem: f('evoItem'), evoCondition: f('evoCondition'), evoMove: f('evoMove'), evoRegion: f('evoRegion') };
	}
}
const idOf = name => Object.keys(species).find(k => squash(k) === squash(name)) || null;
const EVOS = [];
const seenEdge = new Set();
const edge = (from, to) => {
	const d = dex[squash(to)];
	if (seenEdge.has(squash(from) + '>' + squash(to))) return;
	seenEdge.add(squash(from) + '>' + squash(to));
	EVOS.push({ from: idOf(from), to: idOf(to), type: d.evoType || 'level', level: d.evoLevel ?? null, item: d.evoItem ? squash(d.evoItem) : null,
		condition: d.evoCondition || null, move: d.evoMove ? squash(d.evoMove) : null, region: d.evoRegion || null });
};
for (const id of forms) {
	const d = dex[squash(id)];
	if (!d) continue;
	if (d.prevo) edge(d.prevo, d.name);
	for (const e of d.evos || []) edge(d.name, e);
}
for (const e of EVOS) if (!e.from || !e.to) { console.error('evolution species missing from our data', e); process.exit(1); }

const body = `// regional_forms_data.js — GENERATED by tools/gen_regional_forms.mjs from Showdown's
// learnsets.ts; re-run it rather than editing by hand. Source move ids, unmapped:
// overworld/regional_forms.js applies them (and MOVE_SUBS) when the battle data loads.
// { formId: { gen, level: [[lv, move]], tm: [move], egg: [move] } }
export const SOURCE_GEN_NOTE = 'level = newest generation with level-up moves; tm = any-gen Machine/Tutor; egg = any-gen Egg';
export const SOURCE = ${JSON.stringify(SOURCE)};
// Showdown moves this engine has no data for -> the nearest implemented move
export const MOVE_SUBS = ${JSON.stringify(MOVE_SUBS)};
// moves in SOURCE this engine has no data for: mapped through MOVE_SUBS, or dropped
export const UNIMPLEMENTED = ${JSON.stringify(unimplemented)};
// Showdown's evolutions into and out of every regional form (pokedex.ts)
export const SHOWDOWN_EVOS = ${JSON.stringify(EVOS)};
`;
console.log(`${forms.length} regional forms; ${Object.values(SOURCE).reduce((n, s) => n + s.level.length, 0)} level-up entries, `
	+ `${Object.values(SOURCE).reduce((n, s) => n + s.tm.length, 0)} machine/tutor pairs.`);
console.log(`unimplemented: ${unimplemented.map(u => `${u.move} -> ${u.sub || 'skip'} (${u.forms.join(', ')})`).join('; ') || 'none'}`);
if (WRITE) {
	fs.writeFileSync('overworld/regional_forms_data.js', body);
	console.log(`wrote overworld/regional_forms_data.js (${(body.length / 1024).toFixed(0)}KB)`);
} else console.log('(dry run; --write to save)');
