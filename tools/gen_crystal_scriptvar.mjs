// gen_crystal_scriptvar.mjs — restore the Crystal comparisons the transpile dropped.
//
// pokecrystal tests the SCRIPT VARIABLE (hScriptVar) with ifequal / ifnotequal /
// ifgreater / ifless / iftrue / iffalse. Magepunk66's transpile_crystal.py only
// emits ifequal/ifnotequal after a `readvar`, never ifgreater/ifless at all, and
// drops every test of a value a `special` wrote. So
//
//     special GetFirstPokemonHappiness
//     ifgreater 150 - 1, .Loyal
//     sjump .Disloyal
//
// became an UNCONDITIONAL goto .Disloyal: the Route 27 Sandstorm house refused
// TM37 at friendship 255 (2026-10-03, Instinct), and the Goldenrod Happiness
// Rater said every POKeMON "looks mean".
//
// This replays the transpiler one command at a time (tools/crystal_trace.py),
// finds each dropped test whose value came from `readvar` or from a special the
// engine IMPLEMENTS (ALLOW below — an unimplemented special leaves VAR_RESULT
// stale, and branching on that would be worse than the current fall-through), and
// splices a branch on that variable back in at the exact op position. A label is
// only patched when our current ops equal the fresh transpile — a hand-patched
// label (ManiasHouse, the injected static battles) is left alone and reported.
// Output: overworld/crystal_scriptvar_data.json { patches: { stem: { label: ops } } },
// merged over the map's labels at load (overworld/crystal_scriptvar.js).
//
//   node tools/gen_crystal_scriptvar.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const D = path.join('overworld', 'data');
const OUT = path.join('overworld', 'crystal_scriptvar_data.json');
const MP66 = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66');
		if (fs.existsSync(path.join(p, 'tools', 'transpile_crystal.py'))) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66 not found above ' + path.resolve('.'));
	}
})();

// labels (stem:label prefixes) where the dropped coin / setval / verticalmenu
// commands are restored — the Goldenrod City move tutor (Wed/Sat after the E4)
const RESTORE_COMMANDS_IN = ['GoldenrodCity:MoveTutorScript'];
// specials whose result the engine actually computes (ow_story.js runSpecial)
const ALLOW = new Set(['GetFirstPokemonHappiness', 'CheckFirstMonIsEgg', 'ReturnShuckie', 'GiveShuckle', 'MoveTutor']);
// commands that leave hScriptVar alone (display / movement); anything else between
// the writer and the test might overwrite it, so the restore stops there
const NEUTRAL = new Set(['writetext', 'promptbutton', 'waitbutton', 'closetext', 'opentext', 'faceplayer',
	'turnobject', 'pause', 'playsound', 'waitsfx', 'buttonsound', 'applymovement', 'cry', 'special_sound',
	'ifequal', 'ifnotequal', 'ifgreater', 'ifless', 'iftrue', 'iffalse', 'loadmenu', 'closewindow']);
const CONST = { PARTY_LENGTH: 6, NUM_POKEMON: 251, NUM_JOHTO_BADGES: 8, NUM_KANTO_BADGES: 8, NUM_BADGES: 16,
	MORN_HOUR: 4, DAY_HOUR: 10, NITE_HOUR: 18, TRUE: 1, FALSE: 0,
	// pokecrystal constants/script_constants.asm
	HAVE_MORE: 0, HAVE_AMOUNT: 1, HAVE_LESS: 2, MOVETUTOR_FLAMETHROWER: 1, MOVETUTOR_THUNDERBOLT: 2, MOVETUTOR_ICE_BEAM: 3 };
function evalExpr(s) {
	const t = String(s).replace(/[A-Z_][A-Z0-9_]*/g, n => (n in CONST ? String(CONST[n]) : '#'));
	if (/#|[^0-9+\-*\s()]/.test(t)) return null;
	try { const v = Function('return (' + t + ')')(); return Number.isInteger(v) ? v : null; } catch (e) { return null; }
}
// `loadmenu .Header` + `verticalmenu`: the Header's `dw .MenuData` lists the items
// as `db "NAME@"`. Crystal's verticalmenu answers 1-based (B = 0) — see below.
function menuItems(asm, header) {
	const lines = asm.split(/\r?\n/);
	const at = name => lines.findIndex(l => l.trim().startsWith(name + ':'));
	const i = at(header); if (i < 0) return null;
	let data = null;
	for (let k = i + 1; k < lines.length && k < i + 8; k++) { const m = /dw\s+(\.?\w+)/.exec(lines[k]); if (m) { data = m[1]; break; } }
	if (!data) return null;
	const j = at(data); if (j < 0) return null;
	const items = [];
	for (let k = j + 1; k < lines.length; k++) {
		const m = /^\s*db\s+"([^"]*)@"/.exec(lines[k]);
		if (m) { items.push(m[1]); continue; }
		if (/^\s*\.?\w+:/.test(lines[k]) || (/^\s*$/.test(lines[k]) && items.length)) break;
	}
	return items.length ? items : null;
}
const qualify = (label, g) => (label.startsWith('.') && g ? g + label : label);
const strip = ops => JSON.stringify((ops || []).map(o => { const { steps, ...r } = o; return r; }));

const trace = JSON.parse(execFileSync('python', [path.join('tools', 'crystal_trace.py'), path.join(MP66, 'tools'), path.join(MP66, 'Reference', 'pokecrystal', 'maps')], { maxBuffer: 1 << 28 }).toString());

