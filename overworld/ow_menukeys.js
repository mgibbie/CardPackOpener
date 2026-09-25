// ow_menukeys.js — the menus' input layer: the key router (pressKey), menu gating (menuBlocking / canvasMenuOpen), and the key handlers for the bag, PC, shops, BP exchange, ferry, portals and starter picker.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only. The drawing side is ow_menus.js.
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import { statsFor } from './battle.js';
import * as BUI from './battleui.js';
import * as Story from './events.js';
import * as Frontier from './frontier.js';
import { battle, cutscene, dialog, encounters, evolution, factorySpec, hud, player, pvp, screen, sctx, trainers, world } from './ow_core.js';
import { menuChrome } from './ow_menus.js';
import { mailKey, shopStockNow, tradeKey } from './ow_pvp.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { blendKey, blendMenu, contestKey, contestMenu, slideKey, slideMenu, unownDex, unownDexKey } from './ow_venues.js';
import { slotsKey, slotsMenu } from './ow_minigames.js';
import {
	REPEL_LAST_KEY, STARTERS, beginNewGame, cardsKey, cardsMenu, cycleForm, daycareKey, daycareMenu,
	deckSelect, deckSelectKey, decoKey, decoMenu, dexKey, dexMenu, fading, finishStarterPick, flyTo,
	formsOf, friendsKey, friendsMenu, gcKey, gcMenu, halfParty, halfPartyKey, interact, levelCapNow,
	mailMenu, moveShop, moveShopKey, moveToMap, nameRater, nameRaterKey, npcTradeKey,
	openPartyAction, optionsKey, optionsMenu, partyMenu, playerMenu, playerMenuKey, playerRegion,
	questKey, questMenu, radioKey, radioMenu, refreshFollower, refreshObjective, repelSteps, runKey,
	runMenu, saveFlute, setRepel, socialKey, socialMenu, startKey, startMenu, startWildBattle,
	starterMenu, toggleBike, townKey, townMap, trade, tradeMenu, trainerCard, useFieldMove,
	useGadget, vfKey, vfMenu,
} from './main.js';

