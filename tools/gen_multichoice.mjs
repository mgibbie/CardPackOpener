// gen_multichoice.mjs — restore every `multichoice` the transpile dropped.
//
// FireRed and Emerald ask their menu questions with
//     msgbox Question, MSGBOX_DEFAULT
//     multichoice 0, 0, MULTI_MECHADOLL1_Q1, TRUE      (x, y, list, ignoreBPress)
//     switch VAR_RESULT ...
// The map transpile kept the msgbox and the switch but DROPPED the multichoice
// (~250 of them), so every such menu answered with whatever VAR_RESULT already
// held: Trick House Puzzle 5's Mechadolls failed every quiz (2026-09-30).
//
// This reads each decomp's scripts, finds every multichoice / multichoicedefault
// / multichoicegrid, resolves its option list (script_menu) to strings, and
// re-inserts a `multichoice` op into our transpiled label: right after the
// question's msg, else just before the first VAR_RESULT branch.
//   -> overworld/multichoice_data.json { patches: { <stem>: { <label>: ops } }, shared: { <label>: ops } }
//
//   node tools/gen_multichoice.mjs
import fs from 'fs';
import path from 'path';

const REF = path.resolve('..', 'Magepunk66', 'Reference');
const DATA = path.resolve('overworld', 'data');
const read = p => fs.readFileSync(p, 'utf8');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const warn = [];

