// main.js — game loop, input, camera, warps, connection crossing.
import { World, Player, VIEW_W, VIEW_H, META } from './engine.js';
import { NPCs } from './npcs.js';
import { Encounters } from './encounters.js';
import { Battle } from './battle.js';
import { Trainers } from './trainers.js';
import { Dialog } from './dialog.js';
import { Services } from './services.js';
import * as Bag from './bag.js';
import { getJSON } from './engine.js';
import { loadParty, saveParty, healParty, leadMon, addCaught, createStarter } from './party.js';
import { Evolution } from './evolution.js';
import { Items } from './items.js';
import * as Dex from './pokedex.js';
import { statsFor } from './battle.js';
import { getImage } from './engine.js';
import * as BUI from './battleui.js';
import * as MP from '../battlecards/mpmode.js';
import { Pvp } from './pvp.js';

// Test Realm mode: ?mp=1 with a login token. The account backend owns the
// cards; friends, presence, and world-visiting all run through it.
const MP_ON = MP.wantsMp() && MP.hasToken();
if (MP.wantsMp() && !MP.hasToken()) location.href = '/magepunktest/';
let mpAccount = null;   // { username, friendCode, ... } once loaded
let friends = [];       // last friends-poll result
let visiting = null;    // when set: { username, sprite } — roaming a friend's world
let friendGhost = null; // a friend's live sprite while we visit their map

const SCALE = 3;
const screen = document.getElementById('screen');
screen.width = VIEW_W * SCALE;
screen.height = VIEW_H * SCALE;
const sctx = screen.getContext('2d');
sctx.imageSmoothingEnabled = false;

const frame = document.createElement('canvas'); // native 240x160
frame.width = VIEW_W; frame.height = VIEW_H;
const ctx = frame.getContext('2d');
ctx.imageSmoothingEnabled = false;

const hud = document.getElementById('hud');
const world = new World();
const player = new Player(world);
const npcs = new NPCs(world, player);
const encounters = new Encounters();
const battle = new Battle();
const trainers = new Trainers(world, player);
const dialog = new Dialog();
const services = new Services(world);
const evolution = new Evolution();
const items = new Items(world);
const pvp = new Pvp();
let signTexts = {};
let party = null;

// starter picker (fresh saves): 3 regions x 3 starters
const STARTERS = [
	{ region: 'KANTO', ids: ['bulbasaur', 'charmander', 'squirtle'] },
	{ region: 'JOHTO', ids: ['chikorita', 'cyndaquil', 'totodile'] },
	{ region: 'HOENN', ids: ['treecko', 'torchic', 'mudkip'] },
];
const starterMenu = { open: false, row: 0, col: 0, sprites: {} };
const urlPinnedMap = new URLSearchParams(location.search).has('map');
player.blocked = (tx, ty) => npcs.npcBlocks(tx, ty) || trainers.occupied(tx, ty) || services.blocks(tx, ty) || items.occupied(tx, ty);

// Strength: shove a boulder one tile ahead if a party mon can use Strength and
// the destination is clear. Returns true when the boulder actually moved.
let strengthHinted = false;
function partyHasStrength() {
	return (party || []).some(m => m.curHP > 0
		&& (m.moves.some(mv => mv.id === 'strength') || canLearn(m, 'strength')));
}
player.pushBoulder = (bx, by, dx, dy) => {
	const obj = items.fieldObjAt(bx, by);
	if (!obj || obj.kind !== 'boulder') return false;
	if (!partyHasStrength()) {
		if (!strengthHinted) {
			strengthHinted = true;
			dialog.open("It's a hefty boulder — but it won't budge.\n\nMaybe a strong POKeMON could push it.");
		}
		return false;
	}
	const tx = bx + dx, ty = by + dy;
	// the tile beyond must be open floor (not water, not blocked by anything)
	if (!world.isPassable(tx, ty) || world.isSurfable(tx, ty)) return false;
	if (player.blocked(tx, ty)) return false;
	items.moveFieldObj(obj, tx, ty);
	return true;
};

trainers.onEngage = t => {
	const { party: foeParty, info } = trainers.buildBattle(t, battle.data);
	const begin = () => startTrainerBattle(t, foeParty, info);
	if (info.introQuote) dialog.open(info.introQuote, begin);
	else begin();
};

function startTrainerBattle(t, foeParty, info) {
	for (const m of foeParty) Dex.markSeen(m.speciesId);
	battle.startTrainer(party, foeParty, info, result => {
		if (result === 'victory') {
			trainers.markDefeated(t);
			try {
				const money = (parseInt(localStorage.getItem('magepunk_money'), 10) || 0) + info.money;
				localStorage.setItem('magepunk_money', String(money));
			} catch (e) {}
			saveParty(party);
			evolution.check(party, battle.data);
		} else if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		}
	});
}
evolution.onDone = () => saveParty(party);
let loading = true;

// ---------- input ----------
const KEYMAP = {
	ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
	w: 'up', s: 'down', a: 'left', d: 'right',
};
const heldKeys = [];
let runHeld = false; // Shift on keyboard, holding B on touch
// while typing in the chat box, keys belong to the input, not the game
const typingInChat = () => document.activeElement && document.activeElement.tagName === 'INPUT';
addEventListener('keydown', e => {
	if (typingInChat()) return;
	// while a menu/dialog/battle is open, arrows navigate options — don't also
	// queue overworld movement (that made the player walk while browsing menus)
	if (menuBlocking()) { if (KEYMAP[e.key]) e.preventDefault(); return; }
	if (e.key === 'Shift') runHeld = true;
	const dir = KEYMAP[e.key];
	if (dir) {
		e.preventDefault();
		if (!heldKeys.includes(dir)) heldKeys.unshift(dir);
	}
});
addEventListener('keyup', e => {
	if (e.key === 'Shift') runHeld = false;
	const dir = KEYMAP[e.key];
	if (dir) {
		const i = heldKeys.indexOf(dir);
		if (i >= 0) heldKeys.splice(i, 1);
	}
});

// where you are, so a return visit resumes there (URL params still win)
const POS_KEY = 'magepunk_pos_v1';
function savePos() {
	try {
		localStorage.setItem(POS_KEY, JSON.stringify({ map: world.current.name, x: player.tx, y: player.ty }));
	} catch (e) {}
}
// Z in front of something: services, talk-to trainers (incl. gym leaders), signs
function interact() {
	if (player.moving || trainers.engaging) return;
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	const fx = player.tx + dx, fy = player.ty + dy;
	// item balls / berry trees / hidden items (facing tile, then standing tile)
	const found = items.interactAt(fx, fy) || items.interactAt(player.tx, player.ty);
	if (found) { dialog.open(found); return; }
	// smashable rocks + cuttable trees: the lead mon clears the way
	const fo = items.fieldObjAt(fx, fy);
	if (fo) {
		const lead = party.find(m => m.curHP > 0);
		if (!lead) return;
		if (fo.kind === 'rock') {
			dialog.open(`${lead.name} smashed the rock!`, () => {
				items.removeFieldObj(fo);
				const grp = encounters.data[world.current.map.id]?.rock_smash;
				if (grp && Math.random() * 100 < grp.rate) {
					const pick = encounters.pick(world.current.map.id, 'rock_smash');
					if (pick) startWildBattle(pick);
				}
			});
		} else {
			dialog.open(`${lead.name} cut down the tree!`, () => items.removeFieldObj(fo));
		}
		return;
	}
	const svc = services.kindAt(fx, fy);
	if (svc === 'nurse') {
		dialog.open('Welcome to the POKEMON CENTER!\n\nWe restored your POKEMON\nto full health. See you again!', () => healParty(party));
		return;
	}
	if (svc === 'pc') { pcMenu.open = true; pcMenu.side = 0; pcMenu.idx = 0; return; }
	if (svc === 'shop') { shopMenu.open = true; shopMenu.idx = 0; shopMenu.mode = 'buy'; shopMenu.flash = null; return; }
	if (svc === 'ferry') { ferryMenu.open = true; ferryMenu.idx = 0; return; }
	// Surf: face water with a healthy Water-type and it paddles you out
	if (!player.surfing && world.isSurfable(fx, fy)) {
		const surfer = party.find(m => m.curHP > 0 && m.types?.includes('Water'));
		if (surfer) {
			dialog.open(`${surfer.name} paddles out onto the water!`, () => {
				player.surfing = true;
				player.beginMove(fx, fy, META, true);
			});
		} else {
			dialog.open('The water is a deep blue...\n\nA WATER-type could carry you across.');
		}
		return;
	}
	const t = trainers.trainerAt(fx, fy);
	if (t) {
		if (trainers.isDefeated(t)) {
			const { info } = trainers.buildBattle(t, battle.data);
			dialog.open(info.defeatText);
		} else {
			trainers.talkTo(t, player.facing);
		}
		return;
	}
	for (const ev of world.current.map.bg_events || []) {
		if (+ev.x === fx && +ev.y === fy && signTexts[ev.script]) {
			dialog.open(signTexts[ev.script]);
			return;
		}
	}
	// face-to-face NPC: have them turn toward the player
	const npc = npcs.list.find(n => n.tx === fx && n.ty === fy);
	if (npc) npc.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[player.facing];
}

const partyMenu = { open: false, idx: 0, summary: false };
const startMenu = { open: false, idx: 0 };
const cardsMenu = { open: false, idx: 0 };
const dexMenu = { open: false, idx: 0, detail: false, list: null };
const trainerCard = { open: false };

// full species list for the Pokédex, sorted by dex number (built once)
function dexList() {
	if (dexMenu.list) return dexMenu.list;
	const sp = battle.data.species;
	// standard dex (positive nums) first, ascending; fakemon/custom (num <= 0)
	// after, ordered by magnitude so they group sensibly
	const key = n => (n > 0 ? n : 100000 + Math.abs(n || 99999));
	dexMenu.list = Object.keys(sp)
		.map(id => ({ id, num: sp[id].num || 9999, name: sp[id].name }))
		.sort((a, b) => key(a.num) - key(b.num) || a.name.localeCompare(b.name));
	return dexMenu.list;
}
const friendsMenu = { open: false, idx: 0 };

