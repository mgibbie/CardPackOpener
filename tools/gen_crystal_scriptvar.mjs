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
import { loadCrystalMaps, makeHarvester } from './crystal_blocks.mjs';

const D = path.join('overworld', 'data');
const OUT = path.join('overworld', 'crystal_scriptvar_data.json');
const MP66 = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66');
		if (fs.existsSync(path.join(p, 'tools', 'transpile_crystal.py'))) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66 not found above ' + path.resolve('.'));
	}
})();

// labels (stem:label prefixes) where the dropped coin / money / setval /
// verticalmenu / givepoke commands are restored (and where a `scall` or a
// `giveitem` answers the iftrue/iffalse after it): the Goldenrod City move tutor
// (Wed/Sat after the E4), the Game Corner TM and prize-Pokémon vendors (Goldenrod,
// Celadon), the Celadon gambler's 18 coins, the Dept. Store 6F vending machines
// and the Dragon Shrine quiz. Every label here was read by hand: its menus lead to
// nothing the engine lacks (unlike the link/mobile counters, Moomoo...). The slot
// machine signs get their `random 6` lucky-machine roll and `setval TRUE/FALSE`
// back: `special SlotMachine` (ow_crystalslots.js) reads the script var the way
// Slots_InitBias reads wScriptVar.
const RESTORE_COMMANDS_IN = ['GoldenrodCity:MoveTutorScript',
	'GoldenrodGameCorner:GoldenrodGameCornerTMVendor', 'GoldenrodGameCorner:GoldenrodGameCornerPrizeMonVendor',
	'JohKantoCeladonGameCornerPrizeRoom:CeladonGameCornerPrizeRoomPokemonVendor', 'JohKantoCeladonGameCornerPrizeRoom:CeladonPrizeRoom_tmcounterloop',
	'JohKantoCeladonGameCorner:CeladonGameCornerFisherScript',
	'GoldenrodDeptStore6F:GoldenrodVendingMachine', 'JohKantoCeladonDeptStore6F:CeladonDeptStore6FVendingMachine',
	'DragonShrine:DragonShrineTakeTestScript',
	'GoldenrodGameCorner:GoldenrodGameCornerSlotsMachineScript', 'GoldenrodGameCorner:GoldenrodGameCornerLuckySlotsMachineScript',
	'JohKantoCeladonGameCorner:CeladonGameCornerLuckySlotMachineScript', 'JohKantoCeladonGameCorner:CeladonGameCornerSlotMachineScript',
	// the Ruins of Alph UNOWN PUZZLE panels: setval picks the puzzle, the special
	// answers TRUE when it's solved, and .PuzzleComplete opens the floor (its
	// changeblocks + the warpcheck that drops you into the inner chamber)
	...['Kabuto', 'Omanyte', 'Aerodactyl', 'HoOh'].map(c => `RuinsOfAlph${c}Chamber:RuinsOfAlph${c}ChamberPuzzle`)];
// labels whose plain-script changeblocks / warpcheck are restored too (elsewhere
// only MAP CALLBACK changeblocks are)
const SCRIPT_TILES_IN = ['Kabuto', 'Omanyte', 'Aerodactyl', 'HoOh'].map(c => `RuinsOfAlph${c}Chamber:RuinsOfAlph${c}ChamberPuzzle.PuzzleComplete`);
// specials whose result the engine actually computes (ow_story.js runSpecial)
const ALLOW = new Set(['GetFirstPokemonHappiness', 'CheckFirstMonIsEgg', 'ReturnShuckie', 'GiveShuckle', 'MoveTutor', 'UnownPuzzle']);
// commands that leave hScriptVar alone (display / movement); anything else between
// the writer and the test might overwrite it, so the restore stops there
const NEUTRAL = new Set(['writetext', 'promptbutton', 'waitbutton', 'closetext', 'opentext', 'faceplayer',
	'turnobject', 'pause', 'playsound', 'waitsfx', 'buttonsound', 'applymovement', 'cry', 'special_sound',
	'ifequal', 'ifnotequal', 'ifgreater', 'ifless', 'iftrue', 'iffalse', 'loadmenu', 'closewindow']);
