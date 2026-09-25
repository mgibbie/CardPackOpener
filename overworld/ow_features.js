// ow_features.js — Secret Bases, async friend trades (the escrowed mailbox), Shoal Cave tides, roaming legendaries and the Johto RADIO.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as MP from '../battlecards/mpmode.js';
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as Clock from './clock.js';
import { META } from './engine.js';
import { Journal } from './journal.js';
import { battle, dialog, evolution, hud, player, world } from './ow_core.js';
import { drawVertical, menuChrome, monRow, optionList } from './ow_menus.js';
import { syncOverworldAchievements } from './ow_saves.js';
import { S } from './ow_state.js';
import { addCaught, leadMon, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { offerNickname } from './ow_screens.js';
import { whiteOut } from './ow_places.js';
import { dexMilestoneCheck } from './ow_follower.js';
import { bgmTick } from './ow_music.js';
import {
	MP_ON, warpTo,
} from './main.js';

// ---------- Secret Bases ----------
// Every one of Emerald's REAL base spots survives in the shipped layouts as a
// metatile behavior (0x90-0x9D: red/brown/yellow/blue cave, tree, shrub), so
// detection is mechanical — no hand-placed zones, all ~70 spots work. One base
// per player: claim a spot, decorate it, and FRIENDS who walk up to your spot
// can step inside and see your handiwork (D1: base-save/base-get/base-dir).
const BASE_KEY = 'magepunk_base_v1';
export const DECO_ITEMS = [
	{ id: 'plant', name: 'POTTED PLANT' }, { id: 'table', name: 'WOOD TABLE' },
	{ id: 'cushion', name: 'CUSHION' }, { id: 'mat', name: 'SPIN MAT' },
	{ id: 'lamp', name: 'GLOW LAMP' }, { id: 'rock', name: 'PRETTY ROCK' },
	{ id: 'doll', name: 'POKe DOLL' }, { id: 'banner', name: 'BANNER' },
];
const DECO_CAP = 16;
export function myBase() { return safeLoad(BASE_KEY, null); }
export function saveMyBase(b) { safeSave(BASE_KEY, b); if (MP_ON) { try { MP.call('base-save', { spot: b.spot, deco: b.deco || [] }).catch(() => {}); } catch (e) {} } }
// spot key: map file + the LEFT tile of a tree pair, so both halves agree
export function baseSpotKey(fx, fy, behavior) {
	const x = behavior === 0x9C ? fx - 1 : fx;
	return `${world.current?.name}:${x},${fy}`;
}
// whose base is on this spot? friends' claims are cached briefly
let baseDir = null, baseDirAt = 0;
async function fetchBaseDir() {
	if (!MP_ON) return {};
	if (baseDir && Date.now() - baseDirAt < 60000) return baseDir;
	try { baseDir = (await MP.call('base-dir'))?.dir || {}; baseDirAt = Date.now(); } catch (e) { baseDir = baseDir || {}; }
	return baseDir;
}
// the live base room context (whose deco to draw, whether you may edit)
S.baseCtx = null;
export function baseRoomFor(spotKey, behavior) {
	const SNAKE = { 0x90: 'RED_CAVE', 0x92: 'BROWN_CAVE', 0x94: 'YELLOW_CAVE', 0x96: 'TREE', 0x98: 'SHRUB', 0x9A: 'BLUE_CAVE', 0x9C: 'TREE' };
	let h = 0;
	for (const c of spotKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `MAP_SECRET_BASE_${SNAKE[behavior & ~1] || 'RED_CAVE'}${(h % 4) + 1}`;
}
export async function enterBase(spotKey, behavior, owner) {
	const mine = owner == null;
	let deco = [];
	if (mine) deco = myBase()?.deco || [];
	else {
		try { deco = ((await MP.call('base-get', { user: owner }))?.base?.deco) || []; } catch (e) {}
	}
	S.baseCtx = { mine, owner: owner || null, deco, spot: spotKey };
	await warpTo(baseRoomFor(spotKey, behavior), '0');
	hud.textContent = mine ? 'Your SECRET BASE. Press Z on open floor to decorate!' : `${(owner || '').toUpperCase()}'s SECRET BASE!`;
}
export function secretSpotInteract(fx, fy, behavior) {
	const key = baseSpotKey(fx, fy, behavior);
	const mine = myBase();
	if (mine?.spot === key) {
		dialog.open('Your SECRET BASE!\n\nStep inside?   Z = Yes   X = No', d => { if (d !== 'x') enterBase(key, behavior, null); });
		return;
	}
	fetchBaseDir().then(dir => {
		const owner = dir[key];
		if (owner && owner !== (S.mpAccount?.username || '')) {
			dialog.open(`This is ${owner.toUpperCase()}'s SECRET BASE!\n\nPeek inside?   Z = Yes   X = No`, d => { if (d !== 'x') enterBase(key, behavior, owner); });
			return;
		}
		const q = mine
			? `A perfect hollow for a SECRET BASE!\n\nMove your base HERE? Your decorations\ncome along.   Z = Yes   X = No`
			: 'A perfect hollow for a SECRET BASE!\n\nMake this your base?   Z = Yes   X = No';
		dialog.open(q, d => {
			if (d === 'x') return;
			const b = { spot: key, behavior, deco: mine?.deco || [] };
			saveMyBase(b);
			baseDir = null; // the directory changed
			Journal.add('Claimed a SECRET BASE!');
			sfx('levelup');
			enterBase(key, behavior, null);
		});
	});
}
// inside your own base, Z on open floor decorates; Z on a decoration removes it
export const decoMenu = { open: false, idx: 0, tx: 0, ty: 0 };
export function baseDecoInteract(fx, fy) {
	if (!S.baseCtx) return false;
	const d = (S.baseCtx.deco || []).find(x => x.x === fx && x.y === fy);
	if (d) {
		if (!S.baseCtx.mine) { dialog.open(`A lovely ${DECO_ITEMS.find(i => i.id === d.id)?.name || d.id}.`); return true; }
		dialog.open(`Put the ${DECO_ITEMS.find(i => i.id === d.id)?.name || d.id} away?\n\nZ = Yes   X = No`, k => {
			if (k === 'x') return;
			S.baseCtx.deco = S.baseCtx.deco.filter(x => x !== d);
			const b = myBase(); if (b) { b.deco = S.baseCtx.deco; saveMyBase(b); }
		});
		return true;
	}
	if (!S.baseCtx.mine) return false;
	if (!world.isPassable(fx, fy) || world.warpAt(fx, fy)) return false;
	decoMenu.open = true; decoMenu.idx = 0; decoMenu.tx = fx; decoMenu.ty = fy;
	sfx('ui_select');
	return true;
}
export function decoKey(k) {
	const rows = DECO_ITEMS.length + 1;
	if (k === 'ArrowUp') decoMenu.idx = (decoMenu.idx + rows - 1) % rows;
	if (k === 'ArrowDown') decoMenu.idx = (decoMenu.idx + 1) % rows;
	if (k === 'x' || k === 'Escape') { decoMenu.open = false; return; }
	if (k !== 'z' && k !== 'Enter') return;
	if (decoMenu.idx >= DECO_ITEMS.length) { decoMenu.open = false; return; }
	if ((S.baseCtx?.deco || []).length >= DECO_CAP) { dialog.open(`The base is full! (${DECO_CAP} decorations max.)`); decoMenu.open = false; return; }
	const it = DECO_ITEMS[decoMenu.idx];
	S.baseCtx.deco.push({ id: it.id, x: decoMenu.tx, y: decoMenu.ty });
	const b = myBase(); if (b) { b.deco = S.baseCtx.deco; saveMyBase(b); }
	sfx('item_get');
	decoMenu.open = false;
}
export function drawDecoMenu(W, H) {
	const u = H / 480;
	optionList(W, H, u, 'DECORATE', `Place what here? (${(S.baseCtx?.deco || []).length}/${DECO_CAP} placed)`,
		DECO_ITEMS.map(i => i.name).concat(['Never mind']), decoMenu.idx, 'deco:', null);
}
// chunky 16px pixel decorations, drawn in code (no art assets needed)
function drawDecoSprite(ctx, id, px, py) {
	const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + x, py + y, w, h); };
	switch (id) {
		case 'plant': P(5, 9, 6, 6, '#8a5a2b'); P(4, 3, 8, 7, '#2e8b3a'); P(6, 1, 4, 4, '#46c455'); break;
		case 'table': P(2, 5, 12, 7, '#8a5a2b'); P(3, 4, 10, 3, '#c98d4a'); break;
		case 'cushion': P(3, 6, 10, 7, '#c23b4e'); P(5, 4, 6, 4, '#e26b7c'); break;
		case 'mat': P(2, 3, 12, 11, '#2c5f9e'); P(5, 6, 6, 5, '#5b8fd0'); break;
		case 'lamp': P(7, 8, 2, 7, '#666'); P(4, 2, 8, 7, '#ffd75e'); break;
		case 'rock': P(4, 7, 9, 7, '#8d99a6'); P(6, 5, 5, 4, '#b7c2cc'); break;
		case 'doll': P(4, 6, 8, 8, '#e87ca0'); P(5, 2, 6, 6, '#f7a8c4'); break;
		case 'banner': P(3, 2, 10, 10, '#7a4bd0'); P(5, 4, 6, 3, '#ffd75e'); P(3, 12, 10, 2, '#4a2a86'); break;
		default: P(4, 4, 8, 8, '#999');
	}
}
export function drawBaseDeco(ctx, camX, camY) {
	if (!S.baseCtx || !/^SecretBase_/.test(world.current?.name || '')) return;
	for (const d of S.baseCtx.deco || []) drawDecoSprite(ctx, d.id, d.x * META - camX, d.y * META - camY);
}