// the FireRed-style START menu (items depend on Test Realm mode)
function startItems() {
	const items = ['POKeDEX', 'POKeMON', 'CARDS'];
	if (MP_ON) items.push('FRIENDS');
	items.push('BAG', 'CARD', 'SAVE', 'OPTION', 'EXIT');
	return items;
}
const cardsItems = () => MP_ON
	? ['GALLERY', 'DECK BUILDER', 'PACKS', 'DUNGEON RUN', 'CHALLENGE FRIEND', 'BACK']
	: ['GALLERY', 'DECK BUILDER', 'PACKS', 'DUNGEON RUN', 'BACK'];
const CARD_URLS = {
	'GALLERY': 'viewer.html', 'DECK BUILDER': 'deck.html',
	'PACKS': 'packs.html', 'DUNGEON RUN': '?dungeon=1',
};
function openCardPage(label) {
	const q = MP_ON ? (label === 'DUNGEON RUN' ? '&mp=1' : '?mp=1') : '';
	const path = CARD_URLS[label];
	location.href = '/battlecards/' + (path.startsWith('?') ? path + (MP_ON ? '&mp=1' : '') : path + (MP_ON ? '?mp=1' : ''));
}

function startKey(k) {
	const items = startItems();
	if (k === 'ArrowUp') startMenu.idx = (startMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') startMenu.idx = (startMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape' || k === 'Enter') { startMenu.open = false; return; }
	if (k === 'z') {
		const it = items[startMenu.idx];
		startMenu.open = false;
		if (it === 'POKeMON') { partyMenu.open = true; partyMenu.idx = 0; partyMenu.summary = false; }
		else if (it === 'BAG') { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; bagMenu.forget = null; bagMenu.flash = null; }
		else if (it === 'CARDS') { cardsMenu.open = true; cardsMenu.idx = 0; }
		else if (it === 'FRIENDS') { openFriends(); }
		else if (it === 'POKeDEX') { dexMenu.open = true; dexMenu.idx = 0; dexMenu.detail = false; }
		else if (it === 'CARD') { trainerCard.open = true; }
		else if (it === 'SAVE') { saveParty(party); savePos(); dialog.open('Your journey has been saved.'); }
		else if (it === 'OPTION') { dialog.open('OPTIONS\n\nControls: arrows/WASD move, Z confirm,\nX cancel, Enter/START menu.'); }
		else if (it === 'EXIT' && visiting) { leaveVisit(); }
		// EXIT just closes
	}
}

function dexKey(k) {
	const list = dexList();
	if (dexMenu.detail) {
		if (k === 'ArrowUp') dexMenu.idx = (dexMenu.idx + list.length - 1) % list.length;
		if (k === 'ArrowDown') dexMenu.idx = (dexMenu.idx + 1) % list.length;
		if (k === 'x' || k === 'Escape') dexMenu.detail = false;
		return;
	}
	if (k === 'ArrowUp') dexMenu.idx = (dexMenu.idx + list.length - 1) % list.length;
	if (k === 'ArrowDown') dexMenu.idx = (dexMenu.idx + 1) % list.length;
	if (k === 'ArrowLeft') dexMenu.idx = Math.max(0, dexMenu.idx - 9);
	if (k === 'ArrowRight') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + 9);
	if (k === 'z' || k === 'Enter') { if (Dex.isSeen(list[dexMenu.idx].id)) dexMenu.detail = true; }
	if (k === 'x' || k === 'Escape') dexMenu.open = false;
}

function cardsKey(k) {
	const items = cardsItems();
	if (k === 'ArrowUp') cardsMenu.idx = (cardsMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') cardsMenu.idx = (cardsMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { cardsMenu.open = false; return; }
	if (k === 'z') {
		const it = items[cardsMenu.idx];
		if (it === 'BACK') { cardsMenu.open = false; startMenu.open = true; return; }
		if (it === 'CHALLENGE FRIEND') { cardsMenu.open = false; openFriends('card'); return; }
		saveParty(party); savePos();
		openCardPage(it);
	}
}

// ---- friends ----
const friendsChallenge = { mode: null }; // null | 'card' | 'pokemon'
async function openFriends(challengeType) {
	friendsChallenge.mode = challengeType || null;
	friendsMenu.open = true;
	friendsMenu.idx = 0;
	await refreshFriends();
}
async function refreshFriends() {
	if (!MP_ON) return;
	const data = await MP.call('friends');
	if (data.friends) { friends = data.friends; if (mpAccount) mpAccount.friendCode = data.friendCode; }
}
function friendsKey(k) {
	// rows: [Add friend] then each friend
	const rows = friendsMenu.mode = 1 + friends.length;
	if (k === 'ArrowUp') friendsMenu.idx = (friendsMenu.idx + rows - 1) % rows;
	if (k === 'ArrowDown') friendsMenu.idx = (friendsMenu.idx + 1) % rows;
	if (k === 'x' || k === 'Escape') { friendsMenu.open = false; return; }
	if (k === 'z') {
		if (friendsMenu.idx === 0) { promptAddFriend(); return; }
		const f = friends[friendsMenu.idx - 1];
		if (!f) return;
		friendAction(f);
	}
}
async function promptAddFriend() {
	const code = (prompt('Enter your friend\'s 6-letter code:') || '').toUpperCase().trim();
	if (!/^[A-Z]{6}$/.test(code)) { if (code) dialog.open('That is not a valid 6-letter friend code.'); return; }
	const data = await MP.call('add-friend', { code });
	if (data.error) { dialog.open(data.error); return; }
	await refreshFriends();
	dialog.open(`Added ${data.added} as a friend!`);
}
function friendAction(f) {
	if (friendsChallenge.mode === 'card') {
		friendsMenu.open = false; friendsChallenge.mode = null;
		if (!f.online) { dialog.open(`${f.username} is offline right now.`); return; }
		sendCardChallenge(f);
		return;
	}
	if (!f.online) { dialog.open(`${f.username} is offline right now.`); return; }
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
			if (declined !== 'x') location.href = '/battlecards/?spectate=' + encodeURIComponent(f.username) + '&mp=1';
		});
		return;
	}
	dialog.open(`${f.username}:  Z=Battle challenge  X=Visit world`, (declined) => {
		if (declined === 'x') visitWorld(f);
		else sendChallenge(f);
	});
}
const ferryMenu = { open: false, idx: 0 };
const FERRY_DESTS = [
	{ label: 'Vermilion Harbor (Kanto)', file: 'SSAnne_Exterior' },
	{ label: 'Olivine Port (Johto)', file: 'OlivinePort' },
	{ label: 'Slateport Harbor (Hoenn)', file: 'SlateportCity_Harbor' },
];
function ferryKey(k) {
	const dests = FERRY_DESTS.filter(d => d.file !== world.current.name);
	if (k === 'ArrowUp') ferryMenu.idx = (ferryMenu.idx + dests.length - 1) % dests.length;
	if (k === 'ArrowDown') ferryMenu.idx = (ferryMenu.idx + 1) % dests.length;
	if (k === 'x' || k === 'Escape') ferryMenu.open = false;
	if (k === 'z' || k === 'Enter') {
		const dest = dests[ferryMenu.idx];
		ferryMenu.open = false;
		moveToMap(dest.file).then(() => dialog.open(`The ferry sets sail...\n\nWelcome to ${dest.label}!`));
	}
}
const shopMenu = { open: false, idx: 0, mode: 'buy' };
// items the mart will buy back (must have a price); sell yields half
function sellList() {
	return Object.entries(Bag.getBag())
		.filter(([id, n]) => n > 0 && Bag.ITEMS[id]?.price > 0)
		.map(([id, n]) => ({ id, n }));
}
const sellPrice = id => Math.floor((Bag.ITEMS[id]?.price || 0) / 2);
const bagMenu = { open: false, idx: 0, picking: false, pickIdx: 0 };
const pcMenu = { open: false, side: 0, idx: 0 }; // side 0 = party (deposit), 1 = box (withdraw)

function getBox() {
	try { return JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]'); } catch (e) { return []; }
}
function setBox(box) {
	try { localStorage.setItem('magepunk_box_v1', JSON.stringify(box)); } catch (e) {}
}

function shopKey(k) {
	// TAB / left-right flips between BUY and SELL
	if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') {
		shopMenu.mode = shopMenu.mode === 'buy' ? 'sell' : 'buy';
		shopMenu.idx = 0;
		return;
	}
	const list = shopMenu.mode === 'buy' ? Bag.SHOP_STOCK : sellList();
	const n = Math.max(1, list.length);
	if (k === 'ArrowUp') shopMenu.idx = (shopMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') shopMenu.idx = (shopMenu.idx + 1) % n;
	if (k === 'z' || k === 'Enter') {
		if (shopMenu.mode === 'buy') {
			const id = Bag.SHOP_STOCK[shopMenu.idx];
			shopMenu.flash = Bag.buy(id) ? `Bought ${Bag.ITEMS[id].name}!` : 'Not enough money!';
		} else {
			const entry = sellList()[shopMenu.idx];
			if (entry) {
				const gain = sellPrice(entry.id);
				Bag.consume(entry.id);
				Bag.earn(gain);
				shopMenu.flash = `Sold ${Bag.ITEMS[entry.id].name} for $${gain}.`;
				const after = sellList();
				if (shopMenu.idx >= after.length) shopMenu.idx = Math.max(0, after.length - 1);
			}
		}
	}
	if (k === 'x' || k === 'Escape') shopMenu.open = false;
}

