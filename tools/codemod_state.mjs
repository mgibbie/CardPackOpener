// codemod_state.mjs — move main.js's shared top-level `let`s onto the state object
// `S` from ow_state.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 2).
//
// ES module imports are read-only, so a `let` that other modules need to REASSIGN
// can't be exported as-is. It lives on `S` instead: `party = x` becomes
// `S.party = x`, and any module can import S.
//
// Scope-aware, not textual: espree parses and eslint-scope resolves every
// reference, so only identifiers bound to the MODULE-LEVEL variable are rewritten.
// A parameter or local that shadows the name is left alone. Handles:
//   * the declaration   `let x = init;`  ->  `S.x = init;`  (same spot, so
//     evaluation order is unchanged; `let x;` just disappears)
//   * shorthand object properties  `{ party }`  ->  `{ party: S.party }`
// and refuses anything else it can't rewrite safely (destructuring declarations,
// exports), rather than guessing.
//
//   node tools/codemod_state.mjs party loading menuUi ...     (dry run: counts)
//   node tools/codemod_state.mjs --write party loading ...
import fs from 'fs';
import * as espree from 'espree';
import * as eslintScope from 'eslint-scope';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const NAMES = args.filter(a => !a.startsWith('--'));
const FILE = 'overworld/main.js';

const src = fs.readFileSync(FILE, 'utf8');
const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', range: true, loc: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
const mod = sm.globalScope.childScopes.find(s => s.type === 'module');

// parent links, to see how each identifier is used
const parentOf = new Map();
(function walk(n, p) {
	if (!n || typeof n.type !== 'string') return;
	if (p) parentOf.set(n, p);
	for (const k of Object.keys(n)) {
		if (k === 'parent') continue;
		const v = n[k];
		if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, n));
		else if (v && typeof v.type === 'string') walk(v, n);
	}
})(ast, null);

const edits = [];   // { start, end, text }
const report = [];
for (const name of NAMES) {
	const v = mod.variables.find(x => x.name === name);
	if (!v) throw new Error(`${name}: no module-level variable`);
	const def = v.defs[0];
	if (v.defs.length !== 1 || def.type !== 'Variable' || def.parent.kind !== 'let') throw new Error(`${name}: not a single top-level let`);
	const decl = def.parent, declr = def.node;
	if (declr.id.type !== 'Identifier') throw new Error(`${name}: destructuring declaration`);
	if (parentOf.get(decl)?.type === 'ExportNamedDeclaration') throw new Error(`${name}: exported`);

	// the declaration: rebuild the whole `let` statement once per statement
	if (!decl.__done) {
		decl.__done = true;
		const keep = [], assigns = [];
		for (const d of decl.declarations) {
			if (d.id.type === 'Identifier' && NAMES.includes(d.id.name)) {
				if (d.init) assigns.push(`S.${d.id.name} = ${src.slice(d.init.range[0], d.init.range[1])};`);
			} else keep.push(src.slice(d.range[0], d.range[1]));
		}
		const parts = [];
		if (keep.length) parts.push(`let ${keep.join(', ')};`);
		parts.push(...assigns);
		edits.push({ start: decl.range[0], end: decl.range[1], text: parts.join(' ') });
	}

	let n = 0;
	for (const ref of v.references) {
		const id = ref.identifier;
		if (id === declr.id) continue;   // the declaration itself, handled above
		const p = parentOf.get(id);
		if (p?.type === 'Property' && p.shorthand && p.value === id) {
			if (parentOf.get(p)?.type === 'ObjectPattern') throw new Error(`${name}: shorthand in a destructuring pattern at line ${id.loc.start.line}`);
			edits.push({ start: p.range[0], end: p.range[1], text: `${name}: S.${name}` });
		} else {
			edits.push({ start: id.range[0], end: id.range[1], text: `S.${name}` });
		}
		n++;
	}
	report.push(`${name}: ${n} references`);
}

edits.sort((a, b) => b.start - a.start);
for (let i = 1; i < edits.length; i++) if (edits[i].end > edits[i - 1].start) throw new Error('overlapping edits at ' + edits[i].start);
let out = src;
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
console.log(report.join('\n'));
console.log(`${edits.length} edits`);
if (WRITE) { fs.writeFileSync(FILE, out); console.log('written'); } else console.log('(dry run — pass --write)');
