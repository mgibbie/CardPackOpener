// ow_screens.js — the START-menu screens and service counters: the menu itself, POKeDEX, friends, mail, quests, the player/trainer menu, deck select and CARDS, the run-mode menu, and the service NPCs (in-game trades, the DAY CARE, the NAME RATER, the move relearner).
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import { hasPhone, openPhoneMenu } from './phone.js';
import * as MP from '../battlecards/mpmode.js';
import * as Bag from './bag.js';
import { buildMon as battleBuildMon } from './battle.js';
import * as BUI from './battleui.js';
import * as Daycare from './daycare.js';
import * as Story from './events.js';
import { Journal } from './journal.js';
import { battle, dialog, hud, player, sctx } from './ow_core.js';
import { openRadio, openTradeInbox, openTradeOffer } from './ow_features.js';
import { toggleBike } from './ow_fieldmoves.js';
import { bagMenu, canLearn, pcMenu } from './ow_menukeys.js';
import { drawVertical, menuChrome, monRow } from './ow_menus.js';
import { boosterLabel, enterMatch, leaveVisit, openMailbox, prettyId, sendCardChallenge, sendChallenge, sendMailChallenge, startTrade, visitWorld } from './ow_pvp.js';
import { S } from './ow_state.js';
import { addCaught, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import * as Quest from './quest.js';
import { cry } from './sound.js';
import * as Trades from './trades.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { savePos } from './ow_input.js';
import { saveBeforeLeave } from './ow_leaveguard.js';
import { levelCapNow, playerRegion } from './ow_progression.js';
import { dexMilestoneCheck } from './ow_follower.js';
import { daycareMenu, daycareOptions, moveShop, nameRater, openTownMap, tradeMenu } from './ow_music.js';
import { PLAYER_MENU_ITEMS, THINGS_TO_DO, TRADE_CATS, TRADE_STEPS, cardsMenu, deckSelect, dexMenu, optionsMenu, partyMenu, playerMenu, questMenu, runMenu, startMenu, trade, trainerCard } from './ow_menustate.js';
import {
	MP_ON,
} from './main.js';
import { askText } from '../site/osk.js';
import { watchHref, micatroActivityLabel, micasurvivorActivityLabel, scoundrelActivityLabel, pearsActivityLabel, pocketActivityLabel } from '../site/livewatch.js';

// ---------- in-game NPC trades ----------
// One flow for both dialects (see trades.js for why they broke differently).
// Offer -> pick a party POKeMON -> it must be the species they asked for -> swap.
const monName = id => (battle.data?.species?.[id]?.name || id || '').toUpperCase();
export function startNpcTrade(trade, talker) {
	if (!S.party || !S.party.length) return;
	if (Story.getFlag(Trades.flagFor(trade.key))) {
		dialog.open(`How's ${trade.nickname || monName(trade.give)} doing?\n\nI'm glad we traded.`);
		return;
	}
	dialog.open(`I have a ${monName(trade.give)}.\n\nWould you trade me your ${monName(trade.want)} for it?`, () => {
		tradeMenu.open = true; tradeMenu.trade = trade; tradeMenu.idx = 0;
		tradeMenu.flash = null; tradeMenu.talker = talker || null;
	});
}
export function npcTradeKey(k) {
	const t = tradeMenu.trade;
	if (k === 'ArrowUp') tradeMenu.idx = (tradeMenu.idx + S.party.length - 1) % S.party.length;
	if (k === 'ArrowDown') tradeMenu.idx = (tradeMenu.idx + 1) % S.party.length;
	if (k === 'x' || k === 'Escape') { tradeMenu.open = false; dialog.open('Oh… well, maybe another time.'); return; }
	if (k !== 'z' && k !== 'Enter') return;
	const given = S.party[tradeMenu.idx];
	if (!given || !t) return;
	if (given.speciesId !== t.want) {
		tradeMenu.flash = `That's not a ${monName(t.want)}!`;
		return;
	}
	// your last POKeMON would leave you with an empty party mid-overworld
	if (S.party.length <= 1) { tradeMenu.flash = "That's your only POKeMON!"; return; }
	const got = Trades.buildTraded(t, given, battle.data, battleBuildMon);
	if (!got) { tradeMenu.flash = 'Something went wrong…'; return; }
	S.party.splice(tradeMenu.idx, 1);
	S.party.push(got);
	saveParty(S.party);
	Dex.markSeen(got.speciesId); Dex.markCaught(got.speciesId); dexMilestoneCheck();
	Story.setFlag(Trades.flagFor(t.key));
	tradeMenu.open = false;
	dialog.open(`You traded your ${monName(t.want)} for ${got.name}!\n\nThanks — take good care of it!`);
	hud.textContent = `Traded ${monName(t.want)} for ${got.name} (Lv${got.level}).`;
}
export function drawNpcTrade(W, H) {
	const u = H / 480;
	const t = tradeMenu.trade;
	menuChrome(W, H, u, 'TRADE', t ? `Which POKeMON will you give for ${monName(t.give)}?` : '');
	S.party.forEach((m, i) => monRow('trade:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, m, tradeMenu.idx === i, u));
	if (tradeMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(tradeMenu.flash, 24 * u, H - 18 * u);
	}
}

export function daycareKey(k) {
	if (daycareMenu.mode === 'deposit') {
		const cands = S.party.filter((m, i) => i > 0 || S.party.length > 1); // keep at least one
		if (k === 'ArrowUp') daycareMenu.idx = (daycareMenu.idx + S.party.length - 1) % S.party.length;
		if (k === 'ArrowDown') daycareMenu.idx = (daycareMenu.idx + 1) % S.party.length;
		if (k === 'x' || k === 'Escape') { daycareMenu.mode = 'main'; daycareMenu.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			if (S.party.length <= 1) { daycareMenu.flash = "You can't leave your last POKeMON!"; return; }
			const mon = S.party[daycareMenu.idx];
			if (!mon || !Daycare.canDeposit()) return;
			S.party.splice(daycareMenu.idx, 1);
			Daycare.deposit(mon);
			saveParty(S.party);
			daycareMenu.flash = `Left ${mon.name} at the Day Care.`;
			daycareMenu.mode = 'main'; daycareMenu.idx = 0;
		}
		return;
	}
	const opts = daycareOptions();
	if (k === 'ArrowUp') daycareMenu.idx = (daycareMenu.idx + opts.length - 1) % opts.length;
	if (k === 'ArrowDown') daycareMenu.idx = (daycareMenu.idx + 1) % opts.length;
	if (k === 'x' || k === 'Escape') { daycareMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const o = opts[daycareMenu.idx];
		if (!o) return;
		if (o.act === 'leave') { daycareMenu.open = false; return; }
		if (o.act === 'deposit') { daycareMenu.mode = 'deposit'; daycareMenu.idx = 0; daycareMenu.flash = null; return; }
		if (o.act === 'withdraw') {
			const info = Daycare.withdrawInfo(o.slot, battle.data, levelCapNow());
			if (!Bag.spend(info.cost)) { daycareMenu.flash = "You don't have enough money!"; return; }
			const mon = Daycare.withdraw(o.slot, battle.data, levelCapNow());
			const where = addCaught(S.party, mon);
			daycareMenu.flash = `Got ${mon.name} back! ${where === 'box' ? '(sent to the box)' : ''}`;
			saveParty(S.party);
			daycareMenu.idx = 0;
		}
		if (o.act === 'egg') {
			const baby = Daycare.collectEgg(battle.data, canLearn); // egg moves filter through TM/level-up compat
			if (baby) {
				Dex.markCaught(baby.speciesId); dexMilestoneCheck();
				const where = addCaught(S.party, baby);
				Journal.add(`The EGG hatched into ${baby.name}!`);
				daycareMenu.flash = `The EGG hatched into ${baby.name}! ${where === 'box' ? '(sent to the box)' : ''}`;
			}
			daycareMenu.idx = 0;
		}
	}
}

// ---- name rater ----
export function nameRaterKey(k) {
	if (k === 'ArrowUp') nameRater.idx = (nameRater.idx + S.party.length - 1) % S.party.length;
	if (k === 'ArrowDown') nameRater.idx = (nameRater.idx + 1) % S.party.length;
	if (k === 'x' || k === 'Escape') { nameRater.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const mon = S.party[nameRater.idx];
		if (mon) promptRename(mon);
	}
}
// A caught POKeMON could only ever be named by walking to the NAME RATER —
// setNickname existed and nothing but that NPC ever called it. Ask at the moment
// of capture, which is when you actually care and when the games ask.
export function offerNickname(mon) {
	if (!mon) return;
	Journal.add(`Caught ${mon.name} (Lv${mon.level})`); // every catch path funnels through here
	dialog.open(`Give a nickname to ${mon.name}?\n\nZ = Yes   X = No`, declined => {
		if (declined !== 'x') promptRename(mon);
	});
}
// rename on the on-screen keyboard (site/osk.js): cancel leaves the name as it is
async function promptRename(mon) {
	const speciesName = battle.data.species[mon.speciesId]?.name?.toUpperCase() || mon.name;
	const name = await askText({ title: `New name for ${mon.name}? (blank = ${speciesName})`, initial: mon.name, maxLength: 12, upper: true });
	if (name == null) return;
	setNickname(mon, name);
}
export function setNickname(mon, name) {
	const clean = String(name).trim().slice(0, 12);
	const speciesName = battle.data.species[mon.speciesId]?.name?.toUpperCase() || mon.name;
	mon.name = clean || speciesName;
	saveParty(S.party);
	nameRater.open = false;
}

// ---- move deleter / reminder ----
export function relearnable(mon) {
	const sp = battle.data.species[mon.speciesId];
	const known = new Set(mon.moves.map(m => m.id));
	const seen = new Set();
	const out = [];
	for (const [lv, id] of (sp?.learnset || [])) {
		if (lv <= mon.level && !known.has(id) && !seen.has(id) && battle.data.moves[id]) {
			seen.add(id); out.push(id);
		}
	}
	return out;
}
export function moveShopKey(k) {
	const m = moveShop;
	if (m.mode === 'main') {
		if (k === 'ArrowUp') m.idx = (m.idx + 1) % 2;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % 2;
		if (k === 'x' || k === 'Escape') { m.open = false; return; }
		if (k === 'z' || k === 'Enter') { m.mode = m.idx === 0 ? 'pick-delete' : 'pick-relearn'; m.idx = 0; }
		return;
	}
	if (m.mode === 'pick-delete' || m.mode === 'pick-relearn') {
		if (k === 'ArrowUp') m.idx = (m.idx + S.party.length - 1) % S.party.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % S.party.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'main'; m.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			m.mon = S.party[m.idx];
			if (m.mode === 'pick-delete') { m.mode = 'delete-move'; m.idx = 0; }
			else { m.list = relearnable(m.mon); m.mode = 'relearn-move'; m.idx = 0; if (!m.list.length) m.flash = `${m.mon.name} has no moves to recall.`; }
		}
		return;
	}
	if (m.mode === 'delete-move') {
		const moves = m.mon.moves;
		if (k === 'ArrowUp') m.idx = (m.idx + moves.length - 1) % moves.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % moves.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'pick-delete'; m.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			if (moves.length <= 1) { m.flash = "It can't forget its only move!"; return; }
			const gone = moves.splice(m.idx, 1)[0];
			saveParty(S.party);
			m.flash = `${m.mon.name} forgot ${gone.name}.`;
			m.mode = 'main'; m.idx = 0;
		}
		return;
	}
	if (m.mode === 'relearn-move') {
		const list = m.list || [];
		if (!list.length) { if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') { m.mode = 'main'; m.idx = 0; } return; }
		if (k === 'ArrowUp') m.idx = (m.idx + list.length - 1) % list.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % list.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'pick-relearn'; m.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			const id = list[m.idx];
			const info = battle.data.moves[id];
			if (m.mon.moves.length < 4) {
				m.mon.moves.push({ id, name: info.name, pp: info.pp, maxPp: info.pp });
				saveParty(S.party);
				m.flash = `${m.mon.name} recalled ${info.name}!`;
				m.mode = 'main'; m.idx = 0;
			} else {
				bagMenu.forget = { itemId: null, mid: id, mon: m.mon, idx: 0, keepItem: true };
				bagMenu.open = true; bagMenu.picking = false;
				m.open = false;
			}
		}
		return;
	}
}

// full species list for the Pokédex, sorted by dex number (built once)
// dex filters (Batch 6): narrow the 1,751-entry national list by type, region,
// and caught-status — the completionist lens. Cycled by T/R/F in dexKey.
const DEX_TYPES = ['ALL', 'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
const DEX_REGIONS = [['ALL', () => true], ['KANTO', n => n >= 1 && n <= 151], ['JOHTO', n => n >= 152 && n <= 251], ['HOENN', n => n >= 252 && n <= 386], ['OTHER', n => n > 386 || n < 1]];
const DEX_CAUGHT = ['ALL', 'OWNED', 'SEEN', 'MISSING'];
export const DEX_GRID_COLS = 12; // the LIVING DEX completion grid
export function dexAll() {
	if (dexMenu._all) return dexMenu._all;
	const sp = battle.data.species;
	// standard dex (positive nums) first, ascending; fakemon/custom (num <= 0)
	// after, ordered by magnitude so they group sensibly
	const key = n => (n > 0 ? n : 100000 + Math.abs(n || 99999));
	dexMenu._all = Object.keys(sp)
		.map(id => ({ id, num: sp[id].num || 9999, name: sp[id].name, types: sp[id].types || [] }))
		.sort((a, b) => key(a.num) - key(b.num) || a.name.localeCompare(b.name));
	return dexMenu._all;
}
export function dexList() {
	const t = DEX_TYPES[dexMenu.typeI || 0];
	const inRegion = DEX_REGIONS[dexMenu.regionI || 0][1];
	const cf = DEX_CAUGHT[dexMenu.caughtI || 0];
	if (!(dexMenu.typeI || dexMenu.regionI || dexMenu.caughtI)) return dexAll(); // unfiltered: the full list
	return dexAll().filter(e => {
		if (t !== 'ALL' && !e.types.includes(t)) return false;
		if (!inRegion(e.num)) return false;
		if (cf !== 'ALL') {
			const seen = Dex.isSeen(e.id), caught = Dex.isCaught(e.id);
			if (cf === 'OWNED' && !caught) return false;
			if (cf === 'SEEN' && !(seen && !caught)) return false;
			if (cf === 'MISSING' && caught) return false;
		}
		return true;
	});
}
export function dexFilterLabel() {
	return `${DEX_TYPES[dexMenu.typeI || 0]} · ${DEX_REGIONS[dexMenu.regionI || 0][0]} · ${DEX_CAUGHT[dexMenu.caughtI || 0]}`;
}
export const friendsMenu = { open: false, idx: 0 };
// MAIL BATTLES: correspondence Pokémon matches (server-authoritative, played a
// turn at a time whenever each side gets around to it — see async-act in mp.mjs)
export const mailMenu = { open: false, idx: 0, rows: [], loading: false };
S.mailWaiting = 0; // matches waiting on ME, shown as a badge on the START menu

// the FireRed-style START menu (items depend on Test Realm mode)
export function startItems() {
	const items = ['POKeDEX', 'POKeMON', 'CARDS'];
	if (MP_ON) items.push('FRIENDS', S.mailWaiting > 0 ? `MAIL (${S.mailWaiting})` : 'MAIL');
	// BIKE had exactly ONE trigger in the whole game — the `c` key. There is no
	// touch button for it and bike items are kind:'key', which the bag doesn't
	// action, so a phone player could never mount up — and cracked floors are
	// gated on player.biking, which made SKY PILLAR literally impassable on a
	// phone. Hidden while surfing, where toggleBike refuses anyway.
	items.push('BAG');
	if (hasPhone()) items.push('PHONE');
	// Crystal's POKéGEAR RADIO (the RADIO CARD from Goldenrod's quiz): a radio you
	// carry, so the POKé FLUTE station can play beside Vermilion's SNORLAX
	if (Story.getFlag('ENGINE_RADIO_CARD')) items.push('RADIO');
	items.push('TOWN MAP', 'PC');
	if (!player.surfing) items.push(player.biking ? 'ON FOOT' : 'BIKE');
	// GAMES: the site's Games switcher (Home and every game), reachable with the
	// buttons alone — a hold of Esc / Start+Select / the ⚙️ open it too
	items.push('CARD', 'QUEST', 'SAVE', 'OPTION', 'GAMES', 'EXIT');
	return items;
}
export const cardsItems = () => MP_ON
	? ['GALLERY', 'DECK BUILDER', 'PACKS', 'DUNGEON RUN', 'CHALLENGE FRIEND', 'BACK']
	: ['GALLERY', 'DECK BUILDER', 'PACKS', 'DUNGEON RUN', 'BACK'];
// DUNGEON RUN opens a submenu of the three run modes
export const runModeItems = () => ['OG DUNGEON RUN', 'DALARAN HEIST', 'TOMBS OF TERROR', 'DUELS', 'BACK'];
const CARD_URLS = {
	'GALLERY': 'viewer.html', 'DECK BUILDER': 'deck.html', 'PACKS': 'packs.html',
	'OG DUNGEON RUN': '?dungeon=1', 'DALARAN HEIST': '?heist=1', 'TOMBS OF TERROR': '?tombs=1', 'DUELS': '?duels=1',
};
function openCardPage(label) {
	saveBeforeLeave();   // whoever opens a card page, the position is saved first
	const q = MP_ON ? (label === 'DUNGEON RUN' ? '&mp=1' : '?mp=1') : '';
	const path = CARD_URLS[label];
	location.href = '/battlecards/' + (path.startsWith('?') ? path + (MP_ON ? '&mp=1' : '') : path + (MP_ON ? '?mp=1' : ''));
}

// the site's Games switcher (site/switcher.js) from the START menu. A TAP picks the
// row on pointerdown, so the same tap's click would land on whatever switcher tile
// is now under the finger and leave the page: that one click is swallowed.
function openGamesSwitcher() {
	const eat = e => { e.preventDefault(); e.stopImmediatePropagation(); };
	addEventListener('click', eat, { capture: true, once: true });
	setTimeout(() => removeEventListener('click', eat, { capture: true }), 700);
	window.__mpSwitcher?.open();
}
export function startKey(k) {
	const items = startItems();
	if (k === 'ArrowUp') startMenu.idx = (startMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') startMenu.idx = (startMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape' || k === 'Enter') { startMenu.open = false; return; }
	if (k === 'z') {
		const it = items[startMenu.idx];
		startMenu.open = false;
		if (it === 'POKeMON') { if (!S.party || !S.party.length) hud.textContent = 'You have no POKeMON yet! Visit the LAB to get one.'; else { partyMenu.open = true; partyMenu.idx = 0; partyMenu.summary = false; } }
		else if (it === 'BAG') { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; bagMenu.forget = null; bagMenu.ppPick = null; bagMenu.flash = null; }
		else if (it === 'CARDS') { cardsMenu.open = true; cardsMenu.idx = 0; }
		else if (it === 'PHONE') openPhoneMenu();
		else if (it === 'RADIO') { startMenu.open = false; openRadio(); }
		else if (it === 'FRIENDS') { openFriends(); }
		else if (it.startsWith('MAIL')) { openMailbox(); }
		else if (it === 'POKeDEX') { dexMenu.open = true; dexMenu.idx = 0; dexMenu.detail = false; dexMenu.grid = false; }
		else if (it === 'CARD') { trainerCard.open = true; trainerCard.page = 0; }
		else if (it === 'QUEST') { questMenu.open = true; questMenu.idx = 0; questMenu.page = 0; }
		else if (it === 'TOWN MAP') { openTownMap(); }
		else if (it === 'BIKE' || it === 'ON FOOT') { toggleBike(); }
		// the PC was reachable ONLY at a CENTER counter, yet a catch on a full
		// party silently goes to a box you then could not open
		else if (it === 'PC') { pcMenu.open = true; }
		else if (it === 'SAVE') { saveParty(S.party); savePos(); dialog.open('Your journey has been saved.'); }
		else if (it === 'OPTION') { optionsMenu.open = true; optionsMenu.idx = 0; optionsMenu.mode = 'main'; optionsMenu.flash = null; optionsMenu.busy = false; }
		else if (it === 'GAMES') openGamesSwitcher();
		else if (it === 'EXIT' && S.visiting) { leaveVisit(); }
		// EXIT just closes
	}
}

export function questKey(k) {
	// ◄ ► flips between the quest LOG (page 0) and the THINGS TO DO checklist (1)
	if (k === 'ArrowLeft' || k === 'ArrowRight') { questMenu.page = 1 - questMenu.page; questMenu.idx = 0; return; }
	const n = questMenu.page === 1 ? THINGS_TO_DO.length : Quest.log(playerRegion()).length;
	if (k === 'ArrowUp') questMenu.idx = (questMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') questMenu.idx = (questMenu.idx + 1) % n;
	if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') questMenu.open = false;
}

export function playerMenuKey(k) {
	const items = PLAYER_MENU_ITEMS;
	if (k === 'ArrowUp') playerMenu.idx = (playerMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') playerMenu.idx = (playerMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { playerMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const it = items[playerMenu.idx];
		const who = playerMenu.target;
		playerMenu.open = false;
		if (!who) return;
		const f = S.friends.find(fr => fr.username === who) || { username: who };
		if (it === 'POKeMON BATTLE') sendChallenge(f);
		else if (it === 'MAIL BATTLE') sendMailChallenge(f);
		else if (it === 'CARD BATTLE') sendCardChallenge(f);
		else if (it === 'TRADE') startTrade(f);
		// CANCEL just closes
	}
}
export function drawPlayerMenu(W, H) {
	drawVertical(W, H, H / 480, playerMenu.target || 'PLAYER',
		'Challenge them or offer a trade.', PLAYER_MENU_ITEMS, playerMenu.idx, 'player');
}
// the deck-selection phase: list the account's class decks (10+ cards) and call
// onPick({ classId, count, deck }). Auto-picks when there's only one option.
export async function openDeckSelect(prompt, onPick) {
	let st; try { st = await MP.freshState(); } catch (e) { st = MP.cachedState(); }
	const decks = ((st && st.decks) || [])
		.filter(d => d && Array.isArray(d.cards) && d.cards.length >= 40)
		.map(d => ({ classId: d.classId, count: d.cards.length, deck: d.cards, name: d.name, id: d.id, commander: d.commander || null, companion: d.companion || null }));
	if (!decks.length) { dialog.open('You have no decks :('); return; }
	if (decks.length === 1) { onPick(decks[0]); return; }
	deckSelect.open = true; deckSelect.idx = 0; deckSelect.decks = decks;
	deckSelect.onPick = onPick; deckSelect.prompt = prompt || 'Choose your deck';
}
export function deckSelectKey(k) {
	const n = deckSelect.decks.length;
	if (k === 'ArrowUp') deckSelect.idx = (deckSelect.idx + n - 1) % n;
	if (k === 'ArrowDown') deckSelect.idx = (deckSelect.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { deckSelect.open = false; deckSelect.onPick = null; return; }
	if (k === 'z' || k === 'Enter') {
		const picked = deckSelect.decks[deckSelect.idx], cb = deckSelect.onPick;
		deckSelect.open = false; deckSelect.onPick = null;
		if (cb && picked) cb(picked);
	}
}
export function drawDeckSelect(W, H) {
	const labels = deckSelect.decks.map(d => `${(d.name || d.classId).toUpperCase()}  ·  ${d.classId.replace(/_/g, ' ')} (${d.count})`);
	drawVertical(W, H, H / 480, 'SELECT DECK', deckSelect.prompt, labels, deckSelect.idx, 'deck');
}
export function offerLines(o) {
	const out = [], n = v => (Math.floor(+v) || 0).toLocaleString();
	if (!o) return out;
	if (o.stars) out.push(`Stars x${n(o.stars)}`);
	if (o.dust) out.push(`Dust x${n(o.dust)}`);
	if (o.gold) out.push(`Gold x${n(o.gold)}`);
	if (o.money) out.push(`Money $${n(o.money)}`);
	if (o.coins) out.push(`Game Corner coins x${n(o.coins)}`);
	if (o.ms && o.ms.coins) out.push(`MicaSurvivor coins x${n(o.ms.coins)}`);
	if (o.ms && o.ms.t1) out.push(`MicaSurvivor tickets x${n(o.ms.t1)}`);
	if (o.ms && o.ms.t10) out.push(`MicaSurvivor 10-pull tickets x${n(o.ms.t10)}`);
	for (const [id, c] of Object.entries(o.cards || {})) out.push(`${prettyId(id)} x${c}`);
	if (o.packs) out.push(`Card Pack x${o.packs}`);
	for (const [id, c] of Object.entries((o.pk && o.pk.prints) || {})) out.push(`${trade.pkName ? trade.pkName(id) : id} x${c} (Pocket)`);
	if (o.pk && o.pk.packs) out.push(`Pocket Pack x${o.pk.packs}`);
	for (const [id, c] of Object.entries((o.pk && o.pk.own) || {})) out.push(`${boosterLabel(id)} x${c} (Pocket)`);
	for (const m of (o.pokemon || [])) out.push(`${m.name} Lv.${m.level}`);
	for (const it of (o.items || [])) out.push(`${Bag.nameOf(it.id)} x${it.count}`);
	return out;
}
// The trade screen works as the Inventory's trade window does (inventory/inventory.js): my offer on one side of a line,
// the other player's on the other; a side that has locked in is outlined and says so; when both have, a four-second
// countdown; then a link-cable scene while the trade is carried out, and what each received.
export const TRADE_SCENE_MS = 4200;
export function tradeView() {   // (what is on screen now: 'offers' | 'countdown' | 'scene' | 'end')
	if (trade.scene && !(trade.done && performance.now() - trade.scene >= TRADE_SCENE_MS)) return 'scene';
	if (trade.done) return 'end';
	return trade.goAt ? 'countdown' : 'offers';
}
function drawTradeScene(W, H, u) {
	const t = (performance.now() - trade.scene) / 1000, cx = W / 2, cy = H * 0.44, uw = 96 * u, uh = 132 * u, gap = Math.min(W * 0.26, 190 * u);
	const me = (S.mpAccount && S.mpAccount.username) || 'YOU';
	const unit = (x, name) => {
		sctx.fillStyle = '#8c95b5'; sctx.fillRect(x - uw / 2, cy - uh / 2, uw, uh);
		sctx.fillStyle = '#2a3140'; sctx.fillRect(x - uw / 2 + 8 * u, cy - uh / 2 + 10 * u, uw - 16 * u, uh * 0.44);
		sctx.fillStyle = '#9fe6a0'; sctx.font = `${10 * u}px monospace`; sctx.textAlign = 'center'; sctx.fillText(String(name).slice(0, 10), x, cy - uh / 2 + 10 * u + uh * 0.25);
		sctx.fillStyle = '#3b4258'; sctx.fillRect(x - uw / 2 + 12 * u, cy + uh * 0.14, 22 * u, 7 * u); sctx.fillRect(x - uw / 2 + 19.5 * u, cy + uh * 0.14 - 7.5 * u, 7 * u, 22 * u);   // the d-pad
		sctx.fillStyle = '#c0504d'; sctx.beginPath(); sctx.arc(x + uw / 2 - 16 * u, cy + uh * 0.15, 6 * u, 0, 7); sctx.arc(x + uw / 2 - 32 * u, cy + uh * 0.22, 6 * u, 0, 7); sctx.fill();   // A and B
	};
	const xl = cx - gap, xr = cx + gap, x0 = xl + uw / 2, x1 = xr - uw / 2, wy = cy + uh * 0.2;
	// the cable, sagging between the two
	sctx.strokeStyle = '#5a6384'; sctx.lineWidth = 4 * u; sctx.beginPath(); sctx.moveTo(x0, wy); sctx.quadraticCurveTo(cx, wy + 34 * u, x1, wy); sctx.stroke();
	unit(xl, me); unit(xr, trade.them);
	// my bundle travels down the cable one way, theirs the other; they pass in the middle
	const at = p => { const q = Math.max(0, Math.min(1, p)); return [x0 + (x1 - x0) * q, wy + 34 * u * 2 * q * (1 - q)]; };
	const ball = (p, col) => { const [bx, by] = at(p); sctx.fillStyle = col; sctx.beginPath(); sctx.arc(bx, by, 7 * u, 0, 7); sctx.fill(); sctx.fillStyle = '#fff'; sctx.beginPath(); sctx.arc(bx - 2 * u, by - 2 * u, 2 * u, 0, 7); sctx.fill(); };
	const p = (t % 2.1) / 2.1;
	ball(p, '#ffd25f'); ball(1 - p, '#7cc7ff');
	sctx.textAlign = 'center'; sctx.fillStyle = '#fff'; sctx.font = `bold ${14 * u}px monospace`;
	sctx.fillText('TRADING' + '.'.repeat(1 + (Math.floor(t * 2) % 3)), cx, cy - uh / 2 - 22 * u);
	sctx.fillStyle = '#dfe3ee'; sctx.font = `${9 * u}px monospace`;
	sctx.fillText(trade.phase === 'wait' ? (trade.handing ? 'Handing over…' : trade.status || '') : `${me} and ${trade.them} are trading. Do not close the game.`, cx, cy + uh / 2 + 34 * u);
	sctx.textAlign = 'left';
}
function drawTradeEnd(W, H, u) {
	const t = trade.final || {}, mineSide = trade.role === 'a' ? 'A' : 'B', theirSide = mineSide === 'A' ? 'B' : 'A';
	const got = offerLines(t['offer' + theirSide]), gave = offerLines(t['offer' + mineSide]);
	sctx.textAlign = 'center'; sctx.fillStyle = '#7CFC7C'; sctx.font = `bold ${16 * u}px monospace`; sctx.fillText('TRADE COMPLETE!', W / 2, 96 * u);
	sctx.strokeStyle = '#ffd25f'; sctx.lineWidth = 2 * u; sctx.beginPath(); sctx.moveTo(W / 2, 116 * u); sctx.lineTo(W / 2, H - 70 * u); sctx.stroke();
	sctx.textAlign = 'left';
	const col = (x, title, lines) => {
		sctx.font = `bold ${11 * u}px monospace`; sctx.fillStyle = '#fff'; sctx.fillText(title, x, 130 * u);
		sctx.font = `${9 * u}px monospace`; let y = 148 * u;
		if (!lines.length) { sctx.fillStyle = '#888'; sctx.fillText('(nothing)', x, y); }
		else for (const ln of lines.slice(0, 14)) { sctx.fillStyle = '#dfe3ee'; sctx.fillText(ln, x, y); y += 13 * u; }
	};
	col(24 * u, 'YOU RECEIVED', got); col(W / 2 + 12 * u, `${trade.them} RECEIVED`, gave);
	sctx.textAlign = 'center'; sctx.fillStyle = '#8892a8'; sctx.font = `${9 * u}px monospace`; sctx.fillText('Z  close     (POKeMON are in your PC box)', W / 2, H - 40 * u);
	sctx.textAlign = 'left';
	S.menuUi.push({ id: 'trade:0', x: 0, y: 70 * u, w: W, h: H - 70 * u, label: '' });
}
export function drawTrade(W, H) {
	const u = H / 480, view = tradeView();
	menuChrome(W, H, u, 'TRADE — ' + trade.them, view === 'scene' || view === 'end' ? '' : trade.status || '', false);
	sctx.textAlign = 'left';
	if (view === 'scene') { drawTradeScene(W, H, u); return; }
	if (view === 'end') { drawTradeEnd(W, H, u); return; }
	const panel = (x, w, title, offer, locked) => {
		// a side that has locked in is outlined, and says so
		if (locked) { sctx.strokeStyle = '#7CFC7C'; sctx.lineWidth = 2 * u; sctx.strokeRect(x - 8 * u, 68 * u, w, 130 * u); sctx.fillStyle = 'rgba(124,252,124,0.08)'; sctx.fillRect(x - 8 * u, 68 * u, w, 130 * u); }
		sctx.font = `bold ${11 * u}px monospace`;
		sctx.fillStyle = locked ? '#7CFC7C' : '#fff';
		sctx.fillText(title, x, 82 * u);
		if (locked) { sctx.textAlign = 'right'; sctx.font = `bold ${8 * u}px monospace`; sctx.fillText('LOCKED IN', x - 8 * u + w - 6 * u, 82 * u); sctx.textAlign = 'left'; }
		sctx.font = `${9 * u}px monospace`;
		const lines = offerLines(offer);
		let y = 97 * u;
		if (!lines.length) { sctx.fillStyle = '#888'; sctx.fillText('(nothing)', x, y); }
		else for (const ln of lines.slice(0, 8)) { sctx.fillStyle = '#dfe3ee'; sctx.fillText(ln, x, y); y += 12.5 * u; }
		if (lines.length > 8) { sctx.fillStyle = '#8892a8'; sctx.textAlign = 'right'; sctx.fillText(`…and ${lines.length - 8} more`, x - 8 * u + w - 6 * u, 194 * u); sctx.textAlign = 'left'; }
	};
	const pw = W / 2 - 28 * u;
	panel(24 * u, pw, 'YOUR OFFER', trade.mine, trade.myAccept);
	panel(W / 2 + 20 * u, pw, `${trade.them}'S OFFER`, trade.theirs, trade.theirAccept);
	// the line between my things and theirs
	sctx.strokeStyle = '#ffd25f'; sctx.lineWidth = 2 * u; sctx.beginPath(); sctx.moveTo(W / 2, 66 * u); sctx.lineTo(W / 2, 200 * u); sctx.stroke();
	if (view === 'countdown') {
		// both locked in: the seconds left, on the line. Either of us can still back out.
		const left = Math.max(1, Math.ceil((trade.goAt - performance.now()) / 1000));
		sctx.fillStyle = 'rgba(10,8,18,0.9)'; sctx.beginPath(); sctx.arc(W / 2, 133 * u, 30 * u, 0, 7); sctx.fill();
		sctx.strokeStyle = '#ffd25f'; sctx.lineWidth = 3 * u; sctx.beginPath(); sctx.arc(W / 2, 133 * u, 30 * u, 0, 7); sctx.stroke();
		sctx.textAlign = 'center'; sctx.fillStyle = '#ffd25f'; sctx.font = `bold ${34 * u}px monospace`; sctx.fillText(String(left), W / 2, 145 * u); sctx.textAlign = 'left';
	}
	// category tabs + hint
	sctx.font = `bold ${9 * u}px monospace`;
	{ const step = Math.min(66 * u, (W - 48 * u) / TRADE_CATS.length); TRADE_CATS.forEach((c, i) => { sctx.fillStyle = i === trade.cat ? '#ffd25f' : '#8892a8'; sctx.fillText(c, 24 * u + i * step, 212 * u); }); }
	sctx.fillStyle = '#8892a8'; sctx.font = `${7 * u}px monospace`;
	sctx.fillText('< > category   up/down move   Z add / X remove' + (TRADE_CATS[trade.cat] === 'MONEY' ? `   C amount per press: ${TRADE_STEPS[trade.step].toLocaleString()}` : ''), 24 * u, 224 * u);
	if (TRADE_CATS[trade.cat] === 'MONEY') S.menuUi.push({ id: 'tradestep:0', x: 24 * u, y: 214 * u, w: W - 48 * u, h: 14 * u, label: '' });   // (a tap on the hint changes the amount, for a touch screen)
	TRADE_CATS.forEach((cname, i) => { const step = Math.min(66 * u, (W - 48 * u) / TRADE_CATS.length); S.menuUi.push({ id: 'tradecat:' + i, x: 24 * u + i * step, y: 200 * u, w: step, h: 14 * u, label: '' }); });   // (and a tap on a category goes to it)
	// inventory + action rows
	const rows = trade.rows, listTop = 236 * u, rowH = 19 * u;
	const maxRows = Math.max(1, Math.floor((H - listTop - 10 * u) / rowH));
	const start = Math.max(0, Math.min(trade.idx - (maxRows >> 1), Math.max(0, rows.length - maxRows)));
	for (let vi = 0; vi < Math.min(maxRows, rows.length); vi++) {
		const i = start + vi, r = rows[i]; if (!r) break;
		const y = listTop + vi * rowH, sel = i === trade.idx, bx = 24 * u, bw = W - 48 * u;
		if (sel) { sctx.fillStyle = 'rgba(255,210,95,0.22)'; sctx.fillRect(bx, y, bw, rowH - 3 * u); }
		sctx.fillStyle = r.kind === 'cancel' ? '#ff8a8a' : r.kind === 'accept' ? '#7CFC7C' : '#fff';
		sctx.font = `${9 * u}px monospace`;
		let lab = r.label;
		if (r.owned != null) lab += `   x${(+r.owned || 0).toLocaleString()}` + (r.off ? `  → offering ${(+r.off).toLocaleString()}` : '');
		else if (r.off) lab += '  (offered)';
		sctx.fillText(lab, bx + 8 * u, y + 13 * u);
		S.menuUi.push({ id: 'trade:' + i, x: bx, y, w: bw, h: rowH - 3 * u, label: '' });
	}
}

export function dexKey(k) {
	const list = dexList();
	if (dexMenu.detail) {
		if (k === 'ArrowUp') dexMenu.idx = (dexMenu.idx + list.length - 1) % list.length;
		if (k === 'ArrowDown') dexMenu.idx = (dexMenu.idx + 1) % list.length;
		// 1,366 cries shipped and the dex never played one — Z gives it a voice
		if (k === 'z' || k === 'Enter') { const e = list[dexMenu.idx]; if (e && Dex.isSeen(e.id)) cry(e.id); }
		if (k === 'x' || k === 'Escape') dexMenu.detail = false;
		return;
	}
	// T / R / F cycle the type, region and caught-status filters
	if (k === 't' || k === 'r' || k === 'f') {
		if (k === 't') dexMenu.typeI = ((dexMenu.typeI || 0) + 1) % DEX_TYPES.length;
		if (k === 'r') dexMenu.regionI = ((dexMenu.regionI || 0) + 1) % DEX_REGIONS.length;
		if (k === 'f') dexMenu.caughtI = ((dexMenu.caughtI || 0) + 1) % DEX_CAUGHT.length;
		dexMenu.idx = 0;
		return;
	}
	// G toggles the LIVING DEX grid (a visual completion wall) vs the list
	if (k === 'g') { dexMenu.grid = !dexMenu.grid; return; }
	if (!list.length) { if (k === 'x' || k === 'Escape') dexMenu.open = false; return; }
	// the grid steps a full row (DEX_GRID_COLS) up/down; the list steps a page of 9
	const rowStep = dexMenu.grid ? DEX_GRID_COLS : 9;
	if (dexMenu.grid) {
		if (k === 'ArrowLeft') dexMenu.idx = Math.max(0, dexMenu.idx - 1);
		if (k === 'ArrowRight') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + 1);
		if (k === 'ArrowUp') dexMenu.idx = Math.max(0, dexMenu.idx - rowStep);
		if (k === 'ArrowDown') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + rowStep);
	} else {
		if (k === 'ArrowUp') dexMenu.idx = (dexMenu.idx + list.length - 1) % list.length;
		if (k === 'ArrowDown') dexMenu.idx = (dexMenu.idx + 1) % list.length;
		if (k === 'ArrowLeft') dexMenu.idx = Math.max(0, dexMenu.idx - rowStep);
		if (k === 'ArrowRight') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + rowStep);
	}
	if (k === 'z' || k === 'Enter') { const e = list[dexMenu.idx]; if (e && Dex.isSeen(e.id)) dexMenu.detail = true; }
	if (k === 'x' || k === 'Escape') dexMenu.open = false;
}

export function cardsKey(k) {
	const items = cardsItems();
	if (k === 'ArrowUp') cardsMenu.idx = (cardsMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') cardsMenu.idx = (cardsMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { cardsMenu.open = false; return; }
	if (k === 'z') {
		const it = items[cardsMenu.idx];
		if (it === 'BACK') { cardsMenu.open = false; startMenu.open = true; return; }
		if (it === 'CHALLENGE FRIEND') { cardsMenu.open = false; openFriends('card'); return; }
		if (it === 'DUNGEON RUN') { cardsMenu.open = false; runMenu.open = true; runMenu.idx = 0; return; }
		saveParty(S.party); savePos();
		openCardPage(it);
	}
}

// the run-mode submenu: OG Dungeon Run / Dalaran Heist / Tombs of Terror
export function runKey(k) {
	const items = runModeItems();
	if (k === 'ArrowUp') runMenu.idx = (runMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') runMenu.idx = (runMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { runMenu.open = false; cardsMenu.open = true; return; }
	if (k === 'z') {
		const it = items[runMenu.idx];
		if (it === 'BACK') { runMenu.open = false; cardsMenu.open = true; return; }
		saveParty(S.party); savePos();
		openCardPage(it);
	}
}

// ---- friends ----
export const friendsChallenge = { mode: null }; // null | 'card' | 'pokemon'
async function openFriends(challengeType) {
	friendsChallenge.mode = challengeType || null;
	friendsMenu.open = true;
	friendsMenu.idx = 0;
	friendsMenu.badges = null;
	refreshFriendBadges(); // the inbox row fills in as the counts land
	await refreshFriends();
}
// pending battle challenges + trade offers, surfaced as the INBOX badge —
// async PvP existed but nothing TOLD you a challenge was waiting
export async function refreshFriendBadges() {
	if (!MP_ON) { friendsMenu.badges = { ch: 0, tr: 0 }; return; }
	try {
		const [c, t] = await Promise.all([MP.call('challenges'), MP.call('trade-list')]);
		friendsMenu.badges = { ch: (c?.challenges || []).length, tr: (t?.trades || []).length };
	} catch (e) { friendsMenu.badges = { ch: 0, tr: 0 }; }
}
export async function refreshFriends() {
	if (!MP_ON) return;
	const data = await MP.call('friends');
	if (data.friends) { S.friends = data.friends; if (S.mpAccount) S.mpAccount.friendCode = data.friendCode; }
}
export function friendsKey(k) {
	// rows: [Add friend] [Inbox] then each friend
	const rows = 2 + S.friends.length;
	if (k === 'ArrowUp') friendsMenu.idx = (friendsMenu.idx + rows - 1) % rows;
	if (k === 'ArrowDown') friendsMenu.idx = (friendsMenu.idx + 1) % rows;
	if (k === 'x' || k === 'Escape') { friendsMenu.open = false; return; }
	if (k === 'z') {
		if (friendsMenu.idx === 0) { promptAddFriend(); return; }
		if (friendsMenu.idx === 1) { friendsMenu.open = false; openTradeInbox(); return; }
		const f = S.friends[friendsMenu.idx - 2];
		if (!f) return;
		friendAction(f);
	}
}
async function promptAddFriend() {
	const code = ((await askText({ title: 'Enter your friend\'s 6-letter code:', maxLength: 6, charset: 'code' })) || '').toUpperCase().trim();
	if (!/^[A-Z]{6}$/.test(code)) { if (code) dialog.open('That is not a valid 6-letter friend code.'); return; }
	const data = await MP.call('add-friend', { code });
	if (data.error) { dialog.open(data.error); return; }
	await refreshFriends();
	dialog.open(`Added ${data.added} as a friend!`);
}
export function friendAction(f) {
	if (friendsChallenge.mode === 'card') {
		friendsMenu.open = false; friendsChallenge.mode = null;
		if (!f.online) { dialog.open(`${f.username} is offline right now.`); return; }
		sendCardChallenge(f);
		return;
	}
	if (!f.online) {
		// offline is exactly when the ASYNC options matter
		friendsMenu.open = false;
		dialog.open(`${f.username} is offline right now.\n\nZ = Offer a POKeMON trade   X = Cancel`, declined => {
			if (declined !== 'x') openTradeOffer(f);
		});
		return;
	}
	friendsMenu.open = false;
	// battling friend → offer to spectate; otherwise a challenge/visit choice
	if ((f.status || '').startsWith('battling:')) {
		const matchId = f.status.slice('battling:'.length);
		dialog.open(`${f.username} is in a battle!\n\nPress Z to SPECTATE, X to cancel.`, (declined) => {
			if (declined !== 'x') enterMatch(matchId, true);
		});
		return;
	}
	// friend is in a card game → offer to watch it (navigates to Battlecards)
	if ((f.status || '').startsWith('card:')) {
		const mode = f.status.slice('card:'.length);
		const what = mode === 'dungeon' ? 'dungeon run' : 'card battle';
		dialog.open(`${f.username} is in a ${what}!  Z=Watch  X=Cancel`, (declined) => {
			if (declined !== 'x') { saveBeforeLeave(); location.href = '/battlecards/?spectate=' + encodeURIComponent(f.username) + '&mp=1'; }
		});
		return;
	}
	if ((f.status || '').startsWith('factory:')) {
		const label = f.status.slice('factory:'.length) || 'BATTLE FRONTIER';
		dialog.open(`${f.username} is in the ${label}!\n\nZ = Watch   X = Cancel`, (declined) => {
			if (declined !== 'x') { saveBeforeLeave(); location.href = '/overworld/?watchfactory=' + encodeURIComponent(f.username) + '&mp=1'; }
		});
		return;
	}
	// friend is playing MICATRO (the poker roguelike at /micatro/) → offer to watch it
	if ((f.status || '').startsWith('micatro:')) {
		const href = watchHref({ username: f.username, kind: 'micatro' });
		const act = micatroActivityLabel(f.region || f.status.slice('micatro:'.length)).toUpperCase();
		dialog.open(`${f.username}: ${act}!\n\nZ = Watch   X = Cancel`, (declined) => {
			if (declined !== 'x') { saveParty(S.party); savePos(); location.href = href; }
		});
		return;
	}
	// friend is playing SCOUNDREL (/scoundrel/) → offer to watch it
	if ((f.status || '').startsWith('scoundrel:')) {
		const href = watchHref({ username: f.username, kind: 'scoundrel' });
		const act = scoundrelActivityLabel(f.region || f.status.slice('scoundrel:'.length)).toUpperCase();
		dialog.open(`${f.username}: ${act}!

Z = Watch   X = Cancel`, (declined) => {
			if (declined !== 'x') { saveParty(S.party); savePos(); location.href = href; }
		});
		return;
	}
	// friend is playing PAIR OF PEARS (/pairofpears/) → offer to watch it
	if ((f.status || '').startsWith('pears:')) {
		const href = watchHref({ username: f.username, kind: 'pears' });
		const act = pearsActivityLabel(f.region || f.status.slice('pears:'.length)).toUpperCase();
		dialog.open(`${f.username}: ${act}!

Z = Watch   X = Cancel`, (declined) => {
			if (declined !== 'x') { saveParty(S.party); savePos(); location.href = href; }
		});
		return;
	}
	// friend is playing POCKET ENHANCED (/pocketenhanced/) → offer to watch it
	if ((f.status || '').startsWith('pocket:')) {
		const href = watchHref({ username: f.username, kind: 'pocket' });
		const act = pocketActivityLabel(f.region || f.status.slice('pocket:'.length)).toUpperCase();
		dialog.open(`${f.username}: ${act}!

Z = Watch   X = Cancel`, (declined) => {
			if (declined !== 'x') { saveParty(S.party); savePos(); location.href = href; }
		});
		return;
	}
	// friend is in a MICASURVIVOR run (/micasurvivor/, M5 batch 12c) → offer to watch it live
	if ((f.status || '') === 'micasurvivor:run') {
		const href = watchHref({ username: f.username, kind: 'micasurvivor' });
		const act = micasurvivorActivityLabel(f.region).toUpperCase();
		dialog.open(`${f.username}: ${act}!\n\nZ = Watch   X = Cancel`, (declined) => {
			if (declined !== 'x') { saveParty(S.party); savePos(); location.href = href; }
		});
		return;
	}
	dialog.open(`${f.username}:  Z=Battle challenge  X=More…`, (declined) => {
		if (declined !== 'x') { sendChallenge(f); return; }
		dialog.open(`${f.username}:  Z=Visit world  X=Offer a trade`, (d2) => {
			if (d2 === 'x') openTradeOffer(f);
			else visitWorld(f);
		});
	});
}