function useRareCandy(mon) {
	if (mon.level >= 100 || mon.curHP <= 0) return false;
	mon.level++;
	mon.exp = Math.max(mon.exp ?? 0, mon.level ** 3);
	const sp = battle.data.species[mon.speciesId];
	const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
	const oldMax = mon.maxHP;
	mon.stats = statsFor(sp, ivs, mon.level);
	mon.maxHP = mon.stats.hp;
	mon.curHP = Math.min(mon.maxHP, mon.curHP + (mon.maxHP - oldMax));
	saveParty(party);
	evolution.check(party, battle.data);
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
function tmMoveId(id) {
	let m = /^tm(\d+)$/.exec(id);
	if (m) return GEN3_TM[+m[1]] || null;
	m = /^hm(\d+)$/.exec(id);
	if (m) return GEN3_HM[+m[1]] || null;
	m = /^tm([a-z0-9]+)$/.exec(id);
	if (m && battle.data.moves[m[1]]) return m[1];
	return null;
}
function canLearn(mon, mid) {
	if (battle.data.extra?.[mon.speciesId]?.learn?.includes(mid)) return true;
	return (battle.data.species[mon.speciesId]?.learnset || []).some(([, id2]) => id2 === mid);
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
	const grp = encounters.data[world.current.map.id]?.fishing;
	const bands = { 1: [0, 1], 2: [2, 4], 3: [5, 9] };
	const [lo, hi] = bands[item.tier] || [0, 1];
	const slots = grp ? grp.slots.slice(lo, hi + 1) : [];
	if (!slots.length || Math.random() > 0.6) {
		dialog.open(`You cast the ${item.name}...\n\nNot even a nibble.`);
		return;
	}
	const total = slots.reduce((s, x) => s + x.w, 0);
	let r = Math.random() * total, slot = slots[0];
	for (const s of slots) { r -= s.w; if (r <= 0) { slot = s; break; } }
	const level = slot.min + Math.floor(Math.random() * (slot.max - slot.min + 1));
	dialog.open(`You cast the ${item.name}...\n\nOh! A bite!`, () => startWildBattle({ id: slot.id, level }));
}

function bagKey(k) {
	const entries = Object.entries(Bag.getBag()).filter(([, n]) => n > 0);
	// forgetting a move to make room for a TM
	if (bagMenu.forget) {
		const f = bagMenu.forget;
		if (k === 'ArrowUp') f.idx = (f.idx + 3) % 4;
		if (k === 'ArrowDown') f.idx = (f.idx + 1) % 4;
		if (k === 'x' || k === 'Escape') { bagMenu.forget = null; bagMenu.picking = false; }
		if (k === 'z' || k === 'Enter') {
			const info = battle.data.moves[f.mid];
			const old = f.mon.moves[f.idx];
			f.mon.moves[f.idx] = { id: f.mid, name: info.name, pp: info.pp, maxPp: info.pp };
			Bag.consume(f.itemId);
			saveParty(party);
			bagMenu.flash = `Forgot ${old.name}, learned ${info.name}!`;
			bagMenu.forget = null;
			bagMenu.picking = false;
		}
		return;
	}
	if (bagMenu.picking) {
		if (k === 'ArrowUp') bagMenu.pickIdx = (bagMenu.pickIdx + party.length - 1) % party.length;
		if (k === 'ArrowDown') bagMenu.pickIdx = (bagMenu.pickIdx + 1) % party.length;
		if (k === 'x' || k === 'Escape') bagMenu.picking = false;
		if (k === 'z' || k === 'Enter') {
			const [id] = entries[bagMenu.idx] || [];
			const item = Bag.ITEMS[id];
			const mon = party[bagMenu.pickIdx];
			if (mon) {
				if (item && item.kind === 'heal' && mon.curHP > 0 && mon.curHP < mon.maxHP) {
					Bag.consume(id);
					mon.curHP = Math.min(mon.maxHP, mon.curHP + item.amount);
					saveParty(party);
					bagMenu.picking = false;
				} else if (item?.kind === 'revive' && mon.curHP <= 0) {
					Bag.consume(id);
					mon.curHP = Math.floor(mon.maxHP / 2);
					mon.status = null;
					saveParty(party);
					bagMenu.picking = false;
				} else if (item?.kind === 'candy' && useRareCandy(mon)) {
					Bag.consume(id);
					bagMenu.picking = false;
				} else if (item?.kind === 'ether' && mon.curHP > 0 && mon.moves.some(m => m.pp < m.maxPp)) {
					Bag.consume(id);
					for (const mv of mon.moves) mv.pp = Math.min(mv.maxPp, mv.pp + item.amount);
					saveParty(party);
					bagMenu.picking = false;
				} else if ((item?.kind === 'stone' || item?.kind === 'held') && mon.curHP > 0
					&& (battle.data.extra?.[mon.speciesId]?.evos || [])
						.some(e => e.type === 'item' && e.param === id && battle.data.species[e.target])) {
					// an evolution item the selected species responds to
					const evo = battle.data.extra[mon.speciesId].evos
						.find(e => e.type === 'item' && e.param === id && battle.data.species[e.target]);
					Bag.consume(id);
					bagMenu.picking = false;
					bagMenu.open = false;
					evolution.evolveNow(mon, evo.target, battle.data);
				} else if (item?.kind === 'held') {
					// give the item; anything already held returns to the bag
					Bag.consume(id);
					if (mon.heldItem) Bag.addItem(mon.heldItem);
					mon.heldItem = id;
					saveParty(party);
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
						Bag.consume(id);
						saveParty(party);
						bagMenu.flash = `${mon.name} learned ${info.name}!`;
						bagMenu.picking = false;
					} else {
						bagMenu.forget = { itemId: id, mid, mon, idx: 0 };
					}
				}
			}
		}
		return;
	}
	if (k === 'ArrowUp' && entries.length) bagMenu.idx = (bagMenu.idx + entries.length - 1) % entries.length;
	if (k === 'ArrowDown' && entries.length) bagMenu.idx = (bagMenu.idx + 1) % entries.length;
	if (k === 'x' || k === 'Escape' || k === 'b') bagMenu.open = false;
	if ((k === 'z' || k === 'Enter') && entries.length) {
		const [id] = entries[bagMenu.idx];
		const item = Bag.ITEMS[id];
		if (item?.kind === 'rod') { castRod(id, item); return; }
		if (['heal', 'revive', 'candy', 'ether', 'held', 'stone'].includes(item?.kind) || tmMoveId(id)) {
			bagMenu.picking = true;
			bagMenu.pickIdx = 0;
		}
	}
}

function pcKey(k) {
	const box = getBox();
	const list = pcMenu.side === 0 ? party : box;
	if (k === 'ArrowLeft' || k === 'ArrowRight') { pcMenu.side ^= 1; pcMenu.idx = 0; }
	if (k === 'ArrowUp' && list.length) pcMenu.idx = (pcMenu.idx + list.length - 1) % list.length;
	if (k === 'ArrowDown' && list.length) pcMenu.idx = (pcMenu.idx + 1) % list.length;
	if (k === 'x' || k === 'Escape') pcMenu.open = false;
	if ((k === 'z' || k === 'Enter') && list.length) {
		if (pcMenu.side === 0) {
			if (party.length <= 1) return; // never deposit the last mon
			const [m] = party.splice(pcMenu.idx, 1);
			box.push(m);
			setBox(box);
			saveParty(party);
		} else {
			if (party.length >= 6) return;
			const [m] = box.splice(pcMenu.idx, 1);
			party.push(m);
			setBox(box);
			saveParty(party);
		}
		pcMenu.idx = 0;
	}
}

function starterKey(k) {
	if (k === 'ArrowUp') starterMenu.row = (starterMenu.row + 2) % 3;
	if (k === 'ArrowDown') starterMenu.row = (starterMenu.row + 1) % 3;
	if (k === 'ArrowLeft') starterMenu.col = (starterMenu.col + 2) % 3;
	if (k === 'ArrowRight') starterMenu.col = (starterMenu.col + 1) % 3;
	if (k === 'z' || k === 'Enter') {
		const row = STARTERS[starterMenu.row];
		const id = row.ids[starterMenu.col];
		party = createStarter(id, battle.data);
		Dex.seedFrom(party);
		try { localStorage.setItem('magepunk_region', row.region); } catch (e) {}
		starterMenu.open = false;
		// the row you picked from is the region you begin in
		const home = { KANTO: 'PalletTown', JOHTO: 'NewBarkTown', HOENN: 'LittlerootTown' }[row.region];
		const go = !urlPinnedMap && home && world.current.name !== home ? moveToMap(home) : Promise.resolve();
		go.then(() => dialog.open(`You chose ${party[0].name}!\n\nYour journey begins in ${row.region}.`));
	}
}