const CONST = { PARTY_LENGTH: 6, NUM_POKEMON: 251, NUM_JOHTO_BADGES: 8, NUM_KANTO_BADGES: 8, NUM_BADGES: 16,
	MORN_HOUR: 4, DAY_HOUR: 10, NITE_HOUR: 18, TRUE: 1, FALSE: 0, MAX_COINS: 9999,
	// pokecrystal constants/script_constants.asm
	HAVE_MORE: 0, HAVE_AMOUNT: 1, HAVE_LESS: 2, MOVETUTOR_FLAMETHROWER: 1, MOVETUTOR_THUNDERBOLT: 2, MOVETUTOR_ICE_BEAM: 3,
	UNOWNPUZZLE_KABUTO: 0, UNOWNPUZZLE_OMANYTE: 1, UNOWNPUZZLE_AERODACTYL: 2, UNOWNPUZZLE_HO_OH: 3 };
// the map's own `DEF NAME EQU value` lines (prices: GOLDENRODGAMECORNER_TM25_COINS)
let LOCAL = {};
function localDefs(asm) {
	const out = {};
	for (const m of asm.matchAll(/^DEF\s+([A-Z_][A-Z0-9_]*)\s+EQU\s+(\d+)\s*$/gm)) out[m[1]] = +m[2];
	return out;
}
function evalExpr(s) {
	const t = String(s).replace(/[A-Z_][A-Z0-9_]*/g, n => (n in LOCAL ? String(LOCAL[n]) : n in CONST ? String(CONST[n]) : '#'));
	if (/#|[^0-9+\-*\s()]/.test(t)) return null;
	try { const v = Function('return (' + t + ')')(); return Number.isInteger(v) ? v : null; } catch (e) { return null; }
}
// `loadmenu .Header` + `verticalmenu`: the Header's `dw .MenuData` lists the items
// as `db "NAME@"`. Crystal's verticalmenu answers 1-based (B = 0) — see below.
// A local `.MenuHeader` / `.MenuData` is the first one AFTER its global label (the
// Goldenrod Game Corner has three `.MenuData`s) — so search from the scope `g`.
function menuItems(asm, header, g) {
	const lines = asm.split(/\r?\n/);
	const at = (name, from = 0) => { for (let k = from; k < lines.length; k++) if (lines[k].trim().startsWith(name + ':')) return k; return -1; };
	const i = at(header, header.startsWith('.') && g ? Math.max(0, at(g)) : 0); if (i < 0) return null;
	let data = null;
	for (let k = i + 1; k < lines.length && k < i + 8; k++) { const m = /dw\s+(\.?\w+)/.exec(lines[k]); if (m) { data = m[1]; break; } }
	if (!data) return null;
	const j = at(data, data.startsWith('.') ? i : 0); if (j < 0) return null;
	const items = [];
	for (let k = j + 1; k < lines.length; k++) {
		const m = /^\s*db\s+"([^"]*)@"/.exec(lines[k]);
		if (m) { items.push(m[1].replace(/\{d:(\w+)\}/g, (x, n) => (n in LOCAL ? String(LOCAL[n]) : x))); continue; }
		if (/^\s*\.?\w+:/.test(lines[k]) || (/^\s*$/.test(lines[k]) && items.length)) break;
	}
	return items.length ? items : null;
}
const qualify = (label, g) => (label.startsWith('.') && g ? g + label : label);
const strip = ops => JSON.stringify((ops || []).map(o => { const { steps, ...r } = o; return r; }));

// Crystal MAP CALLBACKS (`callback MAPCALLBACK_TILES, Label`): their `changeblock`s
// were dropped too (a TILES callback became a bare branch + end). They are
// restored in callback labels (and their .sublabels) only, each as the 4 grid
// cells of the target block harvested from our converted layouts.
const CR = path.join(MP66, 'Reference', 'pokecrystal');
const CALLBACK_LABELS = {};   // crystal map name -> Set(label)
for (const f of fs.readdirSync(path.join(CR, 'maps')).filter(f => f.endsWith('.asm'))) {
	for (const m of fs.readFileSync(path.join(CR, 'maps', f), 'utf8').matchAll(/callback MAPCALLBACK_\w+,\s*(\w+)/g))
		(CALLBACK_LABELS[f.replace('.asm', '')] = CALLBACK_LABELS[f.replace('.asm', '')] || new Set()).add(m[1]);
}
const inCallback = (mapName, label) => { const set = CALLBACK_LABELS[mapName]; return !!set && [...set].some(l => label === l || label.startsWith(l + '.')); };
const harvestBlock = makeHarvester(loadCrystalMaps(path.resolve('.'), CR));
// blocks no converted map uses: computed from the decomp with the converter's own
// code and validated against every harvested block (tools/gen_crystal_block_cells.mjs)
const BLOCK_CELLS = (() => { try { return JSON.parse(fs.readFileSync(path.join('tools', 'data', 'crystal_block_cells.json'), 'utf8')); } catch (e) { return {}; } })();
const blockCells = (mapName, ts, block) => harvestBlock(ts, block) || BLOCK_CELLS[mapName + ':' + block] || null;
const changeblockSkipped = [];

