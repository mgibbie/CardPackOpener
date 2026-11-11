// split_designs.mjs — split micatro/mods/pokermon/jokers/pokejokers_designs.js by GENERATION (2026-11).
//
// The file held every one of the owner's own Pokermon jokers (429) and their helpers: 12,450 lines that every
// joker batch edits, so parallel sessions kept colliding on it. This cuts it into
//   jokers/designs/common.js        helpers two or more generations use (or none: hooks index.js calls)
//   jokers/designs/gen3.js … gen9.js each generation's jokers (`export const JOKERS`) + the helpers only it uses
//   jokers/designs/text.js          DESIGN_FAMILIES, DESIGN_LOC and the rest of the text tables
//   jokers/pokejokers_designs.js    the index: re-exports everything (importers are untouched) and REGISTERS the
//                                   jokers in the exact order the old file did
// Cut and paste only: every statement and every joker definition is moved byte for byte; the tool writes only the
// import / export plumbing. Scope-aware (espree + eslint-scope), like tools/extract_block.mjs.
//
// Registration order is part of the rules: index.js walks DEFS.jokers in definition order and `poke_after` splices
// each joker in, so the order decides the Joker pool's order, and seeded picks (and recorded runs) with it. The index
// therefore keeps the old file's order as a frozen list (BATCHES) and registers anything newer after it.
//
//   node tools/micatro/split_designs.mjs            (dry run: the plan + anything it refuses)
//   node tools/micatro/split_designs.mjs --write
import fs from 'fs';
import * as espree from 'espree';
import * as eslintScope from 'eslint-scope';

const WRITE = process.argv.includes('--write');
const DIR = 'micatro/mods/pokermon/jokers';
const FILE = `${DIR}/pokejokers_designs.js`;
const raw = fs.readFileSync(FILE, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const src = raw.replace(/\r\n/g, '\n');
const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', range: true, loc: true, comment: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
const mod = sm.globalScope.childScopes.find((s) => s.type === 'module');

// ---------- items: every top-level statement, and every joker inside a defineJokers({...}) call ----------
const isDefine = (n) => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' && n.expression.callee.name === 'defineJokers';
const body = ast.body;
const imports = body.filter((n) => n.type === 'ImportDeclaration');
const rest = body.filter((n) => n.type !== 'ImportDeclaration');
const lastDefine = rest.map(isDefine).lastIndexOf(true);
if (lastDefine < 0) throw new Error('no defineJokers call');

// the text of an item includes the comments / blank lines since the previous item (so comments travel with their code)
const defineCalls = [];
const items = [];   // { id, kind: 'stmt'|'joker'|'text', start, end, names: [], gen?, batch?, name?, node }
let prevEnd = imports[imports.length - 1].range[1];
const header = src.slice(0, imports[0].range[0]);   // the file's own header comment
rest.forEach((n, i) => {
	if (isDefine(n)) {
		const obj = n.expression.arguments[0];
		const a2 = n.expression.arguments[1];
		if (n.expression.arguments.length !== 2 || obj.type !== 'ObjectExpression' || a2.type !== 'Identifier' || a2.name !== 'FILE') throw new Error(`defineJokers at line ${n.loc.start.line}: not defineJokers({…}, FILE)`);
		defineCalls.push(n);
		const batch = items.filter((x) => x.kind === 'joker').reduce((m, x) => Math.max(m, x.batch), -1) + 1;
		// (comments between the previous statement and `defineJokers({` stay with the first joker)
		// the text before a joker travels with it: for the first of a call, the comments before the call + what follows its `{`
		let pEnd = prevEnd, lead0 = src.slice(prevEnd, n.range[0]) + src.slice(obj.range[0] + 1, obj.properties.length ? obj.properties[0].range[0] : obj.range[0] + 1);
		for (const p of obj.properties) {
			if (p.type !== 'Property' || p.computed || p.value.type !== 'ObjectExpression') throw new Error(`defineJokers at line ${p.loc.start.line}: a joker that is not a plain 'name: {…}' property`);
			const name = p.key.name ?? p.key.value;
			const genP = p.value.properties.find((q) => q.type === 'Property' && (q.key.name ?? q.key.value) === 'gen');
			let gen = genP && genP.value.type === 'Literal' && typeof genP.value.value === 'number' ? genP.value.value : null;
			if (gen === null && !genP) {
				// built from a template (`...paradox('great_tusk', …)`): the template's own `gen: N`
				const sp = p.value.properties.find((q) => q.type === 'SpreadElement' && q.argument.type === 'CallExpression' && q.argument.callee.type === 'Identifier');
				const tmpl = sp && rest.find((s) => s.type === 'VariableDeclaration' && s.declarations.some((d) => d.id.name === sp.argument.callee.name));
				const m = tmpl && /\bgen: (\d+)\b/.exec(src.slice(tmpl.range[0], tmpl.range[1]));
				if (m) gen = +m[1];
			}
			if (gen === null) throw new Error(`joker '${name}' (line ${p.loc.start.line}) has no literal gen`);
			const lead = lead0 !== null ? lead0 : src.slice(pEnd, p.range[0]);
			lead0 = null;
			items.push({ id: items.length, kind: 'joker', start: p.range[0], end: p.range[1], text: lead + src.slice(p.range[0], p.range[1]), node: p, name, gen, batch, names: [] });
			pEnd = p.range[1];
		}
		// what is left between the last joker and the call's `});` (a trailing comma, comments): must be trivial
		const tail = src.slice(pEnd, n.range[1]).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/[\s,]/g, '');
		if (tail !== '}FILE);') throw new Error(`defineJokers at line ${n.loc.start.line}: unexpected text after the last joker: ${tail.slice(0, 40)}`);
		prevEnd = n.range[1];
	} else {
		const decl = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
		const names = decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration' ? [decl.id.name]
			: decl.type === 'VariableDeclaration' ? decl.declarations.map((d) => { if (d.id.type !== 'Identifier') throw new Error(`destructuring declaration at line ${d.loc.start.line}`); return d.id.name; }) : [];
		if (n.type === 'ExportNamedDeclaration' && !n.declaration) throw new Error(`export list at line ${n.loc.start.line}: not handled`);
		items.push({ id: items.length, kind: i > lastDefine ? 'text' : 'stmt', start: prevEnd, end: n.range[1], node: n, names, exported: n.type === 'ExportNamedDeclaration', sideEffect: !names.length });
		prevEnd = n.range[1];
	}
});
// FILE: the label every definition carries (def.poke_file). Only the registration uses it, so it moves to the index.
const fileItem = items.find((x) => x.names.length === 1 && x.names[0] === 'FILE');
if (!fileItem || !/^const FILE = '[^']+';$/.test(src.slice(fileItem.node.range[0], fileItem.node.range[1]))) throw new Error('const FILE not found as expected');
const FILE_DECL = src.slice(fileItem.node.range[0], fileItem.node.range[1]);
const trailer = src.slice(prevEnd);
if (trailer.trim()) throw new Error('unexpected text after the last statement');