// one entry point for keyboard AND the virtual touch buttons
function pressKey(k) {
	if (starterMenu.open) { starterKey(k); return; }
	if (dialog.blocking) { dialog.key(k); return; }
	if (evolution.blocking) { evolution.key(k); return; }
	if (battle.blocking) { battle.key(k); return; }
	if (pvp.blocking) { pvp.key(k); return; }
	if (startMenu.open) { startKey(k); return; }
	if (cardsMenu.open) { cardsKey(k); return; }
	if (friendsMenu.open) { friendsKey(k); return; }
	if (ferryMenu.open) { ferryKey(k); return; }
	if (shopMenu.open) { shopKey(k); return; }
	if (bagMenu.open) { bagKey(k); return; }
	if (pcMenu.open) { pcKey(k); return; }
	if (dexMenu.open) { dexKey(k); return; }
	if (trainerCard.open) { if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') trainerCard.open = false; return; }
	if (partyMenu.open) {
		if (partyMenu.summary) {
			// summary view: up/down cycles party members, Z makes lead, X closes
			if (k === 'ArrowUp') partyMenu.idx = (partyMenu.idx + party.length - 1) % party.length;
			if (k === 'ArrowDown') partyMenu.idx = (partyMenu.idx + 1) % party.length;
			if ((k === 'z' || k === 'Enter') && partyMenu.idx > 0) {
				const [m] = party.splice(partyMenu.idx, 1);
				party.unshift(m);
				partyMenu.idx = 0;
				saveParty(party);
			}
			if (k === 'x' || k === 'Escape') partyMenu.summary = false;
			return;
		}
		if (k === 'ArrowUp') partyMenu.idx = (partyMenu.idx + party.length - 1) % party.length;
		if (k === 'ArrowDown') partyMenu.idx = (partyMenu.idx + 1) % party.length;
		if (k === 'z' || k === 'Enter') partyMenu.summary = true;  // view the mon's summary
		if (k === 'x' || k === 'p' || k === 'Escape') partyMenu.open = false;
		return;
	}
	if ((k === 'Enter' || k === 'm') && !loading) { startMenu.open = true; startMenu.idx = 0; return; }
	if (k === 'p' && !loading) { partyMenu.open = true; partyMenu.idx = 0; return; }
	if (k === 'b' && !loading) { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; bagMenu.forget = null; bagMenu.flash = null; return; }
	if (k === 'z' && !loading) interact();
}
// any menu that consumes direction presses instead of walking
const menuBlocking = () => starterMenu.open || dialog.blocking || evolution.blocking
	|| battle.blocking || pvp.blocking || shopMenu.open || bagMenu.open || pcMenu.open || partyMenu.open || ferryMenu.open
	|| startMenu.open || cardsMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open;

addEventListener('keydown', e => {
	if (typingInChat()) return;
	if (menuBlocking() || ['z', 'x', 'Enter', 'p', 'b', 'Escape'].includes(e.key) || KEYMAP[e.key]) {
		if (e.key !== 'F5' && e.key !== 'F12') e.preventDefault();
	}
	pressKey(e.key);
});

// ---------- touch controls ----------
// d-pad + A/B + PARTY/BAG buttons drive the same code paths as the keyboard
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
const DPAD = { 't-up': 'up', 't-down': 'down', 't-left': 'left', 't-right': 'right' };
const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
for (const [id, dir] of Object.entries(DPAD)) {
	const el = document.getElementById(id);
	el.addEventListener('pointerdown', e => {
		e.preventDefault();
		try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
		if (menuBlocking()) { pressKey(ARROW[dir]); return; }
		if (!heldKeys.includes(dir)) heldKeys.unshift(dir);
	});
	const release = () => { const i = heldKeys.indexOf(dir); if (i >= 0) heldKeys.splice(i, 1); };
	el.addEventListener('pointerup', release);
	el.addEventListener('pointercancel', release);
	el.addEventListener('lostpointercapture', release);
}
for (const [id, key] of [['t-a', 'z'], ['t-b', 'x'], ['t-start', 'Enter'], ['t-party', 'p'], ['t-bag', 'b']]) {
	document.getElementById(id).addEventListener('pointerdown', e => { e.preventDefault(); pressKey(key); });
}
// holding B doubles as the run button while roaming
const tb = document.getElementById('t-b');
tb.addEventListener('pointerdown', () => { runHeld = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tb.addEventListener(ev, () => { runHeld = false; });

// tap/click on the game screen: battle buttons, or advancing dialogs
function screenPos(e) {
	const r = screen.getBoundingClientRect();
	return [(e.clientX - r.left) * (screen.width / r.width),
		(e.clientY - r.top) * (screen.height / r.height)];
}
screen.addEventListener('pointermove', e => {
	if (pvp.blocking) { pvp.hover(...screenPos(e)); return; }
	if (battle.blocking) { battle.hover(...screenPos(e)); return; }
	if (anyMenuOpen()) {
		const [x, y] = screenPos(e);
		menuHover = null;
		for (const b of menuUi) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) menuHover = b.id;
	}
});
screen.addEventListener('pointerdown', e => {
	e.preventDefault();
	if (pvp.blocking) { pvp.tap(...screenPos(e)); return; }
	if (battle.blocking) { battle.tap(...screenPos(e)); return; }
	if (dialog.blocking || evolution.blocking) { pressKey('z'); return; }
	if (anyMenuOpen()) {
		const [x, y] = screenPos(e);
		for (const b of menuUi) {
			if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { menuTap(b.id); return; }
		}
	}
});

// ---------- map transitions ----------
async function refreshMapContent(label) {
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	items.loadForMap();
	hud.textContent = world.current.map.name || label;
	savePos();
	loading = false;
}

// nearest walkable tile to a preferred spot (spiral search)
function findLanding(px, py) {
	for (let r = 0; r < 14; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const x = px + dx, y = py + dy;
				if (world.isPassable(x, y) && !world.isSurfable(x, y)) return [x, y];
			}
		}
	}
	return [px, py];
}

// direct travel (region select, ferries): land near the map's center
async function moveToMap(file, px, py) {
	loading = true;
	await world.load(file);
	const cx = px ?? Math.floor(world.current.layout.width / 2);
	const cy = py ?? Math.floor(world.current.layout.height / 2);
	player.setTile(...findLanding(cx, cy));
	player.surfing = false;
	await refreshMapContent(file);
}

async function warpTo(mapId, destWarpId) {
	const file = world.fileFor(mapId);
	if (!file) { console.warn('unknown warp dest', mapId); return; }
	loading = true;
	const source = { name: world.current.name, tx: player.tx, ty: player.ty };
	await world.load(file);
	let idx = parseInt(destWarpId, 10);
	if (isNaN(idx) || idx < 0) idx = 0;
	const w = world.warps[idx] || world.warps[0];
	if (w) player.setTile(w.x, w.y);
	else player.setTile(Math.floor(world.current.layout.width / 2), Math.floor(world.current.layout.height / 2));
	world.lastWarpSource = source;
	await refreshMapContent(file);
}

async function backWarp() {
	const src = world.lastWarpSource;
	if (!src) return;
	loading = true;
	await world.load(src.name);
	player.setTile(src.tx, src.ty);
	await refreshMapContent(src.name);
}

// re-anchor when the player has walked into a connected map
async function crossConnection(hit) {
	loading = true;
	const { conn, lx, ly } = hit;
	await world.load(conn.name);
	player.setTile(lx, ly);
	await refreshMapContent(conn.name);
}

player.onArrive = () => {
	// warp tile?
	const w = world.warpAt(player.tx, player.ty);
	if (!w) savePos();
	if (w) {
		const dest = parseInt(w.dest_warp_id, 10);
		if (dest === -1) backWarp();
		else warpTo(w.dest_map, w.dest_warp_id);
		return;
	}
	// crossed into a connection?
	const lay = world.current.layout;
	const outside = player.tx < 0 || player.tx >= lay.width || player.ty < 0 || player.ty >= lay.height;
	if (outside) {
		const hit = world.connectionAt(player.tx, player.ty);
		if (hit) { crossConnection(hit); return; }
	}
	// trainer sight lines take priority over grass
	if (!battle.blocking && trainers.checkSight(player.tx, player.ty)) return;
	// wild encounter?
	if (!battle.blocking) {
		const pick = encounters.roll(world.current.map.id, world, player.tx, player.ty, player.surfing);
		if (pick) startWildBattle(pick);
	}
};

function startWildBattle(pick, forceDouble) {
	if (!party || !leadMon(party)) return;
	Dex.markSeen(pick.id);
	// a slice of grass encounters are horde-style double battles
	const second = (forceDouble || Math.random() < 0.1)
		&& party.filter(m => m.curHP > 0).length >= 2
		? encounters.pick(world.current.map.id) : null;
	if (second) Dex.markSeen(second.id);
	battle.start(party, pick.id, pick.level, result => {
		if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		} else if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId);
			const where = addCaught(party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
		} else {
			saveParty(party);
		}
		if (result === 'victory') evolution.check(party, battle.data);
	}, second);
}

// ---------- camera ----------
function cameraPos() {
	// center on player sprite (feet tile center), GBA-style; no bounds clamp
	const cx = Math.round(player.px + META / 2 - VIEW_W / 2);
	const cy = Math.round(player.py + META / 2 - VIEW_H / 2 - 8);
	return [cx, cy];
}

// ---------- loop ----------
let last = performance.now();
let playAccum = 0;
function tick(now) {
	requestAnimationFrame(tick);
	const dt = Math.min((now - last) / 1000, 0.05);
	last = now;
	if (loading || !world.current) return;

	// accumulate playtime (whole seconds, throttled writes) for the Trainer Card
	playAccum += dt;
	if (playAccum >= 5) {
		const s = (parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0) + Math.floor(playAccum);
		try { localStorage.setItem('magepunk_playtime', String(s)); } catch (e) {}
		playAccum -= Math.floor(playAccum);
	}

	battle.update(dt);
	pvp.update(dt);
	evolution.update(dt);
	if (!battle.blocking && !pvp.blocking && !dialog.blocking && !evolution.blocking && !starterMenu.open) {
		trainers.update(dt);
		player.run = runHeld;
		// any open menu freezes the player even if a key was held as it opened
		const moveDir = menuBlocking() ? null : (heldKeys[0] || null);
		if (!trainers.engaging) player.update(dt, moveDir);
		npcs.update(dt);
	}

	const [camX, camY] = cameraPos();
	ctx.clearRect(0, 0, VIEW_W, VIEW_H);
	world.drawLayer(ctx, 'bottom', camX, camY);
	services.draw(ctx, camX, camY);
	items.draw(ctx, camX, camY);
	// sprites in y order so overlaps stack correctly
	const sprites = [...npcs.list, ...trainers.list, player].sort((a, b) => a.py - b.py);
	for (const s of sprites) s.draw(ctx, camX, camY);
	drawFriendGhosts(ctx, camX, camY);
	world.drawLayer(ctx, 'top', camX, camY);
	if (!battle.blocking) evolution.draw(ctx);

	sctx.drawImage(frame, 0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
	// battle, menus, and dialogs all render at full canvas resolution
	const SW = screen.width, SH = screen.height;
	if (battle.blocking) {
		battle.draw(sctx, SW, SH);
	} else if (pvp.blocking) {
		pvp.draw(sctx, SW, SH);
	} else {
		if (partyMenu.open) drawPartyMenu(SW, SH);
		else if (shopMenu.open) drawShopMenu(SW, SH);
		else if (bagMenu.open) drawBagMenu(SW, SH);
		else if (pcMenu.open) drawPcMenu(SW, SH);
		else if (dexMenu.open) drawDexMenu(SW, SH);
		else if (trainerCard.open) drawTrainerCard(SW, SH);
		else if (starterMenu.open) drawStarterMenu(SW, SH);
		else if (ferryMenu.open) drawFerryMenu(SW, SH);
		else if (startMenu.open) drawStartMenu(SW, SH);
		else if (cardsMenu.open) drawCardsMenu(SW, SH);
		else if (friendsMenu.open) drawFriendsMenu(SW, SH);
		if (!evolution.blocking) dialog.drawHi(sctx, SW, SH);
	}
}

// ---------- full-resolution menus (battleui components + pixel font) ----------
let menuUi = [];   // tappable rects rebuilt each draw: {id, x, y, w, h}
let menuHover = null;
const iconCache = new Map();
function iconOf(mon) {
	if (!mon.sprite) return null;
	if (!iconCache.has(mon.sprite)) {
		iconCache.set(mon.sprite, null);
		getImage(`data/pokemon/${mon.sprite}`).then(img => iconCache.set(mon.sprite, img)).catch(() => {});
	}
	return iconCache.get(mon.sprite);
}

function menuChrome(W, H, u, title, sub, closable = true) {
	menuUi = [];
	sctx.fillStyle = 'rgba(10,8,18,0.82)';
	sctx.fillRect(0, 0, W, H);
	sctx.fillStyle = BUI.C.text;
	sctx.font = `${Math.round(24 * u)}px m6x11plus, monospace`;
	sctx.fillText(title, 24 * u, 40 * u);
	if (sub) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText(sub, 24 * u, 60 * u);
	}
	if (!closable) return;
	const close = { id: 'close', x: W - 106 * u, y: 16 * u, w: 90 * u, h: 36 * u, label: 'CLOSE', center: true };
	menuUi.push(close);
	BUI.button(sctx, close, menuHover === 'close', u);
}