const trace = JSON.parse(execFileSync('python', [path.join('tools', 'crystal_trace.py'), path.join(MP66, 'tools'), path.join(MP66, 'Reference', 'pokecrystal', 'maps')], { maxBuffer: 1 << 28 }).toString());

const patches = {};
const STEMS = [];
let restored = 0, labels = 0;
const skipped = { handPatched: [], unresolved: [], notEnabled: new Set() }, bySource = {};
for (const f of fs.readdirSync(path.join(D, 'maps'))) {
	if (!f.endsWith('_map.json')) continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
	if (!j._crystal_tileset || !j.name || !trace[j.name]) continue;
	const stem = f.replace('_map.json', '');
	STEMS.push({ stem, name: j.name });
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
		LOCAL = localDefs(asm);
		const tally = k => { bySource[k] = (bySource[k] || 0) + 1; };
		// the dropped COMMANDS below (coins, setval, menus) are restored only in
		// labels on this list; elsewhere they're reported. Many other menus lead into
		// specials the engine doesn't implement (slots, link/mobile, vending), where a
		// restored menu would branch on a stale value.
		const newKinds = RESTORE_COMMANDS_IN.some(p => `${stem}:${label}`.startsWith(p));
		const wouldRestore = c => { if (!newKinds) { skipped.notEnabled.add(`${stem}:${label} (${c})`); return false; } return true; };
		for (const [cmd, a, conv] of rows) {
			if (!conv.length && ['checkcoins', 'takecoins', 'givecoins', 'checkmoney', 'takemoney', 'givepoke', 'setval', 'verticalmenu', 'random'].includes(cmd) && !wouldRestore(cmd)) { out.push(...conv); continue; }
			// commands the transpile dropped outright (conv empty) that the engine runs
			if (!conv.length && cmd === 'checkcoins' && evalExpr(a[0]) != null) { add({ op: 'checkcoins', amount: evalExpr(a[0]) }); n++; tally('checkcoins'); src = { var: 'VAR_RESULT', name: 'checkcoins' }; continue; }
			if (!conv.length && cmd === 'takecoins' && evalExpr(a[0]) != null) { add({ op: 'takecoins', amount: evalExpr(a[0]) }); n++; tally('takecoins'); continue; }
			if (!conv.length && cmd === 'givecoins' && evalExpr(a[0]) != null) { add({ op: 'givecoins', amount: evalExpr(a[0]) }); n++; tally('givecoins'); continue; }
			// Crystal's checkmoney answers HAVE_MORE 0 / HAVE_AMOUNT 1 / HAVE_LESS 2 (the
			// FireRed one the engine also runs answers 1/0) — `crystal: true` picks the 3-way
			if (!conv.length && cmd === 'checkmoney' && a[0] === 'YOUR_MONEY' && evalExpr(a[1]) != null) { add({ op: 'checkmoney', amount: evalExpr(a[1]), crystal: true }); n++; tally('checkmoney'); src = { var: 'VAR_RESULT', name: 'checkmoney' }; continue; }
			if (!conv.length && cmd === 'takemoney' && a[0] === 'YOUR_MONEY' && evalExpr(a[1]) != null) { add({ op: 'removemoney', amount: evalExpr(a[1]) }); n++; tally('takemoney'); continue; }
			// givepoke SPECIES, LEVEL (no held item / OT extras): party, or the PC when full
			if (!conv.length && cmd === 'givepoke' && a.length === 2 && /^[A-Z][A-Z0-9_]*$/.test(a[0]) && evalExpr(a[1]) != null) { add({ op: 'givemon', species: 'SPECIES_' + a[0], level: evalExpr(a[1]) }); n++; tally('givepoke'); src = null; continue; }
			// `random N` (0..N-1 into the script var), read by the ifequal after it
			if (!conv.length && cmd === 'random' && evalExpr(a[0]) != null) { add({ op: 'random', max: evalExpr(a[0]) }); n++; tally('random'); src = { var: 'VAR_RESULT', name: 'random' }; continue; }
			if (!conv.length && cmd === 'setval'&& evalExpr(a[0]) != null) { add({ op: 'setvar', var: 'VAR_RESULT', value: evalExpr(a[0]) }); n++; tally('setval'); src = { var: 'VAR_RESULT', name: 'setval' }; continue; }
			if (!conv.length && cmd === 'loadmenu') { menu = menuItems(asm, a[0], g); continue; }
			const scriptTiles = SCRIPT_TILES_IN.includes(`${stem}:${label}`);
			// warpcheck: take the warp under the player (the puzzle's fall into the hole)
			if (!conv.length && cmd === 'warpcheck' && scriptTiles) { add({ op: 'warpcheck' }); n++; tally('warpcheck'); continue; }
			// the player's-room poster sign (overworld/decorations.js); the doll and
			// console descriptions stay dropped — their objects never show
			if (!conv.length && cmd === 'describedecoration' && a[0] === 'DECODESC_POSTER' && `${stem}:${label}` === 'PlayersHouse2F:PlayersHousePosterScript.Script') {
				add({ op: 'special', name: 'DescribeDecoration', which: a[0] }); add({ op: 'end' }); n++; tally('describedecoration'); continue;
			}
			if (!conv.length && cmd === 'changeblock' && (inCallback(j.name, label) || scriptTiles)) {
				const x = evalExpr(a[0]), y = evalExpr(a[1]), block = parseInt(String(a[2]).replace('$', ''), 16);
				const cells = x != null && y != null && Number.isFinite(block) ? blockCells(j.name, j._crystal_tileset, block) : null;
				// changeblock x, y addresses the BLOCK containing that 16px cell
				if (cells) { add({ op: 'changeblock', x: Math.floor(x / 2) * 2, y: Math.floor(y / 2) * 2, cells }); n++; tally('changeblock'); }
				else changeblockSkipped.push(`${stem}:${label} changeblock ${a.join(',')}`);
				continue;
			}
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
			// a confirm subroutine ends in `yesorno` (the engine's prompt answers 1/0), and
			// giveitem answers 1/0 — both read by the iffalse after them (listed labels only)
			else if (newKinds && ['scall', 'giveitem', 'verbosegiveitem'].includes(cmd) && conv.length) src = { var: 'VAR_RESULT', name: cmd };
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
// ALL OR NOTHING per callback: a TILES callback whose changeblocks are only partly
// restorable could close an entrance without opening the exit (the Elite Four
// rooms: the entrance-closing block exists in our layouts, the exit-opening one
// doesn't) and trap the player. If any changeblock in a callback can't be
// restored, none of that callback's are — its tiles stay as the map draws them.
const brokenRoots = new Set(changeblockSkipped.map(x => { const [stem, rest] = x.split(':'); return stem + ':' + rest.split(' ')[0].split('.')[0]; }));
let withdrawn = 0;
for (const [stem, labels] of Object.entries(patches)) {
	for (const [label, ops] of Object.entries(labels)) {
		if (!brokenRoots.has(stem + ':' + label.split('.')[0])) continue;
		const kept = ops.filter(o => o.op !== 'changeblock');
		withdrawn += ops.length - kept.length;
		const crName = (STEMS.find(m => m.stem === stem) || {}).name;
		const fresh = (trace[crName] || {})[label];
		if (fresh && strip(kept) === strip(fresh.flatMap(r => r[2]))) delete labels[label]; else labels[label] = kept;
	}
	if (!Object.keys(labels).length) delete patches[stem];
}
console.log(`changeblock: withdrew ${withdrawn} from ${brokenRoots.size} callback(s) that are only partly restorable (all or nothing)`);
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_crystal_scriptvar.mjs', patches }));
console.log(`restored ${restored} dropped comparison(s) in ${labels} label(s) across ${Object.keys(patches).length} map(s)`);
console.log('by source:', JSON.stringify(bySource));
console.log(`skipped (hand-patched labels, left alone): ${skipped.handPatched.length}`, skipped.handPatched.join(' '));
console.log(`skipped (value not resolvable): ${skipped.unresolved.length}`, skipped.unresolved.join(' | '));
console.log('wrote ' + OUT);
console.log(`changeblocks not restorable (block never appears in a converted map of that tileset): ${changeblockSkipped.length}`, changeblockSkipped.join(' | '));
console.log(`dropped coin/setval/menu commands NOT restored (not on RESTORE_COMMANDS_IN): ${skipped.notEnabled.size}`);
for (const x of [...skipped.notEnabled].sort()) console.log('   ' + x);