// every string a list can name: src/strings.c C literals and data/text asm labels
function stringTable(root) {
	const out = {};
	const clean = s => s.replace(/\\n|\\l|\\p/g, ' ').replace(/\{[^}]*\}/g, '').replace(/\$$/, '').replace(/\s+/g, ' ').trim();
	for (const f of walk(path.join(root, 'src')).filter(f => f.endsWith('.c') || f.endsWith('.h'))) {
		const src = read(f);
		for (const m of src.matchAll(/(?:const\s+)?u8\s+(\w+)\[\]\s*=\s*_\(((?:\s*"(?:[^"\\]|\\.)*")+)\s*\)/g)) {
			out[m[1]] = clean([...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]).join(''));
		}
	}
	for (const f of walk(path.join(root, 'data')).filter(f => f.endsWith('.inc') || f.endsWith('.s'))) {
		let label = null;
		for (const line of read(f).split(/\r?\n/)) {
			const l = line.match(/^(\w+)::?\s*$/);
			if (l) { label = l[1]; continue; }
			const s = line.match(/^\s*\.string\s+"((?:[^"\\]|\\.)*)"/);
			if (s && label) { out[label] = (out[label] ? out[label] + ' ' : '') + clean(s[1]); if (/\$"?\s*$/.test(line)) label = null; }
		}
	}
	return out;
}
// MULTI_* id -> [option strings]
function menuLists(root, file, idPrefix) {
	const src = read(path.join(root, file));
	const strings = stringTable(root);
	const lists = {};
	for (const m of src.matchAll(/static const struct MenuAction (\w+)\[\]\s*=\s*\{([\s\S]*?)\};/g)) {
		lists[m[1]] = [...m[2].matchAll(/\{\s*(\w+)/g)].map(x => strings[x[1]] ?? (warn.push(`${root}: no string ${x[1]}`), x[1]));
	}
	const ids = {};
	for (const m of src.matchAll(new RegExp(`\\[(${idPrefix}\\w+)\\]\\s*=\\s*MULTICHOICE\\((\\w+)\\)`, 'g'))) ids[m[1]] = lists[m[2]];
	return ids;
}

const GAMES = [
	{ name: 'EMERALD', root: path.join(REF, 'pokeemerald'), menu: path.join('src', 'data', 'script_menu.h'), prefix: 'MULTI_' },
	{ name: 'FIRERED', root: path.join(REF, 'pokefirered'), menu: path.join('src', 'script_menu.c'), prefix: 'MULTICHOICE_' },
];
const ourStems = new Set(fs.readdirSync(path.join(DATA, 'scripts')).map(f => f.replace(/\.json$/, '')));
const shared = JSON.parse(read(path.join(DATA, 'shared_scripts.json')));
const sharedScripts = shared.scripts || shared;
const patches = {}, sharedPatches = {};
let found = 0, applied = 0;
const unapplied = [];

for (const g of GAMES) {
	const lists = menuLists(g.root, g.menu, g.prefix);
	for (const f of walk(path.join(g.root, 'data')).filter(f => f.endsWith('.inc'))) {
		const mapDir = /[\\/]maps[\\/]([^\\/]+)[\\/]scripts\.inc$/.exec(f);
		let label = null, lastText = null;
		const byLabel = [];   // [label, [{ text, list, ignoreB, def, cols }]]
		for (const raw of read(f).split(/\r?\n/)) {
			const line = raw.replace(/@.*$/, '');
			const l = line.match(/^(\w+)::?\s*$/);
			if (l) { label = l[1]; lastText = null; byLabel.push([label, []]); continue; }
			const t = line.match(/^\s*(?:msgbox|message)\s+(\w+)/);
			if (t) { lastText = t[1]; continue; }
			const mc = line.match(/^\s*(multichoice|multichoicedefault|multichoicegrid)\s+(.*)$/);
			if (mc && label) {
				const a = mc[2].split(',').map(s => s.trim());
				const list = a[2];
				const e = { text: lastText, list, options: lists[list] };
				if (mc[1] === 'multichoice') e.ignoreB = /TRUE|1/.test(a[3] || 'FALSE');
				if (mc[1] === 'multichoicedefault') { e.def = +a[3] || 0; e.ignoreB = /TRUE|1/.test(a[4] || 'FALSE'); }
				if (mc[1] === 'multichoicegrid') { e.cols = +a[3] || 1; e.ignoreB = /TRUE|1/.test(a[4] || 'FALSE'); }
				if (!e.options) { warn.push(`${g.name} ${label}: no list ${list}`); continue; }
				byLabel[byLabel.length - 1][1].push(e);
				found++;
			}
		}
		for (const [lab, choices] of byLabel) {
			if (!choices.length) continue;
			// where our copy of this label lives: the map's own file (and Hoenn2_), or the shared table
			const targets = [];
			if (mapDir) for (const s of [mapDir[1], 'Hoenn2_' + mapDir[1]]) if (ourStems.has(s)) targets.push(['map', s]);
			if (sharedScripts[lab]) targets.push(['shared', null]);
			if (!targets.length) { unapplied.push(`${g.name} ${lab}: no transpiled copy`); continue; }
			for (const [kind, stem] of targets) {
				const src = kind === 'map' ? (JSON.parse(read(path.join(DATA, 'scripts', stem + '.json')))[lab]) : sharedScripts[lab];
				if (!Array.isArray(src)) { if (kind === 'map' && !sharedScripts[lab]) unapplied.push(`${g.name} ${lab}: not in ${stem}`); continue; }
				if (src.some(o => o.op === 'multichoice')) continue;
				const ops = JSON.parse(JSON.stringify(src));
				let from = 0, ok = true;
				for (const c of choices) {
					let at = c.text ? ops.findIndex((o, i) => i >= from && (o.op === 'msg' || o.op === 'say') && o.text === c.text) + 1 : 0;
					if (at <= 0) at = ops.findIndex((o, i) => i >= from && o.op === 'branch' && o.cond && o.cond.var === 'VAR_RESULT');
					if (at < 0) { ok = false; unapplied.push(`${g.name} ${lab}: no anchor for ${c.list}`); break; }
					const op = { op: 'multichoice', list: c.list, options: c.options, ignoreB: !!c.ignoreB };
					if (c.text) op.prompt = c.text;
					if (c.def != null) op.default = c.def;
					if (c.cols) op.cols = c.cols;
					ops.splice(at, 0, op);
					from = at + 1;
				}
				if (!ok) continue;
				applied++;
				if (kind === 'map') (patches[stem] = patches[stem] || {})[lab] = ops;
				else sharedPatches[lab] = ops;
			}
		}
	}
}

fs.writeFileSync(path.resolve('overworld', 'multichoice_data.json'), JSON.stringify({ generated: 'tools/gen_multichoice.mjs', patches, shared: sharedPatches }));
console.log(`${found} multichoice commands in the decomps; ${applied} label copies restored on ${Object.keys(patches).length} maps + ${Object.keys(sharedPatches).length} shared labels`);
console.log(`${unapplied.length} not applied (no transpiled copy / anchor)`);
for (const u of unapplied.slice(0, 25)) console.log('  ' + u);
if (warn.length) { console.log(`${warn.length} warnings`); for (const w of warn.slice(0, 15)) console.log('  ' + w); }