// a tappable mon row: sprite icon, name, level, status, HP bar + numbers
function monRow(id, x, y, w, h, mon, selected, u, note) {
	const b = { id, x, y, w, h };
	menuUi.push(b);
	sctx.fillStyle = selected || menuHover === id ? BUI.C.btnHover : BUI.C.btn;
	BUI.rr(sctx, x, y, w, h, 8 * u); sctx.fill();
	sctx.strokeStyle = selected ? BUI.C.accent : BUI.C.panelBorder;
	sctx.lineWidth = selected ? 3 : 2;
	BUI.rr(sctx, x + 1, y + 1, w - 2, h - 2, 8 * u); sctx.stroke();
	const img = iconOf(mon);
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = (h - 8 * u) / img.height;
		sctx.drawImage(img, x + 8 * u, y + 4 * u, img.width * s, img.height * s);
	}
	sctx.fillStyle = mon.curHP > 0 ? BUI.C.text : BUI.C.faint;
	sctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
	sctx.fillText(mon.name, x + h + 6 * u, y + 22 * u);
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(`Lv${mon.level}`, x + h + 6 * u, y + h - 10 * u);
	if (mon.status) {
		BUI.badge(sctx, x + h + 52 * u, y + h - 24 * u, 34 * u, 16 * u,
			BUI.STATUS_BADGE[mon.status] || '#999', mon.status.toUpperCase(),
			`${Math.round(11 * u)}px m6x11plus, monospace`);
	}
	const barW = w * 0.34;
	const frac = Math.max(0, mon.curHP / mon.maxHP);
	BUI.bar(sctx, x + w - barW - 84 * u, y + h / 2 - 5 * u, barW, 10 * u, frac, BUI.hpColor(frac), 4 * u);
	sctx.fillStyle = BUI.C.text;
	sctx.textAlign = 'right';
	sctx.fillText(`${mon.curHP}/${mon.maxHP}`, x + w - 12 * u, y + h / 2 + 5 * u);
	sctx.textAlign = 'left';
	if (note) {
		sctx.fillStyle = BUI.C.accent;
		sctx.textAlign = 'right';
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText(note, x + w - 12 * u, y + 16 * u);
		sctx.textAlign = 'left';
	}
}

function drawPartyMenu(W, H) {
	const u = H / 480;
	if (partyMenu.summary) { drawSummary(W, H, u); return; }
	menuChrome(W, H, u, 'PARTY', 'Tap a POKEMON to view its summary. TAKE returns its held item.');
	party.forEach((m, i) => {
		const note = (i === 0 ? 'LEAD ' : '') + (m.heldItem ? Bag.ITEMS[m.heldItem]?.name || m.heldItem : '');
		monRow('party:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u - (m.heldItem ? 74 * u : 0), 56 * u, m,
			partyMenu.idx === i, u, note.trim());
		if (m.heldItem) {
			const b = { id: 'take:' + i, x: W - 24 * u - 68 * u, y: (76 + i * 62) * u, w: 68 * u, h: 56 * u,
				label: 'TAKE', center: true };
			menuUi.push(b);
			BUI.button(sctx, b, menuHover === b.id, u);
		}
	});
}

const STAT_LABEL = { hp: 'HP', atk: 'ATTACK', def: 'DEFENSE', spa: 'SP. ATK', spd: 'SP. DEF', spe: 'SPEED' };

// full-page summary for one party member: portrait, stats, moves
function drawSummary(W, H, u) {
	const m = party[partyMenu.idx];
	if (!m) { partyMenu.summary = false; return; }
	menuChrome(W, H, u, m.name, `Lv${m.level}   ${m.gender === 'M' ? '♂' : m.gender === 'F' ? '♀' : ''}   #${String(Math.abs(m.num || 0)).padStart(3, '0')}`);
	// portrait + types on the left
	const img = iconOf(m);
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min(160 * u / img.width, 160 * u / img.height);
		sctx.drawImage(img, 40 * u, 90 * u, img.width * s, img.height * s);
	}
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	m.types.forEach((t, i) => {
		const bw = 74 * u;
		BUI.badge(sctx, 40 * u + i * (bw + 8 * u), 258 * u, bw, 22 * u,
			BUI.TYPE_COLORS[t] || '#888', t.toUpperCase(), `${Math.round(12 * u)}px m6x11plus, monospace`);
	});
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(`ABILITY: ${(m.ability || '—').toUpperCase()}`, 40 * u, 302 * u);
	sctx.fillText(`ITEM: ${m.heldItem ? (Bag.ITEMS[m.heldItem]?.name || m.heldItem) : '—'}`, 40 * u, 322 * u);
	sctx.fillText(`FRIEND: ${m.friend ?? 70}`, 40 * u, 342 * u);
	// stat bars on the right
	const sx = W * 0.42, sw = W * 0.5;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach((st, i) => {
		const y = (96 + i * 34) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(STAT_LABEL[st], sx, y);
		const v = st === 'hp' ? m.maxHP : m.stats[st];
		sctx.fillStyle = BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(String(v), sx + 96 * u, y);
		sctx.textAlign = 'left';
		const frac = Math.max(0.05, Math.min(1, v / 200));
		BUI.bar(sctx, sx + 108 * u, y - 11 * u, sw - 108 * u, 12 * u, frac, BUI.C.accent, 4 * u);
	});
	// moves along the bottom
	const my = 320 * u;
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText('MOVES', sx, my - 8 * u);
	m.moves.forEach((mv, i) => {
		const info = battle.data.moves[mv.id] || {};
		const y = my + i * 30 * u;
		const bw = (sw) / 2 - 8 * u;
		const bx = sx + (i % 2) * (bw + 12 * u);
		const yy = my + Math.floor(i / 2) * 34 * u;
		sctx.fillStyle = BUI.C.btn;
		BUI.rr(sctx, bx, yy, bw, 28 * u, 6 * u); sctx.fill();
		const tc = BUI.TYPE_COLORS[info.type] || '#888';
		sctx.fillStyle = tc;
		sctx.fillRect(bx, yy, 4 * u, 28 * u);
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText(mv.name, bx + 12 * u, yy + 13 * u);
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText(`${(info.type || '').toUpperCase()}  PP ${mv.pp}/${mv.maxPp}`, bx + 12 * u, yy + 25 * u);
	});
	// nav hint / lead button
	const lead = { id: 'summary-lead', x: 40 * u, y: H - 52 * u, w: 200 * u, h: 40 * u,
		label: partyMenu.idx === 0 ? 'IS LEAD' : 'MAKE LEAD', center: true };
	menuUi.push(lead);
	BUI.button(sctx, lead, menuHover === lead.id, u);
}

function drawDexMenu(W, H) {
	const u = H / 480;
	const list = dexList();
	const c = Dex.counts();
	if (dexMenu.detail) { drawDexDetail(W, H, u, list[dexMenu.idx]); return; }
	menuChrome(W, H, u, 'POKeDEX', `Seen ${c.seen}   Caught ${c.caught}   —   tap a seen entry for details`);
	const rows = 9;
	const start = Math.max(0, Math.min(dexMenu.idx - 4, list.length - rows));
	list.slice(start, start + rows).forEach((e, i) => {
		const idx = start + i;
		const seen = Dex.isSeen(e.id), caught = Dex.isCaught(e.id);
		const bid = 'dex:' + idx;
		const b = { id: bid, x: 24 * u, y: (76 + i * 40) * u, w: W - 48 * u, h: 34 * u };
		menuUi.push(b);
		sctx.fillStyle = dexMenu.idx === idx || menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 6 * u); sctx.fill();
		sctx.strokeStyle = dexMenu.idx === idx ? BUI.C.accent : BUI.C.panelBorder;
		sctx.lineWidth = dexMenu.idx === idx ? 3 : 1;
		BUI.rr(sctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 6 * u); sctx.stroke();
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		sctx.fillText(`#${String(Math.abs(e.num)).padStart(3, '0')}`, b.x + 12 * u, b.y + 22 * u);
		sctx.fillStyle = seen ? BUI.C.text : BUI.C.faint;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText(seen ? e.name.toUpperCase() : '----------', b.x + 70 * u, b.y + 22 * u);
		if (caught) {
			sctx.fillStyle = BUI.C.accent;
			sctx.textAlign = 'right';
			sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			sctx.fillText('● OWNED', b.x + b.w - 14 * u, b.y + 22 * u);
			sctx.textAlign = 'left';
		}
	});
}

