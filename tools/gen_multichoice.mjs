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

const REF = process.env.MAGEPUNK_REF || path.resolve('..', 'Magepunk66', 'Reference');
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
const restored = { multichoice: 0, checkmoney: 0, removemoney: 0, setdynamicwarp: 0, buffer: 0, getpartysize: 0, giveegg: 0 };
const unapplied = [];

// ---- the ALIGNER ----
// Walk a decomp label's commands in order alongside our transpiled ops. A command
// the transpile KEPT advances to the op it became; a command it DROPPED (the ones
// restored here) is inserted at that point. So a menu lands right after its
// question, a checkmoney right before the branch that reads it, and a command
// that opens the label at index 0 (Lilycove's elevator and vending machine).
// the STR_VAR fillers: `bufferspeciesname STR_VAR_1, VAR_TEMP_1` before "received
// the {STR_VAR_1}" (2026-10-02: the Dojo gift printed a blank name)
const BUFFER_KINDS = { bufferspeciesname: 'species', bufferitemname: 'item', bufferitemnameplural: 'itemplural', buffernumberstring: 'number', buffermovename: 'move' };
// `getpartysize` + `giveegg`: the Lavaridge egg woman (2026-10-07) checked a
// stale VAR_RESULT against PARTY_SIZE and set her flag without handing over the egg
const RESTORE = new Set(['multichoice', 'multichoicedefault', 'multichoicegrid', 'checkmoney', 'removemoney', 'setdynamicwarp', 'getpartysize', 'giveegg', ...Object.keys(BUFFER_KINDS)]);
const RESTORED_OPS = new Set(['multichoice', 'checkmoney', 'removemoney', 'setdynamicwarp', 'buffer', 'getpartysize', 'giveegg']);
function keptAs(cmd, a) {
	switch (cmd) {
		case 'msgbox': case 'message': return o => (o.op === 'msg' || o.op === 'say') && o.text === a[0];
		case 'goto': return o => o.op === 'goto' && o.label === a[0];
		case 'call': return o => o.op === 'call' && o.label === a[0];
		case 'case': return o => o.op === 'branch';
		case 'setvar': case 'copyvar': return o => o.op === cmd;
		case 'special': case 'specialvar': return o => o.op === 'special';
		case 'setflag': case 'clearflag': case 'random': case 'release': case 'lock': case 'faceplayer': case 'end': case 'return': return o => o.op === cmd;
		case 'applymovement': return o => o.op === 'move';
		case 'waitmovement': return o => o.op === 'waitmove';
		case 'closemessage': return o => o.op === 'closemsg';
		case 'waitmessage': return o => o.op === 'waitmsg';
		case 'checkitemspace': return o => o.op === 'setvar' && o.var === 'VAR_RESULT';
		case 'additem': case 'giveitem': return o => o.op === 'give';
	}
	if (/^(goto|call)_if/.test(cmd)) return o => o.op === 'branch';
	return null;   // a command with no op (bufferitemname, playse, waitse...): no position to match
}
function restoredOp(cmd, a, lists, lastText) {
	if (/^multichoice/.test(cmd)) {
		const list = a[2], options = lists[list];
		if (!options) return { err: `no list ${list}` };
		const op = { op: 'multichoice', list, options, ignoreB: false };
		if (cmd === 'multichoice') op.ignoreB = /TRUE|1/.test(a[3] || 'FALSE');
		if (cmd === 'multichoicedefault') { op.default = +a[3] || 0; op.ignoreB = /TRUE|1/.test(a[4] || 'FALSE'); }
		if (cmd === 'multichoicegrid') { op.cols = +a[3] || 1; op.ignoreB = /TRUE|1/.test(a[4] || 'FALSE'); }
		if (lastText) op.prompt = lastText;
		return { op };
	}
	if (BUFFER_KINDS[cmd]) return { op: { op: 'buffer', kind: BUFFER_KINDS[cmd], dst: a[0], src: a[1] } };
	if (cmd === 'checkmoney' || cmd === 'removemoney') return { op: { op: cmd, amount: +a[0] || 0 } };
	if (cmd === 'getpartysize') return { op: { op: 'getpartysize' } };
	if (cmd === 'giveegg') return { op: { op: 'giveegg', species: a[0] } };
	if (cmd === 'setdynamicwarp') {
		const op = { op: 'setdynamicwarp', map: a[0] };
		// formatwarp: (map), (map, warpId), (map, x, y) or (map, warpId, x, y). FRLG's
		// elevators use the last with warpId 255 = WARP_ID_NONE, so x,y win —
		// reading it as (map, x, y) sent every FRLG floor to x=255 (2026-10-02:
		// the Rocket Hideout lift dropped you at B4F's stair side, cut off from Giovanni)
		if (a.length >= 4) { if (+a[1] !== 255) op.warp = a[1]; op.x = +a[2]; op.y = +a[3]; }
		else if (a.length === 3) { op.x = +a[1]; op.y = +a[2]; } else if (a.length === 2) op.warp = a[1];
		return { op };
	}
	return { err: 'unknown ' + cmd };
}

