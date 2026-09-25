// ow_menustate.js — the menus' STATE objects (party, START, quest, player, trade, cards, run, dex, trainer card, town map, options) and the service-map tables + MOM, plus the animated water tiles that shared their stretch of main.js.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import { META, VIEW_H, VIEW_W } from './engine.js';
import * as Frontier from './frontier.js';
import { dialog, world } from './ow_core.js';
import { myBase } from './ow_features.js';
import { noteHealPoint } from './ow_places.js';
import { ghosts } from './ow_pvp.js';
import { S } from './ow_state.js';
import { allRuinsSolved, contestProgress, isBugDay } from './ow_venues.js';
import { healParty, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import { sfx } from './sound.js';

// ---------- water animation ----------
// The map renders ONCE into cached canvases, so water sat frozen in every
// region. This re-draws each visible surfable tile from that cache with a
// GB-style 1px horizontal wobble (4 phases, wrap-around slices) — the sea
// moves again without any new art. Drawn after the bottom layer and before
// the top, so bridges stay above the ripple.
const WATER_PHASE = [0, 1, 0, -1];
export function drawWaterAnim(ctx, camX, camY, forceOff) {
	const cur = world.current;
	const src = cur?.canvases?.bottom;
	const lay = cur?.layout;
	if (!src || !lay) return;
	const off = forceOff !== undefined ? forceOff : WATER_PHASE[Math.floor(performance.now() / 280) % 4];
	if (off === 0) return; // the cached frame IS phase zero
	const x0 = Math.max(0, Math.floor(camX / META)), y0 = Math.max(0, Math.floor(camY / META));
	const x1 = Math.min(lay.width - 1, x0 + Math.ceil(VIEW_W / META) + 1);
	const y1 = Math.min(lay.height - 1, y0 + Math.ceil(VIEW_H / META) + 1);
	for (let ty = y0; ty <= y1; ty++) {
		for (let tx = x0; tx <= x1; tx++) {
			if (!world.isSurfable(tx, ty)) continue;
			const sx = tx * META, sy = ty * META, dx = tx * META - camX, dy = ty * META - camY;
			if (off > 0) {
				ctx.drawImage(src, sx, sy, META - off, META, dx + off, dy, META - off, META);
				ctx.drawImage(src, sx + META - off, sy, off, META, dx, dy, off, META);
			} else {
				const o = -off;
				ctx.drawImage(src, sx + o, sy, META - o, META, dx, dy, META - o, META);
				ctx.drawImage(src, sx, sy, o, META, dx + META - o, dy, o, META);
			}
		}
	}
}

// MOM, in every region's player house: a warm word and a full heal
export const MOM_SCRIPTS = new Set(['MomScript', 'PalletTown_PlayersHouse_1F_EventScript_Mom', 'PlayersHouse_1F_EventScript_Mom']);
export function momTalk() {
	const hurt = (S.party || []).some(m => m && (m.curHP < m.maxHP || m.status || (m.moves || []).some(mv => mv.pp < mv.maxPp)));
	if (!hurt) {
		dialog.open('MOM: Oh, hi! Your POKeMON look happy\nand healthy to me. Off you go —\nand take care of each other!');
		return;
	}
	dialog.open('MOM: Welcome home! Goodness, you all look\nworn out. Let me look after your POKeMON\nfor a moment...\n\n. . . . .\n\nThere! Rested and raring to go!', () => {
		sfx('heal');
		healParty(S.party);
		saveParty(S.party);
		noteHealPoint();   // MOM's is a resting place too — wake up here if you black out
	});
}

// canonical service buildings (talk to the NPC inside to use the service)
export const DAYCARE_MAPS = new Set(['MAP_DAY_CARE', 'MAP_ROUTE5_POKEMON_DAY_CARE',
	'MAP_ROUTE117_POKEMON_DAY_CARE', 'MAP_FOUR_ISLAND_POKEMON_DAY_CARE']);
export const NAMERATER_MAPS = new Set(['MAP_GOLDENROD_NAME_RATER', 'MAP_JOHKANTO_LAVENDER_NAME_RATER',
	'MAP_SLATEPORT_CITY_NAME_RATERS_HOUSE']);
export const DELETER_MAPS = new Set(['MAP_MOVE_DELETERS_HOUSE', 'MAP_LILYCOVE_CITY_MOVE_DELETERS_HOUSE']);

export const partyMenu = { open: false, idx: 0, summary: false, action: null, swapFrom: null, moveSwap: null };
export const startMenu = { open: false, idx: 0 };
export const questMenu = { open: false, idx: 0, page: 0 }; // page 0 = quest log, 1 = THINGS TO DO
// THINGS TO DO — the discovery checklist (Batch 6). Whole subsystems shipped as
// reachable content that nothing ever pointed you at: contests, the Ruins, secret
// bases, the Frontier, apricorns, Dive... This surfaces them with a where-to-start
// hint and a live state ([x] done, [>] available now, [ ] locked/where-to-unlock).
// `done`/`avail` are optional predicates read at draw time; default avail = true.
export const THINGS_TO_DO = [
	{ label: 'BUG-CATCHING CONTEST', where: 'National Park gate (Johto) — Tue/Thu/Sat', avail: () => isBugDay() },
	{ label: 'POKeMON CONTESTS', where: 'Lilycove Contest Hall (Hoenn)', done: () => Object.values(contestProgress().ranks || {}).some(v => v > 0) },
	{ label: 'THE RUINS OF ALPH', where: 'Solve the sliding tile puzzles (Johto)', done: () => allRuinsSolved() },
	{ label: 'UNOWN DEX', where: 'Catch every Unown letter in the Ruins (Johto)', done: () => Dex.unownCount() >= 28 },
	{ label: 'APRICORNS & KURT', where: 'Pick apricorns on Routes 37/42, see Kurt in Azalea (Johto)' },
	{ label: 'THE RADIO', where: 'Tune in to a radio in any Johto house' },
	{ label: 'SECRET BASE', where: 'SECRET POWER on a tree, rock or cave wall (Hoenn)', done: () => !!myBase() },
	{ label: 'HEADBUTT TREES', where: 'Use HEADBUTT on a leafy tree for hidden POKeMON' },
	{ label: 'DIVE SPOTS', where: 'DIVE on deep water — Route 128 / Sootopolis (Hoenn)' },
	{ label: 'THE SAFARI ZONE', where: 'Fuchsia City (Kanto) / Route 121 (Hoenn)' },
	{ label: 'GAME CORNER', where: 'Voltorb Flip — Celadon / Goldenrod' },
	{ label: 'TRAINER HILL', where: 'Climb for the best time (Hoenn)' },
	{ label: 'SHOAL CAVE', where: 'Time the tides for shells & a Shell Bell (Hoenn)' },
	{ label: 'BATTLE FRONTIER', where: 'Battle facilities for BP (Hoenn)', done: () => Frontier.getBP() > 0 || Frontier.bestStreak() > 0 },
	{ label: 'ASYNC TRADES', where: 'Send & accept trade offers via the FRIENDS menu' },
];
export function todoRows() {
	return THINGS_TO_DO.map(t => {
		let mark = '[ ] ';
		try { mark = t.done?.() ? '[x] ' : (t.avail ? (t.avail() ? '[>] ' : '[ ] ') : '[>] '); } catch (e) { mark = '[>] '; }
		return `${mark}${t.label} — ${t.where}`;
	});
}
// walk-up-and-talk: press Z facing another player's sprite to challenge or trade
export const playerMenu = { open: false, idx: 0, target: null };
export const PLAYER_MENU_ITEMS = ['POKeMON BATTLE', 'MAIL BATTLE', 'CARD BATTLE', 'TRADE', 'CANCEL'];
// deck-selection phase before a card duel: pick which class deck to bring
export const deckSelect = { open: false, idx: 0, decks: [], onPick: null, prompt: '' };
// RuneScape-style two-party trade window
export const TRADE_CATS = ['CARDS', 'PACKS', 'POKeMON', 'ITEMS'];
export const trade = {
	open: false, id: null, role: null, them: 'PLAYER',   // role 'a' = requester, 'b' = accepter
	mine: null, theirs: null, myAccept: false, theirAccept: false,
	done: false, applied: false, cat: 0, idx: 0, rows: [], poll: null, status: '',
};
export const emptyOffer = () => ({ cards: {}, packs: 0, pokemon: [], items: [] });
// the username of a friend-ghost currently standing on tile (tx,ty), or null
export function ghostAt(tx, ty) {
	for (const [name, g] of ghosts) {
		if (Math.round(g.px / META) === tx && Math.round(g.py / META) === ty) return name;
	}
	return null;
}
export const cardsMenu = { open: false, idx: 0 };
export const runMenu = { open: false, idx: 0 };
export const dexMenu = { open: false, idx: 0, detail: false, list: null };
export const trainerCard = { open: false, page: 0 }; // page 0 = the card, 1 = the adventure JOURNAL
export const townMap = { open: false, region: 0, idx: 0 };
// mode 'backups' lists the server's automatic daily saves; list is fetched lazily
export const optionsMenu = { open: false, idx: 0, mode: 'main', list: null, flash: null, busy: false };
// battleAnim was in Settings.OPTIONS but never listed here — the setting existed
// with no way to reach it
export const OPTION_KEYS = ['textSpeed', 'bgmVol', 'sfxVol', 'autoRun', 'dayNight', 'followers', 'battleAnim'];
// rows below the settings: save-data actions, not cyclable values
export const OPTION_ACTIONS = [
	{ id: 'export', label: 'EXPORT SAVE', hint: 'Download your game as a file' },
	{ id: 'import', label: 'IMPORT SAVE', hint: 'Restore a downloaded save file' },
	{ id: 'backups', label: 'BACKUPS', hint: 'Restore an automatic daily backup' },
	{ id: 'controls', label: 'CONTROLS', hint: 'See every shortcut and rebind the single keys' },
];