function drawDexDetail(W, H, u, e) {
	if (!e) { dexMenu.detail = false; return; }
	const sp = battle.data.species[e.id];
	const caught = Dex.isCaught(e.id);
	menuChrome(W, H, u, sp.name.toUpperCase(), `#${String(Math.abs(e.num)).padStart(3, '0')}   ${caught ? 'OWNED' : 'SEEN'}`);
	const img = iconOf({ sprite: sp.sprite });
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min(180 * u / img.width, 180 * u / img.height);
		sctx.drawImage(img, 50 * u, 100 * u, img.width * s, img.height * s);
	}
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	(sp.types || []).forEach((t, i) => {
		const bw = 76 * u;
		BUI.badge(sctx, 50 * u + i * (bw + 8 * u), 290 * u, bw, 22 * u,
			BUI.TYPE_COLORS[t] || '#888', t.toUpperCase(), `${Math.round(12 * u)}px m6x11plus, monospace`);
	});
	const sx = W * 0.5, sw = W * 0.42;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach((st, i) => {
		const y = (110 + i * 36) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(STAT_LABEL[st], sx, y);
		const v = sp.baseStats[st] || 0;
		sctx.fillStyle = BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(String(v), sx + 96 * u, y);
		sctx.textAlign = 'left';
		BUI.bar(sctx, sx + 108 * u, y - 11 * u, sw - 40 * u, 12 * u, Math.min(1, v / 200), BUI.C.accent, 4 * u);
	});
}

// simple playtime accumulator (seconds), persisted; region stored on starter pick
function playtimeStr() {
	const s = parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0;
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
	return `${h}:${String(m).padStart(2, '0')}`;
}
function drawTrainerCard(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'TRAINER CARD', 'Your journey so far.');
	const c = Dex.counts();
	const name = localStorage.getItem('magepunk_name') || 'PLAYER';
	const region = localStorage.getItem('magepunk_region') || '—';
	const money = Bag.getMoney();
	const cardX = 60 * u, cardY = 90 * u, cardW = W - 120 * u, cardH = H - 190 * u;
	sctx.fillStyle = 'rgba(30,54,92,0.9)';
	BUI.rr(sctx, cardX, cardY, cardW, cardH, 16 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 3;
	BUI.rr(sctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, 16 * u); sctx.stroke();
	const lines = [
		['NAME', name],
		['REGION', region],
		['MONEY', `$${money}`],
		['POKeDEX SEEN', String(c.seen)],
		['POKeDEX OWNED', String(c.caught)],
		['PARTY', `${party.length}/6`],
		['PLAYTIME', playtimeStr()],
	];
	sctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
	lines.forEach(([k, v], i) => {
		const y = cardY + (44 + i * 40) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(k, cardX + 32 * u, y);
		sctx.fillStyle = BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(v, cardX + cardW - 32 * u, y);
		sctx.textAlign = 'left';
	});
}

function drawStarterMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'CHOOSE YOUR FIRST POKEMON', 'Tap one to begin your journey.', false);
	const cw = 150 * u, ch = 118 * u;
	STARTERS.forEach((row, r) => {
		const y = (78 + r * 130) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.save();
		sctx.translate(38 * u, y + ch / 2);
		sctx.rotate(-Math.PI / 2);
		sctx.textAlign = 'center';
		sctx.fillText(row.region, 0, 0);
		sctx.restore();
		row.ids.forEach((id, c) => {
			const x = (70 + c * 165) * u;
			const sel = starterMenu.row === r && starterMenu.col === c;
			const bid = `starter:${r}:${c}`;
			menuUi.push({ id: bid, x, y, w: cw, h: ch });
			const sp = battle.data.species[id];
			const tc = BUI.TYPE_COLORS[sp?.types?.[0]] || '#888';
			sctx.fillStyle = sel || menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
			BUI.rr(sctx, x, y, cw, ch, 10 * u); sctx.fill();
			sctx.strokeStyle = sel || menuHover === bid ? tc : BUI.C.panelBorder;
			sctx.lineWidth = sel ? 4 : 2;
			BUI.rr(sctx, x + 1, y + 1, cw - 2, ch - 2, 10 * u); sctx.stroke();
			const img = starterMenu.sprites[id];
			if (img) {
				sctx.imageSmoothingEnabled = false;
				const s = Math.min((cw - 30 * u) / img.width, (ch - 44 * u) / img.height);
				sctx.drawImage(img, x + (cw - img.width * s) / 2, y + 6 * u, img.width * s, img.height * s);
			}
			sctx.fillStyle = sel ? tc : BUI.C.text;
			sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText((sp?.name || id).toUpperCase(), x + cw / 2, y + ch - 10 * u);
			sctx.textAlign = 'left';
		});
	});
}

function drawShopMenu(W, H) {
	const u = H / 480;
	const selling = shopMenu.mode === 'sell';
	menuChrome(W, H, u, 'POKE MART', `Money: $${Bag.getMoney()} — ${selling ? 'tap to sell (half price)' : 'tap to buy'}`);
	// BUY / SELL tabs
	['buy', 'sell'].forEach((m, i) => {
		const bid = 'shopmode:' + m;
		const b = { id: bid, x: (24 + i * 130) * u, y: 62 * u, w: 120 * u, h: 30 * u, label: m.toUpperCase(), center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || shopMenu.mode === m, u);
	});
	const rows = selling ? sellList() : Bag.SHOP_STOCK.map(id => ({ id }));
	if (!rows.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('Nothing to sell.', 24 * u, 140 * u);
	}
	const start = Math.max(0, Math.min(shopMenu.idx - 3, rows.length - 7));
	rows.slice(start, start + 7).forEach((row, i) => {
		const idx = start + i;
		const it = Bag.ITEMS[row.id];
		const bid = (selling ? 'sell:' : 'buy:') + idx;
		const price = selling ? sellPrice(row.id) : it.price;
		const b = { id: bid, x: 24 * u, y: (104 + i * 48) * u, w: W - 118 * u, h: 42 * u,
			label: it.name, sub: selling ? `have ${row.n}` : `have ${Bag.count(row.id)}`,
			right: `$${price}`, kbSel: shopMenu.idx === idx };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || shopMenu.idx === idx, u);
	});
	for (const [id, label, y] of [['shopscroll:-1', '▲', 104], ['shopscroll:1', '▼', 320]]) {
		const b = { id, x: W - 86 * u, y: y * u, w: 62 * u, h: 130 * u, label, center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === id, u);
	}
	if (shopMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(shopMenu.flash, 24 * u, H - 20 * u);
	}
}

function drawBagMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'BAG', `Money: $${Bag.getMoney()} — tap an item, then who to use it on`);
	const entries = Object.entries(Bag.getBag()).filter(([, n]) => n > 0);
	if (!entries.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('The bag is empty.', 24 * u, 100 * u);
	}
	const colW = bagMenu.picking ? W * 0.44 : W - 48 * u;
	const start = Math.max(0, Math.min(bagMenu.idx - 3, entries.length - 7));
	entries.slice(start, start + 7).forEach(([id, n], i) => {
		const idx = start + i;
		const bid = 'item:' + idx;
		const b = { id: bid, x: 24 * u, y: (76 + i * 52) * u, w: colW, h: 46 * u,
			label: Bag.nameOf(id), right: `x${n}` };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || (bagMenu.idx === idx && !bagMenu.picking), u);
	});
	if (bagMenu.forget) {
		const f = bagMenu.forget;
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(`${f.mon.name}: forget which move?`, W * 0.5, 70 * u);
		f.mon.moves.forEach((mv, i) => {
			const bid = 'forget:' + i;
			const b = { id: bid, x: W * 0.5, y: (76 + i * 52) * u, w: W * 0.47, h: 46 * u,
				label: mv.name, right: `${mv.pp}/${mv.maxPp}` };
			menuUi.push(b);
			BUI.button(sctx, b, menuHover === bid || f.idx === i, u);
		});
	} else if (bagMenu.picking) {
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText('Use on:', W * 0.5, 70 * u);
		party.forEach((m, i) => {
			monRow('use:' + i, W * 0.5, (76 + i * 54) * u, W * 0.47, 48 * u, m, bagMenu.pickIdx === i, u);
		});
	}
	if (bagMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(bagMenu.flash, 24 * u, H - 24 * u);
	}
}

function drawPcMenu(W, H) {
	const u = H / 480;
	const box = getBox();
	menuChrome(W, H, u, 'POKEMON STORAGE', 'Tap to move between PARTY and BOX.');
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	sctx.fillStyle = pcMenu.side === 0 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText('PARTY', 24 * u, 78 * u);
	sctx.fillStyle = pcMenu.side === 1 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText(`BOX (${box.length})`, W * 0.52, 78 * u);
	party.forEach((m, i) => {
		monRow('pcp:' + i, 24 * u, (88 + i * 54) * u, W * 0.44, 48 * u, m,
			pcMenu.side === 0 && pcMenu.idx === i, u);
	});
	const start = Math.max(0, Math.min((pcMenu.side === 1 ? pcMenu.idx : 0) - 3, box.length - 7));
	box.slice(start, start + 7).forEach((m, i) => {
		const idx = start + i;
		monRow('pcb:' + idx, W * 0.52, (88 + i * 54) * u, W * 0.44, 48 * u, m,
			pcMenu.side === 1 && pcMenu.idx === idx, u);
	});
}

function drawFerryMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'FERRY', 'All aboard! Where to, sailor?');
	const dests = FERRY_DESTS.filter(d => d.file !== world.current.name);
	dests.forEach((d, i) => {
		const bid = 'sail:' + i;
		const b = { id: bid, x: 24 * u, y: (90 + i * 64) * u, w: W - 48 * u, h: 56 * u,
			label: d.label, big: true, center: true, kbSel: ferryMenu.idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || ferryMenu.idx === i, u);
	});
}

