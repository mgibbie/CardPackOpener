// decorations.js — the player's-room DECORATIONS of pokecrystal
// (engine/overworld/decorations.asm + the house PC, engine/events/pokecenter_pc.asm).
//
// Crystal keeps one decoration per slot (wDecoBed, wDecoCarpet, wDecoPlant,
// wDecoPoster, wDecoConsole, wDecoLeft/RightOrnament, wDecoBigDoll); a new game
// starts with InitDecorations' FEATHERY BED and TOWN MAP poster, and owns a
// decoration while its EVENT_DECO_* flag is set (InitializeEventsScript sets the
// bed's and the poster's).
//
// The PC in PlayersHouse2F (`special PlayersHousePC`) turns on, asks what to do
// and offers DECORATION: the categories you own something in, then per category
// your decorations + PUT IT AWAY + CANCEL (an ORNAMENT asks RIGHT SIDE / LEFT
// SIDE first). Changing anything ends the PC session and answers TRUE, and the
// map script's `iftrue .Warp` reloads the room (`warp NONE`, events.js).
//
// Entering PlayersHouse2F runs two callbacks: ToggleDecorationsVisibility
// shows/hides the console, doll and big-doll objects (npcs.js draws each with the
// placed decoration's sprite, decoSpriteFor), and ToggleMaptileDecorations stamps
// the bed / plant / poster / carpet blocks into the room and sets
// EVENT_PLAYERS_ROOM_POSTER while a poster hangs. describedecoration reads the
// poster, a doll, the console or the big doll.
//
// Data: overworld/crystal_decorations.json (tools/gen_crystal_decorations.mjs);
// sprites: overworld/deco_gfx/ (tools/gen_crystal_deco_sprites.py).
import * as Story from './events.js';
import { cutscene, dialog, world } from './ow_core.js';
import { safeLoad, safeSave } from './safestore.js';
import { startChoice, MULTI_B_PRESSED } from './choice.js';
import { sfx } from './sound.js';

const KEY = 'magepunk_crystal_deco_v1';
const SLOTS = ['bed', 'carpet', 'plant', 'poster', 'console', 'leftOrnament', 'rightOrnament', 'bigDoll'];
let DATA = { init: {}, coords: {}, decos: {}, categories: [], text: {}, pc: {}, sides: [] };
let SHEET = null;
export async function loadCrystalDecorations(getJSON, getImage) {
	DATA = (await getJSON('crystal_decorations.json').catch(() => null)) || DATA;
	if (getImage) SHEET = await getImage('deco_gfx/sprites.png').catch(() => null);
	SPRITES = (await getJSON('deco_gfx/sprites.json').catch(() => null)) || {};
}
let SPRITES = {};

// the room's slots: InitDecorations' defaults until the PC changes one
export function decoState() {
	const st = { ...Object.fromEntries(SLOTS.map(s => [s, null])), ...DATA.init, ...(safeLoad(KEY, null) || {}) };
	for (const s of SLOTS) if (st[s] && !DATA.decos[st[s]]) st[s] = null;   // a stale id never breaks the room
	return st;
}
function saveState(st) { safeSave(KEY, Object.fromEntries(SLOTS.map(s => [s, st[s] || null]))); }
const nameOf = id => (DATA.decos[id] && DATA.decos[id].name) || '';
const owns = id => !!(DATA.decos[id] && Story.getFlag(DATA.decos[id].flag));
// for the Dept Store DOLL COUNTER (dept_dolls.js)
export const decoName = id => nameOf(id);
export const decoOwned = id => owns(id);
export const decoFlag = id => (DATA.decos[id] && DATA.decos[id].flag) || null;
const fill = (t, a = {}) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => k === 'player'
	? ((typeof localStorage !== 'undefined' && localStorage.getItem('magepunk_name')) || 'PLAYER') : (a[k] ?? m));

// ToggleDecorationsVisibility: an empty console / doll slot hides its object
// (sets its flag); a filled one shows it, wearing the decoration's sprite
const OBJECT_FLAGS = { console: 'EVENT_PLAYERS_HOUSE_2F_CONSOLE', leftOrnament: 'EVENT_PLAYERS_HOUSE_2F_DOLL_1',
	rightOrnament: 'EVENT_PLAYERS_HOUSE_2F_DOLL_2', bigDoll: 'EVENT_PLAYERS_HOUSE_2F_BIG_DOLL' };
