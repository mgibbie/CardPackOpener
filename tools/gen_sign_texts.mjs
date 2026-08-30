// gen_sign_texts.mjs — give every silent signpost, bookshelf and plaque in the
// game its words back, across all four map sets.
//
// The maps were ported with their sign bg_events intact, but a lot of them
// never got text: 259 in Johto, plus hundreds more across Kanto/JohKanto and
// Hoenn (bookshelves, town signs, gym plaques, museum placards). Each sign
// names a script label, which resolves — directly or through a jump — to a text
// block in one of the vendored decomps. This walks that chain for every sign
// the port can render and merges the result into overworld/data/sign_texts.json.
//
// Two source dialects:
//   pokecrystal (.asm)  — Johto + JohKanto: `jumptext X`, `jumpstd Y`, and
//                         text blocks built from text/line/para/cont.
//   pokefirered / pokeemerald (.inc) — Kanto + Hoenn: `msgbox X, MSGBOX_SIGN`,
//                         and text blocks built from `.string` runs.
//
//   node tools/gen_sign_texts.mjs        (repo root; deploy owdata after)
import fs from 'fs';
import path from 'path';

const REF = path.resolve('../Magepunk66/Reference');
const OUT = 'overworld/data/sign_texts.json';

const scripts = new Map(); // label -> instruction lines (both dialects)
const texts = new Map();   // label -> { kind: 'asm'|'inc', body }

// ---------- index pokecrystal (.asm) ----------
{
	const files = [];
	const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p); else if (e.name.endsWith('.asm')) files.push(p);
	} };
	for (const sub of ['maps', 'engine', 'data']) {
		const d = path.join(REF, 'pokecrystal', sub);
		if (fs.existsSync(d)) walk(d);
	}
	for (const f of files) {
		const lines = fs.readFileSync(f, 'utf8').replace(/\r/g, '').split('\n');
		let label = null, body = [];
		const flush = () => {
			if (!label) return;
			const isText = body.some(l => /^\s*(text|line|para|cont|next|done|prompt)\b/.test(l));
			if (isText) { if (!texts.has(label)) texts.set(label, { kind: 'asm', body }); }
			else if (!scripts.has(label)) scripts.set(label, body);
		};
		for (const raw of lines) {
			const m = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(raw);
			if (m) { flush(); label = m[1]; body = []; continue; }
			if (label) body.push(raw);
		}
		flush();
	}
}

// ---------- index pokefirered + pokeemerald (.inc) ----------
for (const repo of ['pokefirered', 'pokeemerald']) {
	const root = path.join(REF, repo, 'data');
	if (!fs.existsSync(root)) continue;
	const files = [];
	const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p); else if (e.name.endsWith('.inc')) files.push(p);
	} };
	walk(root);
	for (const f of files) {
		const lines = fs.readFileSync(f, 'utf8').replace(/\r/g, '').split('\n');
		let label = null, body = [];
		const flush = () => {
			if (!label) return;
			const isText = body.some(l => /^\s*\.string\b/.test(l));
			if (isText) { if (!texts.has(label)) texts.set(label, { kind: 'inc', body }); }
			else if (!scripts.has(label)) scripts.set(label, body);
		};
		for (const raw of lines) {
			const m = /^([A-Za-z_][A-Za-z0-9_]*)::?$/.exec(raw.trim());
			if (m) { flush(); label = m[1]; body = []; continue; }
			if (label) body.push(raw);
		}
		flush();
	}
}

// ---------- render ----------
const q = l => { const m = /"((?:[^"\\]|\\.)*)"/.exec(l); return m ? m[1] : ''; };
function renderText(label, depth = 0) {
	const t = texts.get(label);
	if (!t || depth > 4) return null;
	let out = '';
	if (t.kind === 'asm') {
		for (const raw of t.body) {
			const l = raw.trim();
			if (/^(done|prompt)\b/.test(l)) break;
			if (/^text_far\b|^text_jump\b/.test(l)) {
				const nxt = /\s(\w+)\s*$/.exec(l);
				if (nxt) { const more = renderText(nxt[1], depth + 1); if (more) out += (out ? '\n\n' : '') + more; }
				continue;
			}
			if (/^text\b/.test(l)) out += q(l);
			else if (/^(line|cont|next)\b/.test(l)) out += '\n' + q(l);
			else if (/^para\b/.test(l)) out += '\n\n' + q(l);
		}
	} else {
		// .string runs: \n and \l continue, \p starts a new page, $ ends
		for (const raw of t.body) {
			const l = raw.trim();
			if (!/^\.string\b/.test(l)) continue;
			out += q(l);
		}
		out = out.replace(/\$$/, '');
	}
	return out
		.replace(/\\p/g, '\n\n').replace(/\\[nl]/g, '\n')   // gen-3 line codes
		.replace(/#MON/g, 'POKEMON').replace(/#/g, 'POKE')  // crystal charmap
		.replace(/\{PLAYER\}|<PLAYER>|<PLAY_G>/g, 'you')
		.replace(/\{RIVAL\}|<RIVAL>/g, 'your rival')
		.replace(/\{POKEMON\}/g, 'POKEMON').replace(/\{POKE\}/g, 'POKE')
		.replace(/\{[A-Z_0-9]+\}|<[A-Z_0-9]+>/g, '')        // remaining buffers
		.replace(/\\./g, '')                                 // stray escapes
		.replace(/[ \t]+\n/g, '\n')
		.trim() || null;
}

function resolveScript(label, depth = 0) {
	const body = scripts.get(label);
	if (!body || depth > 6) return null;
	for (const raw of body) {
		const l = raw.trim();
		let m;
		if ((m = /^msgbox\s+(\w+)/.exec(l))) { const r = renderText(m[1], depth); if (r) return r; }
		if ((m = /^(?:far)?jumptext\s+(\w+)/.exec(l))) return renderText(m[1], depth);
		if ((m = /^(?:far)?writetext\s+(\w+)/.exec(l))) return renderText(m[1], depth);
		if ((m = /^jumpstd\s+(\w+)/.exec(l))) { const r = resolveScript(m[1], depth + 1); if (r) return r; }
		if ((m = /^(?:goto|call)\s+(\w+)/.exec(l))) { const r = resolveScript(m[1], depth + 1); if (r) return r; }
		if ((m = /^(?:iftrue|iffalse|sjump)\s+\.?(\w+)/.exec(l))) {
			const r = resolveScript(m[1], depth + 1) || resolveScript(label + '.' + m[1], depth + 1);
			if (r) return r;
		}
		if (/^end\b|^done\b|^release\b/.test(l)) break;
	}
	return null;
}

// ---------- every sign the port can render ----------
const MAPS = 'overworld/data/maps';
const wanted = new Set();
for (const f of fs.readdirSync(MAPS)) {
	if (!f.endsWith('_map.json')) continue;
	const m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8'));
	for (const b of (m.bg_events || [])) if (/sign/i.test(b.type || '') && b.script) wanted.add(b.script);
}

const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let added = 0; const missed = [];
for (const label of [...wanted].sort()) {
	if (existing[label]) continue;
	const t = resolveScript(label);
	if (t && t.length > 1) { existing[label] = t; added++; } else missed.push(label);
}
fs.writeFileSync(OUT, JSON.stringify(existing));
console.log(`sign scripts referenced by the maps: ${wanted.size}`);
console.log(`newly resolved: ${added}`);
console.log(`still unresolved: ${missed.length}`);
console.log(missed.slice(0, 15).join('\n'));
console.log(`sign_texts.json now holds ${Object.keys(existing).length} entries. Deploy owdata (--branch=main).`);
