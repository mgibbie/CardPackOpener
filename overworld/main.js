// main.js — game loop, input, camera, warps, connection crossing.
import { World, Player, VIEW_W, VIEW_H, META } from './engine.js';
import { NPCs } from './npcs.js';
import { Encounters } from './encounters.js';
import { Battle } from './battle.js';
import { Trainers } from './trainers.js';
import { Dialog } from './dialog.js';
import { getJSON } from './engine.js';
import { loadParty, saveParty, healParty, leadMon, addCaught } from './party.js';

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
let signTexts = {};
let party = null;
player.blocked = (tx, ty) => npcs.npcBlocks(tx, ty) || trainers.occupied(tx, ty);

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
		} else if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		}
	});
}
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
// Z in front of something: talk-to trainers (incl. gym leaders), signs
function interact() {
	if (player.moving || trainers.engaging) return;
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	const fx = player.tx + dx, fy = player.ty + dy;
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
addEventListener('keydown', e => {
	if (dialog.blocking) {
		e.preventDefault();
		dialog.key(e.key);
		return;
	}
	if (battle.blocking) {
		e.preventDefault();
		battle.key(e.key);
		return;
	}
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
	if (!leadMon(party)) return;
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
	if (!battle.blocking && !dialog.blocking) {
		trainers.update(dt);
		if (!trainers.engaging) player.update(dt, heldKeys[0] || null);
		npcs.update(dt);
	}

	const [camX, camY] = cameraPos();
	ctx.clearRect(0, 0, VIEW_W, VIEW_H);
	world.drawLayer(ctx, 'bottom', camX, camY);
	// sprites in y order so overlaps stack correctly
	const sprites = [...npcs.list, ...trainers.list, player].sort((a, b) => a.py - b.py);
	for (const s of sprites) s.draw(ctx, camX, camY);
	world.drawLayer(ctx, 'top', camX, camY);
	battle.draw(ctx);
	if (!battle.blocking) dialog.draw(ctx);
	if (partyMenu.open && !battle.blocking) drawPartyMenu();

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

// ---------- boot ----------
(async () => {
	hud.textContent = 'Loading…';
	await world.init();
	await player.init();
	await npcs.init();
	await encounters.init();
	await battle.init();
	await trainers.init();
	signTexts = await getJSON('data/sign_texts.json').catch(() => ({}));
	party = loadParty(battle.data);
	const params = new URLSearchParams(location.search);
	const startMap = params.get('map') || 'PalletTown';
	await world.load(startMap);
	const sx = params.has('x') ? +params.get('x') : Math.floor(world.current.layout.width / 2);
	const sy = params.has('y') ? +params.get('y') : Math.floor(world.current.layout.height / 2);
	player.setTile(sx, sy);
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	hud.textContent = world.current.map.name || startMap;
	loading = false;
	// headless test hook
	window.__ow = { world, player, warpTo, npcs, encounters, battle, trainers, dialog, get party() { return party; }, startWildBattle, interact };
	requestAnimationFrame(tick);
})();
