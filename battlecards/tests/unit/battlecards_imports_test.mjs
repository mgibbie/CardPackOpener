// battlecards_imports_test.mjs — static import-graph lint for the battlecards game.
//
// The relay harness caught E.stateDigest missing from the engine aggregation, but
// only in a real browser (not CI). This is the CI-safe generalization: it PARSES
// battlecards/*.js + engine/*.js (no execution, no browser) and asserts —
//   • every relative import path resolves to a file,
//   • every NAMED import matches an export in its target (following the
//     `export *` / `export { } from` re-export chain: engine.js → index.js →
//     core.js → serialize/rng),
//   • every NAMESPACE access `NS.name` (for `import * as NS from './local'`) is a
//     real export of NS's module — THIS is the E.stateDigest class: a namespace
//     property that the aggregation doesn't actually re-export is `undefined`,
//   • every module parses (node --check).
// Comments are stripped before scanning (so a `// E.foo` reference is ignored);
// bare specifiers (three) are skipped. False positives here mean the EXPORT
// scanner missed a form — fix the scanner, exactly as the overworld lint's
// multi-declarator gap was fixed.
import { readdirSync, readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BC = resolve(HERE, '../..');            // battlecards dir
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const rel = abs => abs.slice(BC.length).replace(/^[\\/]/, '').replace(/\\/g, '/');

const files = [
	...readdirSync(BC).filter(f => f.endsWith('.js')).map(f => join(BC, f)),
	...readdirSync(join(BC, 'engine')).filter(f => f.endsWith('.js')).map(f => join(BC, 'engine', f)),
];
ok('found the battlecards module set (top-level + engine/)', files.length > 25, `count=${files.length}`);

const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
// remove string/template contents (keeps positions roughly) so a namespace-looking
// token inside a literal — e.g. the 'E.V.I.L.' flavor text — isn't scanned as code
const stripStrings = s => s
	.replace(/'(?:\\.|[^'\\\n])*'/g, "''")
	.replace(/"(?:\\.|[^"\\\n])*"/g, '""')
	.replace(/`(?:\\.|[^`\\])*`/g, '``');
const resolveSpec = (fromAbs, spec) => {
	const clean = spec.split(/[?#]/)[0]; // drop a ?v=… cache-bust query / #hash
	if (!clean.startsWith('.')) return 'external';
	let t = resolve(dirname(fromAbs), clean);
	if (!existsSync(t) && existsSync(t + '.js')) t += '.js';
	return existsSync(t) ? t : null;
};

// full export surface of a module, following export * / export { } from re-exports
const exportCache = new Map();
function exportsOf(absPath, seen = new Set()) {
	if (exportCache.has(absPath)) return exportCache.get(absPath);
	if (seen.has(absPath)) return new Set(); // cycle guard
	seen.add(absPath);
	const set = new Set();
	let src;
	try { src = stripComments(readFileSync(absPath, 'utf8')); } catch { return set; }
	let m;
	const fn = /^\s*export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/gm;
	while ((m = fn.exec(src))) set.add(m[1]);
	const vars = /^\s*export\s+(?:const|let|var)\s+([^\n;]+)/gm;
	while ((m = vars.exec(src))) { const nm = /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g; let x; while ((x = nm.exec(m[1]))) set.add(x[1]); }
	const localList = /^\s*export\s+\{([^}]*)\}(?!\s*from)/gm; // export { a, b as c }
	while ((m = localList.exec(src))) for (const p of m[1].split(',')) { const t = p.trim(); if (!t) continue; const as = /\bas\s+([A-Za-z0-9_$]+)/.exec(t); set.add(as ? as[1] : t.split(/\s+/)[0]); }
	const namedFrom = /^\s*export\s+\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/gm; // export { a } from './x'
	while ((m = namedFrom.exec(src))) for (const p of m[1].split(',')) { const t = p.trim(); if (!t) continue; const as = /\bas\s+([A-Za-z0-9_$]+)/.exec(t); set.add(as ? as[1] : t.split(/\s+/)[0]); }
	const starFrom = /^\s*export\s+\*\s+from\s+['"]([^'"]+)['"]/gm; // export * from './x' -> union
	while ((m = starFrom.exec(src))) { const t = resolveSpec(absPath, m[1]); if (t && t !== 'external') for (const n of exportsOf(t, seen)) set.add(n); }
	exportCache.set(absPath, set);
	return set;
}

const pathProblems = [], namedProblems = [], accessProblems = [];
for (const abs of files) {
	const src = stripComments(readFileSync(abs, 'utf8'));
	const nsTargets = {}; // local namespace bindings -> resolved target
	let m;
	const nsRe = /^\s*import\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from\s+['"]([^'"]+)['"]/gm;
	while ((m = nsRe.exec(src))) {
		const t = resolveSpec(abs, m[2]);
		if (t === null) pathProblems.push(`${rel(abs)}: import * as ${m[1]} from '${m[2]}' resolves to nothing`);
		else if (t !== 'external') nsTargets[m[1]] = t;
	}
	const namedRe = /^\s*import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm;
	while ((m = namedRe.exec(src))) {
		const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
		const t = resolveSpec(abs, m[2]);
		if (t === null) { pathProblems.push(`${rel(abs)}: import from '${m[2]}' resolves to nothing`); continue; }
		if (t === 'external') continue;
		const exp = exportsOf(t);
		const missing = names.filter(n => !exp.has(n));
		if (missing.length) namedProblems.push(`${rel(abs)}: '${m[2]}' does not export ${missing.join(', ')}`);
	}
	// namespace property accesses: NS.name must be a real export of NS's module.
	// Scan a string-stripped copy so a namespace-looking token inside a literal
	// (the 'E.V.I.L.' flavor text) isn't mistaken for code.
	const srcCode = stripStrings(src);
	for (const [ns, t] of Object.entries(nsTargets)) {
		const exp = exportsOf(t);
		const accessRe = new RegExp(`(?<![.\\w$])${ns}\\.([A-Za-z_$][A-Za-z0-9_$]*)`, 'g');
		const seen = new Set();
		let a;
		while ((a = accessRe.exec(srcCode))) {
			const prop = a[1];
			if (seen.has(prop) || exp.has(prop)) { seen.add(prop); continue; }
			seen.add(prop);
			accessProblems.push(`${rel(abs)}: ${ns}.${prop} — not exported by ${rel(t)}`);
		}
	}
}
ok('every battlecards import path resolves to a real file', pathProblems.length === 0, pathProblems.slice(0, 8).join(' | '));
ok('every named import matches an export in its target (through the re-export chain)', namedProblems.length === 0, namedProblems.slice(0, 8).join(' | '));
ok('every namespace access (E.x, Col.x, MPX.x, …) is a real export', accessProblems.length === 0, accessProblems.slice(0, 10).join(' | '));

// syntax gate
const syntaxProblems = [];
for (const abs of files) {
	const r = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8' });
	if (r.status !== 0) syntaxProblems.push(`${rel(abs)}: ${(r.stderr || '').split('\n').find(Boolean) || 'parse error'}`);
}
ok('every battlecards module parses (node --check)', syntaxProblems.length === 0, syntaxProblems.slice(0, 4).join(' | '));

// self-checks: the re-export chain is actually followed, and the scan is exact
{
	const engineExp = exportsOf(join(BC, 'engine.js'));
	ok('the re-export chain resolves engine.js\'s full surface (createGame/hp/toSnapshot/stateDigest)',
		['createGame', 'hp', 'toSnapshot', 'stateDigest', 'seededRng'].every(n => engineExp.has(n)),
		['createGame', 'hp', 'toSnapshot', 'stateDigest', 'seededRng'].filter(n => !engineExp.has(n)).join(','));
	ok('stateDigest specifically is on the aggregated surface (the regression this lint guards)', engineExp.has('stateDigest'));
	ok('the export scan is exact — a non-exported name is rejected', !engineExp.has('__not_a_real_export__'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