// ---------- who references whom ----------
const itemAt = (pos) => items.find((x) => pos >= (x.kind === 'joker' ? x.node.range[0] : x.node.range[0]) && pos < x.end);
const declItem = new Map();   // module-level name -> item
for (const it of items) for (const nm of it.names) declItem.set(nm, it);
const importOf = new Map();   // local name -> { source, spec }
for (const imp of imports) for (const s of imp.specifiers) importOf.set(s.local.name, { source: imp.source.value, spec: s });
for (const it of items) { it.uses = new Set(); it.usesImports = new Set(); it.writes = new Set(); }
for (const v of mod.variables) {
	const target = declItem.get(v.name), isImport = importOf.has(v.name);
	if (!target && !isImport) continue;
	for (const r of v.references) {
		const pos = r.identifier.range[0];
		// the registration calls themselves (`defineJokers(` … `}, FILE);`) are rewritten by the index
		if ((v.name === 'FILE' || v.name === 'defineJokers') && defineCalls.some((c) => pos >= c.range[0] && pos < c.range[1]) && !items.some((x) => x.kind === 'joker' && pos >= x.node.range[0] && pos < x.end)) continue;
		const at = itemAt(pos);
		if (!at) throw new Error(`reference to ${v.name} at line ${r.identifier.loc.start.line} is outside every item`);
		if (isImport) { at.usesImports.add(v.name); continue; }
		if (at === target) continue;
		at.uses.add(target.id);
		if (r.isWrite()) at.writes.add(target.id);
	}
}
// `defineJokers` itself is used only by the calls, which the index now makes
const unresolvedThrough = mod.through.map((r) => r.identifier.name);

