// gen_crystal_stonetables.mjs — pokecrystal's STONE TABLES: which boulder falls
// through which hole, and what that does.
//
// FRLG decides a boulder's fall by the tile it lands on (MB_FALL_WARP); Crystal
// does it per map. A map's MAPCALLBACK_CMDQUEUE queues a CMDQUEUE_STONETABLE whose
// `stonetable WARP, OBJECT, .Script` rows say: when OBJECT (a Strength boulder)
// comes to rest on warp WARP (a hole), run .Script — `disappear` the boulder (which
// sets its event flag), maybe clear the flag that shows its twin on the floor below
// (Ice Path), then "The boulder fell through." The port pushed the boulder onto the
// hole and nothing else happened, so Blackthorn Gym's bridges to Clair never formed
// (2026-10-09, Instinct: a blocker for the eighth Johto badge).
//
// Output: overworld/crystal_stonetables.json
//   { <map>: [{ x, y, flag, clear: [EVENT_...], set: [EVENT_...], text }] }
//   x,y = the hole (the warp's tile); flag = the boulder's own event flag (it falls
//   only when THAT boulder lands there, as the decomp checks the object).
//   node tools/gen_crystal_stonetables.mjs
import fs from 'fs';
import path from 'path';

const MP66 = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66');
		if (fs.existsSync(path.join(p, 'Reference', 'pokecrystal', 'maps'))) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66 not found above ' + path.resolve('.'));
	}
})();
const MAPS = path.join(MP66, 'Reference', 'pokecrystal', 'maps');

// a label's body: the lines after `name:` up to the next label
function body(lines, name) {
	const i = lines.findIndex(l => l.trim() === name + ':' || l.trim() === name + '::' || l.trim() === name);
	if (i < 0) return [];
	const out = [];
	for (let k = i + 1; k < lines.length; k++) {
		if (/^\.?\w+::?\s*(;.*)?$/.test(lines[k]) || /^\.\w+\s*$/.test(lines[k]) || /^[A-Za-z_]\w*::?/.test(lines[k])) break;
		out.push(lines[k].trim());
	}
	return out;
}
// a text label's literal text (text / line / para / cont)
function textOf(lines, name) {
	const parts = [];
	for (const l of body(lines, name)) {
		const m = /^(text|line|para|cont)\s+"(.*)"$/.exec(l);
		if (m) parts.push((m[1] === 'para' ? '\n\n' : parts.length ? '\n' : '') + m[2]);
		if (l === 'done') break;
	}
	return parts.join('');
}

const out = {};
let n = 0;
for (const f of fs.readdirSync(MAPS).filter(f => f.endsWith('.asm')).sort()) {
	const src = fs.readFileSync(path.join(MAPS, f), 'utf8');
	if (!/\bstonetable\b/.test(src)) continue;
	const lines = src.split(/\r?\n/);
	const consts = [];
	const ci = lines.findIndex(l => /^\s*object_const_def\b/.test(l));
	for (let k = ci + 1; ci >= 0 && k < lines.length; k++) {
		const m = /^\s*const\s+(\w+)/.exec(lines[k]);
		if (m) { consts.push(m[1]); continue; }
		if (/^\s*(;.*)?$/.test(lines[k])) continue;
		break;
	}
	const warps = [], objects = [];
	for (const l of lines) {
		let m = /^\s*warp_event\s+(\d+),\s*(\d+)/.exec(l);
		if (m) warps.push([+m[1], +m[2]]);
		m = /^\s*object_event\s+(.*)$/.exec(l);
		if (m) { const a = m[1].split(';')[0].split(',').map(s => s.trim()); objects.push({ x: +a[0], y: +a[1], flag: a[a.length - 1] }); }
	}
	const rows = [];
	for (const l of lines) {
		const m = /^\s*stonetable\s+(\d+),\s*(\w+),\s*(\.?\w+)/.exec(l);
		if (!m) continue;
		const warp = warps[+m[1] - 1], obj = objects[consts.indexOf(m[2])];
		if (!warp || !obj) throw new Error(`${f}: stonetable ${m[1]} ${m[2]} doesn't resolve`);
		// the row's script: its own ops, then whatever it sjumps to, for the event
		// writes and the text it prints
		const clear = [], set = [];
		let text = null, label = m[3];
		for (let hop = 0; label && hop < 4; hop++) {
			let next = null;
			for (const op of body(lines, label)) {
				let k = /^clearevent\s+(\w+)/.exec(op); if (k) clear.push(k[1]);
				k = /^setevent\s+(\w+)/.exec(op); if (k) set.push(k[1]);
				k = /^writetext\s+(\w+)/.exec(op); if (k && !text) text = textOf(lines, k[1]);
				k = /^sjump\s+(\.?\w+)/.exec(op); if (k) next = k[1];
			}
			label = next;
		}
		rows.push({ x: warp[0], y: warp[1], flag: obj.flag, clear, set, text: text || 'The boulder fell\nthrough.' });
	}
	if (rows.length) { out[f.replace(/\.asm$/, '')] = rows; n += rows.length; }
}
fs.writeFileSync(path.join('overworld', 'crystal_stonetables.json'), JSON.stringify(out, null, '\t') + '\n');
console.log(`stone tables: ${Object.keys(out).length} maps, ${n} rows ->`, Object.keys(out).join(', '));
