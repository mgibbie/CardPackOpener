// audit_unresolved_constants.mjs — symbols the script engine can't turn into numbers.
//
// A transpiled script keeps the decomp's SYMBOL (NUM_ROUTE_114_MAN_BERRIES,
// FIRST_BERRY_INDEX). events.js resolveValue knows only what
// overworld/script_constants.js defines, and anything else stays a string. Where
// a NUMBER is required — `random <max>`, `addvar <n>` — that broke silently:
// Route 114's berry man gave nothing and said "The BAG is full" (2026-10-05).
// (events.js now warns once per such symbol at run time instead.)
//
// This scans every map script, shared_scripts.json and the tracked overlays, and
// reports:
//   numeric — operands of random/addvar/subvar that don't resolve (these MUST be
//             numbers; each one is a script that misbehaves)
//   branch  — branch comparison values that don't resolve (the branch can never
//             be true)
// Fix one by teaching tools/gen_script_constants.mjs the symbol (then --write).
//
//   node tools/audit_unresolved_constants.mjs           (summary + lists)
//   node tools/audit_unresolved_constants.mjs --json    (machine-readable, for the guard test)
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const D = path.join(ROOT, 'overworld', 'data');
const { SCRIPT_CONSTANTS } = await import(pathToFileURL(path.join(ROOT, 'overworld', 'script_constants.js')).href);

const BUILTIN = new Set(['TRUE', 'FALSE', 'YES', 'NO']);
const resolves = v => typeof v === 'number' || BUILTIN.has(v) || SCRIPT_CONSTANTS[v] !== undefined
	|| /^B_OUTCOME_/.test(v) || /^VAR_/.test(v) || !isNaN(Number(v));
const isSym = v => typeof v === 'string' && /^[A-Z(][A-Z0-9_ ()+-]*$/.test(v);
const NUMERIC_OPS = { random: ['max'], addvar: ['value'], subvar: ['value'] };

const numeric = new Map(), branch = new Map();   // symbol -> Set(labels)
const add = (m, sym, where) => { if (!m.has(sym)) m.set(sym, new Set()); m.get(sym).add(where); };
function scanBody(label, body) {
	if (!Array.isArray(body)) return;
	for (const s of body) {
		if (!s || typeof s !== 'object') continue;
		for (const f of NUMERIC_OPS[s.op] || []) if (isSym(s[f]) && !resolves(s[f])) add(numeric, s[f], label);
		if (s.op === 'branch' && s.cond?.var != null && isSym(s.cond.value) && !resolves(s.cond.value)) add(branch, s.cond.value, label);
	}
}
const scanLabels = obj => { for (const [label, body] of Object.entries(obj || {})) scanBody(label, body); };

// map scripts
for (const f of fs.readdirSync(path.join(D, 'scripts'))) {
	if (!f.endsWith('.json') || f === '_index.json') continue;
	scanLabels(JSON.parse(fs.readFileSync(path.join(D, 'scripts', f), 'utf8')));
}
// shared scripts
{ const p = path.join(D, 'shared_scripts.json'); if (fs.existsSync(p)) { const j = JSON.parse(fs.readFileSync(p, 'utf8')); scanLabels(j.labels || j); } }
// tracked overlays (each maps {map: {label: body}} and/or {shared: {label: body}})
for (const f of ['multichoice_data.json', 'fallthrough_data.json', 'crystal_scriptvar_data.json', 'missing_labels_data.json']) {
	const p = path.join(ROOT, 'overworld', f);
	if (!fs.existsSync(p)) continue;
	const j = JSON.parse(fs.readFileSync(p, 'utf8'));
	for (const part of [j.patches, j.shared, j.labels, j.maps]) {
		if (!part || typeof part !== 'object') continue;
		for (const v of Object.values(part)) {
			if (Array.isArray(v)) continue;
			if (v && typeof v === 'object') { const first = Object.values(v)[0]; if (Array.isArray(first)) scanLabels(v); }
		}
		if (Object.values(part).some(Array.isArray)) scanLabels(part);
	}
}

const out = {
	numeric: [...numeric].map(([s, l]) => ({ sym: s, uses: l.size, labels: [...l].slice(0, 3) })).sort((a, b) => b.uses - a.uses),
	branch: [...branch].map(([s, l]) => ({ sym: s, uses: l.size })).sort((a, b) => b.uses - a.uses),
};
if (process.argv.includes('--json')) { console.log(JSON.stringify({ numeric: out.numeric.length, branch: out.branch.length, numericSyms: out.numeric.map(x => x.sym) })); process.exit(0); }
console.log(`random/addvar/subvar operands that don't resolve to a number: ${out.numeric.length}`);
for (const x of out.numeric) console.log(`    ${x.sym}  (${x.uses}: ${x.labels.join(', ')})`);
console.log(`\nbranch comparison values that don't resolve: ${out.branch.length}`);
for (const x of out.branch.slice(0, 25)) console.log(`    ${x.sym}  (${x.uses})`);
if (out.branch.length > 25) console.log(`    ... and ${out.branch.length - 25} more`);
