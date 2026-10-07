// gen_fallthrough.mjs — restore the decomp's label FALL-THROUGH.
//
// In the decomps a label with no `end` runs straight on into the next one:
// pokecrystal's gym leaders win the battle, award the badge, and fall from
// `scall OlivineGymActivateRockets` into `.FightDone:`, which hands over the TM.
// The transpile split every local label into its own op list and dropped that
// edge, so the badge came and the TM never did (2026-10-02, Instinct: Jasmine's
// TM23 IRON TAIL; every Johto leader's TM the same way).
//
// The runtime can't infer the edge on its own: `jumptext`/`jumpstd` (which END
// a block) were transpiled to a bare `msg`, so a label ending in `msg` looks the
// same either way. This checks each candidate against the decomp source — the
// line before `.Next:` must not end the block — and writes the verified edges to
// overworld/fallthrough_data.json ({ stem: { label: nextLabel } }), applied as a
// trailing `goto` when the map's scripts load (overworld/fallthrough.js).
//
//   node tools/gen_fallthrough.mjs
import fs from 'fs';
import path from 'path';

const SCRIPTS = path.join('overworld', 'data', 'scripts');
// the decomps live beside the repo (../Magepunk66/Reference); search upward so
// this also runs from a nested worktree
const REF = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66', 'Reference');
		if (fs.existsSync(p)) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66/Reference not found above ' + path.resolve('.'));
	}
})();
const OUT = path.join('overworld', 'fallthrough_data.json');
// GLOBAL -> next GLOBAL label edges, verified the same way, on these labels only
// (stem:label): the Game Corner prize counters, whose purchase
// tools/gen_crystal_scriptvar.mjs restores
const GLOBAL_EDGES_IN = new Set([
	'GoldenrodGameCorner:GoldenrodGameCornerTMVendorScript',
	'JohKantoCeladonGameCornerPrizeRoom:CeladonGameCornerPrizeRoomTMVendor',
]);
const TERM = new Set(['end', 'return', 'goto']);
// decomp commands that end a block (control never reaches the next line)
const TERM_ASM = /^\s*(end|return|sjump|jump|endcallback|endall|done|releaseall\s*$|goto\s|jumpstd\s|jumptext\s|jumptextfaceplayer\s|farjumptext\s|jumpopenedtext\s|farsjump\s|endtext)/;

const asmFiles = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(asm|inc)$/.test(e.name)) asmFiles.push(p); } };
for (const g of ['pokecrystal/maps', 'pokecrystal/engine/events', 'pokeemerald/data', 'pokefirered/data']) { try { walk(path.join(REF, g)); } catch (e) {} }
// label -> [lines, index of its definition]
const defs = new Map();
for (const f of asmFiles) {
	const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
	lines.forEach((l, i) => { const m = /^([A-Za-z_]\w*)::?/.exec(l); if (m && !defs.has(m[1])) defs.set(m[1], [lines, i]); });
}

const out = {};
let edges = 0, refused = 0, unknown = 0;
for (const f of fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.json')).sort()) {
	const stem = f.slice(0, -5);
	const s = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
	const keys = Object.keys(s);
	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i], ops = s[k];
		if (!Array.isArray(ops) || !ops.length || TERM.has(ops[ops.length - 1].op)) continue;
		const root = k.split('.')[0], nx = keys[i + 1];
		if (!nx.startsWith(root + '.')) {
			// a GLOBAL label falling into the next global one (pokecrystal's Game Corner
			// vendors: `...TMVendorScript` greets you and runs on into `..._LoopScript`,
			// the prize menu). Only on the listed labels — see GLOBAL_EDGES_IN.
			if (!GLOBAL_EDGES_IN.has(`${stem}:${k}`) || nx.includes('.')) continue;
			const a = defs.get(root), b = defs.get(nx);
			if (!a || !b || a[0] !== b[0] || b[1] <= a[1]) { unknown++; continue; }
			const [lines, j] = b;
			let p = j - 1; while (p > a[1] && /^\s*(;.*)?$/.test(lines[p])) p--;
			// the line right above `nx:` must be inside k (no other label between) and not end it
			let q = p; while (q > a[1] && !/^\.?[A-Za-z_]\w*::?/.test(lines[q])) q--;
			const kLine = k.includes('.') ? k.slice(root.length) + ':' : root + ':';
			if (!lines[q].startsWith(kLine) || TERM_ASM.test(lines[p])) { refused++; continue; }
			(out[stem] = out[stem] || {})[k] = nx;
			edges++;
			continue;
		}
		const def = defs.get(root);
		if (!def) { unknown++; continue; }
		const [lines, start] = def, local = nx.slice(root.length);
		let j = start + 1;
		for (; j < lines.length; j++) { if (lines[j].startsWith(local + ':')) break; if (/^[A-Za-z_]\w*::?/.test(lines[j])) { j = lines.length; break; } }
		if (j >= lines.length) { unknown++; continue; }
		let p = j - 1; while (p > start && /^\s*(;.*)?$/.test(lines[p])) p--;
		if (TERM_ASM.test(lines[p])) { refused++; continue; }
		(out[stem] = out[stem] || {})[k] = nx;
		edges++;
	}
}
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_fallthrough.mjs', edges: out }) + '\n');
console.log(`${edges} fall-through edges on ${Object.keys(out).length} maps (${refused} refused: the decomp ends the block; ${unknown} not found in the decomps)`);