// a compact vertical list menu (Start / Cards); returns tappable rows
function drawVertical(W, H, u, title, sub, items, idx, idPrefix) {
	menuChrome(W, H, u, title, sub, title !== 'MENU');
	const bw = Math.min(W - 48 * u, 360 * u);
	items.forEach((lab, i) => {
		const bid = idPrefix + ':' + i;
		const b = { id: bid, x: W - bw - 24 * u, y: (80 + i * 46) * u, w: bw, h: 40 * u,
			label: lab, center: true, kbSel: idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || idx === i, u);
	});
}
function drawStartMenu(W, H) {
	drawVertical(W, H, H / 480, 'MENU', 'Press START/Enter to close.', startItems(), startMenu.idx, 'start');
}
function drawCardsMenu(W, H) {
	drawVertical(W, H, H / 480, 'CARDS', 'Your collection, decks, packs, and battles.', cardsItems(), cardsMenu.idx, 'cards');
}
function drawFriendsMenu(W, H) {
	const u = H / 480;
	const sub = friendsChallenge.mode ? 'Choose a friend to challenge.'
		: `Your code: ${mpAccount?.friendCode || '……'} — add friends and visit their world.`;
	menuChrome(W, H, u, 'FRIENDS', sub);
	// row 0: add friend
	const rows = [{ id: 'friend:0', label: '+ ADD FRIEND BY CODE', sub: '' }];
	friends.forEach((f, i) => rows.push({
		id: 'friend:' + (i + 1),
		label: f.username + (f.online ? '  ●' : '  ○'),
		sub: f.online ? (friendsChallenge.mode ? 'tap to challenge' : `in ${f.map || 'their world'} — tap to visit`) : 'offline',
		online: f.online,
	}));
	rows.forEach((r, i) => {
		const b = { id: r.id, x: 24 * u, y: (78 + i * 52) * u, w: W - 48 * u, h: 46 * u,
			label: r.label, sub: r.sub, kbSel: friendsMenu.idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === r.id || friendsMenu.idx === i, u);
	});
	if (!friends.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText('No friends yet — share your code!', 24 * u, (78 + 60) * u);
	}
}

// taps route into the same state + key logic the keyboard uses
function menuTap(id) {
	const [kind, a, b2] = id.split(':');
	if (kind === 'close') { pressKey('Escape'); pressKey('x'); return; }
	if (kind === 'party') { partyMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'take') {
		const mon = party[+a];
		if (mon?.heldItem) {
			Bag.addItem(mon.heldItem);
			mon.heldItem = null;
			saveParty(party);
		}
		return;
	}
	if (kind === 'starter') { starterMenu.row = +a; starterMenu.col = +b2; pressKey('z'); return; }
	if (kind === 'buy' || kind === 'sell') { shopMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'shopmode') { if (shopMenu.mode !== a) { shopMenu.mode = a; shopMenu.idx = 0; } return; }
	if (kind === 'shopscroll') { pressKey(+a > 0 ? 'ArrowDown' : 'ArrowUp'); return; }
	if (kind === 'sail') { ferryMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'item') { bagMenu.idx = +a; bagMenu.picking = false; bagMenu.forget = null; pressKey('z'); return; }
	if (kind === 'use') { bagMenu.pickIdx = +a; pressKey('z'); return; }
	if (kind === 'forget') { if (bagMenu.forget) bagMenu.forget.idx = +a; pressKey('z'); return; }
	if (kind === 'pcp') { pcMenu.side = 0; pcMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'pcb') { pcMenu.side = 1; pcMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'start') { startMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'cards') { cardsMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'friend') { friendsMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'dex') { dexMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'summary-lead') { pressKey('z'); return; }
}
const anyMenuOpen = () => partyMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || starterMenu.open || ferryMenu.open || startMenu.open || cardsMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open;

// ---------- live PvP battles ----------
// build a self-contained party snapshot the PvP engine can resolve without
// any of our client-only data (move power/type/category baked in)
function pvpParty() {
	if (!party || !battle.data) return [];
	return party.filter(m => m.curHP > 0).slice(0, 6).map(m => ({
		speciesId: m.speciesId, name: m.name, level: m.level, types: m.types, sprite: m.sprite,
		stats: { ...m.stats }, maxHP: m.maxHP, curHP: m.curHP, status: m.status || null,
		moves: m.moves.map(mv => {
			const info = battle.data.moves[mv.id] || {};
			return { id: mv.id, name: mv.name, pp: mv.pp, maxPp: mv.maxPp,
				type: info.type || 'Normal', power: info.power || 0,
				category: info.category || 'Status', acc: info.acc ?? 100, priority: info.priority || 0 };
		}),
	}));
}
// my card deck + class for a live card duel (from the account's saved decks)
async function cardParty() {
	let st;
	try { st = await MP.freshState(); } catch (e) { st = MP.cachedState(); }
	if (!st || !st.decks) return null;
	const saved = localStorage.getItem('magepunk_class_v1') || '';
	const clsId = st.decks[saved] ? saved
		: (st.decks.mage ? 'mage' : Object.keys(st.decks).find(k => (st.decks[k] || []).length >= 10));
	const deck = clsId && st.decks[clsId];
	if (!deck || deck.length < 10) return null;
	return { deck, classId: clsId };
}
const goCardDuel = id => { location.href = '/battlecards/?cardpvp=' + encodeURIComponent(id) + '&mp=1'; };

// on boot, offer to rejoin a battle left in progress (e.g. after a refresh).
// Declining forfeits so the opponent isn't left waiting out the abandon timer.
async function checkRejoin() {
	if (!MP_ON) return;
	let data;
	try { data = await MP.call('my-current-match'); } catch (e) { return; }
	if (!data || !data.match) return;
	const { id, type } = data.match;
	const what = type === 'card' ? 'card duel' : 'POKeMON battle';
	dialog.open(`You left a ${what} in progress.  Z=Rejoin  X=Forfeit`, (declined) => {
		if (declined === 'x') { MP.call('leave-match', { id, type }).catch(() => {}); return; }
		if (type === 'card') goCardDuel(id);
		else enterMatch(id, false);
	});
}

let pendingChallengeTo = null; // username we challenged, polling for accept
async function sendChallenge(f) {
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	await MP.call('challenge', { to: f.username, battleType: 'pokemon', party: snap });
	pendingChallengeTo = f.username;
	dialog.open(`Challenge sent to ${f.username}!\n\nWaiting for them to accept…`);
}
async function sendCardChallenge(f) {
	const party = await cardParty();
	if (!party) { dialog.open('You need a full class deck to card-battle.\n\nBuild one in CARDS → DECK BUILDER first.'); return; }
	await MP.call('challenge', { to: f.username, battleType: 'card', party });
	pendingChallengeTo = f.username;
	dialog.open(`Card battle challenge sent to ${f.username}!\n\nWaiting for them to accept…`);
}
async function pollChallenges() {
	if (!MP_ON || pvp.blocking) return;
	// did a friend accept our challenge?
	if (pendingChallengeTo) {
		try {
			const mm = await MP.call('my-match');
			if (mm.matchId) {
				pendingChallengeTo = null;
				if (mm.type === 'card') { goCardDuel(mm.matchId); return; }
				enterMatch(mm.matchId, false); return;
			}
		} catch (e) {}
	}
	// any incoming challenges?
	if (incomingChallenge || anyMenuOpen() || dialog.blocking || battle.blocking) return;
	try {
		const data = await MP.call('challenges');
		const ch = (data.challenges || [])[0];
		if (ch) { incomingChallenge = ch; showIncoming(ch); }
	} catch (e) {}
}
let incomingChallenge = null;
function showIncoming(ch) {
	if (ch.type === 'card') {
		dialog.open(`${ch.from} challenges you to a CARD battle!  Z=Accept  X=Decline`, async (declined) => {
			const c = incomingChallenge; incomingChallenge = null;
			if (!c) return;
			if (declined === 'x') { await MP.call('decline-challenge', { from: c.from }); return; }
			const party = await cardParty();
			if (!party) { dialog.open('You need a full class deck to card-battle.\n\nBuild one in CARDS → DECK BUILDER first.'); return; }
			const data = await MP.call('accept-challenge', { from: c.from, battleType: 'card', party });
			if (data.error) { dialog.open(data.error); return; }
			goCardDuel(data.matchId);
		});
		return;
	}
	dialog.open(`${ch.from} challenges you to a POKeMON battle!\n\nPress Z to ACCEPT, X to decline.`, async (declined) => {
		const c = incomingChallenge; incomingChallenge = null;
		if (!c) return;
		if (declined === 'x') { await MP.call('decline-challenge', { from: c.from }); return; }
		const snap = pvpParty();
		if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
		const data = await MP.call('accept-challenge', { from: c.from, party: snap });
		if (data.error) { dialog.open(data.error); return; }
		enterMatch(data.matchId, false, data.match, sideOfMe(data.match));
	});
}
function sideOfMe(match) {
	return match.sides.findIndex(sd => sd.name === (mpAccount?.username));
}
async function enterMatch(matchId, spectator, matchObj, side) {
	let match = matchObj;
	if (!match) {
		const data = await MP.call('match', { id: matchId });
		if (data.error) { dialog.open(data.error); return; }
		match = data.match; side = data.side;
	}
	if (side == null) side = sideOfMe(match);
	// live PvP is non-persistent (link-battle style): the battle runs on a party
	// snapshot, so damage/fainting never carries back to your overworld team.
	await pvp.start(matchId, match, side, spectator, () => { heartbeat(); });
	// tell friends I'm battling (so they can spectate)
	if (MP_ON) MP.call('heartbeat', { map: world.current.name, x: player.tx, y: player.ty, facing: player.facing, status: 'battling:' + matchId, region: world.current.map.name || '' });
}

