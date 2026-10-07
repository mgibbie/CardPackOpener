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
// labels the phone overlay rebuilds whole (see the colon-less split below)
const PHONE_OVERRIDDEN = new Set(Object.entries(JSON.parse(fs.readFileSync(path.join('overworld', 'phone_data.json'), 'utf8')).scriptOverrides || {})
	.flatMap(([stem, labels]) => Object.keys(labels).map(l => `${stem}:${l}`)));
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
	// the one-time gift POKeMON whose `givepoke` the transpile dropped (2026-10-07:
	// Kiyo's TYROGUE set its flag and gave nothing; Bill's EEVEE the same)
	'MountMortarB1F:MountMortarB1FKiyoScript', 'BillsFamilysHouse:BillScript',
	// RANDY's KENYA (a nicknamed SPEAROW carrying MAIL: givepoke's name/OT args +
	// givepokemail) and the Route 31 man who checks the mail (checkpokemail)
	'Route35GoldenrodGate:RandyScript', 'Route31:Route31MailRecipientScript',
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
// labels where the dropped WRAM bookkeeping comes back: `loadmem wX, N`,
// `readmem wX` + `addval N` + `writemem wX`, `setval N` + `writemem wX` (all as
// story vars, which is what the transpile already compares them as), and
// `moveobject OBJ, x, y` (setobjxy). Each read by hand (2026-10-07 bug reports):
// the Ilex Forest FARFETCH'D herding (wFarfetchdPosition + where the bird stands),
// MOOMOO's berry count (wMooMooBerries), and the Goldenrod Underground switch room
// (wUndergroundSwitchPositions, reset by the Underground and the Warehouse).
const MEM_RESTORE_IN = ['IlexForest:IlexForestFarfetchd', 'Route39Barn:MoomooScript',
	'GoldenrodUndergroundSwitchRoomEntrances:', 'GoldenrodUnderground:GoldenrodUndergroundResetSwitchesCallback',
	'GoldenrodUndergroundWarehouse:GoldenrodUndergroundWarehouseResetSwitchesCallback'];
// labels whose plain-script changeblocks / warpcheck are restored too (elsewhere
// only MAP CALLBACK changeblocks are)
// — and each chamber's WallOpenScript, the wall at (4,0) opening onto its item
// room (HoOh/OmanyteChamber specials, FLASH, an ESCAPE ROPE; ow_story.js)
const SCRIPT_TILES_IN = ['Kabuto', 'Omanyte', 'Aerodactyl', 'HoOh'].flatMap(c => [
	`RuinsOfAlph${c}Chamber:RuinsOfAlph${c}ChamberPuzzle.PuzzleComplete`, `RuinsOfAlph${c}Chamber:RuinsOfAlph${c}ChamberWallOpenScript`]);
// specials whose result the engine actually computes (ow_story.js runSpecial)
const ALLOW = new Set(['GetFirstPokemonHappiness', 'CheckFirstMonIsEgg', 'ReturnShuckie', 'GiveShuckle', 'MoveTutor', 'UnownPuzzle', 'PlayersHousePC']);
// commands that leave hScriptVar alone (display / movement); anything else between
// the writer and the test might overwrite it, so the restore stops there
const NEUTRAL = new Set(['writetext', 'promptbutton', 'waitbutton', 'closetext', 'opentext', 'faceplayer',
	'turnobject', 'pause', 'playsound', 'waitsfx', 'buttonsound', 'applymovement', 'cry', 'special_sound',
	'ifequal', 'ifnotequal', 'ifgreater', 'ifless', 'iftrue', 'iffalse', 'loadmenu', 'closewindow']);
