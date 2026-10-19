// gen_trainer_text.mjs — the trainer lines every Hoenn route trainer was missing.
//
// Emerald keeps its route trainers' intro / defeat lines in ONE shared file,
// pokeemerald data/text/trainers.inc, not in each map's scripts.inc. The per-map
// strings export (Magepunk66 transpile_scripts.py resolve_text) reads only the
// map's own files, and the cross-map pass (resolve_common_text.py collect_wanted)
// only asks for the labels of `msg` ops — a `trainerbattle`'s text labels are its
// ARGUMENTS, so nobody asked for them. 1,465 labels on 32 Emerald routes (and their
// Hoenn2_ copies) resolved to nothing: every Route 102-134 trainer opened with "..."
// and lost with no line, and Route 107 / 108 had no strings file at all — the
// 404s in bug:1792354946145 (2026-10-18).
//
// For every script file, this finds the text labels its trainerbattle ops name that
// resolve nowhere the engine looks (the map's strings, its _1F file, _common.json,
// shared_scripts.json), reads them from the decomps' .inc text exactly as the
// per-map export normalises it, and ADDS them to that map's strings file (an
// existing line is never replaced). tests/bugreports_1019_test.mjs guards it.
//
//   node tools/gen_trainer_text.mjs                 (report)
//   node tools/gen_trainer_text.mjs --write [--out=DIR]
// MAGEPUNK_OWDATA=<dir> reads another checkout's overworld/data; --out writes the
// changed strings files under DIR/strings (a staging tree) instead of in place.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const DATA = process.env.MAGEPUNK_OWDATA || path.join(ROOT, 'overworld', 'data');
const REF = process.env.MAGEPUNK_REF || (() => {
	for (let d = ROOT; ; d = path.dirname(d)) {
		const c = path.join(path.dirname(d), 'Magepunk66', 'Reference');
		if (fs.existsSync(c) || path.dirname(d) === d) return c;
	}
})();
const arg = k => (process.argv.find(a => a.startsWith(k + '=')) || '').slice(k.length + 1) || null;
const OUT = path.resolve(arg('--out') || DATA);
const WRITE = process.argv.includes('--write');
const read = p => fs.readFileSync(p, 'utf8');
const J = p => JSON.parse(read(p));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// transpile_scripts.py resolve_text, line for line: \p a page, \n \l a space, no $
function normalise(raw) {
	let s = raw.replace(/\\p/g, '\n\n').replace(/\\n/g, ' ').replace(/\\l/g, ' ');
	s = s.replace(/\$/g, '').trim();
	return s.replace(/\s+\n/g, '\n');
}
// every `Label:` + `.string "..."` run in a decomp's data/**/*.inc
function textTable(repo) {
	const out = new Map();
	for (const f of walk(path.join(REF, repo, 'data')).filter(f => f.endsWith('.inc'))) {
		let cur = null, buf = [];
		const flush = () => { if (cur && buf.length && !out.has(cur)) out.set(cur, normalise(buf.join(''))); };
		for (const line of read(f).split(/\r?\n/)) {
			const l = /^([A-Za-z0-9_]+)::?\s*$/.exec(line);
			if (l) { flush(); cur = l[1]; buf = []; continue; }
			const s = /\.string\s+"(.*)"/.exec(line);
			if (s && cur) buf.push(s[1]);
		}
		flush();
	}
	return out;
}
const TEXT = { pokeemerald: textTable('pokeemerald'), pokefirered: textTable('pokefirered') };
const inDecomp = (repo, stem) => fs.existsSync(path.join(REF, repo, 'data', 'maps', stem));

const common = J(path.join(DATA, 'strings', '_common.json'));
const shared = (() => { try { return J(path.join(DATA, 'shared_scripts.json')).strings || {}; } catch (e) { return {}; } })();
const own = stem => { const p = path.join(DATA, 'strings', stem + '.json'); return fs.existsSync(p) ? J(p) : null; };

let added = 0, files = 0, created = 0;
const unresolved = [];
for (const f of fs.readdirSync(path.join(DATA, 'scripts')).filter(f => f.endsWith('.json')).sort()) {
	const stem = f.replace(/\.json$/, '');
	const scr = J(path.join(DATA, 'scripts', f));
	const mine = own(stem);
	const first = stem.replace(/_(B\d+F|\d+F)$/, '_1F');
	const visible = { ...(first !== stem ? own(first) || {} : {}), ...(mine || {}) };
	const want = new Set();
	for (const [label, ops] of Object.entries(scr)) {
		if (label === '__map__' || !Array.isArray(ops)) continue;
		for (const o of ops) {
			if (o?.op !== 'trainerbattle') continue;
			for (const a of o.args || []) if (/_Text_/.test(a) && !(a in visible) && !(a in common) && !(a in shared)) want.add(a);
		}
	}
	if (!want.size) continue;
	// the map's own decomp first (a Hoenn2_ copy is Emerald's map)
	const base = stem.replace(/^Hoenn2_/, '');
	const order = inDecomp('pokeemerald', base) ? ['pokeemerald', 'pokefirered'] : ['pokefirered', 'pokeemerald'];
	const add = {};
	for (const k of want) {
		const hit = order.map(r => TEXT[r].get(k)).find(v => v != null && v !== '');
		if (hit != null) add[k] = hit; else unresolved.push(`${stem}:${k}`);
	}
	const n = Object.keys(add).length;
	if (!n) continue;
	added += n; files++; if (!mine) created++;
	console.log(`  ${stem}: +${n}${mine ? '' : ' (new file)'}`);
	if (WRITE) {
		fs.mkdirSync(path.join(OUT, 'strings'), { recursive: true });
		fs.writeFileSync(path.join(OUT, 'strings', stem + '.json'), JSON.stringify({ ...(mine || {}), ...add }));
	}
}
console.log(`${added} trainer text labels added to ${files} strings files (${created} new)${WRITE ? ' -> ' + path.join(OUT, 'strings') : ' (dry run: pass --write)'}`);
if (unresolved.length) console.log(`${unresolved.length} still unresolved, e.g. ${unresolved.slice(0, 8).join(' ')}`);
