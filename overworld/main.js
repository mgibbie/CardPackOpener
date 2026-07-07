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
import { statsFor } from './battle.js';
import { getImage } from './engine.js';
import * as BUI from './battleui.js';

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
let signTexts = {};
let party = null;

// starter picker (fresh saves): 3 regions x 3 starters
const STARTERS = [
	{ region: 'KANTO', ids: ['bulbasaur', 'charmander', 'squirtle'] },
	{ region: 'JOHTO', ids: ['chikorita', 'cyndaquil', 'totodile'] },
	{ region: 'HOENN', ids: ['treecko', 'torchic', 'mudkip'] },
];
const starterMenu = { open: false, row: 0, col: 0, sprites: {} };
player.blocked = (tx, ty) => npcs.npcBlocks(tx, ty) || trainers.occupied(tx, ty) || services.blocks(tx, ty) || items.occupied(tx, ty);

trainers.onEngage = t => {
	const { party: foeParty, info } = trainers.buildBattle(t, battle.data);
	const begin = () => startTrainerBattle(t, foeParty, info);
	if (info.introQuote) dialog.open(info.introQuote, begin);
	else begin();
};

function startTrainerBattle(t, foeParty, info) {
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
addEventListener('keydown', e => {
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
	const svc = services.kindAt(fx, fy);
	if (svc === 'nurse') {
		dialog.open('Welcome to the POKEMON CENTER!\n\nWe restored your POKEMON\nto full health. See you again!', () => healParty(party));
		return;
	}
	if (svc === 'pc') { pcMenu.open = true; pcMenu.side = 0; pcMenu.idx = 0; return; }
	if (svc === 'shop') { shopMenu.open = true; shopMenu.idx = 0; return; }
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

const partyMenu = { open: false, idx: 0 };
const shopMenu = { open: false, idx: 0 };
const bagMenu = { open: false, idx: 0, picking: false, pickIdx: 0 };
const pcMenu = { open: false, side: 0, idx: 0 }; // side 0 = party (deposit), 1 = box (withdraw)

function getBox() {
	try { return JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]'); } catch (e) { return []; }
}
function setBox(box) {
	try { localStorage.setItem('magepunk_box_v1', JSON.stringify(box)); } catch (e) {}
}

function shopKey(k) {
	if (k === 'ArrowUp') shopMenu.idx = (shopMenu.idx + Bag.SHOP_STOCK.length - 1) % Bag.SHOP_STOCK.length;
	if (k === 'ArrowDown') shopMenu.idx = (shopMenu.idx + 1) % Bag.SHOP_STOCK.length;
	if (k === 'z' || k === 'Enter') {
		const id = Bag.SHOP_STOCK[shopMenu.idx];
		shopMenu.flash = Bag.buy(id) ? `Bought ${Bag.ITEMS[id].name}!` : 'Not enough money!';
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

function bagKey(k) {
	const entries = Object.entries(Bag.getBag()).filter(([, n]) => n > 0);
	if (bagMenu.picking) {
		if (k === 'ArrowUp') bagMenu.pickIdx = (bagMenu.pickIdx + party.length - 1) % party.length;
		if (k === 'ArrowDown') bagMenu.pickIdx = (bagMenu.pickIdx + 1) % party.length;
		if (k === 'x' || k === 'Escape') bagMenu.picking = false;
		if (k === 'z' || k === 'Enter') {
			const [id] = entries[bagMenu.idx] || [];
			const item = Bag.ITEMS[id];
			const mon = party[bagMenu.pickIdx];
			if (item && mon) {
				if (item.kind === 'heal' && mon.curHP > 0 && mon.curHP < mon.maxHP) {
					Bag.consume(id);
					mon.curHP = Math.min(mon.maxHP, mon.curHP + item.amount);
					saveParty(party);
					bagMenu.picking = false;
				} else if (item.kind === 'revive' && mon.curHP <= 0) {
					Bag.consume(id);
					mon.curHP = Math.floor(mon.maxHP / 2);
					mon.status = null;
					saveParty(party);
					bagMenu.picking = false;
				} else if (item.kind === 'candy' && useRareCandy(mon)) {
					Bag.consume(id);
					bagMenu.picking = false;
				} else if (item.kind === 'ether' && mon.curHP > 0 && mon.moves.some(m => m.pp < m.maxPp)) {
					Bag.consume(id);
					for (const mv of mon.moves) mv.pp = Math.min(mv.maxPp, mv.pp + item.amount);
					saveParty(party);
					bagMenu.picking = false;
				} else if (item.kind === 'held') {
					// give the item; anything already held returns to the bag
					Bag.consume(id);
					if (mon.heldItem) Bag.addItem(mon.heldItem);
					mon.heldItem = id;
					saveParty(party);
					bagMenu.picking = false;
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
		const kind = Bag.ITEMS[id]?.kind;
		if (['heal', 'revive', 'candy', 'ether', 'held'].includes(kind)) { bagMenu.picking = true; bagMenu.pickIdx = 0; }
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
		const id = STARTERS[starterMenu.row].ids[starterMenu.col];
		party = createStarter(id, battle.data);
		starterMenu.open = false;
		dialog.open(`You chose ${party[0].name}!\n\nTake good care of it.`);
	}
}

// one entry point for keyboard AND the virtual touch buttons
function pressKey(k) {
	if (starterMenu.open) { starterKey(k); return; }
	if (dialog.blocking) { dialog.key(k); return; }
	if (evolution.blocking) { evolution.key(k); return; }
	if (battle.blocking) { battle.key(k); return; }
	if (shopMenu.open) { shopKey(k); return; }
	if (bagMenu.open) { bagKey(k); return; }
	if (pcMenu.open) { pcKey(k); return; }
	if (partyMenu.open) {
		if (k === 'ArrowUp') partyMenu.idx = (partyMenu.idx + party.length - 1) % party.length;
		if (k === 'ArrowDown') partyMenu.idx = (partyMenu.idx + 1) % party.length;
		if ((k === 'z' || k === 'Enter') && partyMenu.idx > 0) {
			// make selected mon the lead
			const [m] = party.splice(partyMenu.idx, 1);
			party.unshift(m);
			partyMenu.idx = 0;
			saveParty(party);
		}
		if (k === 'x' || k === 'p' || k === 'Escape') partyMenu.open = false;
		return;
	}
	if (k === 'p' && !loading) { partyMenu.open = true; partyMenu.idx = 0; return; }
	if (k === 'b' && !loading) { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; return; }
	if ((k === 'z' || k === 'Enter') && !loading) interact();
}
// any menu that consumes direction presses instead of walking
const menuBlocking = () => starterMenu.open || dialog.blocking || evolution.blocking
	|| battle.blocking || shopMenu.open || bagMenu.open || pcMenu.open || partyMenu.open;

addEventListener('keydown', e => {
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
for (const [id, key] of [['t-a', 'z'], ['t-b', 'x'], ['t-party', 'p'], ['t-bag', 'b']]) {
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
	if (battle.blocking) { battle.hover(...screenPos(e)); return; }
	if (anyMenuOpen()) {
		const [x, y] = screenPos(e);
		menuHover = null;
		for (const b of menuUi) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) menuHover = b.id;
	}
});
screen.addEventListener('pointerdown', e => {
	e.preventDefault();
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
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	items.loadForMap();
	hud.textContent = world.current.map.name || file;
	savePos();
	loading = false;
}

async function backWarp() {
	const src = world.lastWarpSource;
	if (!src) return;
	loading = true;
	await world.load(src.name);
	player.setTile(src.tx, src.ty);
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	items.loadForMap();
	hud.textContent = world.current.map.name || src.name;
	savePos();
	loading = false;
}

// re-anchor when the player has walked into a connected map
async function crossConnection(hit) {
	loading = true;
	const { conn, lx, ly } = hit;
	await world.load(conn.name);
	player.setTile(lx, ly);
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	items.loadForMap();
	hud.textContent = world.current.map.name || conn.name;
	savePos();
	loading = false;
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
		const pick = encounters.roll(world.current.map.id, world, player.tx, player.ty);
		if (pick) startWildBattle(pick);
	}
};

function startWildBattle(pick) {
	if (!party || !leadMon(party)) return;
	battle.start(party, pick.id, pick.level, result => {
		if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		} else if (result === 'caught' && battle.lastCaught) {
			const where = addCaught(party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
		} else {
			saveParty(party);
		}
		if (result === 'victory') evolution.check(party, battle.data);
	});
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
function tick(now) {
	requestAnimationFrame(tick);
	const dt = Math.min((now - last) / 1000, 0.05);
	last = now;
	if (loading || !world.current) return;

	battle.update(dt);
	evolution.update(dt);
	if (!battle.blocking && !dialog.blocking && !evolution.blocking && !starterMenu.open) {
		trainers.update(dt);
		player.run = runHeld;
		if (!trainers.engaging) player.update(dt, heldKeys[0] || null);
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
	world.drawLayer(ctx, 'top', camX, camY);
	if (!battle.blocking) evolution.draw(ctx);

	sctx.drawImage(frame, 0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
	// battle, menus, and dialogs all render at full canvas resolution
	const SW = screen.width, SH = screen.height;
	if (battle.blocking) {
		battle.draw(sctx, SW, SH);
	} else {
		if (partyMenu.open) drawPartyMenu(SW, SH);
		else if (shopMenu.open) drawShopMenu(SW, SH);
		else if (bagMenu.open) drawBagMenu(SW, SH);
		else if (pcMenu.open) drawPcMenu(SW, SH);
		else if (starterMenu.open) drawStarterMenu(SW, SH);
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
	menuChrome(W, H, u, 'PARTY', 'Tap a POKEMON to make it your lead. TAKE returns its held item.');
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
	menuChrome(W, H, u, 'POKE MART', `Money: $${Bag.getMoney()} — tap to buy`);
	// windowed list: 7 rows around the selection, with scroll buttons
	const start = Math.max(0, Math.min(shopMenu.idx - 3, Bag.SHOP_STOCK.length - 7));
	Bag.SHOP_STOCK.slice(start, start + 7).forEach((id, i) => {
		const idx = start + i;
		const it = Bag.ITEMS[id];
		const bid = 'buy:' + idx;
		const b = { id: bid, x: 24 * u, y: (76 + i * 52) * u, w: W - 118 * u, h: 46 * u,
			label: it.name, sub: `have ${Bag.count(id)}`, right: `$${it.price}`, kbSel: shopMenu.idx === idx };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || shopMenu.idx === idx, u);
	});
	for (const [id, label, y] of [['shopscroll:-1', '▲', 76], ['shopscroll:1', '▼', 300]]) {
		const b = { id, x: W - 86 * u, y: y * u, w: 62 * u, h: 140 * u, label, center: true };
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
	if (bagMenu.picking) {
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText('Use on:', W * 0.5, 70 * u);
		party.forEach((m, i) => {
			monRow('use:' + i, W * 0.5, (76 + i * 54) * u, W * 0.47, 48 * u, m, bagMenu.pickIdx === i, u);
		});
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

// taps route into the same state + key logic the keyboard uses
function menuTap(id) {
	const [kind, a, b2] = id.split(':');
	if (kind === 'close') { pressKey('Escape'); pressKey('x'); return; }
	if (kind === 'party') { partyMenu.idx = +a; if (+a > 0) pressKey('z'); return; }
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
	if (kind === 'buy') { shopMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'shopscroll') { pressKey(+a > 0 ? 'ArrowDown' : 'ArrowUp'); return; }
	if (kind === 'item') { bagMenu.idx = +a; bagMenu.picking = false; pressKey('z'); return; }
	if (kind === 'use') { bagMenu.pickIdx = +a; pressKey('z'); return; }
	if (kind === 'pcp') { pcMenu.side = 0; pcMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'pcb') { pcMenu.side = 1; pcMenu.idx = +a; pressKey('z'); return; }
}
const anyMenuOpen = () => partyMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || starterMenu.open;

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
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	items.loadForMap();
	hud.textContent = world.current.map.name || startMap;
	loading = false;
	// headless test hook
	window.__ow = { world, player, warpTo, npcs, encounters, battle, trainers, dialog, evolution, items, get party() { return party; }, get menuUi() { return menuUi; }, menuTap, startWildBattle, interact };
	requestAnimationFrame(tick);
})();