export function toggleDecorationsVisibility() {
	const st = decoState();
	for (const [slot, flag] of Object.entries(OBJECT_FLAGS)) { if (st[slot]) Story.clearFlag(flag); else Story.setFlag(flag); }
}
// the variable sprites (SPRITE_CONSOLE / DOLL_1 / DOLL_2 / BIG_DOLL) of the room's
// objects: { img, sx, sy, w, h } for npcs.js, or null (an empty slot / no sheet)
const OBJECT_SLOT = { OBJ_EVENT_GFX_CONSOLE: 'console', OBJ_EVENT_GFX_DOLL_1: 'leftOrnament',
	OBJ_EVENT_GFX_DOLL_2: 'rightOrnament', OBJ_EVENT_GFX_BIG_DOLL: 'bigDoll' };
export function decoSpriteFor(ev) {
	if (!ev || world.current?.name !== DATA.room) return null;
	const slot = OBJECT_SLOT[ev.graphics_id];
	const d = slot && DATA.decos[decoState()[slot]];
	const r = d && d.sprite && SPRITES[d.sprite];
	return r && SHEET ? { img: SHEET, sx: r.x, sy: r.y, w: r.w, h: r.h, big: slot === 'bigDoll' } : null;
}
export const isDecoObject = ev => !!(ev && OBJECT_SLOT[ev.graphics_id]);

// ToggleMaptileDecorations: bed (0,4), plant (7,4), poster (6,0) — changeblock
// coordinates, so each names the 2x2 cells of its block — then SetPosterVisibility,
// then the carpet: its block at the top-left (0,0) and block+1, +2, +1 along (0,2)
// Crystal reloads the room from its .blk first; the port keeps the rendered map
// in a cache that changeblock writes into, so the room's own cells under every
// decoration spot are remembered on the bundle the first time and put back first
// (else a put-away carpet would stay on the floor).
const SPOTS = () => [DATA.coords.bed, DATA.coords.plant, DATA.coords.poster, DATA.coords.carpetTop,
	...[0, 1, 2].map(i => DATA.coords.carpetBottom && [DATA.coords.carpetBottom[0] + i * 2, DATA.coords.carpetBottom[1]])].filter(Boolean);
export function toggleMaptileDecorations() {
	const st = decoState();
	const cellsAt = at => { const x = Math.floor(at[0] / 2) * 2, y = Math.floor(at[1] / 2) * 2; return [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]; };
	const stamp = (at, cells) => cellsAt(at).forEach(([x, y], q) => world.setGridValue(x, y, cells[q]));
	const cur = world.current;
	if (cur && !cur.decoBase) cur.decoBase = SPOTS().map(at => [at, cellsAt(at).map(([x, y]) => world.gridAt(x, y))]);
	for (const [at, cells] of (cur && cur.decoBase) || []) stamp(at, cells);
	for (const slot of ['bed', 'plant', 'poster']) {
		const d = DATA.decos[st[slot]], at = DATA.coords[slot];
		if (d && at && d.cells) stamp(at, d.cells);
	}
	if (st.poster) Story.setFlag('EVENT_PLAYERS_ROOM_POSTER'); else Story.clearFlag('EVENT_PLAYERS_ROOM_POSTER');
	const c = DATA.decos[st.carpet];
	if (c && c.carpet && DATA.coords.carpetTop && DATA.coords.carpetBottom) {
		const [tx, ty] = DATA.coords.carpetTop, [bx, by] = DATA.coords.carpetBottom;
		stamp([tx, ty], c.carpet[0]);
		[1, 2, 1].forEach((k, i) => stamp([bx + i * 2, by], c.carpet[k]));
	}
}

// describedecoration: DECODESC_POSTER (the hung poster's line; the TOWN MAP's
// opens the map), _LEFT_DOLL / _RIGHT_DOLL / _CONSOLE ("It's an adorable ..."),
// _BIG_DOLL ("A giant doll!")
export function describeDecoration(which, openTownMap) {
	const st = decoState();
	if (which === 'DECODESC_POSTER') {
		const d = DATA.decos[st.poster];
		if (!d || !d.text) return;   // DecorationDesc_NullPoster
		dialog.open(d.text, d.townMap && openTownMap ? () => openTownMap() : undefined);
		return;
	}
	if (which === 'DECODESC_BIG_DOLL') { dialog.open(DATA.text.giant); return; }
	const slot = { DECODESC_LEFT_DOLL: 'leftOrnament', DECODESC_RIGHT_DOLL: 'rightOrnament', DECODESC_CONSOLE: 'console' }[which];
	if (slot) dialog.open(fill(DATA.text.adorable, { 3: nameOf(st[slot]) }));
}

// ---------- the house PC (`special PlayersHousePC`) ----------
// _PlayersHousePC: turn on, then the menu until TURN OFF (or B); a DECORATION
// session that changed something ends the PC at once and answers TRUE.
export function playersHousePC(done) {
	sfx('pc_on');
	const finish = changed => done(changed ? 1 : 0);
	const menu = () => startChoice({
		options: [DATA.pc.decoration, DATA.pc.turnOff], promptText: fill(DATA.pc.askWhatDo), ignoreB: false, list: 'PLAYERS_PC',
		onPick: i => {
			if (i !== 0) return finish(false);
			decorationMenu(changed => changed ? finish(true) : menu());
		},
	});
	dialog.open(fill(DATA.pc.turnOn), menu);
	return 'wait';
}

