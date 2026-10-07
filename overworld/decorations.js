// decorations.js — the player's-room DECORATIONS of pokecrystal
// (engine/overworld/decorations.asm), a minimal faithful slice.
//
// Crystal keeps one decoration per slot (wDecoBed, wDecoPoster, ...) and a new
// game starts with InitDecorations' FEATHERY BED and TOWN MAP poster. Entering
// PlayersHouse2F runs two callbacks: ToggleDecorationsVisibility shows/hides the
// console and doll objects, and ToggleMaptileDecorations stamps each slot's block
// into the room and sets EVENT_PLAYERS_ROOM_POSTER while a poster hangs — which
// is what makes the poster's BGEVENT_IFSET sign readable at all. Reading it runs
// describedecoration DECODESC_POSTER: the hung poster's line (the TOWN MAP's
// opens the map). Data: overworld/crystal_decorations.json
// (tools/gen_crystal_decorations.mjs). Not here yet: the PC's DECORATION menu
// (choosing what to put up), carpets, consoles and dolls (their slots stay empty).
import * as Story from './events.js';
import { dialog, world } from './ow_core.js';
import { safeLoad } from './safestore.js';

const KEY = 'magepunk_crystal_deco_v1';
let DATA = { init: {}, coords: {}, decos: {} };
export async function loadCrystalDecorations(getJSON) {
	DATA = (await getJSON('crystal_decorations.json').catch(() => null)) || DATA;
}
// the room's slots: InitDecorations' defaults until the PC menu changes one
export function decoState() {
	return { bed: null, carpet: null, plant: null, poster: null, console: null, leftOrnament: null, rightOrnament: null, bigDoll: null,
		...DATA.init, ...(safeLoad(KEY, null) || {}) };
}

// ToggleDecorationsVisibility: an empty console / doll slot hides its object
// (sets its flag); a filled one shows it (the sprite swap is not ported)
const OBJECT_FLAGS = { console: 'EVENT_PLAYERS_HOUSE_2F_CONSOLE', leftOrnament: 'EVENT_PLAYERS_HOUSE_2F_DOLL_1',
	rightOrnament: 'EVENT_PLAYERS_HOUSE_2F_DOLL_2', bigDoll: 'EVENT_PLAYERS_HOUSE_2F_BIG_DOLL' };
export function toggleDecorationsVisibility() {
	const st = decoState();
	for (const [slot, flag] of Object.entries(OBJECT_FLAGS)) { if (st[slot]) Story.clearFlag(flag); else Story.setFlag(flag); }
}
// ToggleMaptileDecorations: bed (0,4), plant (7,4), poster (6,0) — changeblock
// coordinates, so each names the 2x2 cells of its block — then SetPosterVisibility
export function toggleMaptileDecorations() {
	const st = decoState();
	for (const slot of ['bed', 'plant', 'poster']) {
		const d = DATA.decos[st[slot]], at = DATA.coords[slot];
		if (!d || !at || !d.cells) continue;
		const x = Math.floor(at[0] / 2) * 2, y = Math.floor(at[1] / 2) * 2;
		d.cells.forEach((v, q) => world.setGridValue(x + (q & 1), y + (q >> 1), v));
	}
	if (st.poster) Story.setFlag('EVENT_PLAYERS_ROOM_POSTER'); else Story.clearFlag('EVENT_PLAYERS_ROOM_POSTER');
}
// describedecoration DECODESC_POSTER (the other DECODESC_* read dolls/consoles,
// whose slots are always empty here, so their objects never show)
export function describeDecoration(which, openTownMap) {
	if (which !== 'DECODESC_POSTER') return;
	const d = DATA.decos[decoState().poster];
	if (!d || !d.text) return;   // DecorationDesc_NullPoster
	dialog.open(d.text, d.townMap && openTownMap ? () => openTownMap() : undefined);
}