const CONST = { PARTY_LENGTH: 6, NUM_POKEMON: 251, NUM_JOHTO_BADGES: 8, NUM_KANTO_BADGES: 8, NUM_BADGES: 16,
	MORN_HOUR: 4, DAY_HOUR: 10, NITE_HOUR: 18, TRUE: 1, FALSE: 0, MAX_COINS: 9999,
	// pokecrystal constants/script_constants.asm
	HAVE_MORE: 0, HAVE_AMOUNT: 1, HAVE_LESS: 2, MOVETUTOR_FLAMETHROWER: 1, MOVETUTOR_THUNDERBOLT: 2, MOVETUTOR_ICE_BEAM: 3,
	// checkpokemail answers
	POKEMAIL_WRONG_MAIL: 0, POKEMAIL_CORRECT: 1, POKEMAIL_REFUSED: 2, POKEMAIL_NO_MAIL: 3, POKEMAIL_LAST_MON: 4,
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
// a data label's strings: `Label:` then optional `db ITEM`, then `db "..."` /
// `next "..."` lines up to the one ending in `@` (GiftSpearowName, GiftSpearowMail)
function labelData(asm, label) {
	const lines = asm.split(/\r?\n/);
	const i = lines.findIndex(l => l.trim() === label + ':'); if (i < 0) return null;
	let item = null; const parts = [];
	for (let k = i + 1; k < lines.length && k < i + 8; k++) {
		const m = /^\s*(db|next)\s+(?:"([^"]*)"|([A-Z_][A-Z0-9_]*))/.exec(lines[k]); if (!m) break;
		if (m[3]) { item = m[3]; continue; }
		const t = m[2]; if (t.endsWith('@')) { parts.push(t.slice(0, -1)); return { item, text: parts.join('\n') }; }
		parts.push(t);
	}
	return null;
}
// rgbasm local labels written WITHOUT a colon (`.partyfull` alone on its line —
// 80 of them in 31 pokecrystal maps) never matched the transpiler's label
// pattern: their commands were traced as the tail of the label above, and every
// branch to them dangles (events.js falls through a missing label). RANDY's
// `.partyfull` / `.questcomplete` were unreachable: a full party still got KENYA,
// and the HP UP was never given. For a label on RESTORE_COMMANDS_IN, find them in
// the label's asm body: { row index -> ['.name', ...] }, or null when the body's
// command lines don't line up 1:1 with the traced rows (then leave it alone).
function colonlessSplits(asm, label, nRows) {
	const lines = asm.split(/\r?\n/);
	const g = label.split('.')[0], local = label.includes('.') ? label.slice(g.length) : null;
	let i = lines.findIndex(l => new RegExp('^' + g + '::?(\\s|;|$)').test(l)); if (i < 0) return null;
	if (local) { const k = lines.findIndex((l, j) => j > i && l.startsWith(local + ':')); if (k < 0) return null; i = k; }
	const at = new Map(); let n = 0;
	for (let k = i + 1; k < lines.length; k++) {
		const l = lines[k];
		if (/^\.?[A-Za-z_]\w*::?(\s|;|$)/.test(l)) break;   // the next colon label ends the traced body
		const bare = /^(\.[A-Za-z_]\w*)\s*(;.*)?$/.exec(l);
		if (bare) { if (!at.has(n)) at.set(n, []); at.get(n).push(bare[1]); continue; }
		if (/^\s+[a-z_]\w*/.test(l)) n++;                    // a command line
	}
	return at.size && n === nRows ? at : null;
}
// does the label's traced body hold any colon-less local label at all?
function hasColonless(asm, label) {
	const lines = asm.split(/\r?\n/);
	const g = label.split('.')[0], local = label.includes('.') ? label.slice(g.length) : null;
	let i = lines.findIndex(l => new RegExp('^' + g + '::?(\\s|;|$)').test(l)); if (i < 0) return false;
	if (local) { const k = lines.findIndex((l, j) => j > i && l.startsWith(local + ':')); if (k < 0) return false; i = k; }
	for (let k = i + 1; k < lines.length; k++) {
		if (/^\.?[A-Za-z_]\w*::?(\s|;|$)/.test(lines[k])) return false;
		if (/^\.[A-Za-z_]\w*\s*(;.*)?$/.test(lines[k])) return true;
	}
	return false;
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
const skipped = { handPatched: [], unresolved: [], notEnabled: new Set(), colonlessUnaligned: [], colonlessHandPatched: [] }, bySource = {};
let split = 0;
const FALLTHROUGH = (() => { try { return JSON.parse(fs.readFileSync(path.join('overworld', 'fallthrough_data.json'), 'utf8')).edges || {}; } catch (e) { return {}; } })();
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
		const memKinds = MEM_RESTORE_IN.some(p => `${stem}:${label}`.startsWith(p));
		let lastGive = null; // the givemon op a following givepokemail attaches its MAIL to
		let acc = null;   // the script var as readmem/setval/addval leave it, for writemem
		// every label's colon-less local labels are split out (2026-10-07: 29 branch
		// targets on 17 maps dangled — Mr. POKeMON's `.refused`, the Dept. Store 5F
		// clerk's TM menu, Burned Tower's rival); not only the restore-listed ones
		// ...except a label the phone overlay (phone_data.json scriptOverrides, laid
		// over this one at load) already rebuilds whole: its `.Script` body lives
		// under the parent there, so a split-out `.Script` here would shadow the phone
		// version for the trainer's post-battle pointer (Route 38 Dana, Chad; Joey)
		const subAt = PHONE_OVERRIDDEN.has(`${stem}:${label}`) ? null : colonlessSplits(asm, label, rows.length);
		if (!subAt && !PHONE_OVERRIDDEN.has(`${stem}:${label}`) && hasColonless(asm, label)) skipped.colonlessUnaligned.push(`${stem}:${label}`);
		for (const [ri, [cmd, a, conv]] of rows.entries()) {
			// a colon-less local label starts here: mark it (split below), and nothing
			// before it answers a branch after it — control can arrive by a jump
			if (subAt?.has(ri)) { for (const nm of subAt.get(ri)) add({ op: '__label__', name: qualify(nm, g) }); src = null; acc = null; }
			if (memKinds && !conv.length) {
				if (cmd === 'loadmem' && /^w\w+$/.test(a[0]) && evalExpr(a[1]) != null) { add({ op: 'setvar', var: a[0], value: evalExpr(a[1]) }); n++; tally('loadmem'); continue; }
				if (cmd === 'readmem' && /^w\w+$/.test(a[0])) { acc = { var: a[0], delta: 0 }; continue; }
				if (cmd === 'setval' && evalExpr(a[0]) != null) { acc = { value: evalExpr(a[0]) }; continue; }
				if (cmd === 'addval' && acc && evalExpr(a[0]) != null) { if ('value' in acc) acc.value += evalExpr(a[0]); else acc.delta += evalExpr(a[0]); continue; }
				if (cmd === 'writemem' && acc && /^w\w+$/.test(a[0])) {
					if ('value' in acc) add({ op: 'setvar', var: a[0], value: acc.value });
					else if (acc.var === a[0] && acc.delta) add({ op: 'addvar', var: a[0], value: acc.delta });
					else continue;
					n++; tally('writemem'); continue;
				}
				if (cmd === 'moveobject' && a.length === 3 && evalExpr(a[1]) != null && evalExpr(a[2]) != null) { add({ op: 'setobjxy', who: a[0], x: evalExpr(a[1]), y: evalExpr(a[2]) }); n++; tally('moveobject'); continue; }
			}
			if (!conv.length && ['checkcoins', 'takecoins', 'givecoins', 'checkmoney', 'takemoney', 'givepoke', 'givepokemail', 'checkpokemail', 'setval', 'verticalmenu', 'random'].includes(cmd) && !wouldRestore(cmd)) { out.push(...conv); continue; }
			// commands the transpile dropped outright (conv empty) that the engine runs
			if (!conv.length && cmd === 'checkcoins' && evalExpr(a[0]) != null) { add({ op: 'checkcoins', amount: evalExpr(a[0]) }); n++; tally('checkcoins'); src = { var: 'VAR_RESULT', name: 'checkcoins' }; continue; }
			if (!conv.length && cmd === 'takecoins' && evalExpr(a[0]) != null) { add({ op: 'takecoins', amount: evalExpr(a[0]) }); n++; tally('takecoins'); continue; }
			if (!conv.length && cmd === 'givecoins' && evalExpr(a[0]) != null) { add({ op: 'givecoins', amount: evalExpr(a[0]) }); n++; tally('givecoins'); continue; }
			// Crystal's checkmoney answers HAVE_MORE 0 / HAVE_AMOUNT 1 / HAVE_LESS 2 (the
			// FireRed one the engine also runs answers 1/0) — `crystal: true` picks the 3-way
			if (!conv.length && cmd === 'checkmoney' && a[0] === 'YOUR_MONEY' && evalExpr(a[1]) != null) { add({ op: 'checkmoney', amount: evalExpr(a[1]), crystal: true }); n++; tally('checkmoney'); src = { var: 'VAR_RESULT', name: 'checkmoney' }; continue; }
			if (!conv.length && cmd === 'takemoney' && a[0] === 'YOUR_MONEY' && evalExpr(a[1]) != null) { add({ op: 'removemoney', amount: evalExpr(a[1]) }); n++; tally('takemoney'); continue; }
			// givepoke SPECIES, LEVEL, ITEM, NickLabel, OTLabel: a named gift with the giver
			// as OT. GivePoke (engine/pokemon/move_mon.asm) gives a party mon with an OT
			// name the ID RANDY_OT_ID (01001) — RANDY's KENYA is the only one in Crystal
			if (!conv.length && cmd === 'givepoke' && a.length === 5 && newKinds && /^[A-Z][A-Z0-9_]*$/.test(a[0]) && evalExpr(a[1]) != null) {
				const nick = labelData(asm, a[3]), ot = labelData(asm, a[4]);
				if (nick && ot) {
					lastGive = { op: 'givemon', species: 'SPECIES_' + a[0], level: evalExpr(a[1]), nickname: nick.text, otName: ot.text, otId: 1001 };
					if (a[2] !== 'NO_ITEM') lastGive.item = 'ITEM_' + a[2];
					add(lastGive); n++; tally('givepoke'); src = null; continue;
				}
			}
			// givepokemail Label: the mon just given holds that MAIL (item + message)
			if (!conv.length && cmd === 'givepokemail' && lastGive && newKinds) {
				const m = labelData(asm, a[0]);
				if (m && m.item) { lastGive.item = 'ITEM_' + m.item; lastGive.mail = m.text; tally('givepokemail'); continue; }
			}
			// checkpokemail Text: pick a party mon; its MAIL must read Text (mail.asm
			// CheckPokeMail) — answers POKEMAIL_* in the script var
			if (!conv.length && cmd === 'checkpokemail' && newKinds) {
				const m = labelData(asm, a[0]);
				if (m) { add({ op: 'special', name: 'CheckPokeMail', text: m.text }); n++; tally('checkpokemail'); src = { var: 'VAR_RESULT', name: 'checkpokemail' }; continue; }
			}
			// givepoke SPECIES, LEVEL (no held item / OT extras): party, or the PC when full
			if (!conv.length && cmd === 'givepoke' && a.length === 2 && /^[A-Z][A-Z0-9_]*$/.test(a[0]) && evalExpr(a[1]) != null) { add({ op: 'givemon', species: 'SPECIES_' + a[0], level: evalExpr(a[1]) }); n++; tally('givepoke'); src = null; continue; }
			// `random N` (0..N-1 into the script var), read by the ifequal after it
			if (!conv.length && cmd === 'random' && evalExpr(a[0]) != null) { add({ op: 'random', max: evalExpr(a[0]) }); n++; tally('random'); src = { var: 'VAR_RESULT', name: 'random' }; continue; }
			if (!conv.length && cmd === 'setval'&& evalExpr(a[0]) != null) { add({ op: 'setvar', var: 'VAR_RESULT', value: evalExpr(a[0]) }); n++; tally('setval'); src = { var: 'VAR_RESULT', name: 'setval' }; continue; }
			if (!conv.length && cmd === 'loadmenu') { menu = menuItems(asm, a[0], g); continue; }
			const scriptTiles = SCRIPT_TILES_IN.includes(`${stem}:${label}`);
			// warpcheck: take the warp under the player (the puzzle's fall into the hole)
			if (!conv.length && cmd === 'warpcheck' && scriptTiles) { add({ op: 'warpcheck' }); n++; tally('warpcheck'); continue; }
			// the player's-room describedecoration sign and objects (overworld/decorations.js):
			// the poster, both dolls, the big doll and the game console
			if (!conv.length && cmd === 'describedecoration' && stem === 'PlayersHouse2F' && /^DECODESC_[A-Z_]+$/.test(a[0])) {
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
				// a facing (UP/DOWN/LEFT/RIGHT) stays a symbol: VAR_FACING's encoding is
				// the port's own (script_constants.js), which the engine resolves
				const value = tf ? 0 : (evalExpr(a[0]) ?? (src.var === 'VAR_FACING' && /^(UP|DOWN|LEFT|RIGHT)$/.test(a[0]) ? a[0] : null));
				const target = tf ? a[0] : a[1];
				if (value == null || !target) { skipped.unresolved.push(`${stem}:${label} ${cmd} ${a.join(',')}`); }
				else {
					const cmp = { ifequal: 'eq', ifnotequal: 'ne', ifgreater: 'gt', ifless: 'lt', iftrue: 'ne', iffalse: 'eq' }[cmd];
					add({ op: 'branch', kind: 'goto', cond: { var: src.var, cmp, value }, label: qualify(target, g) });
					n++; bySource[src.name] = (bySource[src.name] || 0) + 1;
				}
			}
			out.push(...conv);
			// an `scall` to a helper that ends in `readvar V` (Ilex Forest's
			// .CryAndCheckFacing) answers V to the ifequal after the call
			const calleeVar = memKinds && cmd === 'scall' && conv.length
				? ((trace[j.name][qualify(a[0], g)] || []).filter(r => r[0] === 'readvar').pop() || [])[1]?.[0] : null;
			if (calleeVar) src = { var: calleeVar, name: 'scall readvar' };
			else if (cmd === 'special') src = ALLOW.has(a[0]) ? { var: 'VAR_RESULT', name: 'special ' + a[0] } : null;
			else if (cmd === 'readvar' && a[0]) src = { var: a[0], name: 'readvar ' + a[0] };
			// a confirm subroutine ends in `yesorno` (the engine's prompt answers 1/0), and
			// giveitem answers 1/0 — both read by the iffalse after them (listed labels only)
			else if (newKinds && ['scall', 'giveitem', 'verbosegiveitem'].includes(cmd) && conv.length) src = { var: 'VAR_RESULT', name: cmd };
			else if (!NEUTRAL.has(cmd)) src = null;
		}
		if (!n && !subAt) continue;
		if (strip(ours[label]) !== strip(fresh)) { (n ? skipped.handPatched : skipped.colonlessHandPatched).push(`${stem}:${label}`); continue; }
		// keep our copy's movement steps: splice into OUR ops at the same positions
		const merged = []; let oi = 0;
		for (const op of out) {
			if (inserted.has(op)) { merged.push(op); continue; }   // a restored op
			merged.push(ours[label][oi++]);
		}
		// cut at the colon-less labels; a block that doesn't end runs on into the next
		const segs = [{ name: label, ops: [] }];
		for (const op of merged) { if (op && op.op === '__label__') segs.push({ name: op.name, ops: [] }); else segs[segs.length - 1].ops.push(op); }
		// the last piece inherits the label's own fall-through into the next colon
		// label (fallthrough_data.json — fallthrough.js only sees the head, which
		// now ends in a goto to its first piece)
		const tailNext = FALLTHROUGH[stem]?.[label];
		segs.forEach((sg, si) => {
			const last = sg.ops[sg.ops.length - 1];
			const next = si + 1 < segs.length ? segs[si + 1].name : (segs.length > 1 ? tailNext : null);
			if (next && !(last && ['end', 'return', 'goto'].includes(last.op))) sg.ops.push({ op: 'goto', label: next });
			(patches[stem] = patches[stem] || {})[sg.name] = sg.ops;
		});
		if (segs.length > 1) { tally('colonless labels'); split += segs.length - 1; }
		restored += n; labels++;
	}
}
// The Goldenrod Underground switch room's doors are rgbasm macro LOOPS — `for n`
// over the `ugdoor_def` table builds .OpenDoorN / .CloseDoorN (changeugdoor +
// set/clear EVENT_DOOR_N_OPEN) and the TILES callback's per-door checks. The
// transpile can't expand a `for`, so all 22 labels the switch positions `scall`
// were missing and the callback was a broken template: no switch ever opened a
// door (2026-10-07). Expanded here from the table, the decomp's own block ids.
{
	const NAME = 'GoldenrodUndergroundSwitchRoomEntrances';
	const m = STEMS.find(s => s.name === NAME);
	const asm = fs.readFileSync(path.join(CR, 'maps', NAME + '.asm'), 'utf8');
	const doors = [...asm.matchAll(/^\s*ugdoor_def\s+([^;\n]+)/gm)].map(r => {
		const v = r[1].split(',').map(s => s.trim());
		const parts = [];
		for (let i = 0; i + 3 < v.length; i += 4) parts.push({ x: +v[i], y: +v[i + 1], closed: parseInt(v[i + 2].replace('$', ''), 16), open: parseInt(v[i + 3].replace('$', ''), 16) });
		return parts;
	});
	const ts = m && JSON.parse(fs.readFileSync(path.join(D, 'maps', m.stem + '_map.json'), 'utf8'))._crystal_tileset;
	const blocks = (d, state) => d.map(p => {
		const cells = blockCells(NAME, ts, p[state]);
		return cells && { op: 'changeblock', x: Math.floor(p.x / 2) * 2, y: Math.floor(p.y / 2) * 2, cells };
	});
	const all = doors.flatMap(d => [...blocks(d, 'open'), ...blocks(d, 'closed')]);
	if (!m || doors.length !== 11 || all.some(x => !x)) console.log(`switch room doors NOT restored (${m ? doors.length + ' doors, ' + all.filter(x => !x).length + ' blocks unharvestable' : 'map missing'})`);
	else {
		const P = (patches[m.stem] = patches[m.stem] || {});
		const U = 'GoldenrodUndergroundSwitchRoomEntrances_UpdateDoors';
		const CB = 'GoldenrodUndergroundSwitchRoomEntrancesUpdateDoorPositionsCallback';
		doors.forEach((d, i) => {
			const n = i + 1, flag = `EVENT_DOOR_${n}_OPEN`;
			P[`${U}.OpenDoor${n}`] = [...blocks(d, 'open'), { op: 'setflag', flag }, { op: 'end' }];
			P[`${U}.CloseDoor${n}`] = [...blocks(d, 'closed'), { op: 'clearflag', flag }, { op: 'end' }];
			// the callback: each open door's blocks, door by door
			const here = n === 1 ? CB : `${CB}.door_${n - 1}_closed`;
			P[here] = [{ op: 'branch', kind: 'goto', cond: { flag, state: false }, label: `${CB}.door_${n}_closed` }, ...blocks(d, 'open'), { op: 'goto', label: `${CB}.door_${n}_closed` }];
		});
		P[`${CB}.door_${doors.length}_closed`] = [{ op: 'end' }];
		// the loop templates' unexpandable changeblocks are handled here, not withdrawn
		for (let k = changeblockSkipped.length - 1; k >= 0; k--) if (changeblockSkipped[k].startsWith(`${m.stem}:${CB}`) || changeblockSkipped[k].startsWith(`${m.stem}:${U}`)) changeblockSkipped.splice(k, 1);
		restored += doors.length * 3; labels += doors.length * 3 + 1;
		console.log(`switch room: ${doors.length} doors -> ${doors.length * 2} door labels + the callback`);
	}
}
// Event scripts behind a GLOBAL label (`CardKeySlotScript::`, `BasementDoorScript::`
// — exported for other banks) were never transpiled: the converter only took
// `Label:` scripts, so the Radio Tower's CARD KEY slot and the Goldenrod
// Underground's BASEMENT KEY door read their sign and then ran nothing, and the
// Radio Tower takeover could not be finished (2026-10-07). A label a map's event
// points at that our scripts lack entirely is rebuilt here from the trace (its
// converted ops, plus its dropped changeblocks), with its .sublabels.
let globalsRestored = 0;
for (const { stem, name } of STEMS) {
	const asmFile = path.join(CR, 'maps', name + '.asm');
	if (!fs.existsSync(asmFile) || !trace[name]) continue;
	const asm = fs.readFileSync(asmFile, 'utf8');
	const sf = path.join(D, 'scripts', stem + '.json');
	const ours = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
	const refs = new Set();
	for (const m of asm.matchAll(/^\s*(?:bg_event\s+[^,\n]+,[^,\n]+,\s*\w+|coord_event\s+[^,\n]+,[^,\n]+,\s*\w+),\s*(\w+)/gm)) refs.add(m[1]);
	for (const m of asm.matchAll(/^\s*object_event\s+([^\n;]+)/gm)) { const s = m[1].split(',').map(v => v.trim())[11]; if (s) refs.add(s); }
	const ts = JSON.parse(fs.readFileSync(path.join(D, 'maps', stem + '_map.json'), 'utf8'))._crystal_tileset;
	for (const L of refs) {
		if (!new RegExp('^' + L + '::', 'm').test(asm) || L in ours || patches[stem]?.[L] || !trace[name][L]) continue;
		for (const [label, rows] of Object.entries(trace[name])) {
			if (label !== L && !label.startsWith(L + '.')) continue;
			const ops = [];
			for (const [cmd, a, conv] of rows) {
				if (!conv.length && cmd === 'changeblock') {
					const x = evalExpr(a[0]), y = evalExpr(a[1]), block = parseInt(String(a[2]).replace('$', ''), 16);
					const cells = x != null && y != null && Number.isFinite(block) ? blockCells(name, ts, block) : null;
					if (cells) ops.push({ op: 'changeblock', x: Math.floor(x / 2) * 2, y: Math.floor(y / 2) * 2, cells });
					else changeblockSkipped.push(`${stem}:${label} changeblock ${a.join(',')}`);
					continue;
				}
				ops.push(...conv);
			}
			(patches[stem] = patches[stem] || {})[label] = ops;
			globalsRestored++;
		}
	}
}
console.log(`global-label event scripts restored: ${globalsRestored} label(s)`);
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
console.log(`colon-less local labels split out: ${split}; NOT split — body doesn't line up with the trace: ${skipped.colonlessUnaligned.length}`, skipped.colonlessUnaligned.join(' '), `| hand-patched: ${skipped.colonlessHandPatched.length}`, skipped.colonlessHandPatched.join(' '));
console.log(`skipped (value not resolvable): ${skipped.unresolved.length}`, skipped.unresolved.join(' | '));
console.log('wrote ' + OUT);
console.log(`changeblocks not restorable (block never appears in a converted map of that tileset): ${changeblockSkipped.length}`, changeblockSkipped.join(' | '));
console.log(`dropped coin/setval/menu commands NOT restored (not on RESTORE_COMMANDS_IN): ${skipped.notEnabled.size}`);
for (const x of [...skipped.notEnabled].sort()) console.log('   ' + x);
