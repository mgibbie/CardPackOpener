// gen_maplayout.mjs — restore every `setmaplayoutindex` the transpile dropped.
//
// pokeemerald (17) and pokefirered (4) switch a map to another of its layouts
// from its ON_TRANSITION script. The transpile kept the labels and lost the
// command, so Route131_EventScript_SetLayout was a bare `return` and the Sky
// Pillar's island stayed cut off from the sea (2026-10-07).
//
// Each one is either its label's first command, or the last before the label's
// closing end/return; the op goes in at the same place in our transpiled label
// (the multichoice patch of that label when it has one). Every map whose script
// file carries the label gets it: the Hoenn2_ copies share Emerald's labels.
//   -> overworld/maplayout_data.json { patches: { <stem>: { <label>: ops } } }
//
//   node tools/gen_maplayout.mjs
import fs from 'fs';
import path from 'path';

const REF = process.env.MAGEPUNK_REF || path.resolve('..', 'Magepunk66', 'Reference');
const DATA = path.resolve('overworld', 'data');
const OUT = path.resolve('overworld', 'maplayout_data.json');
const read = p => fs.readFileSync(p, 'utf8');

// label -> { layout, first, nextTerminal }
const found = {};
for (const game of ['pokeemerald', 'pokefirered']) {
	const root = path.join(REF, game, 'data', 'maps');
	for (const dir of fs.readdirSync(root)) {
		const f = path.join(root, dir, 'scripts.inc');
		if (!fs.existsSync(f)) continue;
		let label = null, cmds = [];
		const flush = () => {
			cmds.forEach((c, i) => {
				const m = c.match(/^setmaplayoutindex\s+(\w+)/);
				if (!m) return;
				const next = (cmds[i + 1] || '').split(/\s/)[0];
				found[label] = { layout: m[1], first: i === 0, nextTerminal: next === 'end' || next === 'return', game };
			});
		};
		for (const raw of read(f).split(/\r?\n/)) {
			const line = raw.replace(/@.*$/, '').trim();
			const l = line.match(/^(\w+)::?$/);
			if (l) { if (label) flush(); label = l[1]; cmds = []; continue; }
			if (label && line && !line.startsWith('#') && !line.startsWith('.')) cmds.push(line);
		}
		if (label) flush();
	}
}

let choice = {};
try { choice = JSON.parse(read(path.resolve('overworld', 'multichoice_data.json'))).patches || {}; } catch (e) {}
const patches = {};
const warn = [];
let n = 0;
for (const f of fs.readdirSync(path.join(DATA, 'scripts')).filter(f => f.endsWith('.json')).sort()) {
	const stem = f.replace(/\.json$/, '');
	let scr;
	try { scr = JSON.parse(read(path.join(DATA, 'scripts', f))); } catch (e) { continue; }
	for (const [label, info] of Object.entries(found)) {
		const base = choice[stem]?.[label] || scr[label];
		if (!Array.isArray(base)) continue;
		if (base.some(o => o.op === 'setmaplayout')) continue;
		const op = { op: 'setmaplayout', layout: info.layout };
		let ops;
		if (info.first) ops = [op, ...base];
		else if (info.nextTerminal && base.length && ['end', 'return'].includes(base[base.length - 1].op)) ops = [...base.slice(0, -1), op, base[base.length - 1]];
		else { warn.push(`${stem}:${label} (no place for it)`); continue; }
		(patches[stem] = patches[stem] || {})[label] = ops;
		n++;
	}
}
const missing = Object.keys(found).filter(l => !Object.values(patches).some(p => p[l]));
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_maplayout.mjs', patches }) + '\n');
console.log(`${Object.keys(found).length} setmaplayoutindex labels in the decomps; ${n} label copies patched across ${Object.keys(patches).length} script files -> ${path.relative(process.cwd(), OUT)}`);
if (missing.length) console.log('no transpiled copy: ' + missing.join(', '));
if (warn.length) console.log('WARN ' + warn.join('; '));
