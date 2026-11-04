// split_deps.mjs — what a block of main.js needs, and what needs it
// (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3 extractions).
//
// Given a line range, resolves every identifier with eslint-scope and reports:
//   IMPORTS  module-level names declared OUTSIDE the block and used inside it
//            (grouped by where they come from: an import, or main.js itself)
//   EXPORTS  names declared INSIDE the block and used outside it
//   BLOCKERS assignments across the boundary: an `import` binding is read-only,
//            so a let written from the other side must move to S or get a setter
//
//   node tools/split_deps.mjs overworld/main.js 8698 9928
import fs from 'fs';
import * as espree from 'espree';
import * as eslintScope from 'eslint-scope';

const [file, a, b] = process.argv.slice(2);
const lo = +a, hi = +b;
const src = fs.readFileSync(file, 'utf8');
const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', range: true, loc: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
const mod = sm.globalScope.childScopes.find(s => s.type === 'module');
const inBlock = n => n.loc.start.line >= lo && n.loc.end.line <= hi;

const imports = new Map(), exportsOut = new Map(), blockers = [];
for (const v of mod.variables) {
	const def = v.defs[0];
	if (!def) continue;
	const declIn = inBlock(def.name);
	const kind = def.type === 'ImportBinding' ? `import from ${def.parent.source.value}`
		: def.type === 'FunctionName' ? 'function' : def.type === 'ClassName' ? 'class'
		: def.type === 'Variable' ? def.parent.kind : def.type;
	for (const r of v.references) {
		const refIn = inBlock(r.identifier);
		if (refIn === declIn) continue;
		if (refIn) {   // used inside, declared outside
			const e = imports.get(v.name) || { kind, n: 0, writes: 0 };
			e.n++; if (r.isWrite()) e.writes++;
			imports.set(v.name, e);
			if (r.isWrite()) blockers.push(`block WRITES outside ${kind} '${v.name}' (line ${r.identifier.loc.start.line})`);
		} else {       // used outside, declared inside
			const e = exportsOut.get(v.name) || { kind, n: 0, writes: 0 };
			e.n++; if (r.isWrite()) e.writes++;
			exportsOut.set(v.name, e);
			if (r.isWrite()) blockers.push(`outside WRITES block ${kind} '${v.name}' (line ${r.identifier.loc.start.line})`);
		}
	}
}
const group = m => {
	const g = {};
	for (const [n, e] of m) (g[e.kind] ||= []).push(n);
	return Object.entries(g).map(([k, ns]) => `  ${k} (${ns.length}): ${ns.sort().join(', ')}`).join('\n');
};
console.log(`lines ${lo}-${hi} (${hi - lo + 1})`);
console.log(`IMPORTS (${imports.size}):\n${group(imports)}`);
console.log(`EXPORTS (${exportsOut.size}):\n${group(exportsOut)}`);
console.log(`BLOCKERS (${blockers.length}):\n  ${[...new Set(blockers)].join('\n  ')}`);