// ---------- async friend trades (mailbox, escrowed) ----------
// Offer a party POKeMON to a friend whether they're online or not: the mon is
// escrowed out of your save the moment the offer sends. They accept with a
// counterpart (which lands in your world as an exactly-once delivery, like a
// gift) or decline (yours comes home the same way).
export const socialMenu = { open: false, mode: 'offermon', friend: null, trades: null, trade: null, idx: 0, flash: null };
function monLine(m) { return `${m.nickname || m.name} Lv${m.level}`; }
export function openTradeOffer(f) {
	if (!S.party || S.party.length < 2) { dialog.open('You need at least two POKeMON to offer one.'); return; }
	socialMenu.open = true; socialMenu.mode = 'offermon'; socialMenu.friend = f; socialMenu.idx = 0; socialMenu.flash = null;
}
export async function openTradeInbox() {
	socialMenu.open = true; socialMenu.mode = 'inbox'; socialMenu.idx = 0; socialMenu.trades = null; socialMenu.flash = null;
	try { socialMenu.trades = (await MP.call('trade-list'))?.trades || []; } catch (e) { socialMenu.trades = []; socialMenu.flash = 'Could not reach the server.'; }
}
export async function sendTradeOffer(f, monIdx) {
	const mon = S.party[monIdx];
	if (!mon || S.party.length < 2) return;
	S.party.splice(monIdx, 1); // escrow: it leaves the save before the offer sends
	saveParty(S.party);
	socialMenu.open = false;
	try {
		const r = await MP.call('trade-offer', { to: f.username, mon });
		if (r?.error) throw new Error(r.error);
		Journal.add(`Offered ${monLine(mon)} to ${f.username} in a trade`);
		dialog.open(`Your trade offer is on its way!\n\n${monLine(mon)} will wait with ${f.username}\nuntil they accept or decline.`);
	} catch (e) {
		addCaught(S.party, mon); saveParty(S.party); // the escrow comes straight home
		dialog.open('The offer could not be sent — ' + (e?.message || 'no connection') + '.\nYour POKeMON is back safe.');
	}
}
export async function acceptTrade(trade, monIdx) {
	const mine = S.party[monIdx];
	if (!mine || S.party.length < 2) return;
	S.party.splice(monIdx, 1);
	saveParty(S.party);
	socialMenu.open = false;
	try {
		const r = await MP.call('trade-accept', { id: trade.id, mon: mine });
		if (r?.error) throw new Error(r.error);
		const got = r.mon;
		Dex.markCaught(got.speciesId); dexMilestoneCheck();
		const where = addCaught(S.party, got);
		saveParty(S.party);
		Journal.add(`Traded ${monLine(mine)} to ${trade.from} for ${monLine(got)}!`);
		sfx('levelup');
		dialog.open(`Trade complete!\n\n${monLine(got)} arrived from ${trade.from}${where === 'box' ? ' (sent to the box)' : ''}.\nTake good care of it!`);
	} catch (e) {
		addCaught(S.party, mine); saveParty(S.party);
		dialog.open('The trade fell through — ' + (e?.message || 'no connection') + '.\nYour POKeMON is back safe.');
	}
}
export async function declineTrade(trade) {
	socialMenu.open = false;
	try { await MP.call('trade-decline', { id: trade.id }); dialog.open(`You declined ${trade.from}'s offer.\nTheir POKeMON is on its way home.`); }
	catch (e) { dialog.open('Could not decline right now — try again later.'); }
}
// on boot: accepted/declined counterparts come home, exactly once each
export async function claimTradeDeliveries() {
	if (!MP_ON) return;
	let list = [];
	try { list = (await MP.call('trade-deliveries'))?.deliveries || []; } catch (e) { return; }
	for (const d of list) {
		let got = null;
		try { got = (await MP.call('trade-claim', { id: d.id }))?.delivery; } catch (e) { continue; }
		if (!got?.mon) continue;
		Dex.markCaught(got.mon.speciesId); dexMilestoneCheck();
		const where = addCaught(S.party, got.mon);
		saveParty(S.party);
		if (got.returned) {
			dialog.open(`${monLine(got.mon)} came home —\n${got.from} declined the trade.${where === 'box' ? '\n(Sent to the box.)' : ''}`);
		} else {
			Journal.add(`${got.from} accepted the trade — ${monLine(got.mon)} arrived!`);
			dialog.open(`${got.from} accepted your trade!\n\n${monLine(got.mon)} is yours now${where === 'box' ? ' (sent to the box)' : ''}.`);
		}
	}
}
export function socialKey(k) {
	const s = socialMenu;
	if (s.mode === 'inbox') {
		const list = s.trades || [];
		const rows = list.length + 1;
		if (k === 'ArrowUp') s.idx = (s.idx + rows - 1) % rows;
		if (k === 'ArrowDown') s.idx = (s.idx + 1) % rows;
		if (k === 'x' || k === 'Escape') { s.open = false; return; }
		if (k !== 'z' && k !== 'Enter') return;
		if (s.idx >= list.length) { s.open = false; return; }
		const t = list[s.idx];
		dialog.open(`${t.from} offers ${monLine(t.mon)}!\n\nZ = Accept (pick your POKeMON)\nX = Decline (sends theirs home)`, d => {
			if (d === 'x') { declineTrade(t); return; }
			if (!S.party || S.party.length < 2) { dialog.open('You need at least two POKeMON to trade one.'); return; }
			s.mode = 'acceptmon'; s.trade = t; s.idx = 0;
		});
		return;
	}
	// offermon / acceptmon: a party row picker
	if (k === 'ArrowUp') s.idx = (s.idx + S.party.length - 1) % S.party.length;
	if (k === 'ArrowDown') s.idx = (s.idx + 1) % S.party.length;
	if (k === 'x' || k === 'Escape') { s.open = false; return; }
	if (k !== 'z' && k !== 'Enter') return;
	if (!S.party[s.idx]) return;
	if (s.mode === 'offermon') {
		const f = s.friend, mon = S.party[s.idx];
		dialog.open(`Offer ${monLine(mon)} to ${f.username}?\n\nIt leaves your party until they answer.\nZ = Yes   X = No`, d => { if (d !== 'x') sendTradeOffer(f, s.idx); });
	} else if (s.mode === 'acceptmon') {
		const t = s.trade, mine = S.party[s.idx];
		dialog.open(`Trade YOUR ${monLine(mine)} for\n${t.from}'s ${monLine(t.mon)}?\n\nZ = Trade!   X = No`, d => { if (d !== 'x') acceptTrade(t, s.idx); });
	}
}
export function drawSocial(W, H) {
	const u = H / 480;
	const s = socialMenu;
	if (s.mode === 'inbox') {
		const list = s.trades;
		const rows = list == null ? ['(loading…)'] : list.map(t => `${t.from} offers ${monLine(t.mon)}`).concat(['Back']);
		optionList(W, H, u, 'TRADE OFFERS', 'Z: answer an offer', rows, s.idx, 'soc:', s.flash);
		return;
	}
	menuChrome(W, H, u, s.mode === 'offermon' ? `OFFER A TRADE — to ${s.friend?.username}` : `TRADE WITH ${s.trade?.from}`,
		s.mode === 'offermon' ? 'Which POKeMON do you offer?' : `Their ${s.trade ? monLine(s.trade.mon) : ''} — pick yours to send.`);
	S.party.forEach((mo, i) => monRow('socm:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, s.idx === i, u));
}

// ---------- Shoal Cave tides ----------
// The Clock drives Emerald's real rhythm: LOW tide 3-9 and 15-21, HIGH tide
// otherwise. At high tide the Inner Room swaps to its shipped high-tide layout
// (flooded — Surf country) and the deeper rooms (Stairs/Lower/Ice) are
// underwater outright. The high-tide map shipped as a layout-only shell (no
// warps, even in the decomp — events live on the low map), so its warps are
// injected at load and arrival is re-placed by hand. SHOAL SALT × 4 and SHOAL
// SHELL × 4 hide at the classic dig spots (once per save — no respawn timers),
// and the hermit at the entrance trades 4 + 4 for his SHELL BELL.
const SHOAL_KEY = 'magepunk_shoal_v1';
export const shoalTide = () => { const h = Clock.hour(); return (h >= 3 && h < 9) || (h >= 15 && h < 21) ? 'low' : 'high'; };
// which dig spot yields what, by map:x,y (the decomp's ShoalSalt1-4/ShoalShell1-4)
const SHOAL_ITEM_AT = {
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:31,8': 'shoalsalt', 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:14,26': 'shoalsalt',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:41,20': 'shoalshell', 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:41,10': 'shoalshell',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:6,9': 'shoalshell', 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:16,13': 'shoalshell',
	'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM:18,2': 'shoalsalt', 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM:11,11': 'shoalsalt',
};
// the low Inner Room's warp list, mirrored into the high-tide shell at load
const SHOAL_INNER_WARPS = [
	{ x: 34, y: 29, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', dest_warp_id: '1' },
	{ x: 38, y: 15, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM', dest_warp_id: '0' },
	{ x: 42, y: 4, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM', dest_warp_id: '1' },
	{ x: 19, y: 14, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM', dest_warp_id: '0' },
	{ x: 15, y: 19, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM', dest_warp_id: '1' },
	{ x: 30, y: 25, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM', dest_warp_id: '2' },
	{ x: 14, y: 33, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', dest_warp_id: '2' },
	{ x: 40, y: 33, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', dest_warp_id: '3' },
];
let shoalArrival = null; // set by shoalWarp: where to stand after the shell map loads
// warp overrides: high tide floods the deep rooms and swaps the Inner Room
export function shoalWarp(w) {
	if (shoalTide() === 'low') return null;
	if (/SHOAL_CAVE_LOW_TIDE_(STAIRS|LOWER|ICE)_ROOM$/.test(w.dest_map)) {
		dialog.open('Seawater surges through the passage!\n\nThe way down is underwater until the tide\ngoes out. (Low tide: 3-9 and 15-21.)');
		return 'blocked';
	}
	// only the ENTRANCE door swaps you into the flooded room — climbing back UP
	// from a deep room lands in the low layout as a grace (no stranding)
	if (w.dest_map === 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM' && world.current?.name === 'ShoalCave_LowTideEntranceRoom') {
		const idx = Math.max(0, parseInt(w.dest_warp_id, 10) || 0);
		shoalArrival = [SHOAL_INNER_WARPS[idx]?.x ?? 34, SHOAL_INNER_WARPS[idx]?.y ?? 29];
		return { map: 'MAP_SHOAL_CAVE_HIGH_TIDE_INNER_ROOM', warp: w.dest_warp_id };
	}
	return null;
}
export function shoalFixup(label) {
	if (label !== 'ShoalCave_HighTideInnerRoom') { shoalArrival = null; return; }
	for (const wv of SHOAL_INNER_WARPS) {
		if (!world.warps.some(x => x.x === wv.x && x.y === wv.y)) world.warps.push({ ...wv });
	}
	if (shoalArrival) { player.setTile(shoalArrival[0], shoalArrival[1]); shoalArrival = null; }
}
export function shoalDig() {
	const key = `${world.current?.map?.id}:${player.tx + ((({ down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] })[player.facing] || [0, 0])[0])},${player.ty + ((({ down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] })[player.facing] || [0, 0])[1])}`;
	const item = SHOAL_ITEM_AT[key];
	if (!item) { dialog.open('Just wet cave rock.'); return; }
	const st = safeLoad(SHOAL_KEY, { taken: {} });
	if (st.taken[key]) { dialog.open('You already dug everything out of this spot.'); return; }
	st.taken[key] = 1;
	safeSave(SHOAL_KEY, st);
	Bag.addItem(item, 1);
	sfx('item_get');
	dialog.open(`Buried in the ${item === 'shoalsalt' ? 'briny sand' : 'shallows'}...\n\nYou dug up a ${Bag.ITEMS[item].name}!`);
}
export function shoalHermitTalk() {
	const salt = Bag.count('shoalsalt'), shell = Bag.count('shoalshell');
	if (salt >= 4 && shell >= 4) {
		dialog.open(`HERMIT: Ooh! ${salt} SHOAL SALT and ${shell} SHOAL SHELL!\nWith 4 of each I can craft my masterpiece.\n\nShall I?   Z = Yes   X = No`, declined => {
			if (declined === 'x') return;
			for (let i = 0; i < 4; i++) { Bag.consume('shoalsalt'); Bag.consume('shoalshell'); }
			Bag.addItem('shellbell', 1);
			sfx('levelup');
			Journal.add('The hermit crafted a SHELL BELL from shoal salt and shells!');
			dialog.open('HERMIT: Grind the salt, polish the shells...\n\nDone! Here — a SHELL BELL! The holder drains\na little life from every hit it lands.');
		});
		return;
	}
	dialog.open(`HERMIT: I craft SHELL BELLS from what this cave\nhides — 4 SHOAL SALT and 4 SHOAL SHELL.\n(You carry ${salt} salt, ${shell} shell.)\n\nSalt lies deep — low tide only. Shells sit in\nthe inner cavern. Dig at the sparkling spots!`);
}
export function kurtTalk() {
	const held = Object.keys(Bag.ITEMS).filter(id => Bag.ITEMS[id].kind === 'apricorn' && Bag.count(id) > 0);
	if (!held.length) {
		dialog.open('KURT: I turn APRICORNS into POKe BALLS — my own\nhandiwork, better than store-bought!\n\nAPRICORNS grow on the trees along ROUTE 37\nand ROUTE 42. Bring me any color!');
		return;
	}
	const id = held[0];
	const ball = Bag.ITEMS[id].ball;
	dialog.open(`KURT: Ah, a ${Bag.ITEMS[id].name}! I can craft that into\na ${Bag.ITEMS[ball].name}. (You have ${Bag.count(id)}.)\n\nShall I?   Z = Yes   X = No`, declined => {
		if (declined === 'x') return;
		Bag.consume(id);
		Bag.addItem(ball, 1);
		sfx('levelup');
		dialog.open(`KURT: Hrmph... rrgh... THERE!\n\nOne ${Bag.ITEMS[ball].name}, made the old way!\nBring me more APRICORNS any time.`);
	});
}

// ---------- roaming legendaries ----------
// RAIKOU and ENTEI prowl Johto's routes, LATIOS and LATIAS Hoenn's, once that
// region holds 4 badges. They hop to a new route every map change; on their
// route they can take over a wild encounter — flee-prone (Mean Look holds
// them) and their wounds persist between meetings, the classic chase. Fainting
// one loses it for the save, like the old games.
const ROAM_KEY = 'magepunk_roamers_v1';
export const ROAMERS = {
	raikou: { region: 'JOHTO', level: 40 },
	entei: { region: 'JOHTO', level: 40 },
	latios: { region: 'HOENN', level: 40 },
	latias: { region: 'HOENN', level: 40 },
};
export const ROAM_ROUTES = {
	JOHTO: ['Route29', 'Route30', 'Route31', 'Route32', 'Route33', 'Route34', 'Route35', 'Route36', 'Route37', 'Route38', 'Route39', 'Route42', 'Route43', 'Route44', 'Route45', 'Route46'],
	HOENN: ['Route110', 'Route111', 'Route112', 'Route113', 'Route114', 'Route115', 'Route116', 'Route117', 'Route118', 'Route119', 'Route120', 'Route121'],
};
export function roamState() { return safeLoad(ROAM_KEY, {}); }
function saveRoam(st) { safeSave(ROAM_KEY, st); }
// every map change, each active roamer bolts to a random route of its region
export function roamersOnMapChange() {
	const st = roamState();
	let changed = false;
	for (const [key, cfg] of Object.entries(ROAMERS)) {
		if (st[key]?.down) continue;
		if ((Badges.count(cfg.region) || 0) < 4) continue;
		const pool = ROAM_ROUTES[cfg.region];
		if (!st[key]) {
			st[key] = { map: pool[Math.floor(Math.random() * pool.length)], hp: null, seen: false };
			Journal.add(`Rumors spread of a strange POKeMON roaming ${cfg.region}...`);
			hud.textContent = `Rumors tell of something powerful roaming ${cfg.region}'s routes...`;
			changed = true;
		} else {
			st[key].map = pool[Math.floor(Math.random() * pool.length)];
			changed = true;
		}
	}
	if (changed) saveRoam(st);
}
export const roamerHere = () => Object.keys(ROAMERS).find(k => {
	const st = roamState()[k];
	return st && !st.down && st.map === world.current?.name;
}) || null;
export function roamerEnd(key) {
	return result => {
		const st = roamState();
		if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(S.party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
			st[key] = { down: true }; saveRoam(st);
			syncOverworldAchievements();
		} else if (result === 'victory') {
			st[key] = { down: true }; saveRoam(st); // fainted — gone for this save, like the classics
			hud.textContent = 'The roaming POKeMON fainted... it will not be seen again.';
			evolution.check(S.party, battle.data);
		} else if (result === 'defeat') {
			whiteOut();
		} else {
			// it bolted (or you ran): its wounds travel with it
			if (st[key] && !st[key].down) {
				st[key].hp = battle.lastFoe?.curHP ?? st[key].hp;
				st[key].status = battle.lastFoe?.status || null;
				saveRoam(st);
			}
			saveParty(S.party);
		}
	};
}
export function startRoamerBattle(key) {
	if (!S.party || !leadMon(S.party) || battle.blocking) return;
	const st = roamState();
	Dex.markSeen(key);
	if (st[key]) { st[key].seen = true; saveRoam(st); }
	battle.themeHint = 'legendary';
	battle.endSpec = { kind: 'roamer', roamer: key };
	battle.start(S.party, key, ROAMERS[key].level, roamerEnd(key), null,
		{ roamer: { hp: st[key]?.hp ?? null, status: st[key]?.status || null } });
}

// ---------- the Johto RADIO ----------
// Every radio object used to print one static "cheerful march" line. Tune in for
// real: four channels — POKeMON MUSIC (swaps the BGM), OAK'S PKMN TALK (reports
// where the roaming legendaries were last seen), BUENA'S PASSWORD (a daily
// Blue-Point draw with a prize ladder) and the LUCKY CHANNEL (a daily lottery
// against your Trainer ID). Driven as a stateful canvas menu (the gcMenu/shopMenu
// pattern), intercepted in runScriptLabel before the std body would run.
const RADIO_CHANNELS = ['POKeMON MUSIC', "OAK'S PKMN TALK", "BUENA'S PASSWORD", 'LUCKY CHANNEL', 'TURN IT OFF'];
// Crystal's radio-only tunes weren't ported, so real, present city themes stand
// in as "stations" (each key is confirmed live in music_map.json).
const RADIO_STATIONS = [
	{ name: 'POKeMON MARCH', key: 'crystal_MUSIC_GOLDENROD_CITY' },
	{ name: 'POKeMON LULLABY', key: 'crystal_MUSIC_POKEMON_CENTER' },
	{ name: 'UNOWN RADIO', key: 'crystal_MUSIC_ECRUTEAK_CITY' },
];
S.radioTune = null;   // BGM override while a music channel plays; cleared on map change
export const radioMenu = { open: false, idx: 0, station: 0 };
// deterministic 32-bit FNV-1a — daily draws hash the date so a channel can't be
// re-rolled by tuning in twice
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// a stable 5-digit Trainer ID. Derived from the account name (identical across
// devices when signed in), else a once-seeded local id. Zero-padded at display.
export function playerTID() {
	const name = (MP.cachedState?.() || {}).username || localStorage.getItem('magepunk_name') || '';
	if (name) return hashStr(name) % 100000;
	let tid = parseInt(localStorage.getItem('magepunk_tid') || '0', 10);
	if (!tid) { tid = 1 + Math.floor(Math.random() * 99998); safeSaveStr('magepunk_tid', String(tid)); }
	return tid % 100000;
}
export const tidStr = () => String(playerTID()).padStart(5, '0');

export function openRadio() { radioMenu.open = true; radioMenu.idx = 0; sfx('ui_open'); }

// POKeMON MUSIC: cycle to the next station and take over the BGM until you leave
function playRadioStation() {
	const s = RADIO_STATIONS[radioMenu.station % RADIO_STATIONS.length];
	radioMenu.station++;
	S.radioTune = s.key; bgmTick();   // apply the override immediately
	return `The RADIO tunes to POKeMON MUSIC.  ♪ Now playing: ${s.name} ♪`;
}

// OAK'S PKMN TALK: the roaming-legendary sighting report. The roamer system
// already moves Raikou/Entei/Latios/Latias each map change but nothing announced
// where — this is that missing readout.
export function oakTalkText() {
	const st = roamState();
	const sightings = [];
	for (const key of Object.keys(ROAMERS)) {
		const r = st[key];
		if (!r || r.down || !r.map) continue;
		const nm = (battle.data?.species?.[key]?.name || key).toUpperCase();
		sightings.push(`${nm} near ${r.map.replace(/^Route/, 'ROUTE ')}`);
	}
	if (!sightings.length) return "PROF. OAK'S PKMN TALK: ...and remember, different POKeMON appear by day and by night! Keep exploring, and you'll fill that POKeDEX.";
	return 'PROF. OAK\'S PKMN TALK: We have sighting reports! ' + sightings.join('.  ') + '.  Go get \'em!';
}

// BUENA'S PASSWORD: one tune-in per day earns a Blue Point; crossing a threshold
// on the ladder hands a prize (once each). The daily password itself is flavour.
const BUENA_KEY = 'magepunk_buena_v1';
const BUENA_WORDS = ['LAPRAS', 'PIKACHU', 'MACHOP', 'EEVEE', 'ODDISH', 'SLOWPOKE', 'DIGLETT', 'PIDGEY', 'GEODUDE', 'GENGAR', 'ONIX', 'ABRA', 'MAGIKARP', 'DITTO'];
const BUENA_PRIZES = [ // Blue-Point balance -> a one-time prize when you reach it
	{ at: 3, item: 'pokeball', n: 5 }, { at: 7, item: 'ultraball', n: 3 },
	{ at: 15, item: 'ppup', n: 1 }, { at: 25, item: 'rarecandy', n: 1 }, { at: 40, item: 'maxrevive', n: 2 },
];
export function buenaText() {
	const st = safeLoad(BUENA_KEY, { date: '', points: 0, claimed: 0 });
	const today = new Date().toDateString();
	const word = BUENA_WORDS[hashStr(today) % BUENA_WORDS.length];
	if (st.date === today) return `BUENA'S PASSWORD: Today's password is still "${word}"! You've already tuned in today. (Blue Points: ${st.points})`;
	st.date = today; st.points = (st.points || 0) + 1;
	let msg = `BUENA'S PASSWORD: Today's password is "${word}"! Thanks for listening — +1 Blue Point! (Total: ${st.points})`;
	for (const p of BUENA_PRIZES) {
		if (st.points >= p.at && (st.claimed || 0) < p.at) {
			st.claimed = p.at; Bag.addItem(p.item, p.n);
			msg += `  ★ ${p.at} points reached! BUENA sends you ${p.n}x ${(Bag.ITEMS[p.item]?.name || p.item)}!`;
			break;
		}
	}
	safeSave(BUENA_KEY, st);
	return msg;
}

// LUCKY CHANNEL: the daily Lucky Number Show. Today's number is fixed per date;
// the more trailing digits it shares with your Trainer ID, the bigger the prize.
const LOTTO_KEY = 'magepunk_lottery_v1';
const LOTTO_PRIZES = { 5: ['masterball', 1, 'the GRAND PRIZE — a MASTER BALL'], 4: ['ppup', 1, '2nd prize — a PP UP'], 3: ['rarecandy', 1, '3rd prize — a RARE CANDY'], 2: ['ultraball', 2, '4th prize — 2 ULTRA BALLS'] };
export function luckyText() {
	const st = safeLoad(LOTTO_KEY, { date: '' });
	const today = new Date().toDateString();
	const tid = tidStr();
	if (st.date === today) return `LUCKY CHANNEL: Today's drawing is over! Please come back tomorrow. (Your ID: ${tid})`;
	st.date = today; safeSave(LOTTO_KEY, st);
	const draw = String(hashStr('lotto:' + today) % 100000).padStart(5, '0');
	let match = 0; for (let i = 1; i <= 5; i++) { if (draw.slice(-i) === tid.slice(-i)) match = i; else break; }
	if (match >= 2) { const [item, n, label] = LOTTO_PRIZES[match]; Bag.addItem(item, n); return `LUCKY CHANNEL: Today's Lucky Number is ${draw}! Your ID ${tid} matches the last ${match} digits — you win ${label}!`; }
	return `LUCKY CHANNEL: Today's Lucky Number is ${draw}. Your ID is ${tid}. No match today — better luck tomorrow!`;
}

export function radioKey(k) {
	const n = RADIO_CHANNELS.length;
	if (k === 'ArrowUp') { radioMenu.idx = (radioMenu.idx + n - 1) % n; return; }
	if (k === 'ArrowDown') { radioMenu.idx = (radioMenu.idx + 1) % n; return; }
	if (k === 'x' || k === 'Escape') { radioMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const ch = radioMenu.idx;
		if (ch === 4) { S.radioTune = null; bgmTick(); radioMenu.open = false; return; } // TURN IT OFF
		const text = ch === 0 ? playRadioStation() : ch === 1 ? oakTalkText() : ch === 2 ? buenaText() : luckyText();
		radioMenu.open = false;                      // hand off to the dialog...
		dialog.open(text, () => { radioMenu.open = true; }); // ...then reopen so you can keep tuning
	}
}
export function drawRadio(W, H) {
	drawVertical(W, H, H / 480, 'RADIO', 'Tune in — up/down pick, Z listen, X off.', RADIO_CHANNELS, radioMenu.idx, 'radio');
}
