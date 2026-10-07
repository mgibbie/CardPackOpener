// gen_subvar_fix.mjs — find every `subvar` the script transpile turned into an `addvar`.
//
// Magepunk66's tools/transpile_scripts.py writes `subvar V, N` as `addvar V, -N`,
// which is right for a NUMBER — but for a SYMBOL (a price constant, another
// variable) it can't negate, and it emitted `addvar V, SYMBOL`: an ADD. The
// Glass Workshop's `subvar VAR_ASH_GATHER_COUNT, BLUE_FLUTE_PRICE` became "add
// 250 ash" (2026-10-05). This walks the decomps' script files, lines each label's
// symbolic addvar/subvar up with the converted label's symbolic `addvar` ops (in
// order, matching variable and operand), and records which ones were subvars.
// overworld/subvar_fix.js flips those back to `subvar` when map scripts load.
//
//   node tools/gen_subvar_fix.mjs           (report)
//   node tools/gen_subvar_fix.mjs --write   (write overworld/subvar_fix_data.json)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = (() => {
	if (process.env.MAGEPUNK66) return path.join(process.env.MAGEPUNK66, 'Reference');
	for (let d = path.resolve('..'); ; d = path.dirname(d)) {
		const r = path.join(d, 'Magepunk66', 'Reference');
		if (fs.existsSync(r)) return r;
		if (path.dirname(d) === d) return path.resolve('../Magepunk66/Reference');
	}
})();
const D = path.resolve('overworld/data');
const isNum = v => typeof v === 'number' || /^-?(0x[0-9a-fA-F]+|\d+)$/.test(String(v).trim());

// ---- the decomps: label -> [{cmd, var, operand}] for SYMBOLIC addvar/subvar ----
const decomp = { pokefirered: new Map(), pokeemerald: new Map() };
let decompSub = 0;
for (const dec of Object.keys(decomp)) {
	const walk = dir => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) { walk(p); continue; }
			if (!e.name.endsWith('.inc')) continue;
			let label = null;
			for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
				const l = /^([A-Za-z0-9_]+)::?\s*(?:@.*)?$/.exec(line);
				if (l) { label = l[1]; continue; }
				const c = /^\s+(addvar|subvar)\s+([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_()+\- ]+?)\s*(?:@.*)?$/.exec(line);
				if (!c || !label || isNum(c[3])) continue;
				if (!decomp[dec].has(label)) decomp[dec].set(label, []);
				decomp[dec].get(label).push({ cmd: c[1], var: c[2], operand: c[3].trim() });
				if (c[1] === 'subvar') decompSub++;
			}
		}
	};
	const data = path.join(REF, dec, 'data');
	if (fs.existsSync(data)) walk(data);
}

// ---- our converted scripts: label -> ops (every source the game loads) ----
const conv = new Map();   // label -> [ops arrays]
const add = (label, ops) => { if (!Array.isArray(ops)) return; if (!conv.has(label)) conv.set(label, []); conv.get(label).push(ops); };
for (const f of fs.readdirSync(path.join(D, 'scripts'))) {
	if (!f.endsWith('.json') || f === '_index.json') continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'scripts', f), 'utf8'));
	for (const [label, ops] of Object.entries(j)) add(label, ops);
}
const readJ = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
for (const [label, ops] of Object.entries(readJ(path.join(D, 'shared_scripts.json'))?.scripts || {})) add(label, ops);
for (const [label, ops] of Object.entries(readJ(path.resolve('overworld/missing_labels_data.json'))?.scripts || {})) add(label, ops);
const mc = readJ(path.resolve('overworld/multichoice_data.json')) || {};
for (const per of Object.values(mc.patches || {})) for (const [label, ops] of Object.entries(per)) add(label, ops);
for (const [label, ops] of Object.entries(mc.shared || {})) add(label, ops);

const symAdds = ops => ops.filter(o => o && o.op === 'addvar' && !isNum(o.value)).map(o => ({ var: o.var, value: String(o.value) }));

// ---- align ----
const flips = {};        // label -> [{k, var, value}]
const report = { flipped: [], unmatched: [], noConverted: [] };
for (const [label] of new Set([...decomp.pokefirered, ...decomp.pokeemerald].map(([l]) => [l]).map(x => x))) {
	const cands = ['pokefirered', 'pokeemerald'].map(g => decomp[g].get(label)).filter(Boolean);
	const subs = cands.some(list => list.some(x => x.cmd === 'subvar'));
	if (!subs) continue;
	const opsList = conv.get(label);
	if (!opsList) { report.noConverted.push(label); continue; }
	let chosen = null, ambiguous = false;
	for (const list of cands) {
		const ok = opsList.every(ops => { const c = symAdds(ops); return c.length === list.length && c.every((x, i) => x.var === list[i].var && x.value === list[i].operand); });
		if (!ok) continue;
		const f = list.map((x, k) => x.cmd === 'subvar' ? { k, var: x.var, value: x.operand } : null).filter(Boolean);
		if (chosen && JSON.stringify(chosen) !== JSON.stringify(f)) ambiguous = true;
		chosen = chosen || f;
	}
	if (!chosen || ambiguous) { report.unmatched.push(label + (ambiguous ? ' (ambiguous)' : '')); continue; }
	if (chosen.length) { flips[label] = chosen; for (const f of chosen) report.flipped.push(`${label}: ${f.var} -= ${f.value}`); }
}
console.log(`symbolic subvars in the decomps: ${decompSub}`);
console.log(`converted to addvar, now flipped back: ${report.flipped.length} in ${Object.keys(flips).length} labels`);
for (const x of report.flipped) console.log('   ' + x);
console.log(`labels with a subvar we don't load at all: ${report.noConverted.length}${report.noConverted.length ? ' — e.g. ' + report.noConverted.slice(0, 6).join(', ') : ''}`);
console.log(`labels that didn't line up (left alone): ${report.unmatched.length}${report.unmatched.length ? ' — ' + report.unmatched.slice(0, 8).join(', ') : ''}`);
if (WRITE) {
	fs.writeFileSync(path.resolve('overworld/subvar_fix_data.json'), JSON.stringify({ generated: 'tools/gen_subvar_fix.mjs', flips }, null, 1) + '\n');
	console.log('wrote overworld/subvar_fix_data.json');
} else console.log('(dry run — pass --write)');
