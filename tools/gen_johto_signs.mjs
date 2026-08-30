// gen_johto_signs.mjs — give Johto's 215 signposts their words back.
//
// The Johto maps were ported with their sign bg_events intact, but no text ever
// came with them, so every signpost in the region reads blank. pokecrystal
// (vendored in Magepunk66/Reference) has the originals: each sign bg_event
// names a script label, which resolves — directly or through a `jumpstd` — to a
// text block. This walks that chain and merges the result into
// overworld/data/sign_texts.json, which the overworld looks up by script label.
//
//   node tools/gen_johto_signs.mjs        (from the repo root; deploy owdata after)
import fs from 'fs';
import path from 'path';

const PC = path.resolve('../Magepunk66/Reference/pokecrystal');
const OUT = 'overworld/data/sign_texts.json';

// ---------- 1. index every script + text block in the pokecrystal source ----------
const scripts = new Map(); // label -> instruction lines
const texts = new Map();   // label -> raw text lines
const files = [];
const walk = dir => {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (e.name.endsWith('.asm')) files.push(p);
	}
};
for (const sub of ['maps', 'engine', 'data']) {
	const d = path.join(PC, sub);
	if (fs.existsSync(d)) walk(d);
}
for (const f of files) {
	const lines = fs.readFileSync(f, 'utf8').replace(/\r/g, '').split('\n');
	let label = null, body = [];
	const flush = () => {
		if (!label) return;
		const isText = body.some(l => /^\s*(text|line|para|cont|next|done|prompt)\b/.test(l));
		(isText ? texts : scripts).set(label, body);
	};
	for (const raw of lines) {
		const m = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(raw);
		if (m) { flush(); label = m[1]; body = []; continue; }
		if (label) body.push(raw);
	}
	flush();
}

// ---------- 2. render a text block ----------
const str = l => { const m = /"((?:[^"\\]|\\.)*)"/.exec(l); return m ? m[1] : ''; };
function renderText(label, depth = 0) {
	const body = texts.get(label);
	if (!body || depth > 4) return null;
	let out = '';
	for (const raw of body) {
		const l = raw.trim();
		if (/^(done|prompt)\b/.test(l)) break;
		if (/^text_far\b|^text_jump\b/.test(l)) { // continues in another block
			const nxt = /\s(\w+)\s*$/.exec(l);
			if (nxt) { const more = renderText(nxt[1], depth + 1); if (more) out += (out ? '\n\n' : '') + more; }
			continue;
		}
		if (/^text\b/.test(l)) out += str(l);
		else if (/^line\b/.test(l)) out += '\n' + str(l);
		else if (/^cont\b/.test(l)) out += '\n' + str(l);
		else if (/^next\b/.test(l)) out += '\n' + str(l);
		else if (/^para\b/.test(l)) out += '\n\n' + str(l);
	}
	// pokecrystal charmap: "#" prints POKé; keep the game's plain-ASCII house style
	return out
		.replace(/#MON/g, 'POKEMON').replace(/#/g, 'POKE')
		.replace(/<PLAYER>/g, 'you').replace(/<RIVAL>/g, 'your rival')
		.replace(/<PLAY_G>/g, 'you').replace(/<[A-Z_]+>/g, '')
		.replace(/\\n/g, '\n')
		.trim() || null;
}

// ---------- 3. resolve a sign SCRIPT to its text ----------
function resolveScript(label, depth = 0) {
	const body = scripts.get(label);
	if (!body || depth > 6) return null;
	for (const raw of body) {
		const l = raw.trim();
		let m;
		if ((m = /^(?:far)?jumptext\s+(\w+)/.exec(l))) return renderText(m[1]);
		if ((m = /^(?:far)?writetext\s+(\w+)/.exec(l))) return renderText(m[1]);
		if ((m = /^jumpstd\s+(\w+)/.exec(l))) { const r = resolveScript(m[1], depth + 1); if (r) return r; }
		if ((m = /^(?:iftrue|iffalse|sjump)\s+\.?(\w+)/.exec(l))) {
			// a branch (gym statues: pre-badge vs beaten) — try it, but keep
			// scanning so the fall-through text wins if the branch has none
			const r = resolveScript(m[1], depth + 1) || resolveScript(label + '.' + m[1], depth + 1);
			if (r) return r;
		}
		if (/^end\b|^done\b/.test(l)) break;
	}
	return null;
}

// ---------- 4. every Johto sign the web port actually renders ----------
const MAPS = 'overworld/data/maps';
const JOHTO = /^(NewBark|Cherrygrove|Violet|Azalea|Goldenrod|Ecruteak|Olivine|Cianwood|Mahogany|Blackthorn|Route(2[6-9]|3[0-9]|4[0-6])|Union|Ilex|Slowpoke|Ruins|Sprout|Burned|TinTower|Whirl|MountMortar|DarkCave|LakeOfRage|IcePath|Radio|Team|National|Victory|Indigo|Mahogany|Goldenrod)/;
const wanted = new Set();
for (const f of fs.readdirSync(MAPS)) {
	if (!f.endsWith('_map.json') || !JOHTO.test(f)) continue;
	const m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8'));
	for (const b of (m.bg_events || [])) if (/sign/i.test(b.type || '') && b.script) wanted.add(b.script);
}

const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let added = 0; const missed = [];
for (const label of [...wanted].sort()) {
	if (existing[label]) continue;
	const t = resolveScript(label);
	if (t) { existing[label] = t; added++; } else missed.push(label);
}
fs.writeFileSync(OUT, JSON.stringify(existing));
console.log(`Johto sign scripts referenced: ${wanted.size}`);
console.log(`resolved + added: ${added}`);
console.log(`unresolved: ${missed.length}${missed.length ? ' -> ' + missed.slice(0, 12).join(', ') : ''}`);
console.log(`sign_texts.json now holds ${Object.keys(existing).length} entries. Deploy owdata (--branch=main).`);