// ---------- assign: a helper goes to the one generation that (transitively) uses it, else to common ----------
const users = items.map(() => new Set());   // item id -> set of 'gen3'…'gen9' | 'text'
const walk = (from, tag, seen) => { for (const d of from.uses) { if (seen.has(d)) continue; seen.add(d); users[d].add(tag); walk(items[d], tag, seen); } };
for (const it of items) {
	if (it.kind === 'joker') { it.module = 'gen' + it.gen; walk(it, it.module, new Set()); }
	if (it.kind === 'text') { it.module = 'text'; walk(it, 'text', new Set()); }
}
for (const it of items) {
	if (it.kind !== 'stmt') continue;
	const u = users[it.id];
	// a nameless top-level statement is a side effect (a hook pushed onto POST_EVOLVE / POKE_POOL_RULES): it goes to common,
	// the first of these modules to evaluate, in its old order, and pulls what it uses into common with it
	it.module = !it.sideEffect && u.size === 1 && [...u][0] !== 'text' ? [...u][0] : 'common';
}
// a helper that common (or text) code uses must be importable by it: anything a common item uses is common,
// anything a text item uses is common; and a write must sit beside its declaration (an import is read-only)
for (let changed = true; changed;) {
	changed = false;
	for (const it of items) {
		for (const d of it.uses) {
			const dep = items[d];
			if (dep.kind !== 'stmt') { if (dep.kind === 'joker') throw new Error(`a joker ('${dep.name}') is referenced by name from line ${it.node.loc.start.line}`); continue; }
			const mustBeCommon = (it.module === 'common' || it.module === 'text') && dep.module !== 'common';
			if (mustBeCommon) { dep.module = 'common'; changed = true; }
		}
		for (const d of it.writes) {
			const dep = items[d];
			if (dep.module !== it.module) {
				if (it.kind === 'stmt' && it.module !== 'common') { it.module = 'common'; changed = true; }
				else if (dep.kind === 'stmt' && dep.module !== it.module && it.kind !== 'stmt') throw new Error(`'${dep.names}' is assigned from joker '${it.name}' in another module`);
				if (dep.kind === 'stmt' && dep.module !== 'common' && it.module === 'common') { dep.module = 'common'; changed = true; }
			}
		}
	}
}
// after the fixed point: no gen module may use another gen module's item, and every write is local
const problems = [];
for (const it of items) for (const d of it.uses) {
	const dep = items[d];
	if (dep.module !== it.module && dep.module !== 'common') problems.push(`${it.module} (line ${it.node.loc.start.line}) uses ${dep.names} from ${dep.module}`);
	if (it.writes.has(d) && dep.module !== it.module) problems.push(`${it.module} (line ${it.node.loc.start.line}) assigns ${dep.names} declared in ${dep.module}`);
}
// (side-effect statements before the text section went to common, above; report them so the move is seen)
const hooks = items.filter((x) => x.sideEffect && x.kind === 'stmt');

// evaluation-time reads across modules: a module's top level must not read a binding of a module evaluated later.
// Order: common, gen3…gen9, text, index. common only uses common; gen uses common (earlier); text uses common. Fine by
// construction; within a module the original order is kept.

if (users[fileItem.id].size || items.some((x) => x.uses.has(fileItem.id))) problems.push('FILE is used outside the registration calls');
fileItem.module = 'index';