// ---------- BP EXCHANGE (spend Battle Frontier points) ----------
export const bpShopMenu = { open: false, idx: 0, onClose: null };
function bpItemName(id) { return (Bag.ITEMS[id]?.name || id).toUpperCase(); }
export function openBpShop(onClose) { bpShopMenu.open = true; bpShopMenu.idx = 0; bpShopMenu.onClose = onClose || null; }
function closeBpShop() { bpShopMenu.open = false; const cb = bpShopMenu.onClose; bpShopMenu.onClose = null; if (cb) cb(); }
export function bpShopKey(k) {
	const items = Frontier.BP_SHOP;
	if (k === 'ArrowUp') bpShopMenu.idx = (bpShopMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') bpShopMenu.idx = (bpShopMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { closeBpShop(); return; }
	if (k === 'z' || k === 'Enter') {
		const it = items[bpShopMenu.idx];
		if (Frontier.getBP() < it.cost) { dialog.open(`Not enough BP.\n\n${bpItemName(it.id)} costs ${it.cost} BP;\nyou have ${Frontier.getBP()}.`); return; }
		Frontier.spendBP(it.cost); Bag.addItem(it.id); Bag.registerName(it.id, bpItemName(it.id));
		dialog.open(`You exchanged BP for a ${bpItemName(it.id)}!\n\nBP remaining: ${Frontier.getBP()}.`);
	}
}
export function drawBpShopMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'BP EXCHANGE', `You have ${Frontier.getBP()} BP.    (X to leave)`);
	Frontier.BP_SHOP.forEach((it, i) => {
		const bid = 'bp:' + i;
		const b = { id: bid, x: 24 * u, y: (80 + i * 40) * u, w: W - 48 * u, h: 34 * u,
			label: `${bpItemName(it.id)}   —   ${it.cost} BP`, center: true, kbSel: bpShopMenu.idx === i };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === bid || bpShopMenu.idx === i, u);
	});
}
export const ferryMenu = { open: false, idx: 0 };
export const FERRY_DESTS = [
	{ label: 'Vermilion Harbor (Kanto)', file: 'SSAnne_Exterior' },
	{ label: 'Olivine Port (Johto)', file: 'OlivinePort' },
	{ label: 'Slateport Harbor (Hoenn)', file: 'SlateportCity_Harbor' },
	// post-game island routes — a champion's SEAGALLOP / EON ferry to the orphaned lairs
	{ label: 'Sevii Islands (Seagallop)', file: 'OneIsland', requires: () => Badges.isChampion('KANTO') },
	{ label: 'Southern Island (Eon)', file: 'SouthernIsland_Exterior', requires: () => Badges.isChampion('HOENN') },
	{ label: 'Birth Island', file: 'BirthIsland_Exterior', requires: () => Badges.isChampion('HOENN') },
	{ label: 'Faraway Island', file: 'FarawayIsland_Entrance', requires: () => Badges.isChampion('HOENN') },
	{ label: 'Battle Frontier', file: 'BattleFrontier_OutsideWest', requires: () => Badges.isChampion('HOENN') },
	// NAVEL ROCK — 22 connected maps that had no inbound edge from anywhere, so
	// the whole island was unreachable. It is Kanto's answer to Hoenn's event
	// islands: a long climb to HO-OH at the top and a long descent to LUGIA at
	// the bottom. FRLG gives it no wild encounters either — the emptiness of the
	// climb is the design, the legendary is the payoff.
	{ label: 'Navel Rock (Seagallop)', file: 'NavelRock_Harbor', requires: () => Badges.isChampion('KANTO') },
	// S.S. TIDAL — three maps wired to each other and to nothing else. This port
	// has its own ferry, so the decomp's boarding state machine stays blocked and
	// you simply walk aboard. regionparity_test asserts Scott's cameo is armed in
	// the corridor; until now that was a map nobody could stand on.
	{ label: 'S.S. Tidal (Hoenn liner)', file: 'SSTidalCorridor' },
];
function ferryKey(k) {
	const dests = FERRY_DESTS.filter(d => d.file !== world.current.name && (!d.requires || d.requires()));
	if (k === 'ArrowUp') ferryMenu.idx = (ferryMenu.idx + dests.length - 1) % dests.length;
	if (k === 'ArrowDown') ferryMenu.idx = (ferryMenu.idx + 1) % dests.length;
	if (k === 'x' || k === 'Escape') ferryMenu.open = false;
	if (k === 'z' || k === 'Enter') {
		const dest = dests[ferryMenu.idx];
		ferryMenu.open = false;
		moveToMap(dest.file).then(() => dialog.open(`The ferry sets sail...\n\nWelcome to ${dest.label}!`));
	}
}
// inter-region PORTAL destination menu (opened from a portal pad). dests = the two
// other shared regions' same-tier gym towns (portals.js destsFor); + a Cancel row.
export const portalMenu = { open: false, idx: 0, dests: [], town: null };
function portalKey(k) {
	const n = portalMenu.dests.length + 1; // + Cancel
	if (k === 'ArrowUp') portalMenu.idx = (portalMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') portalMenu.idx = (portalMenu.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { portalMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		if (portalMenu.idx >= portalMenu.dests.length) { portalMenu.open = false; return; } // Cancel
		const d = portalMenu.dests[portalMenu.idx];
		portalMenu.open = false;
		travelPortal(d);
	}
}
// step through: flip the current region so all region logic tracks you, then fly to the
// destination town's PC-front landing (right beside that town's own portal pad). flyTo's
// refreshMapContent re-registers the Fly point + reloads content under the new region.
export function travelPortal(d) {
	safeSaveStr('magepunk_region', d.regionLower);
	flyTo(d.mapId, d.x, d.y).then(() => { refreshObjective(); dialog.open(`You step through the PORTAL...\n\nWelcome to ${d.town}!`); });
}
// one-time teaching moment: the FIRST time a cross-region tier wall turns the player
// back, explain the badge-thirds rule + point them at the PORTAL. Villain seals and
// the pre-starter bounce don't count — only a real tier gate (qb.need > 0).
export function maybePortalTutorial(qb) {
	if (!qb || qb.villain || !(qb.need > 0) || Story.getFlag('tut_portal_seen')) return;
	Story.setFlag('tut_portal_seen');
	dialog.open('The way ahead is sealed!\n\n'
		+ 'GYM badges now come in THIRDS — you must beat this tier’s GYM in ALL THREE regions before the next one opens anywhere.\n\n'
		+ 'Look for the glowing PORTAL pad beside any GYM town’s POKeMON CENTER. It flies you to the other regions’ same-tier GYM towns. Beat their GYMS, then come back to advance!');
}
export const shopMenu = { open: false, idx: 0, mode: 'buy', fromScript: false };
// items the mart will buy back (must have a price); sell yields half
export function sellList() {
	return Object.entries(Bag.getBag())
		.filter(([id, n]) => n > 0 && Bag.ITEMS[id]?.price > 0)
		.map(([id, n]) => ({ id, n }));
}
export const sellPrice = id => Math.floor((Bag.ITEMS[id]?.price || 0) / 2);
export const bagMenu = { open: false, idx: 0, picking: false, pickIdx: 0, pocket: 0 };
// POCKETS. The bag was one flat list of up to 305 items in raw insertion order,
// seven rows at a time — balls, potions, TMs, berries, mints, vitamins and key
// items in a single undifferentiated column, and only TWO rows in a portrait
// battle. Every item already carries a `kind`, so the tabs cost nothing to key
// off; the ordering within a pocket is alphabetical rather than "whatever you
// picked up first".
export const BAG_POCKETS = [
	{ id: 'all', label: 'ALL', test: () => true },
	{ id: 'ball', label: 'BALLS', test: it => it?.kind === 'ball' },
	{ id: 'heal', label: 'MEDICINE', test: it => ['heal', 'revive', 'cure', 'ether'].includes(it?.kind) },
	{ id: 'berry', label: 'BERRIES', test: (it, id) => /berry$/.test(id) },
	{ id: 'held', label: 'HELD', test: (it, id) => it?.kind === 'held' && !/berry$/.test(id) },
	{ id: 'tm', label: 'TMs', test: (it, id) => it?.kind === 'tm' || !!tmMoveId(id) },
	{ id: 'key', label: 'KEY', test: it => ['key', 'charm', 'seeker', 'rod', 'form'].includes(it?.kind) },
	{ id: 'misc', label: 'OTHER', test: it => !it || ['misc', 'sell', 'candy', 'vitamin', 'mint', 'capsule', 'stone'].includes(it.kind) },
];
export function bagEntries() {
	const p = BAG_POCKETS[bagMenu.pocket] || BAG_POCKETS[0];
	return Object.entries(Bag.getBag())
		.filter(([id, n]) => n > 0 && p.test(Bag.ITEMS[id], id))
		.sort((a, b) => Bag.nameOf(a[0]).localeCompare(Bag.nameOf(b[0])));
}
// side 0 = party (deposit), 1 = box (withdraw). Storage stays ONE flat array
// (trade/dex read it whole); the 8 "boxes" are 30-slot pages over it.
export const PC_BOXES = 8, PC_BOX_CAP = 30;
const PC_SORTS = ['dex', 'level', 'shiny', 'name'];
export const pcMenu = { open: false, side: 0, idx: 0, box: 0, sort: 'dex', confirm: null, releaseMode: false, flash: null, filter: null };

