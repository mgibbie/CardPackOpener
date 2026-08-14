// overworld_imports_test.mjs — static import-graph lint for the overworld game.
//
// The overworld's live coverage (overworld/tests/boot_smoke.mjs) needs a browser
// AND the offloaded data assets, so it can't run in CI. This is the CI-safe
// counterpart: it only PARSES the module source (no execution, no browser, no
// data), catching the regressions that would otherwise only surface at boot —
//   • an import path that doesn't resolve to a file (a renamed/typo'd module),
//   • a NAMED import that its target doesn't export (the missing-export class the
//     relay harness caught for battlecards' E.stateDigest),
//   • a syntax error in any module (node --check).
// The overworld uses a clean ESM subset — only `import * as N from '...'` and
// `import { a, b as c } from '...'`, all relative paths, no re-exports/defaults —
// so a line-anchored scan is exact. Imports are matched at a line start (the `m`
// flag + `^`), which also skips commented-out `// import ...` lines.
import { readdirSync, readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OW = resolve(HERE, '../../../overworld');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const files = readdirSync(OW).filter(f => f.endsWith('.js')).sort();
ok('found the overworld module set to lint', files.length > 10, `count=${files.length}`);

// exported names of a module (function/class/const/let/var + an export { } list)
const exportCache = new Map();
function exportsOf(absPath) {
	if (exportCache.has(absPath)) return exportCache.get(absPath);
	const set = new Set();
	let src = '';
	try { src = readFileSync(absPath, 'utf8'); } catch { exportCache.set(absPath, set); return set; }
	let m;
	// export (async) function NAME / export class NAME
	const fn = /^\s*export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/gm;
	while ((m = fn.exec(src))) set.add(m[1]);
	// export const/let/var A = .., B = .., C = ..  (comma-separated declarators, e.g.
	// `export const TILE = 8, META = 16, VIEW_W = 240`). Names are the identifiers at
	// list position — start-or-comma, then `= value` — so commas inside a value don't
	// fool it (the token after such a comma isn't followed by `=`).
	const vars = /^\s*export\s+(?:const|let|var)\s+([^\n;]+)/gm;
	while ((m = vars.exec(src))) {
		const nameRe = /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
		let nm;
		while ((nm = nameRe.exec(m[1]))) set.add(nm[1]);
	}
	// export { a, b as c }  (not a re-export) → exports a, c
	const list = /^\s*export\s+\{([^}]*)\}(?!\s*from)/gm;
	while ((m = list.exec(src))) for (const part of m[1].split(',')) {
		const t = part.trim(); if (!t) continue;
		const as = /\bas\s+([A-Za-z0-9_$]+)/.exec(t);
		set.add(as ? as[1] : t.split(/\s+/)[0]);
	}
	exportCache.set(absPath, set);
	return set;
}

const pathProblems = [], exportProblems = [];
for (const f of files) {
	const abs = join(OW, f);
	const src = readFileSync(abs, 'utf8');
	// namespace imports: only the path must resolve (names are accessed dynamically)
	const nsRe = /^\s*import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/gm;
	// named imports: the path must resolve AND every name must be exported by it
	const namedRe = /^\s*import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm;
	const resolveSpec = spec => {
		let t = resolve(dirname(abs), spec);
		if (!existsSync(t) && existsSync(t + '.js')) t += '.js';
		return existsSync(t) ? t : null;
	};
	let m;
	while ((m = nsRe.exec(src))) {
		const spec = m[1];
		if (!spec.startsWith('.')) continue; // external/bare specifier — not our graph
		if (!resolveSpec(spec)) pathProblems.push(`${f}: import '${spec}' resolves to nothing`);
	}
	while ((m = namedRe.exec(src))) {
		const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
		const spec = m[2];
		if (!spec.startsWith('.')) continue;
		const target = resolveSpec(spec);
		if (!target) { pathProblems.push(`${f}: import '${spec}' resolves to nothing`); continue; }
		const exp = exportsOf(target);
		const missing = names.filter(n => !exp.has(n));
		if (missing.length) exportProblems.push(`${f}: '${spec}' does not export ${missing.join(', ')}`);
	}
}
ok('every overworld import path resolves to a real file', pathProblems.length === 0, pathProblems.slice(0, 6).join(' | '));
ok('every named import matches an export in its target module', exportProblems.length === 0, exportProblems.slice(0, 6).join(' | '));

// syntax gate: parse every module (browser globals are fine — --check never runs it)
const syntaxProblems = [];
for (const f of files) {
	const r = spawnSync(process.execPath, ['--check', join(OW, f)], { encoding: 'utf8' });
	if (r.status !== 0) syntaxProblems.push(`${f}: ${(r.stderr || '').split('\n').find(Boolean) || 'parse error'}`);
}
ok('every overworld module parses (node --check)', syntaxProblems.length === 0, syntaxProblems.slice(0, 4).join(' | '));

// self-check: the machinery both accepts valid edges and rejects invalid ones,
// and it SEES the safestore edges it was built to guard
{
	const engineExp = exportsOf(join(OW, 'engine.js'));
	ok('multi-declarator exports are captured (the engine.js TILE/META/VIEW_W/VIEW_H line)',
		['TILE', 'META', 'VIEW_W', 'VIEW_H'].every(n => engineExp.has(n)));
	ok('the export scan is exact — a name the target does NOT export is rejected', !engineExp.has('__not_exported__'));

	const mainSrc = readFileSync(join(OW, 'main.js'), 'utf8');
	ok('the lint observes the safestore wiring it guards', /import\s*\{[^}]*safe(Load|Save)[^}]*\}\s*from\s*['"]\.\/safestore\.js['"]/.test(mainSrc));
	ok('overworld/safestore.js exports the three helpers', ['safeLoad', 'safeSave', 'safeSaveStr'].every(n => exportsOf(join(OW, 'safestore.js')).has(n)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
