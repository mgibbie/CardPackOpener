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
import { getImage } from './engine.js';

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
let signTexts = {};
let party = null;

// starter picker (fresh saves): 3 regions x 3 starters
const STARTERS = [
	{ region: 'KANTO', ids: ['bulbasaur', 'charmander', 'squirtle'] },
	{ region: 'JOHTO', ids: ['chikorita', 'cyndaquil', 'totodile'] },
	{ region: 'HOENN', ids: ['treecko', 'torchic', 'mudkip'] },
];
const starterMenu = { open: false, row: 0, col: 0, sprites: {} };
player.blocked = (tx, ty) => npcs.npcBlocks(tx, ty) || trainers.occupied(tx, ty) || services.blocks(tx, ty);

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
addEventListener('keydown', e => {
	const dir = KEYMAP[e.key];
	if (dir) {
		e.preventDefault();
		if (!heldKeys.includes(dir)) heldKeys.unshift(dir);
	}
});
addEventListener('keyup', e => {
	const dir = KEYMAP[e.key];
	if (dir) {
		const i = heldKeys.indexOf(dir);
		if (i >= 0) heldKeys.splice(i, 1);
	}
});
// Z in front of something: services, talk-to trainers (incl. gym leaders), signs
function interact() {
	if (player.moving || trainers.engaging) return;
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	const fx = player.tx + dx, fy = player.ty + dy;
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

function bagKey(k) {
	const items = Object.entries(Bag.getBag()).filter(([id, n]) => n > 0 && Bag.ITEMS[id]);
	if (bagMenu.picking) {
		if (k === 'ArrowUp') bagMenu.pickIdx = (bagMenu.pickIdx + party.length - 1) % party.length;
		if (k === 'ArrowDown') bagMenu.pickIdx = (bagMenu.pickIdx + 1) % party.length;
		if (k === 'x' || k === 'Escape') bagMenu.picking = false;
		if (k === 'z' || k === 'Enter') {
			const [id] = items[bagMenu.idx] || [];
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
				}
			}
		}
		return;
	}
	if (k === 'ArrowUp' && items.length) bagMenu.idx = (bagMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown' && items.length) bagMenu.idx = (bagMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape' || k === 'b') bagMenu.open = false;
	if ((k === 'z' || k === 'Enter') && items.length) {
		const [id] = items[bagMenu.idx];
		const kind = Bag.ITEMS[id]?.kind;
		if (kind === 'heal' || kind === 'revive') { bagMenu.picking = true; bagMenu.pickIdx = 0; }
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

addEventListener('keydown', e => {
	if (starterMenu.open) { e.preventDefault(); starterKey(e.key); return; }
	if (dialog.blocking) {
		e.preventDefault();
		dialog.key(e.key);
		return;
	}
	if (evolution.blocking) { e.preventDefault(); evolution.key(e.key); return; }
	if (battle.blocking) {
		e.preventDefault();
		battle.key(e.key);
		return;
	}
	if (shopMenu.open) { e.preventDefault(); shopKey(e.key); return; }
	if (bagMenu.open) { e.preventDefault(); bagKey(e.key); return; }
	if (pcMenu.open) { e.preventDefault(); pcKey(e.key); return; }
	if (partyMenu.open) {
		e.preventDefault();
		if (e.key === 'ArrowUp') partyMenu.idx = (partyMenu.idx + party.length - 1) % party.length;
		if (e.key === 'ArrowDown') partyMenu.idx = (partyMenu.idx + 1) % party.length;
		if ((e.key === 'z' || e.key === 'Enter') && partyMenu.idx > 0) {
			// make selected mon the lead
			const [m] = party.splice(partyMenu.idx, 1);
			party.unshift(m);
			partyMenu.idx = 0;
			saveParty(party);
		}
		if (e.key === 'x' || e.key === 'p' || e.key === 'Escape') partyMenu.open = false;
		return;
	}
	if (e.key === 'p' && !loading) { partyMenu.open = true; partyMenu.idx = 0; return; }
	if (e.key === 'b' && !loading) { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; return; }
	if ((e.key === 'z' || e.key === 'Enter') && !loading) interact();
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
	hud.textContent = world.current.map.name || file;
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
	hud.textContent = world.current.map.name || src.name;
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
	hud.textContent = world.current.map.name || conn.name;
	loading = false;
}

player.onArrive = () => {
	// warp tile?
	const w = world.warpAt(player.tx, player.ty);
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
		if (!trainers.engaging) player.update(dt, heldKeys[0] || null);
		npcs.update(dt);
	}

	const [camX, camY] = cameraPos();
	ctx.clearRect(0, 0, VIEW_W, VIEW_H);
	world.drawLayer(ctx, 'bottom', camX, camY);
	services.draw(ctx, camX, camY);
	// sprites in y order so overlaps stack correctly
	const sprites = [...npcs.list, ...trainers.list, player].sort((a, b) => a.py - b.py);
	for (const s of sprites) s.draw(ctx, camX, camY);
	world.drawLayer(ctx, 'top', camX, camY);
	battle.draw(ctx);
	if (!battle.blocking) {
		evolution.draw(ctx);
		if (!evolution.blocking) dialog.draw(ctx);
		if (partyMenu.open) drawPartyMenu();
		if (shopMenu.open) drawShopMenu();
		if (bagMenu.open) drawBagMenu();
		if (pcMenu.open) drawPcMenu();
		if (starterMenu.open) drawStarterMenu();
	}

	sctx.drawImage(frame, 0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
}

function drawPartyMenu() {
	ctx.fillStyle = 'rgba(16,12,24,0.88)';
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	ctx.fillStyle = '#f8f8e0';
	ctx.font = '8px monospace';
	ctx.fillText('PARTY   [Z] make lead  [P] close', 12, 14);
	party.forEach((m, i) => {
		const y = 30 + i * 20;
		ctx.fillStyle = i === partyMenu.idx ? '#ffd25f' : '#f8f8e0';
		ctx.fillText(`${i === partyMenu.idx ? '>' : ' '} ${m.name}`, 12, y);
		ctx.fillText(`Lv${m.level}`, 120, y);
		ctx.fillText(`${m.curHP}/${m.maxHP}`, 150, y);
		// hp bar
		const frac = Math.max(0, m.curHP / m.maxHP);
		ctx.fillStyle = '#58585a';
		ctx.fillRect(196, y - 6, 36, 5);
		ctx.fillStyle = frac > 0.5 ? '#40c860' : frac > 0.2 ? '#f0c020' : '#e83020';
		ctx.fillRect(197, y - 5, Math.round(34 * frac), 3);
	});
}

function drawStarterMenu() {
	ctx.fillStyle = '#101020';
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	ctx.fillStyle = '#f8f8e0';
	ctx.font = '8px monospace';
	ctx.textAlign = 'center';
	ctx.fillText('CHOOSE YOUR FIRST POKEMON!', VIEW_W / 2, 12);
	ctx.textAlign = 'left';
	const CELL = 32;
	STARTERS.forEach((row, r) => {
		const y = 22 + r * 45;
		ctx.fillStyle = '#9d8fd4';
		ctx.fillText(row.region, 6, y + 18);
		row.ids.forEach((id, c) => {
			const x = 66 + c * 56;
			const sel = starterMenu.row === r && starterMenu.col === c;
			if (sel) {
				ctx.strokeStyle = '#ffd25f';
				ctx.strokeRect(x - 2.5, y - 2.5, CELL + 5, CELL + 5);
			}
			const img = starterMenu.sprites[id];
			if (img) {
				ctx.imageSmoothingEnabled = false;
				const scale = Math.min(CELL / img.width, CELL / img.height);
				const dw = img.width * scale, dh = img.height * scale;
				ctx.drawImage(img, x + (CELL - dw) / 2, y + (CELL - dh) / 2, dw, dh);
			}
			ctx.fillStyle = sel ? '#ffd25f' : '#f8f8e0';
			const sp = battle.data.species[id];
			ctx.fillText((sp?.name || id).slice(0, 10), x - 6, y + CELL + 9);
		});
	});
	ctx.fillStyle = '#9d8fd4';
	ctx.fillText('[Z] choose', VIEW_W - 52, 12);
}

function menuFrame(title) {
	ctx.fillStyle = 'rgba(16,12,24,0.9)';
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	ctx.fillStyle = '#f8f8e0';
	ctx.font = '8px monospace';
	ctx.fillText(title, 12, 14);
}

function drawShopMenu() {
	menuFrame(`POKE MART   money $${Bag.getMoney()}   [Z] buy [X] close`);
	Bag.SHOP_STOCK.forEach((id, i) => {
		const it = Bag.ITEMS[id];
		const y = 32 + i * 16;
		ctx.fillStyle = i === shopMenu.idx ? '#ffd25f' : '#f8f8e0';
		ctx.fillText(`${i === shopMenu.idx ? '>' : ' '} ${it.name}`, 12, y);
		ctx.fillText(`$${it.price}`, 130, y);
		ctx.fillText(`have ${Bag.count(id)}`, 175, y);
	});
	if (shopMenu.flash) {
		ctx.fillStyle = '#9d8fd4';
		ctx.fillText(shopMenu.flash, 12, VIEW_H - 10);
	}
}

function drawBagMenu() {
	menuFrame(`BAG   money $${Bag.getMoney()}   [Z] use [X] close`);
	const items = Object.entries(Bag.getBag()).filter(([id, n]) => n > 0 && Bag.ITEMS[id]);
	if (!items.length) ctx.fillText('(empty)', 12, 34);
	items.forEach(([id, n], i) => {
		const y = 32 + i * 14;
		ctx.fillStyle = i === bagMenu.idx && !bagMenu.picking ? '#ffd25f' : '#f8f8e0';
		ctx.fillText(`${i === bagMenu.idx ? '>' : ' '} ${Bag.ITEMS[id].name} x${n}`, 12, y);
	});
	if (bagMenu.picking) {
		ctx.fillStyle = '#f8f8e0';
		ctx.fillText('Use on:', 120, 24);
		party.forEach((m, i) => {
			const y = 36 + i * 14;
			ctx.fillStyle = i === bagMenu.pickIdx ? '#ffd25f' : '#f8f8e0';
			ctx.fillText(`${i === bagMenu.pickIdx ? '>' : ' '} ${m.name} ${m.curHP}/${m.maxHP}`, 120, y);
		});
	}
}

function drawPcMenu() {
	menuFrame('POKEMON STORAGE   [</>] switch side  [Z] move  [X] close');
	const box = getBox();
	ctx.fillStyle = pcMenu.side === 0 ? '#ffd25f' : '#f8f8e0';
	ctx.fillText('PARTY (deposit)', 12, 30);
	ctx.fillStyle = pcMenu.side === 1 ? '#ffd25f' : '#f8f8e0';
	ctx.fillText(`BOX (${box.length})`, 130, 30);
	party.forEach((m, i) => {
		const sel = pcMenu.side === 0 && pcMenu.idx === i;
		ctx.fillStyle = sel ? '#ffd25f' : '#f8f8e0';
		ctx.fillText(`${sel ? '>' : ' '} ${m.name} Lv${m.level}`, 12, 44 + i * 12);
	});
	const start = Math.max(0, Math.min(pcMenu.idx - 3, box.length - 8));
	box.slice(start, start + 8).forEach((m, i) => {
		const idx = start + i;
		const sel = pcMenu.side === 1 && pcMenu.idx === idx;
		ctx.fillStyle = sel ? '#ffd25f' : '#f8f8e0';
		ctx.fillText(`${sel ? '>' : ' '} ${m.name} Lv${m.level}`, 130, 44 + i * 12);
	});
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
	const startMap = params.get('map') || 'PalletTown';
	await world.load(startMap);
	const sx = params.has('x') ? +params.get('x') : Math.floor(world.current.layout.width / 2);
	const sy = params.has('y') ? +params.get('y') : Math.floor(world.current.layout.height / 2);
	player.setTile(sx, sy);
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	hud.textContent = world.current.map.name || startMap;
	loading = false;
	// headless test hook
	window.__ow = { world, player, warpTo, npcs, encounters, battle, trainers, dialog, evolution, get party() { return party; }, startWildBattle, interact };
	requestAnimationFrame(tick);
})();