// the search view: real storage indices whose mon matches the query. A query is
// a name/species fragment, an exact type, or the word "shiny" — enough to find
// one mon in 1,700 without paging 60 boxes.
export function pcMatches(box, q) {
	const out = [];
	box.forEach((m, i) => {
		const hit = q === 'shiny' ? !!m.shiny
			: (m.name || '').toLowerCase().includes(q) || (m.speciesId || '').includes(q)
				|| (m.types || []).some(t => t.toLowerCase() === q);
		if (hit) out.push(i);
	});
	return out;
}
// prompt-based like promptRename: headless-safe (no prompt -> filter unchanged)
function pcPromptSearch() {
	if (typeof prompt !== 'function') return;
	const q = prompt('Search storage: name, species, a type, or "shiny". Leave empty to clear.', pcMenu.filter || '');
	if (q == null) return;
	pcMenu.filter = q.trim().toLowerCase() || null;
	pcMenu.side = pcMenu.filter ? 1 : pcMenu.side;
	pcMenu.idx = 0;
	pcMenu.flash = pcMenu.filter ? `Searching for "${pcMenu.filter}".` : 'Search cleared.';
}

export function getBox() {
	const b = safeLoad('magepunk_box_v1', []);
	return Array.isArray(b) ? b : [];
}
export function setBox(box) {
	safeSave('magepunk_box_v1', box);
}
// total shinies owned across the party and PC boxes (Trainer Card, Batch 6c)
export function shinyOwnedCount() {
	return (S.party || []).filter(m => m?.shiny).length + getBox().filter(m => m?.shiny).length;
}
// snapshot the current frame (the Trainer Card is up) → PNG, then share it via the
// Web Share API when available, else save it as a download. Mirrors battlecards'
// deck/replay sharing. Returns the data URL (for tests). (Batch 6 follow-up)
export async function shareTrainerCard() {
	let url;
	try { url = screen.toDataURL('image/png'); } catch (e) { return null; }
	const name = localStorage.getItem('magepunk_name') || 'TRAINER';
	const fname = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-trainer-card.png`;
	try {
		const blob = await (await fetch(url)).blob();
		const file = new File([blob], fname, { type: 'image/png' });
		if (navigator.canShare && navigator.canShare({ files: [file] })) {
			await navigator.share({ files: [file], title: 'Trainer Card', text: `${name}'s Magepunk trainer card` });
			hud.textContent = 'Shared your Trainer Card!';
			return url;
		}
	} catch (e) { /* share unavailable or cancelled → save instead */ }
	try {
		const a = document.createElement('a');
		a.href = url; a.download = fname;
		document.body.appendChild(a); a.click(); a.remove();
		hud.textContent = 'Saved your Trainer Card as an image.';
	} catch (e) { /* no-op */ }
	return url;
}

function shopKey(k) {
	// TAB / left-right flips between BUY and SELL
	if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') {
		shopMenu.mode = shopMenu.mode === 'buy' ? 'sell' : 'buy';
		shopMenu.idx = 0;
		return;
	}
	const list = shopMenu.mode === 'buy' ? shopStockNow() : sellList();
	const n = Math.max(1, list.length);
	if (k === 'ArrowUp') shopMenu.idx = (shopMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') shopMenu.idx = (shopMenu.idx + 1) % n;
	if (k === 'z' || k === 'Enter') {
		if (shopMenu.mode === 'buy') {
			const id = shopStockNow()[shopMenu.idx];
			const bought = Bag.buy(id);
			sfx(bought ? 'money' : 'ui_denied');
			shopMenu.flash = bought ? `Bought ${Bag.ITEMS[id].name}!` : 'Not enough money!';
		} else {
			const entry = sellList()[shopMenu.idx];
			if (entry) {
				const gain = sellPrice(entry.id);
				Bag.consume(entry.id);
				Bag.earn(gain);
				sfx('money');
				shopMenu.flash = `Sold ${Bag.ITEMS[entry.id].name} for $${gain}.`;
				const after = sellList();
				if (shopMenu.idx >= after.length) shopMenu.idx = Math.max(0, after.length - 1);
			}
		}
	}
	if (k === 'x' || k === 'Escape') {
		shopMenu.open = false;
		// a script-opened mart (clerk `openmart`) resumes its script on close
		if (shopMenu.fromScript) { shopMenu.fromScript = false; cutscene.resume(); }
	}
}

function useRareCandy(mon) {
	// a RARE CANDY can't buy its way past the cap either
	if (mon.level >= levelCapNow() || mon.level >= Badges.MAX_LEVEL || mon.curHP <= 0) return false;
	mon.level++;
	mon.exp = Math.max(mon.exp ?? 0, Badges.expForLevel(mon.level));
	const sp = battle.data.species[mon.speciesId];
	const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
	const oldMax = mon.maxHP;
	mon.stats = statsFor(sp, ivs, mon.level, mon);
	mon.maxHP = mon.stats.hp;
	mon.curHP = Math.min(mon.maxHP, mon.curHP + (mon.maxHP - oldMax));
	saveParty(S.party);
	evolution.check(S.party, battle.data);
	return true;
}

// Gen3 TM/HM numbering -> move id; Crystal-style ids embed the move name
// (tmraindance). Teaching consumes the TM.
const GEN3_TM = [null, 'focuspunch', 'dragonclaw', 'waterpulse', 'calmmind', 'roar', 'toxic',
	'hail', 'bulkup', 'bulletseed', 'hiddenpower', 'sunnyday', 'taunt', 'icebeam', 'blizzard',
	'hyperbeam', 'lightscreen', 'protect', 'raindance', 'gigadrain', 'safeguard', 'frustration',
	'solarbeam', 'irontail', 'thunderbolt', 'thunder', 'earthquake', 'return', 'dig', 'psychic',
	'shadowball', 'brickbreak', 'doubleteam', 'reflect', 'shockwave', 'flamethrower', 'sludgebomb',
	'sandstorm', 'fireblast', 'rocktomb', 'aerialace', 'torment', 'facade', 'secretpower', 'rest',
	'attract', 'thief', 'steelwing', 'skillswap', 'snatch', 'overheat'];
