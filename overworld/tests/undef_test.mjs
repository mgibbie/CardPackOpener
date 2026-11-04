// undef_test.mjs — no overworld module uses a name it doesn't declare or import.
//
// The main.js split (Plans/MAIN_JS_SPLIT_PLAN.md) moves code between modules. A
// name left behind only throws ReferenceError when that path RUNS, so the rest of
// the gate can pass while a rare branch is broken. This is the static check: ESLint
// `no-undef` over overworld/*.js with tools/eslint.undef.config.mjs (browser
// globals allowed, minus confusable ones like `screen`).
//
//   node overworld/tests/undef_test.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { ESLint } from 'eslint';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: path.join(ROOT, 'tools/eslint.undef.config.mjs'), allowInlineConfig: false });
const results = await eslint.lintFiles(['overworld/*.js']);
A(results.length >= 40, `linted every overworld module (${results.length})`);
const problems = results.flatMap(r => r.messages.map(m => `${path.basename(r.filePath)}:${m.line} ${m.message}`));
A(!problems.length, 'no module uses an undeclared, un-imported name', problems.slice(0, 10).join(' | '));

// ---------- every relative import names something its module exports ----------
// no-undef can't see this: `import { x } from './ow_pvp.js'` when ow_pvp.js has no
// `export x` is a LINK error that only shows up when the page loads (and takes the
// whole overworld down). The split moves exports between files, so check them all.
{
	const fs = await import('fs');
	const espree = await import('espree');
	const OW = path.join(ROOT, 'overworld');
	const parse = f => espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
	const exportsOf = new Map();
	const exported = f => {
		if (exportsOf.has(f)) return exportsOf.get(f);
		const names = new Set();
		exportsOf.set(f, names);
		for (const n of parse(f).body) {
			if (n.type === 'ExportNamedDeclaration') {
				if (n.declaration?.declarations) for (const d of n.declaration.declarations) if (d.id.type === 'Identifier') names.add(d.id.name);
				if (n.declaration?.id) names.add(n.declaration.id.name);
				for (const s of n.specifiers || []) names.add(s.exported.name ?? s.exported.value);
			}
			if (n.type === 'ExportDefaultDeclaration') names.add('default');
			if (n.type === 'ExportAllDeclaration' && n.source) for (const x of exported(path.resolve(path.dirname(f), n.source.value))) names.add(x);
		}
		return names;
	};
	const missing = [];
	for (const f of fs.readdirSync(OW).filter(x => x.endsWith('.js')).map(x => path.join(OW, x))) {
		for (const n of parse(f).body) {
			const src = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration') && n.source)) ? n.source.value : null;
			if (!src || !src.startsWith('.')) continue;
			const target = path.resolve(path.dirname(f), src);
			if (!target.startsWith(OW) || !fs.existsSync(target)) continue;   // outside overworld/: not ours to check
			const have = exported(target);
			for (const s of n.specifiers || []) {
				const name = n.type === 'ImportDeclaration'
					? (s.type === 'ImportSpecifier' ? (s.imported.name ?? s.imported.value) : s.type === 'ImportDefaultSpecifier' ? 'default' : null)
					: (s.local.name ?? s.local.value);
				if (name && !have.has(name)) missing.push(`${path.basename(f)} imports '${name}' from ${src}, which doesn't export it`);
			}
		}
	}
	A(!missing.length, 'every relative import names something its module exports', missing.slice(0, 10).join(' | '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
