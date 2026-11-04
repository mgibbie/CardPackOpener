// The overworld's pixel font draws ♀ / ♂ (owner, 2026-10-28: "get the symbols"). The battle gender mark
// (battleui.js), the party menu (ow_menus.js) and NIDORAN♀ / NIDORAN♂ (events.js) all write the real signs, but the
// overworld loaded data/fonts/m6x11plus.ttf, the original font, which has no glyph for either, so the browser fell
// back to another font for them. battle.js now loads Micatro's patched copy (tools/micatro/add_gender_glyphs.py).
//   node overworld/tests/owfont_gender_glyphs_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg + (extra ? '  ' + extra : '')); } };

/** The code points a TrueType font maps, from its cmap format-4 (BMP) subtable. */
function cmapCodepoints(buf) {
	const n = buf.readUInt16BE(4);
	let cmap = -1;
	for (let i = 0; i < n; i++) { const r = 12 + i * 16; if (buf.toString('latin1', r, r + 4) === 'cmap') cmap = buf.readUInt32BE(r + 8); }
	if (cmap < 0) return new Set();
	const out = new Set();
	const tables = buf.readUInt16BE(cmap + 2);
	for (let t = 0; t < tables; t++) {
		const sub = cmap + buf.readUInt32BE(cmap + 4 + t * 8 + 4);
		if (buf.readUInt16BE(sub) !== 4) continue;
		const segX2 = buf.readUInt16BE(sub + 6), ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, offs = deltas + segX2;
		for (let s = 0; s < segX2 / 2; s++) {
			const end = buf.readUInt16BE(ends + s * 2), start = buf.readUInt16BE(starts + s * 2);
			const delta = buf.readInt16BE(deltas + s * 2), ro = buf.readUInt16BE(offs + s * 2);
			for (let c = start; c <= end && c !== 0xFFFF; c++) {
				let g;
				if (ro === 0) g = (c + delta) & 0xFFFF;
				else { const gi = offs + s * 2 + ro + (c - start) * 2; g = buf.readUInt16BE(gi); if (g) g = (g + delta) & 0xFFFF; }
				if (g) out.add(c);
			}
		}
	}
	return out;
}

const battle = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
const m = battle.match(/new FontFace\('m6x11plus', 'url\(([^)]+)\)'\)/);
A(!!m, 'battle.js loads the m6x11plus font face', m && m[1]);
const url = m ? m[1] : '';
const file = path.resolve(path.join(ROOT, 'overworld'), url.replace(/\?.*$/, ''));
A(path.relative(ROOT, file).split(path.sep).join('/') ==='micatro/assets/fonts/m6x11plus.ttf', 'it is Micatro\'s patched copy (git-tracked), not the original in data/fonts', url);
A(/\?v=\d+/.test(url), 'the URL is versioned, so browsers that cached the old font fetch the new one', url);
const cps = fs.existsSync(file) ? cmapCodepoints(fs.readFileSync(file)) : new Set();
A(cps.has(0x2640) && cps.has(0x2642), 'that font maps ♀ (U+2640) and ♂ (U+2642)', `${cps.size} code points`);
A(cps.has(0x41) && cps.has(0x61) && cps.has(0x30), 'and still maps the ASCII letters and digits', `${cps.size} code points`);
const orig = path.join(ROOT, 'tools/micatro/specs/m6x11plus_original.ttf');
if (fs.existsSync(orig)) { const o = cmapCodepoints(fs.readFileSync(orig)); A(!o.has(0x2640) && !o.has(0x2642), '(the original font, which the overworld used to load, has neither sign)'); }
// the overworld text that needs them
const uses = ['overworld/battleui.js', 'overworld/ow_menus.js', 'overworld/events.js'].filter((f) => /[♀♂]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
A(uses.length === 3, 'the battle gender mark, the party menu and the Nidoran names all write ♀ / ♂', uses.join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
