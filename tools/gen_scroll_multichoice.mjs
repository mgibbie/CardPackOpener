// gen_scroll_multichoice.mjs — Emerald's scrollable multichoice lists, from the decomp.
//
// `special ShowScrollableMultichoice` (VAR_0x8004 = a SCROLL_MULTI_* list) was
// never implemented, so the Glass Workshop's flute/furniture menu (and the other
// scroll lists) never opened and the script branched on a stale VAR_RESULT
// (2026-10-05). This reads pokeemerald's sScrollableMultichoiceOptions table
// (src/field_specials.c), the SCROLL_MULTI_* numbers (include/constants/
// field_specials.h) and each gText_* string (src/strings.c), and writes
// overworld/scroll_multichoice_data.json: { lists: { NAME: [options] }, byNumber: { n: NAME } }.
//
//   node tools/gen_scroll_multichoice.mjs [--write]
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = (() => {
	if (process.env.MAGEPUNK66) return path.join(process.env.MAGEPUNK66, 'Reference');
	for (let d = path.resolve('..'); ; d = path.dirname(d)) {
		const r = path.join(d, 'Magepunk66', 'Reference');
		if (fs.existsSync(r)) return r;
		if (path.dirname(d) === d) return path.resolve('../Magepunk66/Reference');
	}
})();
const E = path.join(REF, 'pokeemerald');
const read = p => fs.readFileSync(path.join(E, p), 'utf8');

const numbers = {};   // NAME -> n
for (const m of read('include/constants/field_specials.h').matchAll(/#define\s+(SCROLL_MULTI_[A-Z0-9_]+)\s+(\d+)/g)) numbers[m[1]] = +m[2];
const strings = {};   // gText_X -> display text
for (const m of read('src/strings.c').matchAll(/const u8 (gText_\w+)\[\]\s*=\s*_\("((?:[^"\\]|\\.)*)"\)/g))
	strings[m[1]] = m[2].replace(/\\n|\\l|\\p/g, ' ').replace(/\{[A-Z_ ]+\}/g, '').replace(/\s+/g, ' ').trim();
const src = read('src/field_specials.c');
const start = src.indexOf('sScrollableMultichoiceOptions[][MAX_SCROLL_MULTI_LENGTH]');
const body = src.slice(start, src.indexOf('};', start));
const lists = {}, missing = [];
for (const m of body.matchAll(/\[(SCROLL_MULTI_[A-Z0-9_]+)\]\s*=\s*\{([^}]*)\}/g)) {
	const ids = m[2].split(',').map(s => s.trim()).filter(Boolean);
	lists[m[1]] = ids.map(id => { if (strings[id] == null) missing.push(id); return strings[id] ?? id.replace(/^gText_/, ''); });
}
const byNumber = {};
for (const [name, n] of Object.entries(numbers)) if (lists[name]) byNumber[n] = name;
console.log(`scroll lists: ${Object.keys(lists).length}; strings not found (kept as names): ${missing.length}${missing.length ? ' — ' + missing.slice(0, 6).join(', ') : ''}`);
console.log('GLASS_WORKSHOP_VENDOR:', JSON.stringify(lists.SCROLL_MULTI_GLASS_WORKSHOP_VENDOR));
if (WRITE) { fs.writeFileSync(path.resolve('overworld/scroll_multichoice_data.json'), JSON.stringify({ generated: 'tools/gen_scroll_multichoice.mjs', lists, byNumber }, null, 1) + '\n'); console.log('wrote overworld/scroll_multichoice_data.json'); }
else console.log('(dry run — pass --write)');