// ---------- report ----------
const MODULES = ['common', 'gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'gen8', 'gen9', 'text'];
const lineCount = (t) => t.split('\n').length;
const sizes = {};
for (const m of MODULES) sizes[m] = items.filter((x) => x.module === m).reduce((n, x) => n + lineCount(x.text ?? src.slice(x.start, x.end)) - 1, 0);
console.log('items:', items.length, '| jokers:', items.filter((x) => x.kind === 'joker').length, '| helpers:', items.filter((x) => x.kind === 'stmt').length, '| text statements:', items.filter((x) => x.kind === 'text').length);
console.log('lines per module:', JSON.stringify(sizes));
console.log('jokers per module:', JSON.stringify(Object.fromEntries(MODULES.filter((m) => m.startsWith('gen')).map((m) => [m, items.filter((x) => x.kind === 'joker' && x.module === m).length]))));
if (unresolvedThrough.length) console.log('globals used (not module bindings):', [...new Set(unresolvedThrough)].join(', '));
if (problems.length) { console.log('PROBLEMS:\n  ' + problems.slice(0, 30).join('\n  ')); process.exit(1); }

// ---------- write ----------
const text = (it) => it.text ?? src.slice(it.start, it.end);
const exportedByOrigin = new Set(items.filter((x) => x.exported).flatMap((x) => x.names));
// a name needs `export` in its new home if the old file exported it, or another new module uses it
const needExport = new Set(exportedByOrigin);
for (const it of items) for (const d of it.uses) if (items[d].module !== it.module) for (const nm of items[d].names) needExport.add(nm);
// (per name: only the names of a multi-declarator statement that are actually needed elsewhere would do, but exporting the
// statement exports them all — harmless, and it keeps the statement byte-identical apart from the keyword)
const relSource = (s) => (s.startsWith('./') ? '../' + s.slice(2) : s.startsWith('../') ? '../' + s : s);
const wrap = (names, indent = '  ') => { const lines = []; let cur = indent; for (const n of names) { if ((cur + n).length > 150) { lines.push(cur.trimEnd()); cur = indent; } cur += n + ', '; } lines.push(cur.trimEnd()); return lines.join('\n'); };
function importsFor(mItems, self) {
	const bySource = new Map();
	for (const it of mItems) for (const nm of it.usesImports) {
		if (nm === 'defineJokers') continue;
		const { source, spec } = importOf.get(nm);
		const e = bySource.get(source) || { named: [] };
		if (spec.type === 'ImportNamespaceSpecifier') e.ns = nm;
		else if (spec.type === 'ImportDefaultSpecifier') e.def = nm;
		else { const s = spec.imported.name === nm ? nm : `${spec.imported.name} as ${nm}`; if (!e.named.includes(s)) e.named.push(s); }
		bySource.set(source, e);
	}
	const out = [];
	for (const imp of imports) {   // the old file's import order
		const e = bySource.get(imp.source.value);
		if (!e) continue;
		const source = relSource(imp.source.value);
		if (e.ns) out.push(`import * as ${e.ns} from '${source}';`);
		const parts = []; if (e.def) parts.push(e.def);
		if (e.named.length) parts.push(e.named.length > 6 ? `{\n${wrap(e.named)}\n}` : `{ ${e.named.join(', ')} }`);
		if (parts.length) out.push(`import ${parts.join(', ')} from '${source}';`);
	}
	if (self !== 'common') {
		const fromCommon = new Set();
		for (const it of mItems) for (const d of it.uses) if (items[d].module === 'common') for (const nm of items[d].names) {
			// only the names this module's code actually references
			fromCommon.add(nm);
		}
		// narrow to referenced names (a multi-declarator statement declares several)
		const used = new Set();
		for (const v of mod.variables) { const t = declItem.get(v.name); if (!t || t.module !== 'common') continue; if (v.references.some((r) => { const at = itemAt(r.identifier.range[0]); return at && at.module === self && at !== t; })) used.add(v.name); }
		const list = [...fromCommon].filter((n) => used.has(n)).sort();
		if (list.length) out.push(`import {\n${wrap(list)}\n} from './common.js';`);
	}
	return out.join('\n');
}
const withExport = (it) => {
	let t = text(it);
	if (it.kind === 'joker' || it.exported || !it.names.some((n) => needExport.has(n))) return t;
	const off = it.node.range[0] - it.start;
	return t.slice(0, off) + 'export ' + t.slice(off);
};
const HEAD = {
	common: `// designs/common.js — helpers the owner's Pokermon jokers share: used by two or more generations' jokers, by the text\n// tables, or only by the mod's hooks (index.js). Cut out of pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11);\n// every statement is unchanged. A helper only ONE generation uses lives in that generation's file.`,
	text: `// designs/text.js — the owner's Pokermon jokers' families and text (DESIGN_FAMILIES, DESIGN_LOC, …), cut out of\n// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every statement is unchanged.`,
};
const out = {};
for (const m of MODULES) {
	const mItems = items.filter((x) => x.module === m);
	if (!mItems.length) continue;
	const head = HEAD[m] || `// designs/${m}.js — the owner's Generation ${m.slice(3)} Pokermon jokers and the helpers only they use, cut out of\n// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another\n// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);\n// a NEW joker is just added to JOKERS below and registers after them.`;
	const stmts = mItems.filter((x) => x.kind !== 'joker'), jokers = mItems.filter((x) => x.kind === 'joker');
	let t = head + '\n' + importsFor(mItems, m) + '\n';
	t += stmts.map(withExport).join('');
	if (jokers.length) {
		t += '\n\nexport const JOKERS = {';
		t += jokers.map((j) => { const s = text(j); return s.replace(/^\s*,/, '').replace(/^(?!\n)/, '\n') + ','; }).join('');
		t += '\n};\n';
	} else t += '\n';
	out[m] = t;
}
// the index
const gens = MODULES.filter((m) => m.startsWith('gen') && out[m]);
const batches = [];
for (const j of items.filter((x) => x.kind === 'joker')) (batches[j.batch] = batches[j.batch] || []).push(j.name);
const q = (n) => (/^[A-Za-z_$][\w$]*$/.test(n) ? `'${n}'` : JSON.stringify(n));
let idx = header.replace(/\n+$/, '\n');
idx += `//\n// SPLIT BY GENERATION (2026-11, tools/micatro/split_designs.mjs): the jokers and their helpers now live in ./designs/ —\n//   common.js (helpers two or more generations share, and the hooks index.js calls), gen3.js … gen9.js (each generation's\n//   jokers + the helpers only it uses) and text.js (DESIGN_FAMILIES, DESIGN_LOC). This file re-exports all of it, so every\n//   importer is unchanged, and REGISTERS the jokers.\n// Registration order is part of the rules: index.js walks the definitions in order and \`poke_after\` splices each joker in,\n//   so it decides the Joker pool's order and seeded picks (recorded runs) with it. BATCHES is the old file's order, frozen.\n//   A NEW joker needs no entry here: add it to its generation's JOKERS and it registers after these, in generation order.\n`;
idx += `import { defineJokers } from '../api.js';\n`;
for (const g of gens) idx += `import { JOKERS as ${g.toUpperCase()} } from './designs/${g}.js';\n`;
// re-export exactly what the old file exported (not the helpers that only gained `export` so a generation file can import them)
idx += '// what this file has always exported, from wherever it lives now\n';
for (const m of ['common', ...gens, 'text']) {
	const names = items.filter((x) => x.module === m && x.exported).flatMap((x) => x.names);
	if (names.length) idx += 'export {\n' + wrap(names) + '\n} from \'./designs/' + m + '.js\';\n';
}
idx += '\n';
idx += FILE_DECL + '   // (the label each definition carries: def.poke_file)\n';
idx += "// every generation's jokers, in generation order then file order. A name in two files would silently drop one, and a\n// joker in the wrong generation's file would be hard to find: both are refused when the mod loads.\nconst ALL = {};\nfor (const [gen, defs] of [" + gens.map((g) => '[' + g.slice(3) + ', ' + g.toUpperCase() + ']').join(', ') + "]) {\n  for (const [name, def] of Object.entries(defs)) {\n    if (ALL[name]) throw new Error(`pokermon designs: '${name}' is defined in two generation files`);\n    if (def.gen !== gen) throw new Error(`pokermon designs: '${name}' (gen ${def.gen}) is in designs/gen${gen}.js`);\n    ALL[name] = def;\n  }\n}\n";
idx += `const BATCHES = [\n${batches.map((b) => '  [\n' + wrap(b.map(q), '    ') + '\n  ],').join('\n')}\n];\n`;
idx += `const done = new Set();\nfor (const batch of BATCHES) {\n  const defs = {};\n  for (const name of batch) {\n    if (!ALL[name]) throw new Error(\`pokermon designs: '\${name}' is in BATCHES but no generation file defines it\`);\n    defs[name] = ALL[name]; done.add(name);\n  }\n  defineJokers(defs, FILE);\n}\n// anything newer than the frozen list: after it, in generation order, then file order\nconst newer = Object.fromEntries(Object.entries(ALL).filter(([name]) => !done.has(name)));\nif (Object.keys(newer).length) defineJokers(newer, FILE);\n`;
// `export *` does not re-export a name two modules both export; JOKERS is exported by every gen file on purpose (and is
// therefore NOT re-exported: nothing outside this file reads it).
console.log('index: ' + lineCount(idx) + ' lines; ' + batches.length + ' batches, ' + batches.flat().length + ' names');
for (const m of Object.keys(out)) console.log(`  designs/${m}.js: ${lineCount(out[m])} lines`);
if (WRITE) {
	fs.mkdirSync(`${DIR}/designs`, { recursive: true });
	const fix = (t) => (EOL === '\n' ? t : t.replace(/\n/g, EOL));
	for (const m of Object.keys(out)) fs.writeFileSync(`${DIR}/designs/${m}.js`, fix(out[m]));
	fs.writeFileSync(FILE, fix(idx));
	console.log('written');
} else console.log('(dry run — pass --write)');