for (const g of GAMES) {
	const lists = menuLists(g.root, g.menu, g.prefix);
	for (const f of walk(path.join(g.root, 'data')).filter(f => f.endsWith('.inc'))) {
		const mapDir = /[\\/]maps[\\/]([^\\/]+)[\\/]scripts\.inc$/.exec(f);
		let label = null;
		const byLabel = [];   // [label, [ [cmd, args] ]]
		for (const raw of read(f).split(/\r?\n/)) {
			const line = raw.replace(/@.*$/, '');
			const l = line.match(/^(\w+)::?\s*$/);
			if (l) { label = l[1]; byLabel.push([label, []]); continue; }
			const c = line.match(/^\s+([a-z_0-9]+)\b\s*(.*)$/);
			if (c && label) byLabel[byLabel.length - 1][1].push([c[1], c[2].split(',').map(x => x.trim()).filter(Boolean)]);
		}
		for (const [lab, cmds] of byLabel) {
			if (!cmds.some(([c]) => RESTORE.has(c))) continue;
			found += cmds.filter(([c]) => /^multichoice/.test(c)).length;
			const targets = [];
			if (mapDir) for (const s2 of [mapDir[1], 'Hoenn2_' + mapDir[1]]) if (ourStems.has(s2)) targets.push(['map', s2]);
			if (sharedScripts[lab]) targets.push(['shared', null]);
			if (!targets.length) { unapplied.push(`${g.name} ${lab}: no transpiled copy`); continue; }
			for (const [kind, stem] of targets) {
				const src = kind === 'map' ? (JSON.parse(read(path.join(DATA, 'scripts', stem + '.json')))[lab]) : sharedScripts[lab];
				if (!Array.isArray(src)) { if (kind === 'map' && !sharedScripts[lab]) unapplied.push(`${g.name} ${lab}: not in ${stem}`); continue; }
				if (src.some(o => RESTORED_OPS.has(o.op))) continue;   // already carries them
				const ops = JSON.parse(JSON.stringify(src));
				let p = 0, lastText = null, ok = true;
				const counts = {};
				for (const [cmd, a] of cmds) {
					if (RESTORE.has(cmd)) {
						const r = restoredOp(cmd, a, lists, lastText);
						if (r.err) { ok = false; unapplied.push(`${g.name} ${lab}: ${r.err}`); break; }
						ops.splice(p, 0, r.op); p++;
						{ const ck = /^multichoice/.test(cmd) ? 'multichoice' : BUFFER_KINDS[cmd] ? 'buffer' : cmd; counts[ck] = (counts[ck] || 0) + 1; }
						continue;
					}
					if (cmd === 'msgbox' || cmd === 'message') lastText = a[0];
					const pred = keptAs(cmd, a);
					if (!pred) continue;
					// the op it became: the next match within a short window (a
					// transpile may fold or reorder a command or two)
					for (let j = p; j < Math.min(ops.length, p + 4); j++) if (pred(ops[j])) { p = j + 1; break; }
				}
				if (!ok) continue;
				applied++;
				for (const [k, v] of Object.entries(counts)) restored[k] += v;
				if (kind === 'map') (patches[stem] = patches[stem] || {})[lab] = ops;
				else sharedPatches[lab] = ops;
			}
		}
	}
}

fs.writeFileSync(path.resolve('overworld', 'multichoice_data.json'), JSON.stringify({ generated: 'tools/gen_multichoice.mjs', patches, shared: sharedPatches }));
console.log(`${found} multichoice commands in the decomps; ${applied} label copies restored on ${Object.keys(patches).length} maps + ${Object.keys(sharedPatches).length} shared labels`);
console.log('restored ops:', JSON.stringify(restored));
console.log(`${unapplied.length} not applied (no transpiled copy / list)`);
for (const u of [...new Set(unapplied)].filter(u => !/CableClub|BerryBlender|UnionRoom|LinkLeader/.test(u)).slice(0, 25)) console.log('  ' + u);
if (warn.length) { console.log(`${warn.length} warnings`); for (const w of warn.slice(0, 15)) console.log('  ' + w); }