// ---------- multiplayer presence & visiting ----------
let friendSprite = null; // green_normal.png, loaded lazily for friend ghosts
getImage('data/sprites/green_normal.png').then(img => { friendSprite = img; }).catch(() => {});
// every friend currently standing on my map, rendered as a live ghost
const ghosts = new Map(); // username -> { tx, ty, facing, px, py }

// broadcast my position; fast when co-located so neighbours see me move
async function heartbeat() {
	if (!MP_ON || loading) return;
	try {
		await MP.call('heartbeat', {
			map: world.current.name, x: player.tx, y: player.ty,
			facing: player.facing,
			status: pvp.blocking ? 'battling:' + (pvp.active?.matchId || '')
				: visiting ? 'visiting:' + visiting.username : 'roaming',
			region: world.current.map.name || '',
		});
	} catch (e) {}
}

// load a friend's current map at their position and follow them live
async function visitWorld(f) {
	const data = await MP.call('presence', { username: f.username });
	const p = data.presence;
	if (!p || !p.map) { dialog.open(`${f.username} isn't roaming right now.`); return; }
	const file = world.fileFor(p.map) || p.map;
	visiting = { username: f.username };
	await moveToMap(file, p.x, p.y);
	heartbeat();
	dialog.open(`You warped into ${f.username}'s world!\n\nPress START and pick EXIT to return home.`);
}
async function leaveVisit() {
	visiting = null;
	ghosts.clear();
	let home = null;
	try { home = JSON.parse(localStorage.getItem(POS_KEY)); } catch (e) {}
	await moveToMap(home?.map ? (world.fileFor(home.map) || home.map) : 'PalletTown', home?.x, home?.y);
}

// one poll of every friend's presence: update ghosts for those on my map,
// follow a visited friend across maps, drop friends who left
async function pollPresence() {
	if (!MP_ON || pvp.blocking) return;
	try {
		const data = await MP.call('friends');
		if (data.friends) friends = data.friends;
		const here = new Set();
		for (const f of friends) {
			if (visiting && f.username === visiting.username) {
				if (!f.online) { dialog.open(`${visiting.username} went offline. Returning home…`); await leaveVisit(); return; }
				const theirFile = world.fileFor(f.map) || f.map;
				if (f.map && theirFile !== world.current.name && !loading) { await moveToMap(theirFile, f.x, f.y); }
			}
			if (f.online && f.map === world.current.name) {
				here.add(f.username);
				let g = ghosts.get(f.username);
				if (!g) g = { px: f.x * META, py: f.y * META, path: [], facing: f.facing || 'down', missed: 0 };
				g.missed = 0;
				g.facingReported = f.facing || 'down';
				// waypoint queue: append each newly-reported tile; the draw loop walks
				// the ghost along the queue at a constant speed instead of snapping
				const last = g.path.length ? g.path[g.path.length - 1] : { x: Math.round(g.px / META), y: Math.round(g.py / META) };
				if (f.x !== last.x || f.y !== last.y) {
					g.path.push({ x: f.x, y: f.y });
					if (g.path.length > 6) g.path.splice(0, g.path.length - 6); // too far behind: skip ahead
				}
				ghosts.set(f.username, g);
			}
		}
		// grace period: one missed poll can be a warp/heartbeat gap — deleting
		// instantly made ghosts flicker ("glimpsed him every few frames")
		for (const [u, g] of ghosts) {
			if (!here.has(u) && ++g.missed >= 3) ghosts.delete(u);
		}
	} catch (e) {}
}

// true when someone is (or could be) sharing my screen — drives fast polling
function coLocated() {
	return ghosts.size > 0 || !!visiting
		|| friends.some(f => f.online && (f.map === world.current.name || (f.status || '').startsWith('visiting:')));
}

// draw every friend ghost on my map, walking it along its waypoint queue at a
// constant speed (like a real player) instead of ease-snapping to the last tile
let ghostClock = 0;
function drawFriendGhosts(ctx, camX, camY) {
	if (!friendSprite || !ghosts.size) return;
	const now = performance.now();
	const dt = ghostClock ? Math.min((now - ghostClock) / 1000, 0.1) : 0.016;
	ghostClock = now;
	for (const [name, g] of ghosts) {
		// catch-up speed scales with backlog: walk pace when current, run pace when
		// 2+ tiles behind, so a sprinting friend stays smooth instead of teleporting
		const speed = 120 * (g.path.length >= 2 ? 1.9 : 1.15);
		let budget = speed * dt;
		let moving = false;
		while (budget > 0 && g.path.length) {
			const wp = g.path[0];
			const dx = wp.x * META - g.px, dy = wp.y * META - g.py;
			const dist = Math.hypot(dx, dy);
			if (dist <= budget) { g.px = wp.x * META; g.py = wp.y * META; g.path.shift(); budget -= dist; }
			else {
				g.px += (dx / dist) * budget; g.py += (dy / dist) * budget; budget = 0;
			}
			// face the way we're travelling; fall back to the reported facing at rest
			g.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
			moving = true;
		}
		if (!moving) g.facing = g.facingReported || g.facing || 'down';
		const bob = moving && Math.floor(now / 150) % 2 ? -1 : 0; // subtle step bob
		const mirror = g.facing === 'right';
		const frameX = { down: 0, up: 1, left: 2, right: 2 }[g.facing] * 16;
		ctx.save();
		const x = Math.round(g.px - camX), y = Math.round(g.py - 16 - camY + bob);
		if (mirror) { ctx.translate(x + 16, y); ctx.scale(-1, 1); }
		else ctx.translate(x, y);
		ctx.globalAlpha = 0.92;
		ctx.drawImage(friendSprite, frameX, 0, 16, 32, 0, 0, 16, 32);
		ctx.restore();
		ctx.fillStyle = '#fff';
		ctx.font = '6px monospace';
		ctx.textAlign = 'center';
		ctx.fillText(name.slice(0, 8), Math.round(g.px - camX) + 8, Math.round(g.py - 18 - camY));
		ctx.textAlign = 'left';
	}
}

// ---------- boot ----------
(async () => {
	hud.textContent = 'Loading…';
	await world.init();
	await player.init();
	await npcs.init();
	await encounters.init();
	await battle.init();
	await trainers.init();
	await services.init();
	await items.init();
	signTexts = await getJSON('data/sign_texts.json').catch(() => ({}));
	party = loadParty(battle.data);
	if (party) Dex.seedFrom([...party, ...getBox()]);
	if (!party) {
		starterMenu.open = true;
		for (const row of STARTERS) {
			for (const id of row.ids) {
				const sp = battle.data.species[id];
				if (sp?.sprite) getImage(`data/pokemon/${sp.sprite}`).then(img => { starterMenu.sprites[id] = img; }).catch(() => {});
			}
		}
	}
	const params = new URLSearchParams(location.search);
	// resume from the saved position unless the URL pins a map
	let saved = null;
	if (!params.has('map')) {
		try { saved = JSON.parse(localStorage.getItem(POS_KEY)); } catch (e) {}
	}
	const startMap = params.get('map') || saved?.map || 'PalletTown';
	try { await world.load(startMap); } catch (e) { saved = null; await world.load('PalletTown'); }
	const sx = params.has('x') ? +params.get('x')
		: saved?.x ?? Math.floor(world.current.layout.width / 2);
	const sy = params.has('y') ? +params.get('y')
		: saved?.y ?? Math.floor(world.current.layout.height / 2);
	player.setTile(sx, sy);
	// resuming a save that stood on water means we were surfing
	if (world.isSurfable(sx, sy)) player.surfing = true;
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	items.loadForMap();
	hud.textContent = world.current.map.name || startMap;
	loading = false;
	// headless test hook
	// test hook: drive the player straight, bypassing the game loop's input
	function freezeLoop(on) { loading = !!on; }
	function pumpPlayer(dir, run, ms) {
		return new Promise(res => {
			player.run = !!run;
			const t0 = performance.now();
			let last = t0;
			const startAxis = dir === 'up' || dir === 'down' ? player.ty : player.tx;
			const step = () => {
				const now = performance.now();
				player.update((now - last) / 1000, dir);
				last = now;
				if (now - t0 < ms) requestAnimationFrame(step);
				else { player.run = false; res(Math.abs((dir === 'up' || dir === 'down' ? player.ty : player.tx) - startAxis)); }
			};
			step();
		});
	}
	// Test Realm: load the account, greet the player, begin presence
	if (MP_ON) {
		mpAccount = MP.cachedState() || await MP.freshState();
		hud.textContent = `${world.current.map.name || startMap}  ·  ${mpAccount?.username || ''} (${mpAccount?.friendCode || '……'})`;
		// adaptive presence: ~450ms when someone shares the map (minimal
		// latency for side-by-side screens), ~1.8s when roaming alone
		const beatLoop = () => heartbeat().finally(() => setTimeout(beatLoop, coLocated() ? 450 : 1800));
		const presLoop = () => pollPresence().finally(() => setTimeout(presLoop, coLocated() ? 400 : 1400));
		beatLoop();
		presLoop();
		setInterval(pollChallenges, 2000);
		checkRejoin();
	}
	window.__ow = { world, player, warpTo, moveToMap, npcs, encounters, battle, trainers, dialog, evolution, items, get party() { return party; }, get menuUi() { return menuUi; }, menuTap, pumpPlayer, freezeLoop, startWildBattle, interact,
		get startMenu() { return startMenu; }, get cardsMenu() { return cardsMenu; }, get friendsMenu() { return friendsMenu; },
		get friends() { return friends; }, get visiting() { return visiting; }, refreshFriends, visitWorld, leaveVisit, heartbeat, pollPresence, get ghosts() { return ghosts; }, MP_ON,
		get pvp() { return pvp; }, pvpParty, sendChallenge, enterMatch, pollChallenges, get pending() { return pendingChallengeTo; },
		Dex, get dexMenu() { return dexMenu; }, get trainerCard() { return trainerCard; }, get partyMenu() { return partyMenu; }, get shopMenu() { return shopMenu; }, get bagMenu() { return bagMenu; }, Bag };
	requestAnimationFrame(tick);
})();
