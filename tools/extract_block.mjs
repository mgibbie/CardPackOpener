// extract_block.mjs — move a line range of main.js into its own module
// (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3). Cut and paste only: the moved code is
// byte-identical; the tool only writes the import/export plumbing around it.
//
//   node tools/extract_block.mjs <start> <end> <newModule.js> "<header comment>"  [--write]
//
// It resolves every identifier with eslint-scope (see split_deps.mjs) and:
//   * gives the new module an import for each outside name it uses — from the
//     same module main.js imported it from (same specifier/alias), or from
//     './main.js' for main's own declarations;
//   * marks those main.js declarations `export` (a cycle main <-> module is
//     safe: nothing is read during evaluation, only inside functions later);
//   * gives main.js an import of everything the moved code declares that the
//     rest of main.js still uses.
// It refuses when a binding is ASSIGNED across the boundary (imports are
// read-only), or when the block's top level would read a main.js binding
// while the module evaluates (that runs before main.js's body: a TDZ error).
import fs from 'fs';
import * as espree from 'espree';
import * as eslintScope from 'eslint-scope';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const [a, b, outName, header] = args.filter(x => x !== '--write');
const lo = +a, hi = +b;
const FILE = 'overworld/main.js';
const src = fs.readFileSync(FILE, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';   // generated text matches the file's line endings
const eol = t => t.replace(/\r?\n/g, EOL);
const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', range: true, loc: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
const mod = sm.globalScope.childScopes.find(s => s.type === 'module');
const inBlock = n => n.loc.start.line >= lo && n.loc.end.line <= hi;

// the block must be whole top-level statements
const stmts = ast.body.filter(s => s.loc.start.line >= lo && s.loc.start.line <= hi);
const cut0 = src.lastIndexOf('\n', stmts[0].range[0]) + 1;
const lastStmt = stmts[stmts.length - 1];
if (lastStmt.loc.end.line > hi) throw new Error(`statement at line ${lastStmt.loc.start.line} runs past ${hi}`);
// take whole lines, including comments between statements up to `hi`
const lineStart = n => { let i = 0; for (let l = 1; l < n; l++) i = src.indexOf('\n', i) + 1; return i; };
const start = lineStart(lo), end = lineStart(hi + 1);
if (start > cut0) throw new Error('block starts mid-statement');
for (const s of ast.body) if (s.range[0] < start && s.range[1] > start) throw new Error(`line ${lo} is inside the statement at line ${s.loc.start.line}`);

const need = new Map();      // name -> def (declared outside, used inside)
const give = new Set();      // declared inside, used outside
const problems = [];
// top-level (evaluation-time) references inside the block: not inside any function
const evalTime = new Set();
(function collect(scope, inFn) {
	for (const r of scope.references) if (!inFn && inBlock(r.identifier)) evalTime.add(r);
	for (const c of scope.childScopes) collect(c, inFn || c.type === 'function' || c.type === 'class-field-initializer');
})(mod, false);

for (const v of mod.variables) {
	const def = v.defs[0];
	if (!def) continue;
	const declIn = inBlock(def.name);
	for (const r of v.references) {
		const refIn = inBlock(r.identifier);
		if (refIn === declIn) continue;
		if (r.isWrite() && r.identifier !== def.name) problems.push(`'${v.name}' assigned across the boundary (line ${r.identifier.loc.start.line})`);
		if (refIn) {
			need.set(v.name, def);
			if (evalTime.has(r) && def.type !== 'ImportBinding') problems.push(`'${v.name}' read at evaluation time (line ${r.identifier.loc.start.line}) — would hit main.js's TDZ`);
		} else give.add(v.name);
	}
}
if (problems.length) { console.log('REFUSED:\n  ' + [...new Set(problems)].join('\n  ')); process.exit(1); }

// imports for the new module, grouped by source
const bySource = new Map();   // source -> { ns, def, named: [] }
const fromMain = [];
for (const [name, def] of need) {
	if (def.type === 'ImportBinding') {
		const spec = def.node, source = def.parent.source.value;
		const e = bySource.get(source) || { named: [] };
		if (spec.type === 'ImportNamespaceSpecifier') e.ns = name;
		else if (spec.type === 'ImportDefaultSpecifier') e.def = name;
		else e.named.push(spec.imported.name === name ? name : `${spec.imported.name} as ${name}`);
		bySource.set(source, e);
	} else fromMain.push({ name, def });
}
const importLines = [];
for (const [source, e] of [...bySource].sort()) {
	if (e.ns) importLines.push(`import * as ${e.ns} from '${source}';`);
	const parts = [];
	if (e.def) parts.push(e.def);
	if (e.named.length) parts.push(`{ ${e.named.sort().join(', ')} }`);
	if (parts.length) importLines.push(`import ${parts.join(', ')} from '${source}';`);
}
if (fromMain.length) importLines.push(`// main.js's own declarations (a safe cycle: only used inside functions)\nimport {\n${wrap(fromMain.map(x => x.name).sort())}\n} from './main.js';`);

function wrap(names) {
	const lines = []; let cur = '\t';
	for (const n of names) { if ((cur + n).length > 96) { lines.push(cur.trimEnd()); cur = '\t'; } cur += n + ', '; }
	lines.push(cur.trimEnd());
	return lines.join('\n');
}

// the moved code gets `export` on each declaration main.js still needs
let block = src.slice(start, end);
const blockEdits = [];
for (const v of mod.variables) {
	if (!give.has(v.name)) continue;
	const def = v.defs[0];
	const stmt = def.type === 'Variable' ? def.parent : def.node;
	blockEdits.push(stmt.range[0] - start);
}
for (const off of [...new Set(blockEdits)].sort((x, y) => y - x)) block = block.slice(0, off) + 'export ' + block.slice(off);

// main.js: `export` on its declarations the module needs, drop the block, import the rest
let main = src;
const mainEdits = new Set();
for (const { def } of fromMain) {
	const stmt = def.type === 'Variable' ? def.parent : def.node;
	mainEdits.add(stmt.range[0]);
}
const ops = [...mainEdits].map(o => ({ at: o, del: 0, text: 'export ' }));
ops.push({ at: start, del: end - start, text: '' });
ops.sort((x, y) => y.at - x.at);
for (const op of ops) main = main.slice(0, op.at) + op.text + main.slice(op.at + op.del);
const giveList = [...give].sort();
const importIntoMain = `import {\n${wrap(giveList)}\n} from './${outName.replace(/^overworld\//, '')}';\n`;
// place it after the ow_state import
const anchor = eol("import { S } from './ow_state.js';\n");
if (!main.includes(anchor)) throw new Error('anchor import missing');
main = main.replace(anchor, anchor + eol(`// ${outName.replace(/^overworld\//, '')}: ${header.split('\n')[0].replace(/^\/\/\s*/, '')}\n` + importIntoMain));

const moduleSrc = eol(`${header.split('\n').map(l => l.startsWith('//') ? l : '// ' + l).join('\n')}\n${importLines.join('\n')}\n\n`) + block;
console.log(`moved lines ${lo}-${hi}: ${need.size} imports (${fromMain.length} from main.js), ${give.size} exports back to main.js`);
if (WRITE) {
	fs.writeFileSync(outName, moduleSrc);
	fs.writeFileSync(FILE, main);
	console.log('written', outName, 'and', FILE);
} else console.log('(dry run — pass --write)');