const GEN3_HM = [null, 'cut', 'fly', 'surf', 'strength', 'flash', 'rocksmash', 'waterfall', 'dive'];
export function tmMoveId(id) {
	let m = /^tm(\d+)$/.exec(id);
	if (m) return GEN3_TM[+m[1]] || null;
	m = /^hm(\d+)$/.exec(id);
	if (m) return GEN3_HM[+m[1]] || null;
	m = /^tm([a-z0-9]+)$/.exec(id);
	if (m && battle.data.moves[m[1]]) return m[1];
	// ...and the same for a NAMED HM. Crystal's item balls hold `hmwaterfall`,
	// which only had the numbered `hm(\d+)` branch to fall through and so taught
	// nothing.
	m = /^hm([a-z]+)$/.exec(id);
	if (m && battle.data.moves[m[1]]) return m[1];
	m = /^tm\d+([a-z][a-z0-9]*)$/.exec(id); // decomp pickups: ITEM_TM24_THUNDERBOLT -> tm24thunderbolt
	if (m && battle.data.moves[m[1]]) return m[1];
	return null;
}
// species Showdown's dex knows at all — fakemon outside it use a type fallback
let _tmKnown = null;
const tmKnown = () => _tmKnown || (_tmKnown = new Set(battle.data.tmLearn?.__species || []));
export function canLearn(mon, mid) {
	if (battle.data.extra?.[mon.speciesId]?.learn?.includes(mid)) return true;
	if ((battle.data.species[mon.speciesId]?.learnset || []).some(([, id2]) => id2 === mid)) return true;
	// machine/tutor compatibility (tm_learnsets.json) — the whole point of TMs
	const learners = battle.data.tmLearn?.[mid];
	if (Array.isArray(learners)) {
		if (learners.includes(mon.speciesId)) return true;
		// fakemon the dex data has never heard of: allow same-type + Normal machines
		if (!tmKnown().has(mon.speciesId)) {
			const t = battle.data.moves[mid]?.type;
			return t === 'Normal' || (battle.data.species[mon.speciesId]?.types || []).includes(t);
		}
	}
	return false;
}

// fishing: cast a rod from the bag while facing water. Rod tiers read the
// classic Gen3 slot bands of the map's fishing table (0-1 / 2-4 / 5-9).
function castRod(id, item) {
	bagMenu.open = false;
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	const fx = player.tx + dx, fy = player.ty + dy;
	if (!world.isSurfable(fx, fy)) {
		dialog.open('No good — you need to face the water to fish.');
		return;
	}
	// 60% the fish bites; the rod tier decides which slot band you can hook (encounters.fish)
	const hit = Math.random() <= 0.6 ? encounters.fish(world.current.map.id, item.tier) : null;
	if (!hit) { dialog.open(`You cast the ${item.name}...\n\nNot even a nibble.`); return; }
	hit.method = 'fish'; // so LURE BALL knows this was a hooked catch
	dialog.open(`You cast the ${item.name}...\n\nOh! A bite!`, () => startWildBattle(hit));
}

// A couple of evolution items target rare "Antique/Artisan" forms whose species
// don't exist in this game's data (their source forms don't either), which left
// the stones unusable. Alias them to the working base-line stone so they still
// evolve the Sinistea / Poltchageist you can actually own.
const STONE_ALIAS = { chippedpot: 'crackedpot', masterpieceteacup: 'unremarkableteacup' };
const evoParam = id => STONE_ALIAS[id] || id;

