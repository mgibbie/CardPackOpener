// tests/tools/twin-audit.mjs — source-level audit of duplicated effect handlers.
//
// Two hazard classes (found by effect-census.mjs):
//   TWINS — same type implemented in BOTH runSecretEffects (switch) and
//           execEffects (chain). The switch wins on the trigger path, the
//           chain on the battlecry/spell path — so BOTH run, for different
//           callers, and silently drift apart.
//   DUPES — same type implemented TWICE in the SAME dispatcher. Only the
//           first can ever run; the second is dead code.
//
// For each pair this tool extracts both bodies and reports:
//   - IDENTICAL: byte-equal after whitespace normalization (safe to delete one)
//   - DIVERGENT: bodies differ — lists the `e.*` option fields each supports,
//     so drift (options one copy ignores) is visible at a glance.
//
// Usage: node battlecards/tests/tools/twin-audit.mjs [--json] [--show=<type>]
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../../engine.js', import.meta.url), 'utf8');
const lines = src.split('\n');

function fnRange(name) {
	const start = lines.findIndex(l => l.startsWith(`function ${name}(`) || l.startsWith(`export function ${name}(`));
	if (start < 0) return null;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) if (/^(export )?function [a-zA-Z_$]/.test(lines[i])) { end = i; break; }
	return [start, end];
}

// chain branches: two-tab `if (e.type === '...')` dispatch lines; body = until next dispatch line at same depth
function chainBodies(range) {
	const out = {}; // type -> [{line, body}]
	if (!range) return out;
	const marks = [];
	for (let i = range[0]; i < range[1]; i++) {
		if (/^\t\t(} else )?if \(e\.type === '/.test(lines[i])) marks.push(i);
	}
	marks.push(range[1]);
	for (let m = 0; m < marks.length - 1; m++) {
		const i = marks[m];
		const types = [...lines[i].matchAll(/e\.type === '([a-z0-9A-Z_-]+)'/g)].map(x => x[1]);
		const body = lines.slice(i, marks[m + 1]).join('\n');
		for (const t of types) (out[t] = out[t] || []).push({ line: i + 1, body });
	}
	return out;
}

// switch cases: `case 'x':` at any depth inside runSecretEffects; body = until next case/default at same indent
function switchBodies(range) {
	const out = {};
	if (!range) return out;
	const marks = [];
	for (let i = range[0]; i < range[1]; i++) {
		if (/^\t*case '[a-z0-9A-Z_-]+':/.test(lines[i].trimEnd()) || /^\t*default:/.test(lines[i])) marks.push(i);
	}
	marks.push(range[1]);
	for (let m = 0; m < marks.length - 1; m++) {
		const i = marks[m];
		const mm = lines[i].match(/case '([a-z0-9A-Z_-]+)':/);
		if (!mm) continue;
		const body = lines.slice(i, marks[m + 1]).join('\n');
		(out[mm[1]] = out[mm[1]] || []).push({ line: i + 1, body });
	}
	return out;
}

const norm = s => s.replace(/\s+/g, ' ').trim();
const fields = body => [...new Set([...body.matchAll(/\be\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map(m => m[1]))]
	.filter(f => f !== 'type').sort();

const chain = chainBodies(fnRange('execEffects'));
const sw = switchBodies(fnRange('runSecretEffects'));

const report = { twins: [], chainDupes: [], switchDupes: [] };

// twins across dispatchers
for (const t of Object.keys(sw).filter(t => chain[t])) {
	const a = sw[t][0], b = chain[t][0];
	const fa = fields(a.body), fb = fields(b.body);
	const onlySwitch = fa.filter(f => !fb.includes(f));
	const onlyChain = fb.filter(f => !fa.includes(f));
	report.twins.push({
		type: t, switchLine: a.line, chainLine: b.line,
		identicalLogic: norm(a.body.replace(/^.*case.*$/m, '')) === norm(b.body.replace(/^.*if \(e\.type.*$/m, '')),
		fieldsOnlyInSwitch: onlySwitch, fieldsOnlyInChain: onlyChain,
		drift: onlySwitch.length + onlyChain.length > 0,
	});
}
// dupes within a dispatcher
const dupesOf = (bodies, label) => Object.entries(bodies)
	.filter(([, arr]) => arr.length > 1)
	.map(([t, arr]) => ({
		type: t, lines: arr.map(x => x.line),
		identical: arr.every(x => norm(x.body) === norm(arr[0].body)),
		fieldsPerCopy: arr.map(x => fields(x.body)),
	}));
report.chainDupes = dupesOf(chain, 'chain');
report.switchDupes = dupesOf(sw, 'switch');

const show = process.argv.find(a => a.startsWith('--show='));
if (show) {
	const t = show.split('=')[1];
	for (const [label, set] of [['switch', sw], ['chain', chain]]) {
		for (const b of set[t] || []) console.log(`\n===== ${label} @ line ${b.line} =====\n${b.body}`);
	}
	process.exit(0);
}
if (process.argv.includes('--json')) {
	console.log(JSON.stringify(report, null, 2));
	process.exit(0);
}

console.log('=== Twin & duplicate handler audit ===\n');
console.log(`TWINS (both dispatchers run, different callers): ${report.twins.length}`);
for (const t of report.twins) {
	console.log(`  ${t.drift ? '⚠ DRIFT' : '  same-fields'}  ${t.type}  (switch:${t.switchLine} chain:${t.chainLine})`);
	if (t.fieldsOnlyInSwitch.length) console.log(`      only in switch: ${t.fieldsOnlyInSwitch.join(', ')}`);
	if (t.fieldsOnlyInChain.length) console.log(`      only in chain:  ${t.fieldsOnlyInChain.join(', ')}`);
}
for (const [name, list] of [['SWITCH DUPES', report.switchDupes], ['CHAIN DUPES', report.chainDupes]]) {
	console.log(`\n${name} (first wins; later copies dead): ${list.length}`);
	for (const d of list) {
		console.log(`  ${d.identical ? 'identical copies' : '⚠ DIVERGENT     '}  ${d.type}  (lines ${d.lines.join(', ')})`);
		if (!d.identical) d.fieldsPerCopy.forEach((f, i) => console.log(`      copy@${d.lines[i]} fields: ${f.join(', ') || '(none)'}`));
	}
}