// _PlayerDecorationMenu: the categories you own something in + EXIT, cursor
// remembered between visits (wCurDecorationCategory)
export function decorationMenu(done) {
	let changed = false, cursor = 0;
	const top = () => {
		const cats = DATA.categories.filter(c => c.decos.some(owns));
		const opts = cats.map(c => c.name).concat(DATA.exit || 'EXIT');
		startChoice({
			options: opts, default: Math.min(cursor, opts.length - 1), ignoreB: false, list: 'DECORATION',
			onPick: i => {
				if (i === MULTI_B_PRESSED || i >= cats.length) return done(changed);
				cursor = i;
				categoryMenu(cats[i], c => { if (c) changed = true; top(); });
			},
		});
	};
	top();
}

// PopulateDecoCategoryMenu: your decorations in the category, PUT IT AWAY, CANCEL
function categoryMenu(cat, back) {
	const owned = cat.decos.filter(owns);
	if (!owned.length) return dialog.open(DATA.text.nothingToChoose, () => back(false));
	const opts = owned.map(nameOf).concat(DATA.putAway || 'PUT IT AWAY', DATA.cancel || 'CANCEL');
	startChoice({
		options: opts, ignoreB: false, list: 'DECORATION_' + cat.slot.toUpperCase(),
		onPick: i => {
			if (i === MULTI_B_PRESSED || i === owned.length + 1) return back(false);   // CANCEL / B
			const putAway = i === owned.length;
			if (cat.slot === 'ornament') return putAway ? ornamentPutAway(back) : ornamentSetUp(owned[i], back);
			return putAway ? slotPutAway(cat.slot, back) : slotSetUp(cat.slot, owned[i], back);
		},
	});
}

// DecoAction_TrySetItUp / DecoAction_SetItUp
function slotSetUp(slot, id, back) {
	const st = decoState(), cur = st[slot];
	if (cur === id) return dialog.open(DATA.text.alreadySetUp, () => back(false));
	const msg = cur ? fill(DATA.text.putAwayAndSetUp, { 3: nameOf(cur), 4: nameOf(id) }) : fill(DATA.text.setUp, { 3: nameOf(id) });
	st[slot] = id; saveState(st);
	dialog.open(msg, () => back(true));
}
// DecoAction_TryPutItAway
function slotPutAway(slot, back) {
	const st = decoState(), cur = st[slot];
	if (!cur) return dialog.open(DATA.text.nothingToPutAway, () => back(false));
	st[slot] = null; saveState(st);
	dialog.open(fill(DATA.text.putAway, { 3: nameOf(cur) }), () => back(true));
}
// DecoAction_AskWhichSide: RIGHT SIDE (1) / LEFT SIDE (2) / CANCEL
function askSide(prompt, then, back) {
	startChoice({
		options: DATA.sides, promptText: prompt, ignoreB: false, list: 'DECO_SIDE',
		onPick: i => (i === 0 || i === 1) ? then(i === 0 ? 'rightOrnament' : 'leftOrnament', i === 0 ? 'leftOrnament' : 'rightOrnament') : back(false),
	});
}
// DecoAction_setupornament: the chosen side takes it; if the OTHER side holds the
// same doll, that side is emptied (it moved)
function ornamentSetUp(id, back) {
	askSide(DATA.text.whichSidePutOn, (side, other) => {
		const st = decoState(), cur = st[side];
		if (cur === id) return dialog.open(DATA.text.alreadySetUp, () => back(false));
		const msg = cur ? fill(DATA.text.putAwayAndSetUp, { 3: nameOf(cur), 4: nameOf(id) }) : fill(DATA.text.setUp, { 3: nameOf(id) });
		st[side] = id;
		if (st[other] === id) st[other] = null;
		saveState(st);
		dialog.open(msg, () => back(true));
	}, back);
}
// DecoAction_putawayornament
function ornamentPutAway(back) {
	askSide(DATA.text.whichSidePutAway, side => {
		const st = decoState(), cur = st[side];
		if (!cur) return dialog.open(DATA.text.nothingToPutAway, () => back(false));
		st[side] = null; saveState(st);
		dialog.open(fill(DATA.text.putAway, { 3: nameOf(cur) }), () => back(true));
	}, back);
}

// the runSpecial hook: the result lands in the script var for `iftrue .Warp`
export function playersHousePCSpecial() {
	return playersHousePC(changed => { Story.setVar('VAR_RESULT', changed); cutscene.resume(); });
}