function bagKey(k) {
	const entries = bagEntries();
	// forgetting a move to make room for a TM
	if (bagMenu.ppPick) {
		const p = bagMenu.ppPick, moves = p.mon.moves;
		if (k === 'ArrowUp') p.idx = (p.idx + moves.length - 1) % moves.length;
		if (k === 'ArrowDown') p.idx = (p.idx + 1) % moves.length;
		if (k === 'x' || k === 'Escape') { bagMenu.ppPick = null; bagMenu.picking = false; }
		if (k === 'z' || k === 'Enter') {
			const mv = moves[p.idx];
			const base = battle.data.moves[mv.id]?.pp || mv.maxPp;
			const step = Math.max(1, Math.floor(base / 5));       // one PP stage = 20% of base PP
			const curStages = Math.round((mv.maxPp - base) / step);
			if (curStages >= 3) { bagMenu.flash = `${mv.name}'s PP is already maxed.`; }
			else {
				const delta = ((p.ppMax ? 3 : curStages + 1) - curStages) * step;
				mv.maxPp += delta; mv.pp += delta;
				Bag.consume(p.itemId);
				saveParty(S.party);
				bagMenu.flash = `${mv.name}'s max PP ${p.ppMax ? 'was maxed out' : 'rose'}!`;
				bagMenu.ppPick = null; bagMenu.picking = false;
			}
		}
		return;
	}
	if (bagMenu.forget) {
		const f = bagMenu.forget;
		if (k === 'ArrowUp') f.idx = (f.idx + 3) % 4;
		if (k === 'ArrowDown') f.idx = (f.idx + 1) % 4;
		if (k === 'x' || k === 'Escape') { bagMenu.forget = null; bagMenu.picking = false; }
		if (k === 'z' || k === 'Enter') {
			const info = battle.data.moves[f.mid];
			const old = f.mon.moves[f.idx];
			f.mon.moves[f.idx] = { id: f.mid, name: info.name, pp: info.pp, maxPp: info.pp };
			if (f.itemId && !f.keepItem) Bag.consume(f.itemId);
			saveParty(S.party);
			bagMenu.flash = `Forgot ${old.name}, learned ${info.name}!`;
			bagMenu.forget = null;
			bagMenu.picking = false;
		}
		return;
	}
	if (bagMenu.picking) {
		if (k === 'ArrowUp') bagMenu.pickIdx = (bagMenu.pickIdx + S.party.length - 1) % S.party.length;
		if (k === 'ArrowDown') bagMenu.pickIdx = (bagMenu.pickIdx + 1) % S.party.length;
		if (k === 'x' || k === 'Escape') bagMenu.picking = false;
		if (k === 'z' || k === 'Enter') {
			const [id] = entries[bagMenu.idx] || [];
			const item = Bag.ITEMS[id];
			const mon = S.party[bagMenu.pickIdx];
			if (mon) {
				if (item && item.kind === 'heal' && mon.curHP > 0 && (mon.curHP < mon.maxHP || (item.cures && mon.status))) {
					Bag.consume(id);
					mon.curHP = Math.min(mon.maxHP, mon.curHP + item.amount);
					if (item.cures) mon.status = null; // FULL RESTORE clears status too
					saveParty(S.party);
					bagMenu.picking = false;
				} else if (item?.kind === 'cure') {
					// ANTIDOTE and friends bite only on the status they treat;
					// FULL HEAL on any of them.
					const AILMENT = { psn: 'poisoned', par: 'paralyzed', slp: 'asleep', brn: 'burned', frz: 'frozen' };
					if (!mon.status || mon.curHP <= 0) bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					else if (item.cures !== 'any' && mon.status !== item.cures) bagMenu.flash = `${mon.name} isn't ${AILMENT[item.cures] || 'affected'}.`;
					else {
						Bag.consume(id);
						mon.status = null;
						saveParty(S.party);
						bagMenu.flash = `${mon.name} was cured!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'revive' && mon.curHP <= 0) {
					Bag.consume(id);
					mon.curHP = Math.floor(mon.maxHP / 2);
					mon.status = null;
					saveParty(S.party);
					bagMenu.picking = false;
				} else if (item?.kind === 'form') {
					// cycles rather than opening a submenu: keep using it and you walk
					// the whole family and come back to the base, which is also how you
					// undo it. The PRISM is never consumed — it is a dex tool.
					const family = formsOf(mon.speciesId);
					if (!family || family.length < 2) {
						bagMenu.flash = `${mon.name} has no other form.`;
					} else {
						const became = cycleForm(mon);
						saveParty(S.party);
						bagMenu.flash = became ? `${mon.name} shifted into ${became.toUpperCase()}!` : `Nothing happened.`;
					}
				} else if (item?.kind === 'candy' && useRareCandy(mon)) {
					Bag.consume(id);
					bagMenu.picking = false;
				} else if (item?.kind === 'candy' && mon.level >= levelCapNow() && mon.level < Badges.MAX_LEVEL) {
					// say why, instead of the candy silently doing nothing
					bagMenu.flash = `${mon.name} is at the LEVEL CAP (Lv${levelCapNow()}).`;
				} else if (item?.kind === 'vitamin') {
					mon.evs = mon.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
					const total = Object.values(mon.evs).reduce((a, b) => a + b, 0);
					if (mon.evs[item.stat] >= 252 || total >= 510) {
						bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					} else {
						Bag.consume(id);
						mon.evs[item.stat] = Math.min(252, mon.evs[item.stat] + Math.min(10, 510 - total));
						const sp = battle.data.species[mon.speciesId];
						const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
						const oldMax = mon.maxHP;
						mon.stats = statsFor(sp, ivs, mon.level, mon);
						mon.maxHP = mon.stats.hp;
						mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(0, mon.maxHP - oldMax));
						saveParty(S.party);
						bagMenu.flash = `${mon.name}'s ${item.name} raised its stats!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'mint') {
					// overwrite the battle nature and recompute (the vitamin recipe)
					if (mon.nature === item.nature) bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					else {
						Bag.consume(id);
						mon.nature = item.nature;
						const sp = battle.data.species[mon.speciesId];
						const dmg = mon.maxHP - mon.curHP;
						mon.stats = statsFor(sp, mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, mon.level, mon);
						mon.maxHP = mon.stats.hp;
						mon.curHP = Math.max(1, mon.maxHP - dmg);
						saveParty(S.party);
						bagMenu.flash = `${mon.name} became ${item.nature.toUpperCase()} natured!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'capsule') {
					// cycle to the species' next listed ability
					const opts = battle.data.abilities?.[mon.speciesId] || [];
					if (opts.length < 2) bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					else {
						Bag.consume(id);
						mon.ability = opts[(Math.max(0, opts.indexOf(mon.ability)) + 1) % opts.length];
						saveParty(S.party);
						bagMenu.flash = `${mon.name}'s ability became ${String(mon.ability).toUpperCase()}!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'ppup') {
					// PP UP / PP MAX raise ONE move's PP ceiling — open a move sub-picker
					if (!mon.moves?.length) bagMenu.flash = `${mon.name} has no moves.`;
					else bagMenu.ppPick = { itemId: id, ppMax: !!item.ppMax, mon, idx: 0 };
				} else if (item?.kind === 'ether' && mon.curHP > 0 && mon.moves.some(m => m.pp < m.maxPp)) {
					Bag.consume(id);
					for (const mv of mon.moves) mv.pp = Math.min(mv.maxPp, mv.pp + item.amount);
					saveParty(S.party);
					bagMenu.picking = false;
				} else if ((item?.kind === 'stone' || item?.kind === 'held') && mon.curHP > 0
					&& (battle.data.extra?.[mon.speciesId]?.evos || [])
						.some(e => e.type === 'item' && e.param === evoParam(id) && battle.data.species[e.target])) {
					// an evolution item the selected species responds to
					const evo = battle.data.extra[mon.speciesId].evos
						.find(e => e.type === 'item' && e.param === evoParam(id) && battle.data.species[e.target]);
					Bag.consume(id);
					bagMenu.picking = false;
					bagMenu.open = false;
					evolution.evolveNow(mon, evo.target, battle.data);
				} else if (item?.kind === 'held') {
					// give the item; anything already held returns to the bag
					Bag.consume(id);
					if (mon.heldItem) Bag.addItem(mon.heldItem);
					mon.heldItem = id;
					saveParty(S.party);
					bagMenu.picking = false;
				} else if (item?.kind === 'stone') {
					bagMenu.flash = `It won't have any effect on ${mon.name}.`;
				} else if (tmMoveId(id)) {
					const mid = tmMoveId(id);
					const info = battle.data.moves[mid];
					if (!info) bagMenu.flash = 'The disc is blank...';
					else if (mon.moves.some(mv => mv.id === mid)) bagMenu.flash = `${mon.name} already knows ${info.name}!`;
					else if (!canLearn(mon, mid)) bagMenu.flash = `${mon.name} can't learn ${info.name}.`;
					else if (mon.moves.length < 4) {
						mon.moves.push({ id: mid, name: info.name, pp: info.pp, maxPp: info.pp });
						if (!['hm', 'tm'].includes(Bag.ITEMS[id]?.kind)) Bag.consume(id); // HMs + mart TMs are reusable
						saveParty(S.party);
						bagMenu.flash = `${mon.name} learned ${info.name}!`;
						bagMenu.picking = false;
					} else {
						bagMenu.forget = { itemId: id, mid, mon, idx: 0, keepItem: ['hm', 'tm'].includes(Bag.ITEMS[id]?.kind) };
					}
				}
			}
		}
		return;
	}
	if (k === 'ArrowUp' && entries.length) bagMenu.idx = (bagMenu.idx + entries.length - 1) % entries.length;
	if (k === 'ArrowDown' && entries.length) bagMenu.idx = (bagMenu.idx + 1) % entries.length;
	// left/right change pocket (they did nothing here before)
	if (k === 'ArrowLeft' || k === 'ArrowRight') {
		const d = k === 'ArrowLeft' ? BAG_POCKETS.length - 1 : 1;
		bagMenu.pocket = (bagMenu.pocket + d) % BAG_POCKETS.length;
		bagMenu.idx = 0;
	}
	if (k === 'x' || k === 'Escape' || k === 'b') bagMenu.open = false;
	if ((k === 'z' || k === 'Enter') && entries.length) {
		const [id] = entries[bagMenu.idx];
		const item = Bag.ITEMS[id];
		if (item?.kind === 'rod') { castRod(id, item); return; }
		if (item?.kind === 'repel') {
			if (repelSteps > 0) { bagMenu.flash = 'A REPEL is already working.'; return; }
			Bag.consume(id);
			setRepel(item.steps || 100);
			safeSaveStr(REPEL_LAST_KEY, id); // the wear-off prompt re-offers this same kind
			bagMenu.flash = `${item.name} will keep weak POKeMON away for ${item.steps} steps.`;
			return;
		}
		// the three gadget key-items, inert since day one
		if (useGadget(id)) return;
		// the glass flutes: reusable, 250 steps of melody
		if (item?.kind === 'flute') {
			S.fluteState = { mode: item.mode, steps: item.steps || 250 };
			saveFlute();
			sfx('ui_select');
			bagMenu.flash = item.mode === 'black'
				? `${item.name}: a hush falls — wild POKeMON keep away for ${item.steps} steps.`
				: `${item.name}: a bright trill — wild POKeMON stir for ${item.steps} steps!`;
			return;
		}
		if (item?.kind === 'seeker') {
			// VS SEEKER: re-arm this map's beaten trainers at badge-scaled levels
			const region = playerRegion();
			const tier = Badges.count(region) + (Badges.isChampion?.(region) ? 4 : 0);
			const armed = trainers.rearmMap(tier);
			bagMenu.flash = armed
				? `VS SEEKER: ${armed} trainer${armed === 1 ? '' : 's'} on this map want${armed === 1 ? 's' : ''} a rematch!`
				: 'No defeated trainers respond around here.';
			return;
		}
		if (['heal', 'cure', 'revive', 'candy', 'ether', 'held', 'stone', 'vitamin', 'mint', 'capsule', 'form', 'ppup'].includes(item?.kind) || tmMoveId(id)) {
			bagMenu.picking = true;
			bagMenu.pickIdx = 0;
		}
	}
}

// sort the whole storage (the box pages are windows onto the sorted list)
function pcSortStorage(mode) {
	const box = getBox();
	const dex = (a, b) => Math.abs(a.num || 999) - Math.abs(b.num || 999);
	const key = {
		dex,
		level: (a, b) => b.level - a.level,
		shiny: (a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0) || dex(a, b),
		name: (a, b) => a.name.localeCompare(b.name),
	}[mode] || dex;
	box.sort(key);
	setBox(box);
}

function pcKey(k) {
	const box = getBox();
	const pageStart = pcMenu.box * PC_BOX_CAP;
	// with a search active the box side is the hit list across ALL boxes; the
	// view carries real storage indices so withdraw/release cut the right mon
	const viewIdx = pcMenu.filter != null ? pcMatches(box, pcMenu.filter) : null;
	const page = viewIdx ? viewIdx.map(i => box[i]) : box.slice(pageStart, pageStart + PC_BOX_CAP);
	const realIdx = i => (viewIdx ? viewIdx[i] : pageStart + i);
	const list = pcMenu.side === 0 ? S.party : page;
	// release confirm: Z lets it go, X keeps it (confirm holds the REAL index)
	if (pcMenu.confirm != null) {
		if (k === 'z' || k === 'Enter') {
			const gone = box[pcMenu.confirm];
			if (gone) {
				box.splice(pcMenu.confirm, 1);
				setBox(box);
				pcMenu.flash = `${gone.name} was released. Bye-bye, ${gone.name}!`;
			}
			pcMenu.confirm = null;
			pcMenu.idx = 0;
		} else if (k === 'x' || k === 'Escape' || k === 'r') pcMenu.confirm = null;
		return;
	}
	if (k === 'f') { pcPromptSearch(); return; }
	if (k === 'Tab') { pcMenu.side ^= 1; pcMenu.idx = 0; return; }
	if (k === 'ArrowLeft' || k === 'ArrowRight') {
		if (pcMenu.side === 0) { pcMenu.side = 1; pcMenu.idx = 0; }
		else if (viewIdx) { // paging makes no sense inside a search — leave it first
			pcMenu.filter = null;
			pcMenu.idx = 0;
			pcMenu.flash = 'Search cleared.';
		} else { // page through the boxes
			pcMenu.box = (pcMenu.box + (k === 'ArrowRight' ? 1 : PC_BOXES - 1)) % PC_BOXES;
			pcMenu.idx = 0;
		}
		return;
	}
	if (k === 'ArrowUp' && list.length) pcMenu.idx = (pcMenu.idx + list.length - 1) % list.length;
	if (k === 'ArrowDown' && list.length) pcMenu.idx = (pcMenu.idx + 1) % list.length;
	if (k === 'x' || k === 'Escape') { pcMenu.open = false; pcMenu.flash = null; pcMenu.releaseMode = false; pcMenu.filter = null; }
	if (k === 'r' && pcMenu.side === 1 && page[pcMenu.idx]) { pcMenu.confirm = realIdx(pcMenu.idx); return; }
	if (k === 's') {
		pcMenu.sort = PC_SORTS[(PC_SORTS.indexOf(pcMenu.sort) + 1) % PC_SORTS.length];
		pcSortStorage(pcMenu.sort);
		pcMenu.flash = `Sorted storage by ${pcMenu.sort.toUpperCase()}.`;
		return;
	}
	if ((k === 'z' || k === 'Enter') && list.length) {
		if (pcMenu.side === 0) {
			if (S.party.length <= 1) return; // never deposit the last mon
			if (box.length >= PC_BOXES * PC_BOX_CAP) { pcMenu.flash = 'The storage system is full!'; return; }
			const [m] = S.party.splice(pcMenu.idx, 1);
			// deposit into the viewed box while it has room, else the first free slot
			box.splice(page.length < PC_BOX_CAP ? pageStart + page.length : box.length, 0, m);
			setBox(box);
			saveParty(S.party);
		} else {
			if (S.party.length >= 6 || !page[pcMenu.idx]) return;
			const [m] = box.splice(realIdx(pcMenu.idx), 1);
			S.party.push(m);
			setBox(box);
			saveParty(S.party);
		}
		pcMenu.idx = 0;
	}
}

function starterKey(k) {
	if (starterMenu.phase === 'pick') {
		// locked to the chosen region's trio; ←/→ pick among its 3 starters
		if (k === 'ArrowLeft') starterMenu.col = (starterMenu.col + 2) % 3;
		if (k === 'ArrowRight') starterMenu.col = (starterMenu.col + 1) % 3;
		if (k === 'z' || k === 'Enter') {
			const region = starterMenu.region, col = starterMenu.col;
			starterMenu.open = false;
			finishStarterPick(region, col);
		}
		return;
	}
	// phase 'region': ↑/↓ choose the region you'll begin in (no starter yet — you
	// pick that on-screen once the intro walks you into the professor's lab)
	if (k === 'ArrowUp') starterMenu.row = (starterMenu.row + 2) % 3;
	if (k === 'ArrowDown') starterMenu.row = (starterMenu.row + 1) % 3;
	if (k === 'z' || k === 'Enter') {
		const region = STARTERS[starterMenu.row].region;
		starterMenu.open = false;
		beginNewGame(region);
	}
}

// one entry point for keyboard AND the virtual touch buttons
export function pressKey(k) {
	// the little sounds: every open menu ticks, confirms and cancels audibly —
	// one hook covers all of them; battle and dialog beep from their own paths
	if (!dialog.blocking && !battle.blocking && !cutscene.blocking && canvasMenuOpen()) {
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) sfx('ui_move');
		else if (k === 'z' || k === 'Enter') sfx('ui_select');
		else if (k === 'x' || k === 'Escape') sfx('ui_cancel');
	}
	if (starterMenu.open) { starterKey(k); return; }
	if (dialog.blocking) { if (k === 'z' || k === 'Enter' || k === 'x') sfx('text_tick'); dialog.key(k); return; }
	// a clerk's `openmart` parks its cutscene in a wait WHILE the counter is up,
	// so the shop must keep taking input — otherwise the player can neither buy
	// nor close it and the script never resumes
	if (shopMenu.open && shopMenu.fromScript) { shopKey(k); return; }
	// the multi-battle party pick is open under its paused script, like the shop
	if (halfParty.open) { halfPartyKey(k); return; }
	// a scripted battle (gym leader / rival / villain / any trainer engaged via
	// their EventScript) runs UNDER its paused cutscene — the trainerbattle op
	// holds the cutscene's `cur` (so `blocking` stays true) until the fight
	// resolves. The battle must take keys BEFORE the cutscene gate, or every
	// scripted fight is keyboard/A-B-dead (only direct taps on the battle's own
	// buttons worked — the pointer handlers already check battle first).
	if (battle.blocking) { battle.key(k); return; }
	if (cutscene.blocking) return; // a running cutscene swallows all other input
	if (evolution.blocking) { evolution.key(k); return; }
	if (pvp.blocking) { pvp.key(k); return; }
	if (factorySpec.blocking) { factorySpec.key(k); return; }
	if (trade.open) { tradeKey(k); return; }
	if (playerMenu.open) { playerMenuKey(k); return; }
	if (deckSelect.open) { deckSelectKey(k); return; }
	if (radioMenu.open) { radioKey(k); return; }
	if (unownDex.open) { unownDexKey(k); return; }
	if (startMenu.open) { startKey(k); return; }
	if (cardsMenu.open) { cardsKey(k); return; }
	if (runMenu.open) { runKey(k); return; }
	if (friendsMenu.open) { friendsKey(k); return; }
	if (mailMenu.open) { mailKey(k); return; }
	if (ferryMenu.open) { ferryKey(k); return; }
	if (portalMenu.open) { portalKey(k); return; }
	if (bpShopMenu.open) { bpShopKey(k); return; }
	if (shopMenu.open) { shopKey(k); return; }
	if (bagMenu.open) { bagKey(k); return; }
	if (pcMenu.open) { pcKey(k); return; }
	if (vfMenu.open) { vfKey(k); return; }
	if (gcMenu.open) { gcKey(k); return; }
	if (contestMenu.open) { contestKey(k); return; }
	if (blendMenu.open) { blendKey(k); return; }
	if (slideMenu.open) { slideKey(k); return; }
	if (decoMenu.open) { decoKey(k); return; }
	if (socialMenu.open) { socialKey(k); return; }
	if (slotsMenu.open) { slotsKey(k); return; }
	if (dexMenu.open) { dexKey(k); return; }
	if (townMap.open) { townKey(k); return; }
	if (tradeMenu.open) { npcTradeKey(k); return; }
	if (daycareMenu.open) { daycareKey(k); return; }
	if (nameRater.open) { nameRaterKey(k); return; }
	if (moveShop.open) { moveShopKey(k); return; }
	if (optionsMenu.open) { optionsKey(k); return; }
	if (questMenu.open) { questKey(k); return; }
	if (trainerCard.open) {
		if (k === 'ArrowLeft' || k === 'ArrowRight') { trainerCard.page = 1 - trainerCard.page; return; }
		if (k === 's') { shareTrainerCard(); return; } // snapshot -> share/save
		if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') trainerCard.open = false;
		return;
	}
	if (partyMenu.open) {
		// the per-POKeMON action menu (field moves / summary / switch)
		if (partyMenu.action) {
			const a = partyMenu.action;
			if (k === 'ArrowUp') a.idx = (a.idx + a.options.length - 1) % a.options.length;
			if (k === 'ArrowDown') a.idx = (a.idx + 1) % a.options.length;
			if (k === 'x' || k === 'Escape') { partyMenu.action = null; return; }
			if (k === 'z' || k === 'Enter') {
				const opt = a.options[a.idx];
				if (opt.kind === 'field') useFieldMove(opt.hm, a.mon);
				else if (opt.kind === 'summary') { partyMenu.action = null; partyMenu.summary = true; partyMenu.moveSwap = null; }
				else if (opt.kind === 'switch') {
					// SWITCH used to only ever promote to lead — there was no way to move
					// slot 5 to slot 3, or to demote the lead. Now it arms a swap and the
					// SECOND pick completes it.
					partyMenu.swapFrom = a.monIdx;
					partyMenu.action = null;
				} else partyMenu.action = null; // cancel
			}
			return;
		}
		if (partyMenu.summary) {
			// summary view: up/down cycles party members (dropping any armed move
			// swap — it belongs to the mon that armed it), X cancels the swap first
			if (k === 'ArrowUp') { partyMenu.idx = (partyMenu.idx + S.party.length - 1) % S.party.length; partyMenu.moveSwap = null; }
			if (k === 'ArrowDown') { partyMenu.idx = (partyMenu.idx + 1) % S.party.length; partyMenu.moveSwap = null; }
			if (k === 'x' || k === 'Escape') {
				if (partyMenu.moveSwap != null) partyMenu.moveSwap = null;
				else partyMenu.summary = false;
			}
			return;
		}
		if (k === 'ArrowUp') partyMenu.idx = (partyMenu.idx + S.party.length - 1) % S.party.length;
		if (k === 'ArrowDown') partyMenu.idx = (partyMenu.idx + 1) % S.party.length;
		if (k === 'z' || k === 'Enter') {
			if (partyMenu.swapFrom != null && partyMenu.swapFrom !== partyMenu.idx) {
				const i = partyMenu.swapFrom, j = partyMenu.idx;
				[S.party[i], S.party[j]] = [S.party[j], S.party[i]];
				saveParty(S.party); refreshFollower();
				partyMenu.swapFrom = null;
			} else if (partyMenu.swapFrom === partyMenu.idx) {
				partyMenu.swapFrom = null;                 // tapping the same slot cancels
			} else openPartyAction(partyMenu.idx);        // choose an action for this mon
		}
		if (k === 'x' || k === 'p' || k === 'Escape') { if (partyMenu.swapFrom != null) partyMenu.swapFrom = null; else partyMenu.open = false; }
		return;
	}
	if ((k === 'Enter' || k === 'm') && !S.loading) { sfx('ui_open'); startMenu.open = true; startMenu.idx = 0; return; }
	if (k === 'p' && !S.loading) { partyMenu.open = true; partyMenu.idx = 0; return; }
	if (k === 'b' && !S.loading) { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; bagMenu.forget = null; bagMenu.ppPick = null; bagMenu.flash = null; return; }
	if (k === 'c' && !S.loading) { toggleBike(); return; }
	if (k === 'z' && !S.loading) interact();
}
// any menu that consumes direction presses instead of walking
// just the full-res canvas menus (the SW x MH band) — no dialogs/battles/scenes
export const canvasMenuOpen = () => starterMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || partyMenu.open || ferryMenu.open || portalMenu.open || bpShopMenu.open
	|| trade.open || startMenu.open || playerMenu.open || deckSelect.open || radioMenu.open || unownDex.open || cardsMenu.open || runMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open || townMap.open
	|| daycareMenu.open || nameRater.open || halfParty.open || moveShop.open || optionsMenu.open || questMenu.open || mailMenu.open
	|| tradeMenu.open || gcMenu.open || vfMenu.open || contestMenu.open || blendMenu.open || slideMenu.open || decoMenu.open || socialMenu.open || slotsMenu.open;
export const menuBlocking = () => dialog.blocking || evolution.blocking || cutscene.blocking
	|| battle.blocking || pvp.blocking || factorySpec.blocking || canvasMenuOpen() || fading();