const patches = {};
let restored = 0, labels = 0;
const skipped = { handPatched: [], unresolved: [], notEnabled: new Set() }, bySource = {};
for (const f of fs.readdirSync(path.join(D, 'maps'))) {
	if (!f.endsWith('_map.json')) continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
	if (!j._crystal_tileset || !j.name || !trace[j.name]) continue;
	const stem = f.replace('_map.json', '');
	const sf = path.join(D, 'scripts', stem + '.json');
	if (!fs.existsSync(sf)) continue;
	const ours = JSON.parse(fs.readFileSync(sf, 'utf8'));
	for (const [label, rows] of Object.entries(trace[j.name])) {
		const g = !label.startsWith('.') && !label.includes('.') ? label : label.split('.')[0];
		const fresh = rows.flatMap(r => r[2]);
		const out = [];
		const inserted = new Set();
		const add = op => { inserted.add(op); out.push(op); };
		let src = null, n = 0, menu = null;
		const asmFile = path.join(MP66, 'Reference', 'pokecrystal', 'maps', j.name + '.asm');
		const asm = fs.existsSync(asmFile) ? fs.readFileSync(asmFile, 'utf8') : '';
		const tally = k => { bySource[k] = (bySource[k] || 0) + 1; };
		// the dropped COMMANDS below (coins, setval, menus) are restored only in
		// labels on this list; elsewhere they're reported. Many other menus lead into
		// specials the engine doesn't implement (slots, link/mobile, vending), where a
		// restored menu would branch on a stale value.
		const newKinds = RESTORE_COMMANDS_IN.some(p => `${stem}:${label}`.startsWith(p));
		const wouldRestore = c => { if (!newKinds) { skipped.notEnabled.add(`${stem}:${label} (${c})`); return false; } return true; };
		for (const [cmd, a, conv] of rows) {
			if (!conv.length && ['checkcoins', 'takecoins', 'setval', 'verticalmenu'].includes(cmd) && !wouldRestore(cmd)) { out.push(...conv); continue; }
			// commands the transpile dropped outright (conv empty) that the engine runs
			if (!conv.length && cmd === 'checkcoins' && evalExpr(a[0]) != null) { add({ op: 'checkcoins', amount: evalExpr(a[0]) }); n++; tally('checkcoins'); src = { var: 'VAR_RESULT', name: 'checkcoins' }; continue; }
			if (!conv.length && cmd === 'takecoins' && evalExpr(a[0]) != null) { add({ op: 'takecoins', amount: evalExpr(a[0]) }); n++; tally('takecoins'); continue; }
			if (!conv.length && cmd === 'setval' && evalExpr(a[0]) != null) { add({ op: 'setvar', var: 'VAR_RESULT', value: evalExpr(a[0]) }); n++; tally('setval'); src = { var: 'VAR_RESULT', name: 'setval' }; continue; }
			if (!conv.length && cmd === 'loadmenu') { menu = menuItems(asm, a[0]); continue; }
			if (!conv.length && cmd === 'verticalmenu' && menu) {
				// the engine's menu answers 0-based (B = 127); Crystal's verticalmenu is
				// 1-based, so add 1 — B then reads 128, which matches no ifequal, as in Crystal
				add({ op: 'multichoice', list: 'CRYSTAL_VERTICALMENU', options: menu, ignoreB: false, default: 0 });
				add({ op: 'addvar', var: 'VAR_RESULT', value: 1 });
				n++; tally('verticalmenu'); src = { var: 'VAR_RESULT', name: 'verticalmenu' }; menu = null; continue;
			}
			const isIf = /^if(equal|notequal|greater|less|true|false)$/.test(cmd);
			if (isIf && !conv.length && src) {
				const tf = cmd === 'iftrue' || cmd === 'iffalse';
				const value = tf ? 0 : evalExpr(a[0]);
				const target = tf ? a[0] : a[1];
				if (value == null || !target) { skipped.unresolved.push(`${stem}:${label} ${cmd} ${a.join(',')}`); }
				else {
					const cmp = { ifequal: 'eq', ifnotequal: 'ne', ifgreater: 'gt', ifless: 'lt', iftrue: 'ne', iffalse: 'eq' }[cmd];
					add({ op: 'branch', kind: 'goto', cond: { var: src.var, cmp, value }, label: qualify(target, g) });
					n++; bySource[src.name] = (bySource[src.name] || 0) + 1;
				}
			}
			out.push(...conv);
			if (cmd === 'special') src = ALLOW.has(a[0]) ? { var: 'VAR_RESULT', name: 'special ' + a[0] } : null;
			else if (cmd === 'readvar' && a[0]) src = { var: a[0], name: 'readvar ' + a[0] };
			else if (!NEUTRAL.has(cmd)) src = null;
		}
		if (!n) continue;
		if (strip(ours[label]) !== strip(fresh)) { skipped.handPatched.push(`${stem}:${label}`); continue; }
		// keep our copy's movement steps: splice into OUR ops at the same positions
		const merged = []; let oi = 0;
		for (const op of out) {
			if (inserted.has(op)) { merged.push(op); continue; }   // a restored op
			merged.push(ours[label][oi++]);
		}
		(patches[stem] = patches[stem] || {})[label] = merged;
		restored += n; labels++;
	}
}
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_crystal_scriptvar.mjs', patches }));
console.log(`restored ${restored} dropped comparison(s) in ${labels} label(s) across ${Object.keys(patches).length} map(s)`);
console.log('by source:', JSON.stringify(bySource));
console.log(`skipped (hand-patched labels, left alone): ${skipped.handPatched.length}`, skipped.handPatched.join(' '));
console.log(`skipped (value not resolvable): ${skipped.unresolved.length}`, skipped.unresolved.join(' | '));
console.log('wrote ' + OUT);
console.log(`dropped coin/setval/menu commands NOT restored (not on RESTORE_COMMANDS_IN): ${skipped.notEnabled.size}`);
for (const x of [...skipped.notEnabled].sort()) console.log('   ' + x);
