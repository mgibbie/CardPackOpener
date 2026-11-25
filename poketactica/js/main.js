// main.js — Poketactica's page (stage 4; Plans/POKETACTICA_PLAN.md): MicaSurvivor 3D's look (its terrain mesh, upright
// billboard sprites with blob shadows, PMD SpriteCollab sheets) on an isometric camera that turns in 90° steps, with the
// Balatro kit's HUD. The battle is the pure engine (js/engine/battle.js): the page only sends it actions and plays back
// the events it returns. Keyboard (arrows / WASD, Z = A, X = B, C = X info, V = Y Execute, Q / E turn, Enter end phase),
// controller (the same through site/input.js) and touch (tap a tile, tap a button) all play the whole game.
import * as THREE from 'three';
import { buildBoard, surfaceDrop } from './terrain3d.js';
import { buildScenery } from './scenery3d.js';
import { makeRenderer, SpriteBatch, loadSheet, frameAt, footLift, spriteQuad, Shadows, setFog } from '../../micasurvivor/m3d/render.js';
import { makeRoom, setCell, CELL, facingRow } from '../../micasurvivor/m3d/sim.js';
import { startInput } from '/site/input.js';
import { sfx } from '/site/ui/sfx.js';
import * as B from './engine/battle.js';
import { marksOf, MARK_SAY, abilitySay } from './engine/statusfx.js';
import { HAZARDS } from './engine/statusfx3.js';
import * as Geo from './engine/geo.js';
import { shapeTiles, DIRS, heightAt, isTile, dirToward as dirTo } from './engine/grid.js';
import { trainingSetup, WILD_SPECIES } from './demo.js';
import { figs as loadFigs, setFigs, takeFound, FIGS_KEY } from './figsave.js';
import { STARTER_LEVEL, FIGS, list, addFig, markCleared, markDeep, loseFig, fallenList, mmStoreTake } from './figcol.js';
import { genFloor, startFloors, bossFigId, saveRun } from './dungeon.js';
import { itemFloor, afterFloor, bankDive, bankPart, clearedFloors, saveDive, exitFloor, loadDive, newDive, diveFloors, findsOf } from './itemworld.js';
import { setItemLevel, addGem, addGood, reholdItem, takeGood, haveGood } from './figcol.js';
import { gemName } from './gear.js';
import { noteDaily } from './goals.js';
import { mapById, campaignSetup, nextMap, rewardFigId } from './campaign.js';
import { createHub } from './hub.js';
import { makeFigurine, learnedTo, expForLevel, MAX_LEVEL } from './figurine.js';
import { applyResults, wildLevelFor } from './progress.js';
import { payOwed, claimBattlecards, ITEM_NAMES } from './gauge.js';
import { makeRng } from '../../overworld/rules/rng.js';
import { createSync } from '../../pocketenhanced/js/colsync.js';
import * as MP from '/battlecards/mpmode.js';
import * as Stars from '/site/stars.js';
import { goodName } from './goods.js';
import * as Net from './net.js';
import { recipeOf, replayTo, validRecipe } from './replay.js';
import { clipStart, copyClip } from '/site/clip.js';
import { arenaById, matchSetup } from './arenas.js';
import { asPlayable, asArena } from './editor.js';
import { createTdMode } from './tdmode.js';
import { createMmMode } from './mmmode.js';
import { itemName as mmItemName, ITEMS as MM_ITEMS } from './mm/items.js';
import { dungeonById as mmDungeonById } from './mm/dungeons.js';
import { mmOutcome, applyMmRewards } from './mm/rewards.js';
import { isBossWave as tdBossWave } from './td/sim.js';
import { tdRewards, applyTdRewards } from './td/rewards.js';
import { HEROES as TD_HEROES, heroById as tdHeroById } from './td/heroes.js';
import { MAZE_MAPS as TD_MAZE_MAPS, isMazeMap as tdIsMaze } from './td/maps.js';
import { createEditMode } from './editmode.js';
import { createOnline, createMatchSync } from './online.js';

const LV = 1.0;                       // metres per height level
const $ = (id) => document.getElementById(id);
const META = (window.G && window.G.SPRITE_META) || {};
const GEO_HEX = { red: 0xe0524a, blue: 0x3f8cf0, purple: 0x9a5be0, orange: 0xf0a040, cyan: 0x40d0d8, yellow: 0xf4d23c, green: 0x6cc84c, pink: 0xf07ab8, white: 0xf2f2f2 };

// ---------------------------------------------------------------- data + battle
async function loadData() {
	const J = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
	const [species, abilities, extra, moves, shapes, abilityShapes] = await Promise.all([
		J('/overworld/data/species_battle.json'), J('/overworld/data/species_abilities.json'), J('/overworld/data/species_extra.json'),
		J('/overworld/data/moves_battle.json'), J('data/move_shapes.json'), J('data/ability_shapes.json')]);
	return { species, abilities, extra, moves, shapes, abilityShapes };
}

const P = { data: null, S: null, setup: null, seed: null, actions: [], mode: 'idle', sel: null, menu: null, cursor: { x: 1, y: 8 }, yawK: 0, zoom: 1, pan: { x: 0, z: 0 }, anims: [], disp: null, busy: false,
	ver: 0, fc: null, dangerOn: false, danger: null, dangerVer: -1, threats: new Map(), skip: false, log: [], summary: null, coach: null, fx: [], shake: 0 };
// this device's battle in progress (owner, 2026-11-21: a reload or a locked phone lost it): its recipe, re-run on resume
const BATTLE_KEY = 'magepunk_poketactica_battle_v1';
const MM_KEY = 'magepunk_poketactica_mm_v1';   // (the Mystery Maze run in progress on this device: its recipe so far)
const TD_KEY = 'magepunk_poketactica_td_v1';   // (the Tower Defense run in progress on this device: its recipe so far)
const FAST_KEY = 'magepunk_poketactica_fast_v1', COACH_KEY = 'magepunk_poketactica_coach_v1';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode: not remembered */ } };
P.fast = lsGet(FAST_KEY) === '1';
window.__poketactica = { ready: false, P, B, Geo, wallet: () => Stars.stars() };
// stage 8: the page's three modes (Pair of Pears' way)
//   normal              play (a signed-in player's battle is live for friends; a finished one becomes a replay)
//   ?spectate=<user>    read-only: a friend's battle, drawn from the views they publish (engine view(): no seed)
//   ?replay=<id>[&t=k]  read-only: a finished battle re-run from its recipe (replay.js), step by step; clip links
const params = new URLSearchParams(location.search);
const SPECTATE = (params.get('spectate') || '').trim().toLowerCase();
const REPLAY_ID = (params.get('replay') || '').trim();
const MODE = REPLAY_ID ? 'replay' : SPECTATE ? 'spectate' : 'normal';
window.__poketactica.mode = MODE;

// ---------------------------------------------------------------- the scene
let renderer, scene, camera, board, scenery, overlay, geoLayer, shadows, symbolGroup, numCanvas, numCtx;
const sheets = new Map();   // dex/anim -> { batch, meta, img, lift } | null (loading)

function buildScene(map) {
	const room = makeRoom(map.w, map.h, 0);
	room.rimH = 999; room.maxH = 4 * LV;
	for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const h = heightAt(map, x, y); setCell(room, x, y, h == null ? -6 : h * LV); }
	if (board) { scene.remove(board.group); board.dispose(); }
	P.room = room;
	// the board (terrain3d.js): textured ground and cliffs, props, water and lava; the bases kept clear
	const S = P.S, bases = S && S.map === map && S.pvp ? Object.values(S.pvp.bases).map((b) => [b.x, b.y]) : map.bases ? map.bases.map((b) => [b.x, b.y]) : map.base ? [[map.base.x, map.base.y]] : [];
	board = buildBoard(map, { bases, over: P.groundOver ? P.groundOver(map) : null });   // (groundOver: Tower Defense's Maze Builder draws its blocks, tdmode.js)
	scene.add(board.group);
	// what stands round a Tower Defense board (scenery3d.js): built once a map, kept while its blocks are re-laid
	const sk = P.sceneryKind || null, skey = sk + ':' + map.w + 'x' + map.h;   // (tdmode.js names it: the map's own scenery)
	if (scenery && (!sk || scenery.key !== skey)) { scene.remove(scenery.group); scenery.dispose(); scenery = null; }
	if (sk && !scenery) { scenery = buildScenery(map, sk); scenery.key = skey; scene.add(scenery.group); }
	P.scenery = scenery ? { kind: scenery.kind, count: scenery.count } : null;
	if (!overlay) {
		overlay = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
		overlay.renderOrder = 3; scene.add(overlay);
	}
	if (!geoLayer) {
		geoLayer = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
		geoLayer.renderOrder = 2; scene.add(geoLayer);
	}
	if (!shadows) { shadows = new Shadows(64); scene.add(shadows.mesh); }
	if (symbolGroup) scene.remove(symbolGroup);
	symbolGroup = new THREE.Group(); scene.add(symbolGroup);
}

const topY = (x, y) => (heightAt(P.S.map, x, y) ?? 0) * LV - (P.S.map.ground ? surfaceDrop(P.S.map.ground[y * P.S.map.w + x]) : 0);
const world = (x, y) => [x * CELL + CELL / 2, topY(x, y), y * CELL + CELL / 2];

/** The coloured tile overlay: Geo colours, then the current highlight layers, then the cursor. */
function rebuildOverlay() {
	const S = P.S, pos = [], col = [], gpos = [], gcol = [], c = new THREE.Color();
	const tile = (x, y, hex, inset = 0.06, lift = 0.02, P1 = pos, C1 = col) => {
		if (!isTile(S.map, x, y)) return;
		const y0 = topY(x, y) + lift, a = x * CELL + inset, b = x * CELL + CELL - inset, d = y * CELL + inset, e = y * CELL + CELL - inset;
		c.setHex(hex);
		for (const p of [[a, y0, d], [a, y0, e], [b, y0, e], [a, y0, d], [b, y0, e], [b, y0, d]]) { P1.push(...p); C1.push(c.r, c.g, c.b); }
	};
	const geo = (P.disp && P.disp.geo) || S.geo;
	for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) { const g = geo[y * S.map.w + x]; if (g) tile(x, y, GEO_HEX[g] || 0xffffff, 0.02, 0.01, gpos, gcol); }
	if (S.pvp) for (const sd of S.pvp.sides) { const b = S.pvp.bases[sd]; tile(b.x, b.y, sd === ME() ? 0x9be7ff : 0xffb36b, 0.2, 0.025); }   // (every seat's base; mine pale blue)
	else for (const b of S.map.bases || [S.map.base]) tile(b.x, b.y, 0x9be7ff, 0.2, 0.025);   // the base tile (deploy here; throw a weakened foe here to catch it)
	// the enemy range (the 👁 toggle): every tile a foe could strike this enemy phase
	if (P.dangerOn && MODE === 'normal' && ['idle', 'unit', 'move'].includes(P.mode)) for (const t of dangerTiles()) tile(t[0], t[1], 0xb04cff, 0.1, 0.027);
	// (a figurine that could be knocked out in the coming enemy phase stands on red: always shown, it is the warning itself)
	if (MODE === 'normal' && P.screen === 'battle' && P.S && !P.S.pvp && P.S.phase === 'player' && !P.busy && ['idle', 'unit', 'move', 'field'].includes(P.mode)) for (const uid of inDanger().keys()) { const v = B.unit(P.S, uid); if (v && v.x != null) tile(v.x, v.y, 0xff3b3b, 0.34, 0.03); }
	// a foe under the cursor: where it can go (pale) and what it can strike (magenta)
	for (const t of P.hl.emove || []) tile(t[0], t[1], 0xc9a8ff, 0.16, 0.03);
	for (const t of P.hl.eatk || []) tile(t[0], t[1], 0xff4fc8, 0.24, 0.034);
	// the queued attacks' tiles (they wait for Execute): a small gold mark in each
	if (S.phase === 'player') for (const q of S.queue) { const u = B.unit(S, q.uid), m = u && B.moveOf(u, q.move, P.data); if (m && u.x != null) for (const [x, y] of shapeTiles(S.map, m, u.x, u.y, q.x, q.y)) tile(x, y, 0xffd23c, 0.4, 0.045); }
	for (const t of P.hl.move || []) tile(t[0], t[1], 0x4aa8ff, 0.14, 0.03);
	for (const t of P.hl.aim || []) tile(t[0], t[1], 0xff5a5a, 0.14, 0.03);
	for (const t of P.hl.area || []) tile(t[0], t[1], 0xffb13c, 0.26, 0.04);
	for (const t of P.hl.extra || []) tile(t[0], t[1], t[2], t[3] != null ? t[3] * CELL : 0.2, 0.028);   // (t[3]: how far in from the tile's edge, as a part of the tile)
	tile(P.cursor.x, P.cursor.y, 0xffffff, 0.34, 0.05);
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	overlay.geometry.dispose(); overlay.geometry = g;
	const gg = new THREE.BufferGeometry();
	gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
	gg.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
	geoLayer.geometry.dispose(); geoLayer.geometry = gg;
	// the Geo Symbols: pyramids
	symbolGroup.clear();
	for (const s of S.symbols) {
		const m = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.2, 4), new THREE.MeshBasicMaterial({ color: s.color === 'clear' ? 0xeeeeee : GEO_HEX[s.color] || 0xffffff }));
		const [wx, wy, wz] = world(s.x, s.y); m.position.set(wx, wy + 0.6, wz); m.rotation.y = Math.PI / 4;
		symbolGroup.add(m);
	}
}
P.hl = {};

// ---------------------------------------------------------------- sprites
function dexOf(species) { const sp = P.data.species[species]; return sp ? sp.num : 0; }
function sheet(dex, anim) {
	const key = dex + '/' + anim;
	if (sheets.has(key)) return sheets.get(key);
	const pm = META[dex], meta = pm && pm.a && pm.a[anim];
	if (!meta) { sheets.set(key, undefined); return undefined; }
	sheets.set(key, null);
	loadSheet(`/micasurvivor/assets/pokemon/${pm.al || dex}/${pm.src ? pm.src + '/' : ''}${anim}.png`).then((tex) => {
		const batch = new SpriteBatch(tex, 16); scene.add(batch.mesh);
		batch.material.transparent = true; batch.mesh.renderOrder = 10;   // (drawn after the tile overlay, so a tile's colour never washes over the feet)
		sheets.set(key, { batch, meta, img: tex.image, lift: footLift(meta, tex.image, { perFrame: anim === 'Idle', hover: !!pm.hv }), shadow: 0.35 + 0.18 * ((pm.s | 0) + 1) });
	}).catch(() => sheets.set(key, undefined));
	return null;
}
const FACE = { n: Math.PI, e: Math.PI / 2, s: 0, w: -Math.PI / 2, ne: Math.PI * 3 / 4, se: Math.PI / 4, sw: -Math.PI / 4, nw: -Math.PI * 3 / 4 };   // (the diagonals: Mystery Maze's 8 facings)

// ---------------------------------------------------------------- the camera: isometric, turned in 90° steps
const camYaw = () => Math.PI / 4 + P.yawK * Math.PI / 2;
const PITCH = 0.62;
function placeCam() {
	const S = P.S, w = S.map.w * CELL, h = S.map.h * CELL, cx = w / 2 + P.pan.x, cz = h / 2 + P.pan.z;
	// fit the whole board's diamond on any screen: seen at 45°, it is (w + h)·√½ wide and that times sin(pitch) (+ its heights) tall
	// (zoomed in, the view centres on the board's middle moved by P.pan: a drag, or the cursor followed by the keys)
	const yaw = camYaw(), pitch = PITCH, d = 60;
	const aspect = innerWidth / innerHeight, halfW = (w + h) * Math.SQRT1_2 / 2, halfH = halfW * Math.sin(pitch) + 4 * LV;
	const span = Math.max(halfH, halfW / aspect) * 1.12 / P.zoom;
	camera.left = -span * aspect; camera.right = span * aspect; camera.top = span; camera.bottom = -span; camera.updateProjectionMatrix();
	camera.position.set(cx - Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, cz - Math.cos(yaw) * Math.cos(pitch) * d);
	camera.lookAt(cx, 1, cz);
}
/** Screen directions turned into grid steps for the current camera, as Disgaea maps them on its diamond: up = up-right on
 *  screen, right = down-right, down = down-left, left = up-left. From the camera's own forward f and right r on the ground
 *  (the billboards' right): up-right is f + r, down-right is r - f. Turning the camera turns them with it. */
function stepFor(action) {
	const yaw = camYaw(), f = [Math.sin(yaw), Math.cos(yaw)], r = [-Math.cos(yaw), Math.sin(yaw)];
	const ax = (v) => (Math.abs(v[0]) > Math.abs(v[1]) ? [Math.sign(v[0]), 0] : [0, Math.sign(v[1])]);
	const up = ax([f[0] + r[0], f[1] + r[1]]), right = ax([r[0] - f[0], r[1] - f[1]]);
	return { up, right, down: [-up[0], -up[1]], left: [-right[0], -right[1]] }[action];
}

// ---------------------------------------------------------------- playing the engine's events
function act(a) {
	if (P.busy || !P.S) return { ok: false };
	if (P.online) a = { ...a, by: P.me };
	const before = snapshotDisp();   // (the board as it stood: the events play from here)
	const r = B.act(P.S, a, P.data);
	if (!r.ok) { sfx.error(); toast(r.why || 'Not now'); return r; }
	P.actions.push(a);
	if (P.online) P.online.sync.send(P.actions.length - 1, a);
	P.ver++;
	if (a.t === 'execute' || a.t === 'end') P.coachExec = true;
	applyLosses(r.events);
	logEvents(r.events, a.t === 'end');
	queueEvents(r.events, before);
	saveBattle();
	afterAct();
	return r;
}
// ---- the battle in progress, on this device: saved after every action, offered as "Resume" in the camp
function saveBattle() {
	if (MODE !== 'normal' || P.screen !== 'battle' || !P.S || !P.teamMap) return;
	if (P.S.over) { lsSet(BATTLE_KEY, null); return; }
	lsSet(BATTLE_KEY, JSON.stringify({ v: 1, seed: P.seed, setup: P.setup, actions: P.actions, target: P.target, teamMap: P.teamMap, wild: P.wild, label: battleName(), turn: P.S.turn, ts: Date.now() }));
}
const clearBattle = () => lsSet(BATTLE_KEY, null);
function savedBattle() {
	try {
		const b = JSON.parse(lsGet(BATTLE_KEY) || 'null');
		return b && b.v === 1 && typeof b.seed === 'string' && b.setup && b.setup.map && Array.isArray(b.actions) && b.teamMap && b.target ? b : null;
	} catch { return null; }
}
window.__poketactica.act = act;
/** (tests) the cursor onto a tile, as the arrows would bring it (the aim's forecast, a foe's range follow it) */
window.__poketactica.cursorTo = (x, y) => { P.cursor = { x, y }; follow(); previewArea(); hoverFoe(); rebuildOverlay(); refreshHud(); };
/** (tests) where a tile's top centre is on screen, in CSS pixels */
window.__poketactica.screenOf = (x, y) => { const [wx, wy, wz] = world(x, y); return project(wx, wy, wz); };

/** Turn engine events into short animations; the units are drawn from P.disp until the queue is empty. `before` is the
 *  board as it stood BEFORE the action: the engine has already played it out, and a copy taken after it showed every
 *  enemy on its last tile from the start of the enemy phase, then sent each back to walk there again when its turn came. */
function queueEvents(evs, before) {
	if (!P.disp) P.disp = before || snapshotDisp();
	for (const e of evs) P.anims.push(e);
	P.busy = P.anims.length > 0;
}
function snapshotDisp() {
	const S = P.S, d = { units: {}, geo: S.geo.slice() };
	for (const u of S.units) d.units[u.uid] = { x: u.x, y: u.y, hp: u.hp, facing: u.facing, anim: 'Idle', t0: 0, alive: u.hp > 0 && u.x != null, flash: 0, wx: null };
	return d;
}
let animT = 0, cur = null;
const DUR = { move: 0.14, use: 0.38, hit: 0.32, ko: 0.5, repaint: 0.035, phase: 0.9, team: 0.25, throw: 0.4, dash: 0.25, leap: 0.4, capture: 0.8, 'geo-break': 0.3, 'bonus-level': 0.3 };
function stepAnims(dt) {
	if (!P.anims.length && !cur) {
		if (P.busy) { P.busy = false; P.disp = null; P.skip = false; refreshHud(); rebuildOverlay(); if (P.summary) { showLog(P.summary, P.S && P.S.pvp ? 'Meanwhile' : 'Enemy phase'); P.summary = null; } }
		return;
	}
	// a press while it plays speeds the rest up (P.skip); the "fast" setting plays every enemy phase at three times
	dt *= P.skip ? 8 : P.fast && P.S && !myTurn() ? 3 : 1;
	if (!cur) { cur = P.anims.shift(); animT = 0; startAnim(cur); }
	animT += dt;
	const dur = cur.t === 'move' ? DUR.move * Math.max(1, (cur.path || []).length - 1) : DUR[cur.t] || 0;
	tickAnim(cur, Math.min(1, dur ? animT / dur : 1));
	if (animT >= dur) { endAnim(cur); cur = null; }
}
// the Pokémon's own CRY when it attacks and when it faints (the overworld's files; a species with none stays silent)
const cries = new Map();
function cry(species, vol = 0.32) {
	if (!species || P.skip || !(sfx.enabled ? sfx.enabled() : true) || typeof Audio === 'undefined') return;
	try {
		let a = cries.get(species);
		if (!a) { a = new Audio('/overworld/data/sounds/cries/' + species + '.ogg'); a.preload = 'auto'; a.addEventListener('error', () => cries.set(species, false)); cries.set(species, a); }
		if (!a) return;
		const c = a.cloneNode(); c.volume = vol; c.play().catch(() => {});
	} catch { /* no audio */ }
}
// living terrain (engine/terrain.js), in words
const GROUND_NAME = { water: 'Water', ice: 'Ice', lava: 'Lava', tallgrass: 'Tall grass' };
const GROUND_SAY = { water: 'slow unless Water / Flying; Water moves +20%', ice: 'slow unless Ice / Flying; Ice moves +20%', lava: 'burns unless Fire / Flying; Fire moves +20%', tallgrass: 'hides (−20% to hit it); Grass moves +20%' };
const HELD_SAY = { heal: 'healed', cure: 'cured', endure: 'hung on', boost: 'powered up', reset: 'stats restored', pp: 'PP restored', helmet: 'spikes', hurt: 'hurt' };
function startAnim(e) {
	const D = P.disp, u = e.uid && D.units[e.uid];
	if (e.t === 'use' && u) { if (u.x != null && (e.x !== u.x || e.y !== u.y)) u.facing = dirTo(u.x, u.y, e.x, e.y); u.anim = 'Attack'; u.t0 = performance.now() / 1000; sfx.card && sfx.card(); moveFx(e, u); const su = B.unit(P.S, e.uid); if (su) cry(su.species, 0.22); }
	if (e.t === 'held' && u) pop(e.uid, goodName(e.item) + (HELD_SAY[e.what] ? ': ' + HELD_SAY[e.what] : ''), '#9fe0ff');
	if (e.t === 'cured' && u) pop(e.uid, 'Cured', '#7cf08a');
	if (e.t === 'hit' && D.units[e.target]) {
		const v = D.units[e.target]; v.anim = 'Hurt'; v.flash = 1; v.hp = e.hp;
		pop(e.target, '-' + e.dmg, e.eff > 1 ? '#ffd23c' : '#ffffff');
		if (e.crit) pop(e.target, 'Critical!', '#ff7a5a');
		if (e.eff > 1) pop(e.target, 'Super effective!', '#ffd23c'); else if (e.eff > 0 && e.eff < 1) pop(e.target, 'Not very effective', '#b8c2c6');
		if (e.combo > 0) pop(e.target, 'Combo ×' + (e.combo + 1), '#7cd0ff');
		const T = B.unit(P.S, e.target);
		P.fx.push({ k: 'impact', at: [v.x, v.y], t: 0, dur: 0.25, color: e.crit ? '#ff7a5a' : '#ffffff' });
		P.shake = Math.max(P.shake, Math.min(0.5, 0.12 + (T ? e.dmg / T.maxHP : 0.2) * 0.6) * (e.crit ? 1.5 : 1));
	}
	if (e.t === 'ko' && u) P.shake = Math.max(P.shake, 0.6);
	if (e.t === 'hurt' && u) { u.hp = Math.max(0, u.hp - e.n); pop(e.uid, '-' + e.n, '#c8a0ff'); }
	if (e.t === 'heal' && u) { u.hp += e.n; pop(e.uid, '+' + e.n, '#7cf08a'); }
	if (e.t === 'miss') pop(e.target || e.uid, 'Miss', '#cccccc');
	if (e.t === 'immune') pop(e.uid, 'Immune', '#cccccc');
	if (e.t === 'status' && u) pop(e.uid, e.st.toUpperCase(), '#e0b36b');
	if (e.t === 'mark' && u) pop(e.uid, (MARK_SAY[e.what] || [e.what])[0], '#9fe0ff');
	if (e.t === 'endured' && u) pop(e.uid, 'Endured!', '#9fe0ff');
	if (e.t === 'retype' && u) pop(e.uid, e.types.join(' / '), '#9fe0ff');
	if (e.t === 'ability' && u) pop(e.uid, abilitySay(e, P.data.abilities._names).pop, '#9fe0ff');
	if (e.t === 'focus' && u) pop(e.uid, 'Focus', '#9fe0ff');
	if (e.t === 'ko' && u) { u.anim = 'Faint'; u.t0 = performance.now() / 1000; const su = B.unit(P.S, e.uid); if (su) cry(su.species, 0.38); }
	if (e.t === 'deploy' && u) { u.x = e.x; u.y = e.y; u.alive = true; }
	if (e.t === 'withdraw' && u) { u.x = null; u.y = null; u.alive = false; sfx.back && sfx.back(); }   // (back to the reserve: off the board)
	if (e.t === 'repaint') { D.geo[e.y * P.S.map.w + e.x] = e.color; rebuildOverlay(); }
	if (e.t === 'geo-break') { banner('Geo chain!'); }
	if (e.t === 'phase') banner(e.side ? (e.side === ME() ? 'Your turn · ' + e.turn : seatName(e.side) + '\'s turn') : e.phase === 'enemy' ? 'Enemy phase' : e.phase === 'wild' ? 'Wild Pokémon' : 'Turn ' + e.turn);
	if (e.t === 'out') banner(seatName(e.side) + (e.side === ME() ? ': out' : ' is out'));
	if (e.t === 'team') banner('Team attack!');
	if (e.t === 'capture') banner(e.ok ? 'Caught!' : 'It broke free!');
	if (e.t === 'over') banner(e.result === 'won' ? 'Victory!' : 'Defeat');
	if (e.t === 'bonus-level') { sfx.coin && sfx.coin(); }
}
function tickAnim(e, k) {
	const D = P.disp, u = e.uid && D.units[e.uid];
	if (e.t === 'move' && u && e.path && e.path.length > 1) {
		const n = e.path.length - 1, f = k * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
		const [ax, ay] = e.path[i], [bx, by] = e.path[i + 1];
		u.anim = 'Walk'; u.wx = [ax + (bx - ax) * t, ay + (by - ay) * t];
		u.facing = bx > ax ? 'e' : bx < ax ? 'w' : by > ay ? 's' : 'n';
	}
	if ((e.t === 'dash' || e.t === 'leap' || e.t === 'throw') && (u || D.units[e.target])) {
		const m = e.t === 'throw' ? D.units[e.target] : u;
		if (m && m.x != null) { m.wx = [m.x + (e.x - m.x) * k, m.y + (e.y - m.y) * k]; m.arc = e.t !== 'dash' ? Math.sin(k * Math.PI) * 2 : 0; }
	}
}
function endAnim(e) {
	const D = P.disp, u = e.uid && D.units[e.uid];
	if (e.t === 'move' && u) { const [x, y] = e.path[e.path.length - 1]; u.x = x; u.y = y; u.wx = null; u.anim = 'Idle'; if (e.sp) pop(e.uid, '+' + e.sp + ' SP', '#7fd8ff'); }
	if ((e.t === 'dash' || e.t === 'leap') && u) { u.x = e.x; u.y = e.y; u.wx = null; u.arc = 0; }
	if (e.t === 'throw' && D.units[e.target]) { const v = D.units[e.target]; v.x = e.x; v.y = e.y; v.wx = null; v.arc = 0; }
	if (e.t === 'use' && u) u.anim = 'Idle';
	if (e.t === 'hit' && D.units[e.target]) D.units[e.target].anim = 'Idle';
	if (e.t === 'ko' && u) u.alive = false;
	if (e.t === 'undo') { P.disp = snapshotDisp(); }   // (an undo is a whole action of its own: the board after it is right)
	if (e.t === 'swap' && u && D.units[e.with]) { const o = D.units[e.with]; [u.x, u.y, o.x, o.y] = [o.x, o.y, u.x, u.y]; }
	if (e.t === 'broke-free' && u) { u.x = e.x; u.y = e.y; u.alive = true; u.wx = null; u.arc = 0; }
	if (e.t === 'capture' && e.ok && D.units[e.target]) D.units[e.target].alive = false;
}

// ---- move effects (drawn on the 2D layer over the board): a shot that flies, a slash, a ring that spreads, sparkles
const TYPE_COL = { Normal: '#d8d6c0', Fire: '#ff8a3c', Water: '#5aa0ff', Electric: '#ffe04a', Grass: '#7ad85a', Ice: '#9ff0f0', Fighting: '#e0523c', Poison: '#c060d0', Ground: '#e8c870', Flying: '#b8a8ff', Psychic: '#ff6aa8', Bug: '#b8d040', Rock: '#c8b060', Ghost: '#9a78d0', Dragon: '#8a60ff', Dark: '#8a7060', Steel: '#c8c8e0', Fairy: '#ffa8d8' };
function moveFx(e, u) {
	const mv = P.data.moves[e.move] || {}, sh = (P.data.shapes || {})[e.move] || {}, color = TYPE_COL[mv.type] || '#ffffff';
	const from = [u.x, u.y], to = [e.x, e.y];
	if (mv.category === 'Status') P.fx.push({ k: 'spark', at: to, t: 0, dur: 0.5, color });
	else if ((sh.s === 'one' || !sh.s) && sh.h === 'melee') P.fx.push({ k: 'slash', at: to, t: 0, dur: 0.28, color });
	else if (sh.s === 'one' || sh.s === 'line' || !sh.s) P.fx.push({ k: 'shot', from, to, t: 0, dur: 0.3, color });
	else P.fx.push({ k: 'ring', at: ['burst', 'aura', 'self'].includes(sh.s) ? from : to, r: Math.max(1, sh.n || 1), t: 0, dur: 0.4, color });
}
function drawFx(g, dt) {
	const at = ([x, y], up = 1.2) => { const [wx, wy, wz] = world(Math.max(0, Math.min(P.S.map.w - 1, x)), Math.max(0, Math.min(P.S.map.h - 1, y))); return project(wx, wy + up, wz); };
	const tilePx = () => { const a = project(...world(0, 0)), b = project(...world(1, 0)); return Math.hypot(a[0] - b[0], a[1] - b[1]) || 30; };
	for (let i = P.fx.length - 1; i >= 0; i--) {
		const f = P.fx[i]; f.t += dt;
		const k = Math.min(1, f.t / f.dur);
		if (f.t > f.dur) { P.fx.splice(i, 1); continue; }
		g.save(); g.globalAlpha = 1 - k * 0.7; g.strokeStyle = f.color; g.fillStyle = f.color; g.shadowColor = f.color; g.shadowBlur = 12;
		if (f.k === 'shot') {
			const a = at(f.from), b = at(f.to), x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * 18;
			g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
			g.lineWidth = 4; g.globalAlpha *= 0.5; g.beginPath(); g.moveTo(a[0] + (b[0] - a[0]) * Math.max(0, k - 0.25), a[1] + (b[1] - a[1]) * Math.max(0, k - 0.25)); g.lineTo(x, y); g.stroke();
		} else if (f.k === 'slash') {
			const [x, y] = at(f.at), s = 26;
			g.lineWidth = 4; g.lineCap = 'round';
			for (let j = 0; j < 3; j++) { const o = (j - 1) * 10, p = Math.min(1, k * 1.6 - j * 0.15); if (p <= 0) continue; g.beginPath(); g.moveTo(x - s + o, y - s); g.lineTo(x - s + o + 2 * s * p, y - s + 2 * s * p); g.stroke(); }
		} else if (f.k === 'ring') {
			const [x, y] = at(f.at, 0.3), r = tilePx() * (0.4 + f.r * k);
			g.lineWidth = 5 * (1 - k) + 1; g.beginPath(); g.ellipse(x, y, r, r * Math.sin(PITCH), 0, 0, Math.PI * 2); g.stroke();
		} else if (f.k === 'spark') {
			const [x, y] = at(f.at);
			for (let j = 0; j < 6; j++) { const ang = j / 6 * Math.PI * 2 + k * 2, rr = 10 + 18 * k; g.beginPath(); g.arc(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.6 - k * 20, 3, 0, Math.PI * 2); g.fill(); }
		} else if (f.k === 'burst') {
			// a knockout: a flash, and bits thrown out that fall (n of them; a boss throws more, for longer)
			const [x, y] = at(f.at, 1), n = f.n || 12, far = f.dur / 0.6;
			if (k < 0.3) { g.save(); g.globalAlpha = 0.8 * (1 - k / 0.3); g.beginPath(); g.arc(x, y, 10 + 70 * k * far, 0, Math.PI * 2); g.fill(); g.restore(); }
			g.shadowBlur = 6;
			for (let j = 0; j < n; j++) {
				const ang = j / n * Math.PI * 2 + (j % 3) * 0.4, sp = (46 + (j * 37 % 5) * 16) * far, s = (j % 3 ? 5 : 8) * (1 - k * 0.6);
				g.fillRect(x + Math.cos(ang) * sp * k - s / 2, y + Math.sin(ang) * sp * k * 0.7 - 40 * k + 90 * k * k - s / 2, s, s);
			}
		} else if (f.k === 'coins') {
			// gold earned: coins fly from the board to the counter (f.to: the counter's element)
			const a = at(f.at, 1), n = f.n || 6;
			if (!f.px) { const el = typeof f.to === 'string' ? document.querySelector(f.to) : null, r = el && el.getBoundingClientRect(); f.px = r && r.width ? [r.left + r.width / 2, r.top + r.height / 2] : a; }
			g.globalAlpha = 1; g.shadowBlur = 8; g.lineWidth = 2;
			for (let j = 0; j < n; j++) {
				const kk = k * 1.5 - j * 0.5 / n; if (kk <= 0 || kk >= 1) continue;
				const e = kk * kk * (3 - 2 * kk), arc = Math.sin(kk * Math.PI);
				g.beginPath(); g.arc(a[0] + (f.px[0] - a[0]) * e + arc * (j % 2 ? 44 : -44), a[1] + (f.px[1] - a[1]) * e - arc * 50, 7, 0, Math.PI * 2);
				g.fillStyle = '#ffd23c'; g.fill(); g.strokeStyle = '#8a6a12'; g.stroke();
			}
		} else if (f.k === 'impact') {
			const [x, y] = at(f.at); g.globalAlpha = 0.9 * (1 - k); g.beginPath(); g.arc(x, y, 8 + 26 * k, 0, Math.PI * 2); g.lineWidth = 3; g.stroke();
		}
		g.restore();
	}
}

// ---------------------------------------------------------------- the frame
let last = performance.now();
function frame(now) {
	const dt = Math.min(0.05, (now - last) / 1000); last = now;
	if (hub && hub.active) { requestAnimationFrame(frame); return; }   // (the camp covers the board: nothing to draw)
	stepAnims(dt);
	rpTick(dt);
	if (td && td.active) td.frame(dt);   // (Tower Defense: real time into the sim's ticks)
	if (mm && mm.active) mm.frame(dt);   // (Mystery Maze: gliding steps, walking to a tapped tile)
	if (board) board.tick(now / 1000);
	drawUnits(now / 1000);
	const right = new THREE.Vector3(-Math.cos(camYaw()), 0, Math.sin(camYaw()));
	for (const s of sheets.values()) if (s) s.batch.end(right);
	// a hit shakes the board a little (a knockout more); reduced motion: no shake
	const shake = P.shake > 0.01 && !reducedMotion() ? P.shake : 0;
	const ox = shake ? (Math.random() - 0.5) * shake : 0, oz = shake ? (Math.random() - 0.5) * shake : 0;
	camera.position.x += ox; camera.position.z += oz;
	renderer.render(scene, camera);
	camera.position.x -= ox; camera.position.z -= oz;
	P.shake = Math.max(0, P.shake - dt * 2.2);
	drawNumbers(dt);
	requestAnimationFrame(frame);
}
function drawUnits(t) {
	for (const s of sheets.values()) if (s) s.batch.begin();
	shadows.begin();
	const S = P.S, D = P.disp, list = [];
	for (const u of S.units) {
		const d = D ? D.units[u.uid] : { x: u.x, y: u.y, facing: u.facing, anim: 'Idle', alive: u.hp > 0 && u.x != null, flash: 0 };
		if (!d || !d.alive || d.x == null) continue;
		const [gx, gy] = d.wx || [d.x, d.y];
		const tx = Math.round(gx), ty = Math.round(gy);
		const wx = gx * CELL + CELL / 2, wz = gy * CELL + CELL / 2, wy = topY(Math.max(0, Math.min(S.map.w - 1, tx)), Math.max(0, Math.min(S.map.h - 1, ty))) + (d.arc || 0);
		const dex = dexOf(u.species);
		let anim = d.anim || 'Idle';
		let sh = sheet(dex, anim);
		if (!sh) { anim = 'Idle'; sh = sheet(dex, 'Idle'); }
		if (!sh) continue;
		const meta = sh.meta, at = anim === 'Idle' || anim === 'Walk' ? t : Math.max(0, t - (d.t0 || 0));
		let fr = frameAt(meta, at);
		if ((anim === 'Faint') && at * 60 > meta.d.reduce((a, b) => a + b, 0)) fr = meta.n - 1;
		const row = facingRow(FACE[d.facing] ?? 0, camYaw());
		const q = spriteQuad(meta, sh.img, fr, row, 1.25, sh.lift);
		sh.batch.add(wx, wy, wz, q.rect, q.uv, d.flash > 0 ? 2 : foeOf(u) ? 0.94 : 1);
		if (d.flash > 0) d.flash = Math.max(0, d.flash - 0.08);
		list.push({ u, wx, wy, wz, shadow: sh.shadow });
	}
	for (const o of list) shadows.add(P.room, o.wx, o.wz, o.wy, o.shadow);
	shadows.end();
	P.drawn = list;
}

// ---------------------------------------------------------------- HP bars and numbers (2D, projected)
const pops = [];
// (o: Tower Defense's damage numbers: { big: 1 a hit | 2 a heavy one, calm: no pop and no arc, at: [x, y] where it was dealt,
// in tiles: the blow that fells an enemy is shown though the enemy is gone } — tdmode.js)
function pop(uid, text, color, o) { const row = pops.filter((p) => p.uid === uid && p.t < 0.35).length; const p = { uid, text, color, t: 0, row, big: (o && o.big) || 0, calm: !!(o && o.calm), side: pops.length % 2 ? 1 : -1 }; if (o && o.at && P.S) { const tx = Math.max(0, Math.min(P.S.map.w - 1, Math.round(o.at[0]))), ty = Math.max(0, Math.min(P.S.map.h - 1, Math.round(o.at[1]))); p.w = [o.at[0] * CELL + CELL / 2, topY(tx, ty), o.at[1] * CELL + CELL / 2]; } pops.push(p); }
P.pops = pops;   // (several at once stack upward)
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const project = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
function drawNumbers(dt) {
	const g = numCtx, dpr = Math.min(devicePixelRatio || 1, 2);
	g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
	const S = P.S, D = P.disp;
	for (const o of P.drawn || []) {
		if (D && D.units[o.u.uid] && D.units[o.u.uid].nobar) continue;   // (Tower Defense: a tower has no HP)
		const [sx, sy] = project(o.wx, o.wy + 2.6, o.wz), hp = D ? D.units[o.u.uid].hp : o.u.hp, f = Math.max(0, hp / o.u.maxHP);
		g.fillStyle = '#1c1f24'; g.fillRect(sx - 18, sy, 36, 6);
		g.fillStyle = P.S && P.S.pvp && !mine(o.u) ? SEAT_HEX[o.u.side] || '#fe5f55' : mine(o.u) ? (f > 0.5 ? '#3fd36b' : f > 0.25 ? '#f5c542' : '#fe5f55') : '#fe5f55';
		g.fillRect(sx - 17, sy + 1, 34 * f, 4);
		// (what lasts on it, over the bar: Reflect, Taunt, a Leech Seed ... engine/statusfx.js)
		const tags = (o.u.fx || o.u.seed || o.u.focus || o.u.stock) ? marksOf(o.u) : null;
		if (tags && tags.length) {
			const text = tags.slice(0, 3).map((t) => t.tag).join(' ') + (tags.length > 3 ? ' +' + (tags.length - 3) : '');
			g.font = 'bold 10px m6x11, monospace'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#1c1f24';
			g.strokeText(text, sx, sy - 3); g.fillStyle = '#9fe0ff'; g.fillText(text, sx, sy - 3);
		}
	}
	// marks: a glyph (and a word) standing on a tile: Mystery Maze's stairs, items, prices, traps (P.marks: [{ x, y, text, color, sub? }])
	// ... and the entry hazards lying on a battle's or a Tower Defense road's tiles (S.hazards: engine/statusfx3.js)
	const hazardMarks = P.S && P.S.hazards && P.S.hazards.length ? P.S.hazards.map((h) => ({ x: h.x, y: h.y, text: '▲', sub: (HAZARDS[h.kind] || [])[1], color: (HAZARDS[h.kind] || [])[2] || '#ffffff' })) : [];
	if (((P.marks && P.marks.length) || hazardMarks.length) && P.S) {
		g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#1c1f24';
		for (const m of [...(P.marks || []), ...hazardMarks]) {
			if (!isTile(P.S.map, m.x, m.y)) continue;
			const [wx, wy, wz] = world(m.x, m.y), [sx, sy] = project(wx, wy + 0.9, wz);
			if (sx < -40 || sy < -40 || sx > innerWidth + 40 || sy > innerHeight + 40) continue;
			g.font = 'bold 20px m6x11, monospace'; g.strokeText(m.text, sx, sy); g.fillStyle = m.color; g.fillText(m.text, sx, sy);
			if (m.sub) { g.font = 'bold 13px m6x11, monospace'; g.strokeText(m.sub, sx, sy + 14); g.fillText(m.sub, sx, sy + 14); }
		}
	}
	if (P.fx.length && P.S) drawFx(g, dt);
	for (let i = pops.length - 1; i >= 0; i--) {
		const p = pops[i]; p.t += dt;
		const o = (P.drawn || []).find((d) => d.u.uid === p.uid);
		if (o) p.w = [o.wx, o.wy, o.wz];   // (a number outlives what it was dealt to: the blow that fells an enemy is still read)
		if (!p.w || p.t > 1.1) { pops.splice(i, 1); continue; }
		const [sx, sy] = project(p.w[0], p.w[1] + 3.2, p.w[2]);
		if (p.big) {
			// a big number: it pops in (large, then settles), arcs up and to one side, and fades
			const moving = !p.calm && !reducedMotion(), size = p.big > 1 ? 34 : 25, k = moving ? 1 + 0.7 * Math.max(0, 1 - p.t / 0.14) : 1;
			const x = sx + (moving ? p.side * p.t * 26 : 0), yb = sy - (moving ? p.t * 74 - p.t * p.t * 52 : p.t * 28) - p.row * 22;
			g.save(); g.globalAlpha = p.t > 0.8 ? Math.max(0, 1 - (p.t - 0.8) / 0.3) : 1;
			g.font = 'bold ' + Math.round(size * k) + 'px m6x11, monospace'; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = p.big > 1 ? 7 : 5; g.strokeStyle = '#1c1f24';
			g.strokeText(p.text, x, yb); g.fillStyle = p.color; g.fillText(p.text, x, yb); g.restore();
			continue;
		}
		const y = sy - p.t * 28 - p.row * 18;
		g.font = (p.row ? 'bold 15px' : 'bold 18px') + ' m6x11, monospace'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#1c1f24';
		g.strokeText(p.text, sx, y); g.fillStyle = p.color; g.fillText(p.text, sx, y);
	}
}

// ---------------------------------------------------------------- the HUD (Balatro kit)
// (the kit's toast is drawn only while it has is-show: without it, it stayed at opacity 0 and no toast was ever seen)
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; el.classList.remove('is-show'); void el.offsetWidth; el.classList.add('is-show'); clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; el.classList.remove('is-show'); }, 2100); }
/** A campaign map's tip, until the player's first key, button or tap (or 12 s). */
function showTip(title, text) {
	const el = $('tip'); el.innerHTML = '<b></b><span></span><small></small>';
	el.children[0].textContent = title;
	el.children[1].textContent = touchy() ? String(text).replace(/\bZ on\b/g, 'Tap').replace(/\s*\(V \/ Y\)/g, '') : text;   // (a tip written for keys, read on a phone)
	el.children[2].textContent = touchy() ? 'Tap to close' : 'Any key closes this';
	el.hidden = false; clearTimeout(showTip.t); showTip.t = setTimeout(hideTip, 12000);
}
function hideTip() { const el = $('tip'); if (el) el.hidden = true; clearTimeout(showTip.t); }
function banner(t) { const el = $('banner'); el.textContent = t; el.hidden = false; el.classList.remove('pt-in'); void el.offsetWidth; el.classList.add('pt-in'); clearTimeout(banner.t); banner.t = setTimeout(() => { el.hidden = true; }, 1100); }
function unitAtCursor() { return B.unitAt(P.S, P.cursor.x, P.cursor.y); }
// (PvP, owner 2026-11-22: "my side" is 'p' in the campaign and this player's seat, 'a'..'d', online)
const ME = () => P.me || 'p';
const mine = (u) => !!u && u.side === ME();
const foeOf = (u) => !!u && u.side !== ME();
const myBase = () => B.baseOf(P.S, ME());
const myTurn = () => !!P.S && P.S.phase === 'player' && B.curSide(P.S) === ME();
/** A seat's name online ("Ann", "CPU Blue"), "You" for this player's own. */
const seatName = (side) => (side === ME() ? 'You' : side === 'e' ? 'Wild' : (P.online && P.online.names[side]) || 'Seat ' + ('abcd'.indexOf(side) + 1));
const SEAT_HEX = { a: '#4fa3ff', b: '#fe5f55', c: '#3fd36b', d: '#f5c542' };
const reserve = () => P.S.units.filter((x) => mine(x) && x.x == null && x.hp > 0);
const onBase = () => B.unitAt(P.S, myBase().x, myBase().y);
const canDeploy = () => myTurn() && reserve().length > 0 && B.onMap(P.S, ME()).length < B.MAX_DEPLOYED;
const ready = () => B.onMap(P.S, ME()).filter((u) => !u.acted);
/** the last input was a touch (the hints then say "tap", not "Z") */
P.input = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'key';
const touchy = () => P.input === 'touch';
function refreshHud() {
	const S = P.S;
	$('turn').textContent = S.pvp ? (S.over ? (S.pvp.winner === ME() ? 'Victory' : seatName(S.pvp.winner) + ' wins') : myTurn() ? 'Turn ' + S.turn + ' · yours' : seatName(B.curSide(S)) + '\'s turn')
		: S.over ? (S.over === 'won' ? 'Victory' : 'Defeat') : (S.phase === 'player' ? 'Turn ' + S.turn : 'Enemy phase');
	$('queue').textContent = S.queue.length ? S.queue.length + ' queued' : '';
	$('b-exec-n').textContent = S.queue.length ? String(S.queue.length) : '';
	const b = S.bonus || { points: 0, level: 0 };
	{ const g = document.querySelector('.pt-gauge'); if (g) g.hidden = !!S.pvp; }
	$('gauge-fill').style.width = Math.min(100, (b.points % 100)) + '%';
	$('gauge-lv').textContent = b.level;
	const u = unitAtCursor() || (P.sel && B.unit(S, P.sel));
	const el = $('unit');
	if (!u || u.x == null) { el.hidden = true; } else {
		el.hidden = false;
		const sp = P.data.species[u.species] || {};
		$('u-name').textContent = (sp.name || u.species) + '  Lv ' + u.level;
		$('u-side').textContent = mine(u) ? (u.acted ? 'Done' : u.moved ? 'Moved' : 'Yours') : S.pvp ? seatName(u.side) : 'Wild';
		$('u-side').className = 'bal-badge ' + (mine(u) ? (u.acted ? 'bal-grey' : 'bal-blue') : 'bal-orange');
		{ const r = MODE === 'normal' && mine(u) && !S.pvp && S.phase === 'player' ? inDanger().get(u.uid) : null;   // (in danger: said on its panel too)
			if (r) { $('u-side').textContent = (r.sure ? '☠ Will fall' : '☠ In danger') + ' · ' + $('u-side').textContent; $('u-side').className = 'bal-badge bal-red'; $('u-side').title = r.foes + (r.foes === 1 ? ' foe can' : ' foes can') + ' reach it next phase, for up to ' + r.most + ' damage (it has ' + u.hp + ' HP)'; } else $('u-side').title = ''; }
		$('u-hp').textContent = 'HP ' + u.hp + ' / ' + u.maxHP; $('u-hpbar').style.width = (100 * u.hp / u.maxHP) + '%';
		$('u-sp').textContent = 'SP ' + u.sp + ' / ' + u.maxSP + (u.status ? '  ' + u.status.toUpperCase() : '') + marksOf(u).map((t) => '  · ' + t.name + (t.turns ? ' ' + t.turns : '')).join('') + (u.heldId ? '  · ' + goodName(u.heldId) + (u.held && u.held.lv > 1 ? ' Lv ' + u.held.lv : '') + (u.heldUsed ? ' (used)' : '') : '');
		if (u.stats) $('u-stats').textContent = `Atk ${u.stats.atk} Def ${u.stats.def} SpA ${u.stats.spa} SpD ${u.stats.spd} Spe ${u.stats.spe} · Move ${u.move} Jump ${u.jump}${(sp.types || []).length ? ' · ' + sp.types.join('/') : ''}`;
		$('u-moves').innerHTML = u.fig.equipped.map((m) => { const d = P.data.moves[m] || {}; return `<li><b>${d.name || m}</b> <span class="bal-muted">${d.type || ''}${d.power ? ' · Pow ' + d.power : ''} · PP ${u.pp[m]}</span></li>`; }).join('');
		const g = Geo.effectsAt(S, u.x ?? -1, u.y ?? -1);
		const gr = S.terrain && S.map.ground ? S.map.ground[u.y * S.map.w + u.x] : null;
		$('u-geo').textContent = [g.length ? 'Geo: ' + g.map((e) => e.k + (e.stat ? ' ' + e.stat : '') + (e.type ? ' ' + e.type : '')).join(', ') : '', gr && GROUND_SAY[gr] ? GROUND_NAME[gr] + ': ' + GROUND_SAY[gr] : ''].filter(Boolean).join(' · ');
	}
	const busy = MODE === 'normal' && P.screen === 'battle';
	$('b-back').hidden = !busy || (P.mode === 'idle' && !P.menu);
	$('b-exec').disabled = busy && !S.queue.length;
	$('b-danger').setAttribute('aria-pressed', P.dangerOn ? 'true' : 'false'); $('b-danger').classList.toggle('bal-purple', P.dangerOn); $('b-danger').classList.toggle('bal-grey', !P.dangerOn);
	renderForecast();
	hint();
	coachStep();
	document.body.classList.toggle('pt-coached', !$('coach').hidden);
	if (S.over) showResult();
}

// ---- the FORECAST (engine forecast()): shown while aiming at a red tile
function renderForecast() {
	const el = $('fc'), f = P.mode === 'aim' && MODE === 'normal' ? P.fc : null;
	if (!f) { el.hidden = true; return; }
	const d = P.data.moves[f.move] || {};
	const rows = f.targets.map((t) => {
		const v = B.unit(P.S, t.uid), nm = nameOf(v.species) + (t.side === ME() ? ' (yours)' : '');
		const ko = t.ko === 'yes' ? '<span class="bal-badge bal-red">KO</span>' : t.ko === 'maybe' ? '<span class="bal-badge bal-orange">KO?</span>' : '';
		const notes = [t.immune ? 'immune' + (t.immune === 'protect' ? ' (Protect)' : '') : '', t.eff > 1 ? 'super effective' : t.eff > 0 && t.eff < 1 ? 'not very effective' : '',
			t.face === 'back' ? 'from behind' : t.face === 'side' ? 'from the side' : '', t.sash ? 'Focus Thread: hangs on' : '', t.hidden ? 'in tall grass: harder to hit' : '', t.ground ? GROUND_NAME[t.ground] + ' boosts it' : '', (t.team || []).length ? (t.team.length === 1 ? 'an ally may join' : t.team.length + ' allies may join') : ''].filter(Boolean).join(' · ');
		const lo = Math.max(0, t.hp - t.max), hi = Math.max(0, t.hp - t.min);
		const dmg = t.status ? '<span>status</span>' : t.immune ? '<span>—</span>' : `<span class="pt-fc-dmg">${t.min === t.max ? t.min : t.min + '–' + t.max}</span>`;
		return `<div class="pt-fc-row${t.side === ME() ? ' pt-fc-own' : ''}"><div class="pt-fc-top"><b>${esc(nm)}</b>${ko}<span class="pt-fc-hit">${t.hit}%</span>${dmg}</div>
			${t.status || t.immune ? '' : `<div class="bal-bar pt-fc-bar"><div class="bal-bar-fill pt-fc-left" style="width:${100 * lo / v.maxHP}%"></div><div class="pt-fc-range" style="left:${100 * lo / v.maxHP}%;width:${100 * (hi - lo) / v.maxHP}%"></div></div>`}
			${notes ? `<small class="bal-muted">${notes}</small>` : ''}</div>`;
	}).join('');
	el.innerHTML = `<div class="pt-fc-head"><b>${esc(d.name || f.move)}</b><span class="bal-muted">hit · damage</span></div>${rows || `<div class="bal-muted">${f.note ? esc(f.note) : 'No one there'}</div>`}${rows && f.note ? `<small class="bal-muted">${esc(f.note)}</small>` : ''}`;
	el.hidden = false;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- the enemy range (engine threat()), cached per board (P.ver)
function threatOf(e) {
	const k = e.uid + '@' + P.ver, c = P.threats.get(k);
	if (c) return c;
	if (P.threats.size > 64) P.threats.clear();
	const t = B.threat(P.S, e, P.data); P.threats.set(k, t); return t;
}
/**
 * IN DANGER (improvement plan, 2026-11-25; the permanent-loss plan deferred it): which of your figurines on the map could
 * be knocked out in the coming enemy phase. For each foe that can reach a figurine's tile (the same reach the 👁 overlay
 * draws), the most its best move could do to it, by the forecast the player sees; added up over those foes. A figurine
 * whose HP that covers is "in danger"; "will fall" when one foe's LEAST is already enough. An estimate: it does not know
 * which foe will choose whom. -> Map uid -> { foes, most, sure }
 */
function inDanger() {
	if (P.riskVer === P.ver && P.risk) return P.risk;
	const S = P.S, out = new Map();
	if (S && !S.over) {
		const foes = S.units.filter((x) => foeOf(x) && x.hp > 0 && x.x != null);
		for (const v of S.units.filter((x) => mine(x) && x.hp > 0 && x.x != null)) {
			let n = 0, most = 0, sure = false;
			for (const e of foes) {
				if (!threatOf(e).attack.some(([x, y]) => x === v.x && y === v.y)) continue;
				let best = 0, least = 0;
				for (const mid of e.fig.equipped) {
					const d = P.data.moves[mid] || {};
					if (d.category === 'Status' || (e.pp[mid] || 0) < 1) continue;
					let fc = null; try { fc = B.forecast(S, e, mid, v.x, v.y, P.data); } catch { fc = null; }
					const t = fc && (fc.targets || []).find((q) => q.uid === v.uid);
					if (t && t.max > best) { best = t.max; least = t.min || 0; }
				}
				if (best > 0) { n++; most += best; if (least >= v.hp) sure = true; }
			}
			if (n && most >= v.hp) out.set(v.uid, { foes: n, most, sure });
		}
	}
	P.risk = out; P.riskVer = P.ver; return out;
}
function dangerTiles() {
	if (P.dangerVer === P.ver && P.danger) return P.danger;
	const seen = new Set(), out = [];
	for (const e of P.S.units.filter((x) => foeOf(x) && x.hp > 0 && x.x != null)) for (const [x, y] of threatOf(e).attack) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); out.push([x, y]); } }
	P.danger = out; P.dangerVer = P.ver; return out;
}
function toggleDanger() { P.dangerOn = !P.dangerOn; sfx.press(); toast(P.dangerOn ? 'Enemy range on: where the foes can strike' : 'Enemy range off'); rebuildOverlay(); refreshHud(); }
/** In idle, the cursor on a foe shows its range (Disgaea's): where it can move, and what it can strike from there. */
function hoverFoe() {
	if (P.mode !== 'idle' || !P.S || MODE !== 'normal') return;
	const u = unitAtCursor();
	if (u && foeOf(u)) { const t = threatOf(u); P.hl = { emove: t.move, eatk: t.attack }; }
	else if (P.hl.emove) P.hl = {};
}

// ---- the log: what happened, in words (the enemy phase's summary after it plays; all of it from the field menu)
function logEvents(evs, isEnd) {
	const nm = (uid) => { const u = B.unit(P.S, uid); return u ? nameOf(u.species) + (P.S.pvp ? (mine(u) ? '' : ' (' + seatName(u.side) + ')') : u.side === 'e' ? ' (wild)' : '') : uid; };
	const lines = []; let cur = null, enemy = false, phaseLines = [];
	const push = (l) => { lines.push(l); if (enemy) phaseLines.push(l); };
	for (const e of evs) {
		if (e.t === 'phase') { enemy = e.phase === 'enemy'; push((e.side ? '— ' + seatName(e.side) + (e.side === ME() ? 'r turn' : '\'s turn') + ' (' + e.turn + ')' : e.phase === 'enemy' ? '— Enemy phase' : e.phase === 'wild' ? '— Wild Pokémon (' + e.turn + ')' : '— Turn ' + e.turn) + ' —'); cur = null; continue; }
		if (e.t === 'concede') { push(seatName(e.side) + (e.side === ME() ? ' left the match' : ' left the match')); continue; }
		if (e.t === 'idle') { push(seatName(e.side) + ' ran out of time'); continue; }
		if (e.t === 'out') { push(seatName(e.side) + (e.side === ME() ? ' are out' : ' is out')); continue; }
		if (e.t === 'use') { cur = { text: nm(e.uid) + ': ' + ((P.data.moves[e.move] || {}).name || e.move), parts: [] }; push(cur); continue; }
		if (e.t === 'hit') { const s = '→ ' + nm(e.target) + ' −' + e.dmg + (e.crit ? ' (critical)' : '') + (e.eff > 1 ? ' (super effective)' : ''); if (cur && cur.text.startsWith(nm(e.uid))) cur.parts.push(s); else push(nm(e.uid) + ' ' + s); continue; }
		if (e.t === 'miss') { if (cur) cur.parts.push('missed'); continue; }
		if (e.t === 'immune') { if (cur) cur.parts.push(nm(e.uid) + ' is immune'); continue; }
		if (e.t === 'ko') { push(nm(e.uid) + ' fainted' + (P.setup && P.setup.perma && !P.online && P.teamMap && P.teamMap[e.uid] ? ' and is gone for good' : '')); continue; }
		if (e.t === 'status') { push(nm(e.uid) + ' is ' + ({ brn: 'burned', psn: 'poisoned', par: 'paralysed', slp: 'asleep', frz: 'frozen', tox: 'badly poisoned' }[e.st] || e.st)); continue; }
		if (e.t === 'mark') { push(nm(e.uid) + ': ' + (MARK_SAY[e.what] || [e.what])[0] + (e.turns && e.turns < 99 ? ' (' + e.turns + ' turn' + (e.turns === 1 ? '' : 's') + ')' : '')); continue; }
		if (e.t === 'endured') { push(nm(e.uid) + ' endured the hit'); continue; }
		if (e.t === 'retype') { push(nm(e.uid) + ' is now ' + e.types.join(' / ')); continue; }
		if (e.t === 'ability') { push(nm(e.uid) + abilitySay(e, P.data.abilities._names).line); continue; }
		if (e.t === 'team') { push(nm(e.uid) + ' joins in: team attack!'); continue; }
		if (e.t === 'withdraw') { push(nm(e.uid) + ' withdrew to the base'); continue; }
		if (e.t === 'held') { push(nm(e.uid) + "'s " + goodName(e.item) + (HELD_SAY[e.what] ? ': ' + HELD_SAY[e.what] : '')); continue; }
		if (e.t === 'capture') { push(e.ok ? nm(e.target) + ' was caught!' : nm(e.target) + ' broke free'); continue; }
		if (e.t === 'over') push(e.result === 'won' ? 'Victory!' : 'Defeat');
	}
	const str = (l) => (typeof l === 'string' ? l : l.text + (l.parts.length ? ' ' + l.parts.join(', ') : ''));
	P.log.push(...lines.map(str)); if (P.log.length > 80) P.log.splice(0, P.log.length - 80);
	if (isEnd) { const sum = phaseLines.map(str).filter((l) => !/^—/.test(l)); P.summary = sum.length ? sum : P.S && P.S.pvp ? null : ['The foes held still.']; }
}
function showLog(lines, title) {
	const el = $('log');
	el.innerHTML = `<div class="pt-log-head"><b>${esc(title)}</b><button class="bal-btn bal-sm bal-grey" data-close>Close <span class="bal-key">X</span></button></div><ul class="pt-log-list bal-scroll">${lines.map((l) => `<li${/^—/.test(l) ? ' class="bal-muted"' : ''}>${esc(l)}</li>`).join('')}</ul>`;
	el.hidden = false;
	const list = el.querySelector('.pt-log-list'); if (list) list.scrollTop = list.scrollHeight;
	clearTimeout(showLog.t); if (title === 'Enemy phase' || title === 'Meanwhile') showLog.t = setTimeout(hideLog, 7000);
}
function hideLog() { $('log').hidden = true; clearTimeout(showLog.t); }

// ---- the first battle's coach (the campaign's first map, until it is cleared or skipped)
const COACH = [
	{ done: (S) => B.onMap(S, 'p').length > 0, key: 'Put the cursor on your <b>base</b> (the pale tile) and press <b>Z</b>, then <b>Z</b> on a figurine: it goes out.', touch: 'Tap your <b>base</b> (the pale tile), then a figurine: it goes out.' },
	{ done: (S) => S.units.some((u) => u.side === 'p' && (u.moved || u.acted)), key: '<b>Z</b> on your figurine opens its commands. Choose <b>Move</b>, then <b>Z</b> on a blue tile, toward a foe.', touch: 'Tap your figurine, then a <b>blue</b> tile: it moves there. Head toward a foe.' },
	{ done: (S) => S.queue.length > 0 || P.coachExec, key: 'Next to a foe? Choose <b>Attack</b>, a move, then a red tile. The box shows the hit chance and the damage.', touch: 'Next to a foe? Tap it, choose <b>Attack</b> and a move, then tap the red tile twice. The box shows the hit chance and the damage.' },
	{ done: () => !!P.coachExec, key: 'Attacks wait in a queue. Press <b>V</b> (<b>Execute</b>): they happen, in order. Several in one Execute make a combo.', touch: 'Attacks wait in a queue. Tap <b>Execute</b>: they happen, in order. Several in one Execute make a combo.' },
	{ done: (S) => S.turn >= 2, key: 'Press <b>Enter</b> (the field menu), then <b>End turn</b>: the wild Pokémon move. The 👁 button shows where they can reach.', touch: 'Tap <b>Menu</b>, then <b>End turn</b>: the wild Pokémon move. The 👁 button shows where they can reach.' },
];
function coachOn(m) { return MODE === 'normal' && m && m.id === 'c1-1' && !(P.col.cleared || []).includes('c1-1') && lsGet(COACH_KEY) !== 'done'; }
function coachStep() {
	const el = $('coach');
	if (!P.coach || P.screen !== 'battle' || !P.S || P.S.over) { el.hidden = true; return; }
	if (P.busy) return;   // (the next step once what was done has played out: the enemy phase, an Execute)
	while (P.coach.step < COACH.length && COACH[P.coach.step].done(P.S)) P.coach.step++;
	if (P.coach.step >= COACH.length) {
		$('coach-n').textContent = '✓'; $('coach-text').innerHTML = 'That is a whole turn. Knock out every foe to win!';
		el.hidden = false; lsSet(COACH_KEY, 'done'); const c = P.coach; P.coach = null; setTimeout(() => { if (!P.coach && c) el.hidden = true; }, 5000); return;
	}
	$('coach-n').textContent = (P.coach.step + 1) + ' / ' + COACH.length;
	$('coach-text').innerHTML = touchy() ? COACH[P.coach.step].touch : COACH[P.coach.step].key;
	el.hidden = false;
}
/** One line under the top bar: what to do next, in the words of the last input (tap / keys). */
function groundHint() {
	const S = P.S;
	if (!S || !S.terrain || !S.map.ground || !P.cursor) return '';
	const g = S.map.ground[P.cursor.y * S.map.w + P.cursor.x];
	return GROUND_SAY[g] ? GROUND_NAME[g] + ': ' + GROUND_SAY[g] : '';
}
function hint() {
	const el = $('hint'), S = P.S;
	if (MODE !== 'normal' || P.screen !== 'battle' || !S || S.over) { el.textContent = ''; return; }
	const t = touchy(), K = (k) => `<span class="bal-key">${k}</span>`;
	let h = '';
	if (P.busy || !myTurn()) h = P.busy ? (t ? 'Tap to speed it up' : `${K('Z')} speeds it up`) : S.pvp ? (S.over ? '' : seatName(B.curSide(S)) + '\'s turn: waiting…' + (P.online && P.online.sync && P.online.sync.deadline() ? ' (' + Math.max(0, Math.ceil((P.online.sync.deadline() - Date.now()) / 1000)) + ' s)' : '')) : 'Enemy phase…';
	else if (P.mode === 'move') h = t ? 'Tap a blue tile to move there' : `${K('Z')} on a blue tile moves there · ${K('X')} back`;
	else if (P.mode === 'aim') h = t ? 'Tap a red tile to aim (the box shows the odds), tap it again to attack' : `${K('Z')} on a red tile queues the attack (the box shows the odds) · ${K('X')} back`;
	else if (P.mode === 'throw-from') h = t ? 'Tap who to lift' : `${K('Z')} on who to lift`;
	else if (P.mode === 'throw-to') h = t ? 'Tap where to throw it (a wild one onto your base: catch!)' : `${K('Z')} where to throw it (a wild one onto your base: catch!)`;
	else if (P.mode === 'unit') h = t ? 'Choose a command, or tap a blue tile to move' : `Choose a command · ${K('X')} back`;
	else if (P.menu) h = t ? '' : `${K('Z')} choose · ${K('X')} back`;
	else if (canDeploy() && !onBase()) h = t ? 'Tap your base (the pale tile) to deploy' : `${K('Z')} on your base (the pale tile) deploys`;
	else if (ready().length) h = t ? 'Tap one of yours to command it' : `${K('Z')} on one of yours: its commands · ${K('⏎')} field menu`;
	else h = S.queue.length ? (t ? 'Everyone has acted: Execute, then Menu → End turn' : `Everyone has acted: ${K('V')} Execute, ${K('⏎')} End turn`) : (t ? 'Everyone has acted: Menu → End turn' : `Everyone has acted: ${K('⏎')} End turn`);
	// the cursor on an empty tile of living terrain (choosing where to walk): what it does
	const gh = groundHint();
	if (gh && !P.busy && (P.mode === 'idle' || P.mode === 'move') && !B.unitAt(S, P.cursor.x, P.cursor.y)) h = `<b>${esc(gh)}</b>` + (h ? ' · ' + h : '');
	el.innerHTML = h;
}
function setMenu(items, title = '') {
	P.menu = items ? { items, i: Math.max(0, items.findIndex((it) => !it.off)) } : null;
	const el = $('menu'), box = $('menu-items');
	$('menu-title').textContent = items ? title : '';
	if (!items) { el.hidden = true; box.innerHTML = ''; refreshBack(); return; }
	el.hidden = false;
	box.innerHTML = items.map((it, i) => `<button class="bal-btn ${it.color || 'bal-blue'} ${i === P.menu.i ? 'is-focus' : ''}" data-i="${i}" ${it.off ? 'aria-disabled="true"' : ''} style="${it.off ? 'opacity:.5' : ''}">${it.label}</button>`).join('');
	refreshBack();
}
const refreshBack = () => { const busy = MODE === 'normal' && P.screen === 'battle'; $('b-back').hidden = !busy || (P.mode === 'idle' && !P.menu); };
function menuMove(d) { if (!P.menu) return; const n = P.menu.items.length; P.menu.i = (P.menu.i + d + n) % n; [...$('menu-items').children].forEach((b, i) => { b.classList.toggle('is-focus', i === P.menu.i); if (i === P.menu.i && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }); if (d) sfx.select && sfx.select(); }
function menuPick(i) { if (!P.menu) return; const it = P.menu.items[i ?? P.menu.i]; if (!it) return; if (it.off) { sfx.error(); if (typeof it.off === 'string') toast(it.off); return; } sfx.press(); it.go(); }

// ---------------------------------------------------------------- the controls: Disgaea's menus as a small state machine
//   idle        the cursor roams; Z on one of yours: its commands; on the base: the deploy list; elsewhere: the field menu
//   unit        a unit's commands (Move, Attack, Throw, Wait, Undo move, Status); its move range shows (a tap there moves)
//   move | aim | throw-from | throw-to    choosing a tile
//   moves       the Attack list;  deploy  the base panel's list;  field  the field menu;  giveup  "give up?"
function setHl(o) { P.hl = o || {}; rebuildOverlay(); }
const toIdle = () => { P.mode = 'idle'; P.sel = null; P.fc = null; setMenu(null); setHl(null); hoverFoe(); rebuildOverlay(); refreshHud(); };
function back() {
	sfx.back();
	if (P.mode === 'aim' || P.mode === 'throw-to') { P.fc = null; return openMoves(B.unit(P.S, P.sel)); }
	if (P.mode === 'move' || P.mode === 'moves' || P.mode === 'throw-from') return openUnit(B.unit(P.S, P.sel));
	if (P.mode === 'giveup' || P.mode === 'queue' || P.mode === 'opts') return openField();
	if (P.mode === 'queue-item') return openQueue(P.qi);
	toIdle();
}
function openUnit(u) {
	if (!u || u.x == null) return toIdle();
	P.sel = u.uid; P.mode = 'unit'; P.cursor = { x: u.x, y: u.y };
	const canMove = !u.moved && !u.acted;
	setHl(canMove ? { move: [...B.moveTiles(P.S, u).values()].map((t) => [t.x, t.y]) } : null);
	const sp = P.data.species[u.species] || {};
	const items = [];
	if (canMove) items.push({ label: 'Move', go: () => { P.mode = 'move'; setMenu(null); setHl({ move: [...B.moveTiles(P.S, u).values()].map((t) => [t.x, t.y]) }); refreshHud(); } });
	if (!u.acted) items.push({ label: 'Attack', color: 'bal-red', go: () => openMoves(u) });
	if (!u.acted && u.lift) items.push({ label: 'Throw', color: 'bal-orange', go: () => { P.mode = 'throw-from'; setMenu(null); setHl({ aim: Object.values(DIRS).map(([dx, dy]) => [u.x + dx, u.y + dy]).filter(([x, y]) => B.unitAt(P.S, x, y) || Geo.symbolAt(P.S, x, y)) }); refreshHud(); } });
	const q = P.S.queue.find((x) => x.uid === u.uid);
	if (q) items.push({ label: `Cancel attack <small>${esc((P.data.moves[q.move] || {}).name || q.move)}</small>`, color: 'bal-orange', go: () => { const r = act({ t: 'unqueue', uid: u.uid }); if (r.ok) { toast('Attack taken back: PP and SP returned'); openUnit(B.unit(P.S, u.uid)); } } });
	if (u.moved && !u.acted) items.push({ label: 'Undo move', color: 'bal-grey', go: () => { act({ t: 'undo', uid: u.uid }); toIdle(); } });
	// (rules 12) on its base tile, not yet acted: back to the reserve. In a deadly battle it is how a hurt figurine is saved.
	{ const S = P.S, bs = B.baseOf(S, u.side); if (S.rev >= 12 && !u.acted && u.cameIn !== S.turn && u.x === bs.x && u.y === bs.y) items.push({ label: `Withdraw <small>back to the reserve${P.setup && P.setup.perma && !P.online ? ': safe there' : ''}</small>`, color: 'bal-blue', off: (B.onMap(S, u.side).length <= 1 && 'The last one on the map cannot leave') || (S.queue.some((q) => q.uid === u.uid) && 'Cancel its attack first'), go: () => { const r = act({ t: 'withdraw', uid: u.uid }); if (r && r.ok === false) toast(r.why || 'It cannot withdraw'); toIdle(); } }); }
	if (!u.acted) items.push({ label: 'Wait', color: 'bal-grey', go: () => { act({ t: 'wait', uid: u.uid }); toIdle(); } });
	items.push({ label: 'Status', color: 'bal-purple', go: () => { $('unit').classList.toggle('pt-open'); refreshHud(); } });
	setMenu(items, (sp.name || u.species) + ' · Lv ' + u.level);
	refreshHud();
}
function openMoves(u) {
	P.mode = 'moves'; setHl(null);
	const sp = P.data.species[u.species] || {};
	setMenu(u.fig.equipped.map((mid) => {
		const m = B.moveOf(u, mid, P.data), d = P.data.moves[mid] || {};
		const hb = B.heldBlock(u, mid, P.data);
		const off = !m ? 'This move can\'t be used here' : u.pp[mid] < 1 ? 'No PP left' : u.sp < m.spCost ? 'Not enough SP' : hb ? hb[0].toUpperCase() + hb.slice(1) : false;
		return { label: `${d.name || mid} <small>${d.type || ''} · SP ${m ? m.spCost : '?'} · PP ${u.pp[mid]}</small>`, color: 'bal-red', off, go: () => {
			P.mode = 'aim'; P.aimMove = mid; setMenu(null);
			setHl({ aim: B.aimTiles(P.S, u, m) });
			previewArea(); refreshHud();
		} };
	}), (sp.name || u.species) + ' · Attack');
	refreshHud();
}
function previewArea() {
	if (P.mode !== 'aim') return;
	const u = B.unit(P.S, P.sel), m = B.moveOf(u, P.aimMove, P.data);
	const ok = P.hl.aim.some(([x, y]) => x === P.cursor.x && y === P.cursor.y);
	P.hl.area = ok ? shapeTiles(P.S.map, m, u.x, u.y, P.cursor.x, P.cursor.y) : [];
	P.fc = ok ? B.forecast(P.S, u, P.aimMove, P.cursor.x, P.cursor.y, P.data) : null;
	rebuildOverlay();
}
/** The Execute list (Disgaea's): the queued attacks in the order they will resolve; choose one to move it or take it back. */
function openQueue(focus = 0) {
	const S = P.S;
	if (!S.queue.length) return openField();
	P.mode = 'queue'; setHl(null);
	setMenu(S.queue.map((q, i) => {
		const u = B.unit(S, q.uid), v = B.unitAt(S, q.x, q.y);
		return { label: `${i + 1}. ${esc(nameOf(u.species))} · ${esc((P.data.moves[q.move] || {}).name || q.move)} <small>${v && v !== u ? '→ ' + esc(nameOf(v.species)) : 'at ' + q.x + ',' + q.y}</small>`, color: 'bal-orange', go: () => openQueueItem(i) };
	}), 'Execute list · in this order');
	P.menu.i = Math.min(focus, S.queue.length - 1); menuMove(0);
	refreshHud();
}
function openQueueItem(i) {
	const S = P.S, q = S.queue[i];
	if (!q) return openQueue();
	P.mode = 'queue-item'; P.qi = i;
	const order = (j) => { const ids = S.queue.map((x) => x.uid); const [x] = ids.splice(i, 1); ids.splice(j, 0, x); const r = act({ t: 'order', uids: ids }); if (r.ok) openQueue(j); };
	setMenu([
		{ label: 'Earlier <small>runs sooner</small>', off: i === 0 && 'It is first already', go: () => order(i - 1) },
		{ label: 'Later <small>runs after</small>', off: i === S.queue.length - 1 && 'It is last already', go: () => order(i + 1) },
		{ label: 'Cancel attack <small>PP and SP back</small>', color: 'bal-red', go: () => { act({ t: 'unqueue', uid: q.uid }); S.queue.length ? openQueue(Math.min(i, S.queue.length - 1)) : toIdle(); } },
		{ label: 'Back', color: 'bal-grey', go: () => openQueue(i) },
	], `${i + 1}. ${nameOf(B.unit(S, q.uid).species)} · ${(P.data.moves[q.move] || {}).name || q.move}`);
	refreshHud();
}
/** The base panel (Disgaea's): the figurines still in reserve, to deploy one. */
function openDeploy() {
	const S = P.S, res = reserve();
	if (!res.length) return toIdle();
	if (onBase()) { sfx.error(); toast('Your base tile is taken: move that one off first'); return; }
	if (B.onMap(S, ME()).length >= B.MAX_DEPLOYED) { sfx.error(); toast(B.MAX_DEPLOYED + ' are on the map already'); return; }
	P.mode = 'deploy'; P.cursor = { ...myBase() };
	setMenu(res.map((u) => ({ label: `${nameOf(u.species)} <small>Lv ${u.level} · HP ${u.hp}/${u.maxHP}</small>`, go: () => {
		const r = act({ t: 'deploy', uid: u.uid });
		if (r.ok) { P.mode = 'idle'; setMenu(null); openUnit(B.unit(P.S, u.uid)); }
	} })), `Base panel · ${B.onMap(S, ME()).length}/${B.MAX_DEPLOYED} out`);
	refreshHud();
}
/** The field menu (Disgaea's): Execute, End turn, deploy, the next unit, the map's goal, help, give up. */
function openField() {
	const S = P.S;
	P.mode = 'field'; setHl(null);
	if (P.online && !myTurn()) {   // (another seat is playing: what you can do meanwhile)
		setMenu([{ label: 'Battle log', color: 'bal-grey', go: () => { toIdle(); showLog(P.log.length ? P.log.slice(-40) : ['Nothing yet.'], 'Battle log'); } },
			{ label: `Enemy range <small>${P.dangerOn ? 'on' : 'off'}</small>`, color: 'bal-purple', go: () => { toggleDanger(); openField(); } },
			{ label: 'Leave match', color: 'bal-red', go: () => leaveAsk() }], seatName(B.curSide(S)) + '\'s turn');
		return refreshHud();
	}
	const items = [
		{ label: `Execute <small>${S.queue.length ? S.queue.length + ' queued' : 'nothing queued'}</small>`, color: 'bal-orange', off: !S.queue.length && 'Nothing queued: Attack first', go: () => { act({ t: 'execute' }); toIdle(); } },
		{ label: `End turn <small>${S.queue.length ? 'runs the queue first' : ready().length ? ready().length + ' can still act' : ''}</small>`, color: 'bal-red', go: () => endTurnAsk() },
	];
	if (canDeploy()) items.push({ label: `Deploy <small>${reserve().length} at the base</small>`, go: () => { P.mode = 'idle'; setMenu(null); openDeploy(); } });
	if (ready().length) items.push({ label: `Next unit <small>${ready().length} still to act</small>`, go: () => { const r = ready(), i = (r.findIndex((u) => u.uid === P.lastNext) + 1) % r.length; P.lastNext = r[i].uid; toIdle(); P.cursor = { x: r[i].x, y: r[i].y }; follow(true); refreshHud(); rebuildOverlay(); } });
	if (S.queue.length) items.splice(1, 0, { label: `Execute list <small>the order · cancel one</small>`, color: 'bal-orange', go: () => openQueue(0) });
	items.push({ label: `Enemy range <small>${P.dangerOn ? 'on' : 'off'}</small>`, color: 'bal-purple', go: () => { toggleDanger(); openField(); } });
	items.push({ label: 'Battle log', color: 'bal-grey', go: () => { toIdle(); showLog(P.log.length ? P.log.slice(-40) : ['Nothing yet.'], 'Battle log'); } });
	items.push({ label: `Enemy phase <small>${P.fast ? 'fast' : 'normal speed'}</small>`, color: 'bal-grey', go: () => { P.fast = !P.fast; lsSet(FAST_KEY, P.fast ? '1' : null); toast(P.fast ? 'Enemy phases play fast' : 'Enemy phases play at normal speed'); openField(); } });
	if (P.map && P.map.tip) items.push({ label: 'Objective', color: 'bal-grey', go: () => { toIdle(); showTip(P.map.name, P.map.tip); } });
	items.push({ label: 'How to play', color: 'bal-grey', go: () => { toIdle(); P.screen = 'help'; hub.help(0, () => { hub.close(); P.screen = 'battle'; refreshHud(); }); } });
	if (P.online) items.push({ label: 'Leave match', color: 'bal-grey', go: () => leaveAsk() });
	else items.push({ label: 'Give up', color: 'bal-grey', go: () => {
		P.mode = 'giveup';
		setMenu([{ label: 'Give up', color: 'bal-red', go: () => { stopLive(); clearBattle(); P.S.over = null; toIdle(); toast(P.dive && P.map ? 'The dive waits on floor ' + P.map.floor : P.run && P.map && P.map.floor ? 'The run waits on floor ' + P.map.floor : 'This battle didn\'t count'); camp(); } },
			{ label: 'Keep playing', color: 'bal-green', go: () => toIdle() },
			// (a dive into an item: a Pull Cord leaves now and keeps the floors cleared; goods.js KIT.pullcord)
			...(P.dive && MODE === 'normal' && haveGood(P.col, 'pullcord') ? [{ label: `Use a Pull Cord <small>leave now: ${clearedFloors(P.dive) ? 'keep the ' + clearedFloors(P.dive) + ' floor' + (clearedFloors(P.dive) === 1 ? '' : 's') + ' cleared' : 'no floor is cleared yet'} · you have ${haveGood(P.col, 'pullcord')}</small>`, color: 'bal-gold', off: !clearedFloors(P.dive) && 'No floor of this dive is cleared yet: there is nothing to keep', go: () => {
				const dive = P.dive, r = pullCord(dive, dive.floor - 1, dive.found);
				if (!r) { toast('No Pull Cord'); return toIdle(); }
				stopLive(); clearBattle(); P.S.over = null; P.dive = null; hub.H.target = null; toIdle();
				toast(`Out by the Pull Cord: ${goodName(dive.id)} is level ${r.to}${r.gems.length ? ', with ' + r.gems.length + ' gemstone' + (r.gems.length === 1 ? '' : 's') : ''}`); camp();
			} }] : [])], (P.map && P.map.floor ? 'Give up? The run stays on this floor.' : 'Give up? It won\'t count.') + (battleFallen().length ? ' The fallen stay gone.' : ''));
		P.menu.i = 1; menuMove(0); refreshHud();
	} });
	setMenu(items, S.phase === 'player' ? 'Turn ' + S.turn : 'Field');
	refreshHud();
}
/** End turn. With figurines that can still act it asks first: on a phone it sits beside Execute, and it cannot be undone.
 *  (Not while the coach is leading: its step IS "End turn".) */
function endTurnAsk() {
	const n = ready().length, end = () => { act({ t: 'end' }); toIdle(); };
	if (!n || P.coach) return end();
	P.mode = 'giveup';
	setMenu([{ label: 'End turn', color: 'bal-red', go: end }, { label: 'Keep playing', color: 'bal-green', go: () => toIdle() }], n === 1 ? 'End the turn? 1 figurine can still act.' : 'End the turn? ' + n + ' figurines can still act.');
	P.menu.i = 0; menuMove(0); refreshHud();
}
/** A dive left by a Pull Cord: banked as far as it is cleared, the dive on this device over. -> its report, or null (no cord) */
function pullCord(dive, cleared, found) {
	const tail = () => Math.floor(Math.random() * 36 ** 8).toString(36).padStart(6, '0');
	const b = bankPart(P.col, dive, cleared, found, { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem, takeGood }, tail);
	if (!b) return null;
	saveCol(b.col); saveDive(null);
	return b.report;
}
/** Online: leave the match (it counts as a loss; the others play on). */
function leaveAsk() {
	P.mode = 'giveup';
	setMenu([{ label: 'Leave', color: 'bal-red', go: () => { toIdle(); onlineLeave(); } }, { label: 'Keep playing', color: 'bal-green', go: () => toIdle() }], 'Leave the match? You lose; the others play on.');
	P.menu.i = 1; menuMove(0); refreshHud();
}
function confirm() {
	const S = P.S, c = P.cursor;
	if (S.over || !myTurn()) { if (P.menu) return menuPick(); return; }
	if (P.menu) return menuPick();
	if (P.mode === 'idle') {
		const u = unitAtCursor();
		if (mine(u)) { sfx.press(); return openUnit(u); }
		if (c.x === myBase().x && c.y === myBase().y && !u && reserve().length) { sfx.press(); return openDeploy(); }
		if (u) { sfx.press(); $('unit').classList.toggle('pt-open'); return refreshHud(); }   // (a foe: its status)
		sfx.press(); return openField();
	}
	if (P.mode === 'unit') return;   // (the menu is closed only by a tap outside it)
	if (P.mode === 'move') {
		if (!(P.hl.move || []).some(([x, y]) => x === c.x && y === c.y)) { sfx.error(); return; }
		act({ t: 'move', uid: P.sel, x: c.x, y: c.y }); const u = B.unit(S, P.sel); setHl(null); return openUnit(u);
	}
	if (P.mode === 'aim') {
		if (!(P.hl.aim || []).some(([x, y]) => x === c.x && y === c.y)) { sfx.error(); return; }
		const r = act({ t: 'attack', uid: P.sel, move: P.aimMove, x: c.x, y: c.y });
		if (r.ok) { toIdle(); toast(S.queue.length + ' queued: Execute runs them'); }
		return;
	}
	if (P.mode === 'throw-from') {
		if (!(P.hl.aim || []).some(([x, y]) => x === c.x && y === c.y)) { sfx.error(); return; }
		const u = B.unit(S, P.sel); P.throwFrom = { x: c.x, y: c.y }; P.mode = 'throw-to';
		const t = []; for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) if (Math.abs(x - u.x) + Math.abs(y - u.y) <= u.throw && isTile(S.map, x, y) && !B.unitAt(S, x, y) && !Geo.symbolAt(S, x, y)) t.push([x, y]);
		setHl({ aim: t }); refreshHud();
		return;
	}
	if (P.mode === 'throw-to') {
		const r = act({ t: 'throw', uid: P.sel, from: P.throwFrom, x: c.x, y: c.y });
		if (r.ok) toIdle();
	}
}
function moveCursor(action) {
	const [dx, dy] = stepFor(action), S = P.S;
	P.cursor.x = Math.max(0, Math.min(S.map.w - 1, P.cursor.x + dx)); P.cursor.y = Math.max(0, Math.min(S.map.h - 1, P.cursor.y + dy));
	follow(); previewArea(); hoverFoe(); rebuildOverlay(); refreshHud();
}
/** A tap on the board (touch / mouse), on tile (x, y): Disgaea's buttons, by touch. */
function tapTile(x, y) {
	const S = P.S, same = x === P.cursor.x && y === P.cursor.y;
	const inHl = (k) => (P.hl[k] || []).some(([a, b]) => a === x && b === y);
	P.cursor = { x, y }; previewArea(); rebuildOverlay();
	if (S.over || !myTurn()) { refreshHud(); return; }
	const u = B.unitAt(S, x, y);
	if (P.mode === 'unit' && u && u.uid === P.sel) { refreshHud(); return; }   // (its own tile: the commands stay open)
	if (P.mode === 'unit' && inHl('move')) { const me = B.unit(S, P.sel); act({ t: 'move', uid: me.uid, x, y }); return openUnit(B.unit(S, me.uid)); }
	if (P.mode === 'move') { if (inHl('move')) return confirm(); }
	else if (P.mode === 'aim') { if (inHl('aim')) { if (same) return confirm(); sfx.select && sfx.select(); refreshHud(); return; } }
	else if (P.mode === 'throw-from' || P.mode === 'throw-to') { if (inHl('aim')) return confirm(); }
	// anywhere else: close what is open, then the tap is a fresh one
	const wasOpen = P.mode !== 'idle';
	if (wasOpen) { P.mode = 'idle'; P.sel = null; setMenu(null); setHl(null); }
	if (mine(u)) { sfx.press(); return openUnit(u); }
	if (x === myBase().x && y === myBase().y && !u && reserve().length) { sfx.press(); return openDeploy(); }
	if (!u && same && !wasOpen) { sfx.press(); return openField(); }
	hoverFoe(); rebuildOverlay();   // (a tap on a foe: its range)
	refreshHud();
}
function onAction(action, o = {}) {
	if (!$('tip').hidden) hideTip();   // (the first press closes the tip, and still does its job)
	if (o.source) P.input = o.source === 'pad' ? 'pad' : 'key';
	if (MODE !== 'normal') return onWatchAction(action, o);
	if (hub.active) return hub.onAction(action, o);
	if (P.screen === 'editor' && editor) {
		if (editor.onAction(action, o)) return true;
		if ((action === 'prev' || action === 'next') && !o.repeat) { P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); }
		return true;
	}
	if (P.screen === 'mm' && mm) {
		if (!$('result').hidden) {   // (the run's results: V watches its replay, C copies the link, Z / X back to the camp)
			if (o.repeat) return true;
			if (action === 'context' && P.replayId) { sfx.press(); watchReplay(); } else if (action === 'secondary' && P.replayId) { sfx.press(); copyReplay(); } else if (action === 'confirm' && P.again) { const g = P.again; P.again = null; sfx.press(); g(); } else if (action === 'confirm' || action === 'cancel') camp();
			return true;
		}
		if (mm.onAction(action, o)) return true;
		if ((action === 'prev' || action === 'next') && !o.repeat) { P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); }
		return true;
	}
	if (P.screen === 'td' && td) {
		if (!$('result').hidden) {   // (the run's results: V watches its replay, C copies the link, Z / X back to the camp)
			if (o.repeat) return true;
			if (action === 'context' && P.replayId) { sfx.press(); watchReplay(); } else if (action === 'secondary' && P.replayId) { sfx.press(); copyReplay(); } else if (action === 'confirm' && P.again) { const g = P.again; P.again = null; sfx.press(); g(); } else if (action === 'confirm' || action === 'cancel') camp();
			return true;
		}
		if (td.onAction(action, o)) return true;
		if ((action === 'prev' || action === 'next') && !o.repeat) { P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); }
		return true;
	}
	if (P.S && P.S.over && !$('result').hidden) {
		if (P.replayId && (action === 'context' || action === 'secondary')) { sfx.press(); if (action === 'context') watchReplay(); else copyReplay(); return true; }
		// the arrows move between the results' buttons (Next, a figurine's "Set moves", the replay's, Back to camp); Z presses
		const bs = resultButtons();
		if (['up', 'down', 'left', 'right'].includes(action) && bs.length) { const d = action === 'up' || action === 'left' ? -1 : 1; resultFocus((P.rfocus + d + bs.length) % bs.length); sfx.select && sfx.select(); return true; }
		if (action === 'confirm') { const b = bs[P.rfocus]; if (b) b.click(); else camp(); return true; }
		if (action === 'cancel') { camp(); return true; }
		return true;
	}
	if (P.busy) { if ((action === 'confirm' || action === 'cancel') && !o.repeat) P.skip = true; return true; }   // (a press speeds the rest up)
	if (!P.S) return true;
	if (!$('log').hidden) { hideLog(); if (action === 'cancel') return true; }   // (any key closes the log; X only closes it, the rest still act)
	if (P.S.over && action === 'confirm') { showResult(); return true; }
	if (['up', 'down', 'left', 'right'].includes(action)) {
		if (P.menu) { menuMove(action === 'up' || action === 'left' ? -1 : 1); return true; }
		moveCursor(action); return true;
	}
	if (action === 'confirm') { confirm(); return true; }
	if (action === 'cancel') { if (P.mode !== 'idle' || P.menu) back(); return true; }
	if (action === 'context') { if (P.S.queue.length && myTurn()) { sfx.press(); act({ t: 'execute' }); if (P.mode === 'field') toIdle(); } else { sfx.error(); toast('Nothing queued: Attack first'); } return true; }   // V / Y: Execute
	if (action === 'menu') { if (P.mode === 'field') back(); else if (myTurn() || (P.online && !P.S.over)) { sfx.press(); P.mode = 'idle'; setMenu(null); openField(); } return true; }
	if (action === 'prev' || action === 'next') { if (o.repeat) return true; P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); return true; }
	if (action === 'secondary') { $('unit').classList.toggle('pt-open'); return true; }   // C / X: status
	return false;
}
function afterAct() { refreshHud(); rebuildOverlay(); }

// ---------------------------------------------------------------- the camera on touch: drag to look around, pinch to zoom
const ZOOM_MIN = 1;
/** How far in the board zooms: 3x, more on a big board (a 32 x 32 made map: 6.4x), so a tile is as big as on a small one. */
const zoomMax = () => Math.max(3, P.S && P.S.map ? (P.S.map.w + P.S.map.h) / 10 : 3);
function setZoom(z) {
	P.zoom = Math.max(ZOOM_MIN, Math.min(zoomMax(), z));
	if (P.zoom <= 1.001) P.pan = { x: 0, z: 0 };
	$('b-zoom').textContent = P.zoom >= zoomMax() - 0.01 ? '－' : '＋';
	clampPan(); placeCam();
}
function clampPan() { if (!P.S) return; const w = P.S.map.w * CELL / 2, h = P.S.map.h * CELL / 2; P.pan.x = Math.max(-w, Math.min(w, P.pan.x)); P.pan.z = Math.max(-h, Math.min(h, P.pan.z)); }
/** Pan the view by a screen drag of (dx, dy) CSS px: the ground under the finger stays under it. */
function panBy(dx, dy) {
	const yaw = camYaw(), k = (camera.right - camera.left) / innerWidth;
	const r = [-Math.cos(yaw), Math.sin(yaw)], f = [Math.sin(yaw), Math.cos(yaw)], s = 1 / Math.sin(PITCH);
	P.pan.x -= r[0] * dx * k; P.pan.z -= r[1] * dx * k;
	P.pan.x += f[0] * dy * k * s; P.pan.z += f[1] * dy * k * s;
	clampPan(); placeCam();
}
/** Zoomed in, keep the cursor on screen (keys / pad move it off the edge). */
function follow(centre) {
	if (!P.S || P.zoom <= 1.001) return;
	const [sx, sy] = window.__poketactica.screenOf(P.cursor.x, P.cursor.y);
	if (!centre && sx > innerWidth * 0.15 && sx < innerWidth * 0.85 && sy > innerHeight * 0.2 && sy < innerHeight * 0.8) return;
	const [wx, , wz] = world(P.cursor.x, P.cursor.y);
	P.pan = { x: wx - P.S.map.w * CELL / 2, z: wz - P.S.map.h * CELL / 2 }; clampPan(); placeCam();
}
/**
 * The view's centre moved part of the way (k: 0..1) toward a point BETWEEN tiles (Mystery Maze: the camera walks with the
 * leader as its sprite glides, mmmode.js camGlide; owner, 2026-11-25: "movement is very choppy, jerking the camera
 * around"). A point more than 3 tiles off is cut to at once (a warp, a new floor). -> how far is left, in tiles
 */
function panToward(x, y, k) {
	if (!P.S || P.zoom <= 1.001) return 0;
	const tx = x * CELL + CELL / 2 - P.S.map.w * CELL / 2, tz = y * CELL + CELL / 2 - P.S.map.h * CELL / 2;
	const dx = tx - P.pan.x, dz = tz - P.pan.z, far = Math.hypot(dx, dz) / CELL, q = far > 3 ? 1 : Math.max(0, Math.min(1, k));
	P.pan = { x: P.pan.x + dx * q, z: P.pan.z + dz * q }; clampPan(); placeCam();
	return far * (1 - q);
}
/** The tile under a screen point. A unit's sprite stands above its tile and hides the tiles behind it, so: the sprite's
 *  tile when it is highlighted (a foe to aim at) or nothing is; else a highlighted tile of ground under the sprite (a tile
 *  to move to, or to aim at, right behind one of yours); else the sprite's; else the ground's. */
function pickTile(cx, cy, ray, ndc) {
	const sp = spriteAt(cx, cy), gr = groundAt(cx, cy, ray, ndc);
	const hl = [...(P.hl.move || []), ...(P.hl.aim || [])], inHl = (t) => t && hl.some(([x, y]) => x === t[0] && y === t[1]);
	return inHl(sp) ? sp : inHl(gr) ? gr : sp || gr;
}
function spriteAt(cx, cy) {
	let best = null;
	for (const o of P.drawn || []) {
		if (o.u.x == null) continue;
		const [fx, fy] = project(o.wx, o.wy, o.wz), [, hy] = project(o.wx, o.wy + 2.2, o.wz);
		const hgt = Math.max(24, fy - hy), half = Math.max(14, hgt * 0.38);
		if (cx >= fx - half && cx <= fx + half && cy >= fy - hgt && cy <= fy + 8 && (!best || fy > best.fy)) best = { fy, x: o.u.x, y: o.u.y };
	}
	return best ? [best.x, best.y] : null;
}
function groundAt(cx, cy, ray, ndc) {
	ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
	ray.setFromCamera(ndc, camera);
	const hit = board ? ray.intersectObjects(board.pick, false)[0] : null;
	if (!hit) return null;
	// (a hit on a cliff's side face belongs to the tile it faces away from: step a hair into the surface)
	const p = hit.point.clone().addScaledVector(ray.ray.direction, 0.05);
	const x = Math.floor(p.x / CELL), y = Math.floor(p.z / CELL);
	return isTile(P.S.map, x, y) ? [x, y] : null;
}

function showResult() {
	if (MODE !== 'normal') return watchResult();
	if (P.online) return onlineResult();
	const S = P.S, r = paidResults(), el = $('result');
	if (P.resultShown && !el.hidden) return;   // (refreshHud asks again after every redraw: build it once)
	P.resultShown = true;
	clearBattle(); hideLog(); $('fc').hidden = true; $('coach').hidden = true;
	applyBattle();
	const rep = P.report || { levels: [], caught: [], stars: 0, owed: [], figurines: [] };
	el.hidden = false;
	setMenu(null); $('hint').textContent = '';
	$('r-title').textContent = S.over === 'won' ? 'Victory!' : 'Defeat';
	$('r-body').innerHTML = S.over === 'won'
		? `<p>Bonus Gauge level ${r.bonusLevel}${r.half ? ' <span class="bal-muted">· Training is safe, so its stars and EXP pay half</span>' : ''}</p><ul class="bal-list">${r.bonus.map((b) => `<li>Lv ${b.level}: ${esc(bonusSay(b))}</li>`).join('') || '<li class="bal-muted">nothing yet: fill the gauge with KOs, combos and Geo chains</li>'}</ul>${r.captured.length ? `<p>Caught: ${r.captured.map((f) => (P.data.species[f.species] || {}).name).join(', ')}</p>` : ''}`
		: P.setup && P.setup.perma ? '<p>Your figurines were all knocked out.</p>' : '<p>Your figurines were all knocked out. What they learned, they keep.</p>';
	// the fallen (permanent loss): who was lost in this battle, and what went with them
	{
		const fell = battleFallen();
		if (fell.length) $('r-body').innerHTML += `<div class="pt-fallen"><p><b>☠ Fallen</b> <span class="bal-muted">gone for good</span></p><ul class="bal-list">${fell.map((e) => `<li><b>${esc(nameOf(e.fig.species))}</b>${e.fig.shiny ? ' ★' : ''} Lv ${e.fig.level}${e.fig.held ? ' <span class="bal-muted">with its ' + esc(goodName(e.fig.held)) + '</span>' : ''}</li>`).join('')}</ul></div>`;
	}
	$('r-body').innerHTML += unitsHtml(rep.units || [])
		+ (rep.first ? `<p>First clear of ${P.map.name}! +${rep.first.stars} ★${rep.first.fig ? ' and a ' + nameOf(rep.first.fig.species) + ' figurine (Lv ' + rep.first.fig.level + ')' : ''}${nextMap(P.col.cleared) ? ' · next: ' + nextMap(P.col.cleared).name : ' · the campaign is cleared!'}</p>` : '')
		+ (rep.floor ? `<p>Floor ${rep.floor.floor} cleared! +${rep.floor.stars} ★${rep.floor.fig ? ' and a ' + nameOf(rep.floor.fig.species) + ' figurine (Lv ' + rep.floor.fig.level + ')' : ''}${rep.floor.checkpoint ? ' · checkpoint: new runs can start on floor ' + (rep.floor.floor + 1) : ''} · next: floor ${rep.floor.floor + 1}</p>` : '')
		+ iwResultHtml(rep)
		+ (rep.runEnd ? `<p>The run ends on floor ${rep.runEnd.floor}. New runs can start on floor ${startFloors(P.col.deep).join(', ')}.</p>` : '')
		+ (rep.stars ? `<p>+${rep.stars} ★ banked · ★ ${Stars.stars()} in your star wallet</p>` : '')
		+ (rep.figurines.length ? `<p>New figurines: ${rep.figurines.map((f) => nameOf(f.species) + ' Lv ' + f.level).join(', ')}</p>` : '')
		+ (rep.owed.length ? '<p id="r-owed" class="bal-muted">Paying the gauge’s items and packs…</p>' : '');
	if (P.paid) P.paid.then((p) => { const o = $('r-owed'); if (o) o.innerHTML = owedText(p); });
	$('r-again').innerHTML = 'Back to camp <span class="bal-key">X</span>';
	$('r-again').className = 'bal-btn bal-grey';
	againButton(null);   // (a battle's own Next / Try again is made by resultActs)
	resultActs();
	animateBars();
}
/** Each figurine that went in (owner, 2026-11-21: "show exp gain/leveling up for each unit after combat"): its EXP gained,
 *  its bar filling (to the top and round again on a level up), the moves it learned (a button to its move slots) and the
 *  move levels its moves reached. */
function unitsHtml(units) {
	if (!units.length) return '';
	const frac = (exp, lv) => { if (lv >= MAX_LEVEL) return 1; const a = expForLevel(lv), b = expForLevel(lv + 1); return Math.max(0, Math.min(1, (exp - a) / Math.max(1, b - a))); };
	const rows = units.map((u) => {
		const sp = P.data.species[u.species] || {}, up = u.to > u.from;
		const mv = (id) => esc((P.data.moves[id] || {}).name || id);
		const learned = u.newMoves.length ? `<div class="pt-ru-new">New move${u.newMoves.length > 1 ? 's' : ''}: <b>${u.newMoves.map(mv).join(', ')}</b> <button class="bal-btn bal-sm bal-purple pt-setmoves" data-fig="${esc(u.id)}">Set moves</button></div>` : '';
		const ups = u.moves.filter((m) => m.to > m.from).map((m) => `${mv(m.id)} Lv ${m.to}`);
		return `<div class="pt-ru${up ? ' pt-ru-up' : ''}" data-uid="${esc(u.uid)}">
			<img src="${sp.sprite ? '/overworld/data/pokemon/' + esc(sp.sprite) : ''}" alt="" draggable="false">
			<div class="pt-ru-main">
				<div class="pt-ru-head"><b>${esc(sp.name || u.species)}</b><span class="pt-ru-lv">Lv ${u.from}${up ? ` → <b>${u.to}</b>` : ''}</span>${up ? '<span class="bal-badge bal-gold pt-lvup">LEVEL UP!</span>' : ''}<span class="pt-ru-exp">${u.gained ? '+' + u.gained + ' EXP' : 'no EXP'}</span></div>
				<div class="bal-bar pt-ru-bar"><div class="bal-bar-fill" style="width:${(100 * frac(u.expFrom, u.from)).toFixed(1)}%" data-to="${(100 * frac(u.expTo, u.to)).toFixed(1)}" data-laps="${u.to - u.from}"></div></div>
				${u.evolve ? '<div class="pt-ru-evo"><span class="bal-badge bal-purple">✨ Can evolve</span> <span class="bal-muted">in Squad</span></div>' : ''}${learned}${ups.length ? `<div class="pt-ru-moves bal-muted">Move levels: ${ups.join(', ')}</div>` : ''}
			</div></div>`;
	}).join('');
	return `<div class="pt-res-units">${rows}</div>`;
}
function animateBars() {
	const quick = reducedMotion();
	for (const el of document.querySelectorAll('#result .pt-ru-bar .bal-bar-fill')) {
		const to = el.dataset.to + '%', laps = +el.dataset.laps || 0;
		if (quick) { el.style.width = to; continue; }
		requestAnimationFrame(() => {
			if (!laps) { el.style.width = to; return; }
			el.style.width = '100%';   // (to the top, then round again from empty)
			setTimeout(() => { el.style.transition = 'none'; el.style.width = '0%'; void el.offsetWidth; el.style.transition = ''; el.style.width = to; }, 650);
		});
	}
	for (const b of document.querySelectorAll('#result .pt-setmoves')) b.addEventListener('click', () => { const id = b.dataset.fig; camp(); hub.moves(id, { back: () => hub.home() }); });
}
const resultButtons = () => [...document.querySelectorAll('#result .pt-setmoves, #result .bal-modal-acts .bal-btn')];
/**
 * ONE RESULTS SCREEN (improvement plan, 2026-11-25): a battle's results offered "Next" or "Try again"; Tower Defense's and
 * Mystery Maze's only "Back to camp". Their results now have "Again" too, the same orange button, on Z: it goes to that
 * map's or dungeon's own way in (the squad or the party is picked there, as always). againButton(null) takes it away.
 */
function againButton(label, go) {
	const box = $('r-again').parentNode;
	box.querySelectorAll('.pt-again').forEach((b) => b.remove());
	P.again = null;
	if (!go) return;
	const b = document.createElement('button');
	b.className = 'bal-btn bal-orange pt-again pt-next'; b.id = 'r-more';
	b.innerHTML = label + ' <span class="bal-key">Z</span>';
	b.addEventListener('click', () => { const g = P.again; P.again = null; sfx.press(); if (g) g(); });
	box.insertBefore(b, box.firstChild);
	P.again = go;
}
function resultFocus(i) { const bs = resultButtons(); P.rfocus = Math.max(0, Math.min(bs.length - 1, i)); bs.forEach((b, k) => b.classList.toggle('is-focus', k === P.rfocus)); P.rfocusEl = bs[P.rfocus] || null; }
/** What the results' first button plays next: the next map / floor after a win, the same battle again after a loss. */
function nextTarget() {
	const t = P.target, won = P.S && P.S.over === 'won';
	if (!t) return null;
	if (t.kind === 'dungeon') return P.run ? { kind: 'dungeon', run: P.run } : null;
	if (t.kind === 'item') return P.dive ? { kind: 'item', dive: P.dive } : null;   // (a lost floor ends the dive: no "Try again")
	if (t.kind === 'custom') return null;   // (an old solo made-map battle: no "Try again", made maps are Versus-only now)
	if (t.kind === 'map' && won) { hub.H.target = null; const n = hub.continueTarget(); return n.kind === 'map' ? n : null; }
	return t;
}
/** What the gauge's items and packs became, for the results screen. */
function owedText(p) {
	if (!p) return 'The gauge’s items and packs could not be paid on this device.';
	const out = [];
	if (p.items.length) out.push(p.items.map((id) => ITEM_NAMES[id] || id).join(', ') + ': in your Bag the next time you open the overworld');
	if (p.pocket) out.push(p.pocket + ' Pocket Enhanced pack' + (p.pocket > 1 ? 's' : ''));
	const b = p.battlecards;
	if (b.want) out.push(b.pending ? b.want + ' Battlecards pack' + (b.want > 1 ? 's' : '') + ': sign in to claim' : b.paid ? b.paid + ' Battlecards pack' + (b.paid > 1 ? 's' : '') + ' in your pack inbox' + (b.capped ? ' (the rest: today’s limit reached)' : '') : 'Battlecards packs: today’s limit reached');
	return out.map((l) => '<span>' + l + '</span>').join('<br>');
}
function newGame() {   // (the training board with no team: what the camp is drawn over)
	$('result').hidden = true;
	P.seed = 'training-' + Date.now().toString(36);
	P.setup = trainingSetup([], 5, P.data, 'preview');
	P.S = B.newBattle(P.seed, P.setup, P.data);
	P.actions = []; P.anims = []; P.disp = null; P.busy = false; P.mode = 'idle'; P.sel = null; P.cursor = { ...P.S.map.base };
	buildScene(P.S.map); placeCam(); setMenu(null); setHl(null); refreshHud();
}

// ---------------------------------------------------------------- the camp (js/hub.js): the player's own figurines
const nameOf = (sp) => (P.data.species[sp] || {}).name || sp;
const signedIn = () => (MP.hasToken() ? (MP.cachedState() && MP.cachedState().username) || null : null);
/** Every figurine's pool brought up to its level (figurine.js learnedTo: it only adds). The first time this changes a
 *  collection on this device, the copy as it was is kept under <key>_bak_learn1 (the rollback: put it back under the key). */
function upgradeLearned(col, where) {
	if (!col || !col.figs) return col;
	let changed = false; const figs = {};
	for (const [id, f] of Object.entries(col.figs)) { const g = learnedTo(f, P.data); if (g !== f) changed = true; figs[id] = g; }
	if (!changed) return col;
	const bak = FIGS_KEY + '_bak_learn1';
	if (!lsGet(bak)) { const raw = lsGet(FIGS_KEY); if (raw) lsSet(bak, raw); }
	const out = { ...col, figs };
	if (where === 'local') setFigs(out);
	return out;
}
function saveCol(c) { P.col = c; setFigs(c); if (P.sync) P.sync.soon(); }
let hub = null, editor = null;
let td = null;   // (Tower Defense: tdmode.js)
let mm = null;   // (Mystery Maze: mmmode.js)
function camp(focus) {
	againButton(null);
	stopLive();
	endOnline();
	if (editor) editor.close();
	if (td) td.close();
	if (mm) mm.close();
	if (focus === 'maps') { P.screen = 'camp'; $('result').hidden = true; hideTip(); setMenu(null); setHl(null); $('hint').textContent = ''; $('unit').hidden = true; return hub.maps(); }
	P.screen = 'camp'; $('result').hidden = true; hideTip(); setMenu(null); setHl(null); $('hint').textContent = ''; $('unit').hidden = true;
	if (!list(P.col).length) return hub.starters();   // (a new player, or one whose every figurine was lost: three starters, free)
	return hub.home(focus);
}
/** The Mystery Maze run saved on this device, or null. */
function savedMm() {
	try { const o = JSON.parse(lsGet(MM_KEY) || 'null'); return o && o.v === 1 && validRecipe(o.recipe) && o.recipe.kind === 'mm' ? o : null; } catch { return null; }
}
function resumeMm() {
	const o = savedMm();
	if (!o) { toast('No run to resume'); return camp(); }
	hub.close();
	P.replayId = null;
	if (!mm.resume(o)) { toast('That run could not be resumed'); camp(); }
}
/** A signed-in player's Mystery Maze run goes live for friends (mmmode.js broadcast): what they see. */
function mmLive(getSnap, getLabel, getBet) {
	stopLive();
	if (MODE !== 'normal' || !Net.isLoggedIn()) return;
	live = Net.startPublisher(getSnap, getLabel, { bet: getBet });
}
/** A spectator: the Mystery Maze run they were watching is over. */
function mmSpecOver() {
	const v = mm.view();
	$('result').hidden = false;
	$('r-title').textContent = 'The run is over';
	$('r-body').innerHTML = `<p>${esc(SPECTATE)} reached <b>B${v.floor}F</b> of ${esc(v.dungeon)}.</p>` + (P.spec && P.spec.replay ? '<p class="bal-muted">Its replay is ready.</p>' : '');
	$('r-again').textContent = P.spec && P.spec.replay ? 'Watch the whole run' : 'Close';
}
/** Into a Mystery Maze dungeon with these figurines (the first leads). */
function startMm(dungeonId, team, opts = {}) {
	const d = typeof dungeonId === 'string' ? mmDungeonById(dungeonId) : dungeonId;
	if (!d || !team.length) return false;
	if (opts.pack && savedMm()) { toast('You have a run in progress: resume it first'); return false; }   // (what it carries is out of the storage)
	// what is packed leaves the storage, and the stars to carry leave the wallet: they are in the dungeon now (opts.bag
	// and a bare opts.stars with no opts.pack are a test's: nothing is taken from anywhere)
	let bag = (opts.bag || []).map((it) => ({ ...it })), stars = opts.stars | 0;
	if (opts.pack && MODE === 'normal' && !d.lv5) {
		let c = P.col;
		for (const id of opts.pack.slice(0, 20)) {
			const next = mmStoreTake(c, id);
			if (!next) continue;
			c = next;
			const pile = MM_ITEMS[id].stack ? bag.find((b) => b.id === id) : null;
			if (pile) pile.n = (pile.n || 1) + 1; else bag.push({ id });
		}
		stars = Math.max(0, Math.min(stars, Stars.stars()));
		if (stars > 0 && !Stars.spend(stars)) stars = 0;
		saveCol(c);
		if (stars > 0 && signedIn()) Stars.sync((a, b) => MP.call(a, b)).catch(() => {});
	}
	// (a dive into a held item, played as a Mystery Maze: the dive is kept on this device while the run is, so its end knows
	// which item to level; itemworld.js)
	if (d.iw && MODE === 'normal') {
		const dive = opts.iwUid && (P.col.items || {})[opts.iwUid] === d.iw.id ? newDive(opts.iwUid, d.iw.id, d.iw.from, 'maze', Date.now(), opts.iwBack || null) : null;
		if (!dive) { toast('That item is not in your bag'); return false; }
		saveDive(dive);
	}
	hub.close();
	P.replayId = null;
	return mm.open(d, team, { ...opts, bag, stars });
}
/** A figurine fell in the maze: it is gone, now (the permanent-loss rule; figcol.js loseFig). */
function mmLost(e, where) {
	if (MODE !== 'normal' || !e.id || !P.col.figs[e.id]) return;
	saveCol(loseFig(P.col, e.id, { at: Date.now(), where, by: '' }));
}
/** A Mystery Maze run is over: what happened, and what it leaves (mm/rewards.js): EXP, recruits, the storage, stars. */
function mmResult(run) {
	const S = run.S, o = S.over, el = $('result');
	if (MODE === 'normal') noteDaily({ floors: Math.max(0, (S.floorNo | 0) - (o && o.won ? 0 : 1)), kos: S.kills | 0 });   // (the day's tasks: floors cleared this run)
	// the run's recipe goes to the tape store (signed in); the last push hands spectators its replay
	{
		const pub = live; live = null;
		Net.uploadReplay(run.recipe).then((id) => {
			P.replayId = id;
			if (pub) pub.finish({ won: !!o.won, replay: id }).catch(() => {});
			if (id && !$('result').hidden && P.screen === 'mm') {
				const box = $('r-again').parentNode;
				box.querySelectorAll('.pt-rp').forEach((b) => b.remove());
				const add = (label, color, go) => { const b = document.createElement('button'); b.className = 'bal-btn pt-rp ' + color; b.innerHTML = label; b.addEventListener('click', go); box.insertBefore(b, $('r-again')); };
				add('Watch replay <span class="bal-key">V</span>', 'bal-blue', watchReplay);
				add('Copy link <span class="bal-key">C</span>', 'bal-grey', copyReplay);
			}
		});
	}
	const out = mmOutcome(S);
	let report = { stars: 0, prize: 0, stored: 0, dropped: 0, recruits: [], units: [], record: false, first: false };
	if (MODE === 'normal') {
		const r = applyMmRewards(P.col, out, run.dungeon, P.data, Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36));
		report = r.report;
		saveCol(r.col);
		if (report.stars > 0) { Stars.earn(report.stars); if (signedIn()) Stars.sync((a, b) => MP.call(a, b)).catch(() => {}); }
	}
	// a dive into an item: clearing it banks the dive (the item's level, and what every floor held); anything else banks nothing
	let iwHtml = '';
	if (run.dungeon.iw && MODE === 'normal') {
		const iw = run.dungeon.iw, dive = loadDive(), mine = dive && dive.style === 'maze' && dive.id === iw.id && dive.from === iw.from ? dive : null;
		if (P.iwPull) {
			const r = P.iwPull; P.iwPull = null;
			iwHtml = `<div class="pt-iw-bank" id="r-iw"><p><span class="bal-badge bal-gold">Pull Cord</span> You left the <b>${esc(goodName(iw.id))}</b> early: it is now <b>level ${r.to}</b> <span class="bal-muted">(was ${r.from})</span>${r.slotsTo > r.slotsFrom ? ' · <b>a new slot!</b>' : ''}.</p>${r.gems.length ? '<p>Brought out: ' + esc(r.gems.map((g) => gemName(g)).join(', ')) + '</p>' : ''}<p class="bal-muted">The Stitching Kit stays at the exit.</p></div>`;
		} else if (o.won && mine) {
			const found = diveFloors(iw.from).flatMap((f) => findsOf(mine.seed, f)), tail = () => Math.floor(Math.random() * 36 ** 8).toString(36).padStart(6, '0');
			const b = bankDive(P.col, { ...mine, floor: iw.exit, found }, { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem }, tail);
			saveCol(b.col);
			iwHtml = iwResultHtml({ iw: { id: iw.id, floor: iw.exit, stars: 0, finds: [], exit: iw.exit, bank: b.report } });
		} else {
			iwHtml = `<p id="r-iw">The dive into the <b>${esc(goodName(iw.id))}</b> is over. Nothing was banked: the item is as it was (level ${iw.from}).</p>`;
			if (mine && mine.back) saveCol(reholdItem(P.col, mine.back, mine.uid, Math.floor(Math.random() * 36 ** 8).toString(36).padStart(6, '0')));   // (back onto the figurine it was taken off, if it lives)
		}
		if (mine) saveDive(null);
		hub.H.target = null;
	}
	P.mmReport = report;
	el.hidden = false; $('hint').textContent = '';
	$('r-title').textContent = o.won ? (run.dungeon.iw ? 'Exit cleared!' : 'Dungeon cleared!') : o.escaped ? 'Escaped' : o.quit ? 'Gave up' : 'The party fell';
	const fallen = S.fallen.map((f) => nameOf(f.species));
	$('r-body').innerHTML = `<p><b>${esc(run.dungeon.name)}</b> · reached B${S.floorNo}F · ${out.kills} knocked out${report.record ? ' <span class="bal-badge bal-gold">New record!</span>' : ''}</p>`
		+ (out.kept ? `<p>+${report.stars} ★ banked${report.prize ? ` (${report.first ? 'first clear' : 'clear'}: ${report.prize} ★)` : ''} · ★ ${Stars.stars()} in your star wallet</p>`
			+ ((report.goods || []).length ? `<p>Held items found: ${report.goods.map((id) => esc(goodName(id))).join(', ')} <small>(with your items, at the camp)</small></p>` : '')
			+ (out.items.length ? `<p>Into storage: ${S.bag.filter((it) => !it.unpaid && (MM_ITEMS[it.id] || {}).group !== 'good').map((it) => esc(mmItemName(it))).join(', ')}${report.dropped ? ` <span class="ph-td-none">(${report.dropped} did not fit: the storage is full)</span>` : ''}</p>` : '')
			+ (report.recruits.length ? `<p>Joined you: ${report.recruits.map((f) => esc(nameOf(f.species)) + ' Lv ' + f.level).join(', ')}</p>` : '')
			: `<p class="bal-muted">Everything found on the run was lost${out.carried ? ', and the ' + out.carried + ' ★ you carried in' : ''}.</p>`)
		+ iwHtml
		+ unitsHtml(report.units)
		+ (fallen.length ? `<p class="pt-fallen">Gone for good: ${fallen.map(esc).join(', ')}</p>` : '');
	$('r-again').innerHTML = 'Back to camp <span class="bal-key">X</span>';
	$('r-again').className = 'bal-btn bal-grey';
	// (again: the same dungeon's party screen; a dive into an item is started from the Item World, not from here)
	againButton(run.dungeon.iw || MODE !== 'normal' ? null : 'Again: ' + esc(run.dungeon.name), run.dungeon.iw ? null : () => { const id = run.dungeon.id; camp(); hub.again({ mm: id }); });
	animateBars();
}
/** Into a Tower Defense run (the camp's Tower Defense screens): a map, a squad (figurines, in order), a start wave. */
function startTd(mapId, squad, startWave, hero = null) {
	if (!squad.length) return;
	hub.close();
	P.replayId = null;
	td.open(mapId, squad, { startWave, best: (P.col.td || {})[mapId] || 0, hero });   // (hero: Maze Builder's, td/heroes.js)
}
/** The Tower Defense run saved on this device, or null. */
function savedTd() {
	try { const o = JSON.parse(lsGet(TD_KEY) || 'null'); return o && o.v === 1 && validRecipe(o.recipe) && o.recipe.kind === 'td' ? o : null; } catch { return null; }
}
function resumeTd() {
	const o = savedTd();
	if (!o) { toast('No run to resume'); return camp(); }
	hub.close();
	P.replayId = null;
	if (!td.resume(o, { best: (P.col.td || {})[o.recipe.map] || 0 })) { lsSet(TD_KEY, null); toast('That run could not be resumed'); camp(); }
}
/** A signed-in player's Tower Defense run goes live for friends (tdmode.js broadcast): the recipe so far and its tick. */
function tdLive(getSnap, getLabel, getBet) {
	stopLive();
	if (MODE !== 'normal' || !Net.isLoggedIn()) return;
	live = Net.startPublisher(getSnap, getLabel, { bet: getBet });
}
/** A Tower Defense run is over: its stars, EXP, move XP and the map's record are paid, once, and shown. */
function tdResult(run) {
	const S = run.S, el = $('result');
	lsSet(TD_KEY, null);
	// the run's recipe goes to the tape store (signed in); the last push hands spectators its replay
	{
		const pub = live; live = null;
		Net.uploadReplay(run.recipe).then((id) => {
			P.replayId = id;
			if (pub) pub.finish({ won: !!run.record, replay: id }).catch(() => {});
			if (id && !$('result').hidden && P.screen === 'td') {
				const box = $('r-again').parentNode;
				box.querySelectorAll('.pt-rp').forEach((b) => b.remove());
				const add = (label, color, go) => { const b = document.createElement('button'); b.className = 'bal-btn pt-rp ' + color; b.innerHTML = label; b.addEventListener('click', go); box.insertBefore(b, $('r-again')); };
				add('Watch replay <span class="bal-key">V</span>', 'bal-blue', watchReplay);
				add('Copy link <span class="bal-key">C</span>', 'bal-grey', copyReplay);
			}
		});
	}
	// (Maze Builder: the best wave over its maps opens heroes: what it was before this run, to say who this run opened)
	const mazeBestOf = (c) => Math.max(0, ...TD_MAZE_MAPS.map((m) => ((c && c.td) || {})[m.id] || 0));
	const mazeBefore = mazeBestOf(P.col);
	const rewarded = applyTdRewards(P.col, run.squad.map((f) => f.id), tdRewards(S), run.map.id, P.data), report = rewarded.report;
	// (Maze Builder: each hero's own best wave, kept beside the maps' records as 'hero-<id>')
	const heroKey = tdIsMaze(run.map) && run.hero && tdHeroById(run.hero) ? 'hero-' + run.hero : null;
	const col = heroKey && S.cleared > ((rewarded.col.td || {})[heroKey] || 0) ? { ...rewarded.col, td: { ...(rewarded.col.td || {}), [heroKey]: S.cleared } } : rewarded.col;
	if (heroKey) report.heroBest = { hero: run.hero, best: (col.td || {})[heroKey] || 0, record: col !== rewarded.col };
	saveCol(col);
	if (report.stars > 0) { Stars.earn(report.stars); if (signedIn()) Stars.sync((a, b) => MP.call(a, b)).catch(() => {}); }
	P.tdReport = report;
	if (MODE === 'normal') noteDaily({ waves: Math.max(0, S.cleared - Math.max(0, (run.recipe && run.recipe.startWave ? run.recipe.startWave : 1) - 1)), kos: S.kills | 0 });   // (the day's tasks: waves cleared this run)
	el.hidden = false; $('hint').textContent = '';
	$('r-title').textContent = S.over === 'retired' ? 'Retired' : 'The base fell';
	$('r-body').innerHTML = `<p><b>Wave ${S.cleared}</b> cleared on ${esc(run.map.name)}${S.cleared && tdBossWave(S.cleared) ? ' (a boss wave: a checkpoint, new runs can start on wave ' + (S.cleared + 1) + ')' : ''}.${report.record ? ' <span class="bal-badge bal-gold">New record!</span>' : report.best ? ' <span class="bal-muted">Best: wave ' + report.best + '</span>' : ''}</p>
		<p class="bal-muted">${S.kills} knocked out</p>${tdHeroLine(run, mazeBefore, mazeBestOf(col))}${tdDealtLine(run)}`
		+ unitsHtml(report.units)
		+ (report.stars ? `<p>+${report.stars} ★ banked · ★ ${Stars.stars()} in your star wallet</p>` : '');
	$('r-again').innerHTML = 'Back to camp <span class="bal-key">X</span>';
	$('r-again').className = 'bal-btn bal-grey';
	// (again: the same map's way in: its start wave, its hero, its squad)
	againButton(MODE !== 'normal' ? null : 'Again: ' + esc(run.map.name), () => { const id = run.map.id; camp(); hub.again({ td: id }); });
	animateBars();
}
/** The result's line on Maze Builder's hero: who the run was played as, who it opened, who opens next. */
function tdHeroLine(run, before, after) {
	if (!tdIsMaze(run.map)) return '';
	const h = run.hero && tdHeroById(run.hero), opened = TD_HEROES.filter((x) => x.unlock > before && x.unlock <= after), next = TD_HEROES.filter((x) => x.unlock > after).sort((a, b) => a.unlock - b.unlock)[0];
	const hb = P.tdReport && P.tdReport.heroBest;
	return (h ? `<p id="r-hero">Played as <b>${esc(h.name)}</b> <span class="bal-muted">${run.S.passives.length} passive${run.S.passives.length === 1 ? '' : 's'}</span>${hb && hb.record ? ' <span class="bal-badge bal-gold">' + esc(h.name) + '\'s best!</span>' : hb && hb.best ? ' <span class="bal-muted">· ' + esc(h.name) + '\'s best: wave ' + hb.best + '</span>' : ''}</p>` : '')
		+ opened.map((x) => `<p class="pt-hero-open"><span class="bal-badge bal-gold">New hero!</span> <b>${esc(x.name)}</b> <span class="bal-muted">${esc(x.title)} can now be picked</span></p>`).join('')
		+ (next ? `<p class="bal-muted" id="r-nexthero">${esc(next.name)} opens when you clear wave ${next.unlock} in Maze Builder (your best: ${after})</p>` : '');
}
/** ... and on who did the work: the damage each figurine on the board dealt, the most first. */
function tdDealtLine(run) {
	const rows = (run.dealt || []).filter((d) => d.n > 0).sort((a, b) => b.n - a.n);
	if (!rows.length) return '';
	const top = rows[0].n;
	return '<div class="pt-dealt" id="r-dealt"><p class="bal-muted">Damage dealt</p>' + rows.map((d) => `<div class="pt-dealt-row"><span>${esc(nameOf(d.species))}</span><span class="pt-dealt-bar"><i style="width:${Math.max(4, Math.round(d.n / top * 100))}%"></i></span><b>${d.n.toLocaleString('en-US')}</b></div>`).join('') + '</div>';
}
/** The result's lines on an Item World floor: what was found, and on the exit what the dive banked. */
function iwResultHtml(rep) {
	const findSay = (f) => (f.k === 'kit' ? 'a Stitching Kit' : 'a ' + gemName(f.gem));
	if (rep.iwEnd) return `<p id="r-iw">The dive into the <b>${esc(goodName(rep.iwEnd.id))}</b> ends on floor ${rep.iwEnd.floor}. Nothing was banked${rep.iwEnd.found ? ': the ' + rep.iwEnd.found + ' thing' + (rep.iwEnd.found === 1 ? '' : 's') + ' found stay' + (rep.iwEnd.found === 1 ? 's' : '') + ' inside' : ''}. The item is as it was (level ${rep.iwEnd.from}).</p>`;
	const iw = rep.iw; if (!iw) return '';
	const found = iw.finds.length ? ' Found: ' + iw.finds.map(findSay).join(', ') + '.' : '';
	if (!iw.bank) return `<p id="r-iw"><b>${esc(goodName(iw.id))}</b> · floor ${iw.floor} cleared! +${iw.stars} ★.${esc(found)} <span class="bal-muted">Kept when you clear the exit on floor ${iw.exit}.</span></p>`;
	const b = iw.bank;
	return `<div class="pt-iw-bank" id="r-iw"><p><span class="bal-badge bal-gold">Exit!</span> <b>${esc(goodName(iw.id))}</b> ${b.banked ? 'is now <b>level ' + b.to + '</b> <span class="bal-muted">(was ' + b.from + ')</span>' : '<span class="bal-muted">was no longer in your bag: its level is unchanged</span>'}${b.slotsTo > b.slotsFrom ? ' · <b>a new slot!</b> ' + b.slotsTo + ' slots' : ''}${iw.stars ? ' · +' + iw.stars + ' ★' : ''}</p>
		${b.gems.length || b.kits ? '<p>Brought out: ' + esc([...b.gems.map((g) => gemName(g)), ...(b.kits ? [b.kits + ' Stitching Kit' + (b.kits === 1 ? '' : 's')] : [])].join(', ')) + '</p>' : ''}${b.to >= 100 ? '<p class="bal-muted">Level 100: this item is at the top.</p>' : '<p class="bal-muted">Dive again from the camp to go deeper.</p>'}</div>`;
}
/** A new player's three starters, at level 5 (owner, 2026-11-20). */
function makeStarters(picks) {
	let c = P.col;
	for (const sp of picks) c = addFig(c, makeFigurine(sp, STARTER_LEVEL, makeRng('starter:' + sp + ':' + Date.now()), P.data, { id: sp + '-starter-' + Date.now().toString(36) }));
	saveCol({ ...c, starters: true });
	toast('Your first figurines!');
	hub.home();
}
/** A gauge reward in words (the list used to print the rules' own names: "moveXp 300"). */
const bonusSay = (b) => (b.kind === 'stars' ? b.n + ' ★' : b.kind === 'exp' ? b.n + ' EXP, shared by the team' : b.kind === 'moveXp' ? b.n + ' move XP, shared by the team'
	: b.kind === 'item' ? 'an item for the overworld Bag (' + (b.tier || 'common') + ')' : b.kind === 'pack' ? 'a ' + (b.game === 'pocket' ? 'Pocket' : 'Battlecards') + ' card pack'
	: b.kind === 'figurine' ? 'a figurine (' + (b.rarity || 'common') + ')' : String(b.kind));
/** The battle's results as they are PAID. Training is safe and can be played over and over against a team at your level,
 *  so the gauge's stars, EXP and move XP pay half there (items, packs and figurines as they are). */
function paidResults() {
	const r = B.results(P.S);
	if (!P.target || P.target.kind !== 'training') return r;
	return { ...r, half: true, bonus: r.bonus.map((b) => (b.n ? { ...b, n: Math.ceil(b.n / 2) } : b)) };
}
/** Is a battle on this target deadly (a knocked-out figurine is lost for good)? Story maps and Dungeon floors. */
const isDeadly = (target) => !!target && (target.kind === 'map' || target.kind === 'dungeon' || target.kind === 'item');   // (the Item World is deadly too: owner, 2026-11-24)
/**
 * PERMANENT LOSS: each of the player's figurines knocked out in these events leaves the collection NOW (not at the
 * results: closing the page, a reload or "Give up" can't save it), with what it held; its id goes onto the collection's
 * `gone` list and the figurine onto the memorial (figcol.js loseFig). Only in a deadly battle (setup.perma).
 */
function applyLosses(evs, quiet) {
	if (MODE !== 'normal' || P.online || !P.setup || !P.setup.perma || !P.teamMap) return;
	let c = P.col, n = 0;
	for (const e of evs) {
		const id = e.t === 'ko' ? P.teamMap[e.uid] : null, f = id && c.figs[id];
		if (!f) continue;
		const by = e.by != null ? B.unit(P.S, e.by) : null;
		c = loseFig(c, id, { at: Date.now(), where: battleName(), by: by ? by.species : '' });
		n++;
		if (!quiet) { toast(nameOf(f.species) + ' is gone for good'); sfx.error(); }
	}
	if (n) saveCol(c);
}
/** This battle's fallen (from the memorial: it survives a reload), newest first. */
const battleFallen = () => { const ids = new Set(Object.values(P.teamMap || {})); return P.setup && P.setup.perma ? fallenList(P.col).filter((e) => ids.has(e.fig.id)) : []; };
/** A battle: a campaign map, a dungeon floor or the Training Grounds, with this team (figurines). */
function startBattle(target, team) {
	if (target.kind === 'custom') { toast('Made maps are for Versus only'); return; }   // (owner, 2026-11-22: made maps are PvP only; a solo one saved before that still resumes, in enterBattle)
	if (!team.length) return;
	const run = target.kind === 'dungeon' ? target.run : null, dive = target.kind === 'item' ? target.dive : null;
	const m = dive ? itemFloor(dive.seed, dive.floor, dive.id, P.data) : run ? genFloor(run.seed, run.floor, P.data) : target.kind === 'map' ? mapById(target.id) : null;
	if (dive && !m) { toast('That item has no world'); return; }
	const seed = (dive ? 'iw-' + dive.seed + '-f' + dive.floor + '-' : run ? 'dgn-' + run.seed + '-f' + run.floor + '-' : m ? 'camp-' + m.id + '-' : 'training-') + Date.now().toString(36);
	// PERMANENT LOSS (owner, 2026-11-23: "if something dies in battle it is gone"): Story and Dungeon battles are deadly;
	// Training (and Versus) are not. The battle carries it, so one saved before the rule finishes under the old one.
	const setup = { ...(m ? campaignSetup(m, team, P.data, seed) : trainingSetup(team, wildLevelFor(team), P.data, seed)), rev: B.RULES_REV, ...(isDeadly(target) ? { perma: true } : {}) };
	const S0 = B.newBattle(seed, setup, P.data), teamMap = {};
	S0.units.filter((u) => u.side === 'p').forEach((u, i) => { teamMap[u.uid] = team[i].id; });
	enterBattle({ target, seed, setup, teamMap, wild: m ? [...new Set(m.foes.map((f) => f.sp))] : WILD_SPECIES, actions: [] });
}
/** Into a battle: a new one (no actions), or one saved on this device, re-run from its recipe to where it was left. */
function enterBattle(b) {
	hub.close();
	const target = b.target;
	P.target = target; P.next = undefined; P.report = null; P.resultShown = false; P.rfocusEl = null;
	P.screen = 'battle'; P.applied = false; setMenu(null);
	P.run = target.kind === 'dungeon' ? target.run : null;
	if (P.run) saveRun(P.run);
	// (the Item World, itemworld.js: a dive into a held item, a battle a floor; kept on this device between floors as a Dungeon run is)
	P.dive = target.kind === 'item' ? target.dive : null;
	if (P.dive) saveDive(P.dive);
	P.mapId = target.kind === 'map' ? target.id : target.kind;
	const m = P.dive ? itemFloor(P.dive.seed, P.dive.floor, P.dive.id, P.data) : P.run ? genFloor(P.run.seed, P.run.floor, P.data) : target.kind === 'map' ? mapById(target.id) : target.kind === 'custom' ? asPlayable(target.map) : null;
	P.map = m;
	P.seed = b.seed; P.setup = b.setup; P.wild = b.wild || WILD_SPECIES; P.teamMap = b.teamMap;
	P.S = B.newBattle(P.seed, P.setup, P.data);
	P.actions = [];
	// (a resumed battle: its losses were taken when they happened; taking them again changes nothing, and covers a page
	// that closed between a knockout and its save)
	for (const a of b.actions) { const r = B.act(P.S, a, P.data); if (!r.ok) break; P.actions.push(a); applyLosses(r.events, true); logEvents(r.events, false); }
	P.anims = []; P.disp = null; P.busy = false; P.skip = false; P.mode = 'idle'; P.sel = null; P.cursor = { ...P.S.map.base }; P.fc = null; P.ver++;
	P.pan = { x: 0, z: 0 }; P.summary = null; hideLog();
	if (!b.actions.length) P.log = [];
	P.coachExec = P.actions.some((a) => a.t === 'execute' || a.t === 'end');
	P.coach = coachOn(m) ? { step: 0 } : null;
	buildScene(P.S.map); setZoom(1); setHl(null); refreshHud();
	if (b.actions.length) { banner('Resumed · Turn ' + P.S.turn); hideTip(); } else { banner(m ? m.name : 'Training Grounds'); if (m && !P.coach) showTip(m.name, m.tip); else hideTip(); }
	saveBattle();
	startLive();
}
// ---------------------------------------------------------------- online (PvP, 2-4 players; server/ptpvp.mjs, online.js)
const online = createOnline((a, b) => MP.call(a, b));
window.__poketactica.online = online;
/** Into an online match: build it from the server's config (every device the same), play the actions so far. */
function startOnline(lobby, match) {
	hub.close();
	endOnline();
	const arena = match.config.arena === 'custom' && match.config.map ? asArena(match.config.map) : arenaById(match.config.arena);
	P.screen = 'battle'; P.applied = true; P.report = null; P.resultShown = false; P.rfocusEl = null; P.next = null; setMenu(null);
	P.target = { kind: 'versus' }; P.map = { name: arena.name, tip: arena.tip }; P.run = null; P.mapId = 'versus'; P.teamMap = null; P.wild = [];
	P.me = match.side;
	P.seed = match.seed; P.setup = matchSetup(match.config, match.seed, P.data, makeFigurine, makeRng);
	const names = {}; match.config.seats.forEach((s, i) => { names['abcd'[i]] = s.name; });
	P.online = { id: lobby.id, lobby, names, overSent: false, sync: null };
	rebuildOnline(match.actions || []);
	P.pan = { x: 0, z: 0 }; P.summary = null; P.coach = null; hideLog(); P.log = [];
	buildScene(P.S.map); setZoom(1); setHl(null);
	P.cursor = { ...myBase() }; follow(true);
	P.online.sync = createMatchSync(online, lobby.id, {
		count: () => P.actions.length,
		busy: () => P.busy,
		play: (a) => playRemote(a),
		rebuild: (actions) => { rebuildOnline(actions); toast('Back in step with the match'); },
		onLobby: (lb) => { if (P.online) P.online.lobby = lb; if (!P.busy && P.S && !P.S.over) hint(); },
		onError: (msg) => toast(msg),
	});
	refreshHud();
	banner(myTurn() ? 'Your turn' : seatName(B.curSide(P.S)) + '\'s turn');
	showTip(arena.name, `${match.config.seats.map((s, i) => '<b style="color:' + SEAT_HEX['abcd'[i]] + '">' + esc(s.name) + '</b>').join(' · ')}<br>${esc(arena.tip)} Your base is the pale tile; the orange ones are the others'.`);
	startLive();
}
/** The battle from the recipe (no animation): a resume, or back in step after a clash. */
function rebuildOnline(actions) {
	P.S = B.newBattle(P.seed, P.setup, P.data);
	P.actions = [];
	for (const a of actions) { const r = B.act(P.S, a, P.data); P.actions.push(a); if (r.ok) logEvents(r.events, false); }
	P.anims = []; P.disp = null; P.busy = false; P.skip = false; P.mode = 'idle'; P.sel = null; P.fc = null; P.ver++;
	setMenu(null); rebuildOverlay(); refreshHud();
}
/** Another seat's action (or the server's clock), played and animated like one of ours. It counts even if refused. */
function playRemote(a) {
	if (!P.S || !P.online) return;
	const before = P.anims.length ? null : snapshotDisp();
	const r = B.act(P.S, a, P.data);
	P.actions.push(a);
	if (!r.ok) return;
	P.ver++;
	logEvents(r.events, a.t === 'end' || a.t === 'idle');
	queueEvents(r.events, before);
	afterAct();
}
function onlineResult() {
	const S = P.S, el = $('result'), o = P.online;
	if (P.resultShown && !el.hidden) return;
	P.resultShown = true;
	hideLog(); $('fc').hidden = true; $('coach').hidden = true;
	if (!o.overSent) { o.overSent = true; online.over(o.id, P.actions.length, S.pvp.winner); finishLive(); }
	el.hidden = false; setMenu(null); $('hint').textContent = '';
	const won = S.pvp.winner === ME();
	$('r-title').textContent = won ? 'Victory!' : S.pvp.winner ? seatName(S.pvp.winner) + ' wins' : 'Match over';
	$('r-body').innerHTML = '<ul class="bal-list">' + S.pvp.sides.map((sd) => {
		const left = S.units.filter((u) => u.side === sd && u.hp > 0).length;
		return `<li><b style="color:${SEAT_HEX[sd]}">${esc(seatName(sd))}</b> · ${sd === S.pvp.winner ? 'winner' : S.pvp.out.includes(sd) ? 'out' : left + ' left'}</li>`;
	}).join('') + '</ul><p class="bal-muted">A friendly match: no stars or EXP change hands.</p>';
	$('r-again').innerHTML = 'Back to camp <span class="bal-key">X</span>';
	$('r-again').className = 'bal-btn bal-grey';
	resultActs();
}
function onlineLeave() {
	if (!P.online) return camp();
	const id = P.online.id, sync = P.online.sync;
	if (!P.S.over) act({ t: 'concede' });
	if (P.S.over) return;   // (two players: the results show)
	// three or four: the others play on; back to camp once the server has the concede
	const t0 = Date.now();
	const go = () => { if (sync.pending() && Date.now() - t0 < 6000) return setTimeout(go, 200); online.leave(id); toast('You left the match'); camp(); };
	go();
}
function endOnline() {
	if (P.online && P.online.sync) P.online.sync.stop();
	P.online = null; P.me = null;
}

/** The camp's "Resume": the battle saved on this device (a reload, a locked phone, the Games switcher). */
function resumeBattle() {
	const b = savedBattle();
	if (!b) { toast('No battle to resume'); return camp(); }
	enterBattle(b);
}
/** The battle's results onto the collection, once (won or lost: EXP stays; a win pays the Bonus Gauge). */
function applyBattle() {
	if (P.applied || !P.S || !P.S.over || !P.teamMap) return null;
	P.applied = true;
	const { col, report } = applyResults(P.col, P.teamMap, paidResults(), { data: P.data, rng: makeRng(P.seed + ':results'), wildSpecies: P.wild || WILD_SPECIES, seed: P.seed.replace(/[^a-z0-9]/g, '') });
	let c2 = col;
	// a campaign map's FIRST clear: it opens the next map and pays its reward (stars; on some maps a figurine, whose id is the map's)
	if (P.dive && P.map && P.map.item) {
		// a floor of an item's world: a win goes one deeper with what it found; the EXIT floor banks the dive (the item's level,
		// its slots, the gemstones and kits); a loss ends the dive with nothing banked. The item is never lost.
		const m = P.map, dive = P.dive, tail = () => Math.floor(Math.random() * 36 ** 8).toString(36).padStart(6, '0');
		if (P.S.over === 'won') {
			const r = afterFloor(dive, m.floor), iw = { id: dive.id, floor: m.floor, stars: m.reward.stars, finds: r.finds, exit: exitFloor(dive.from), bank: null };
			if (r.done) { const b = bankDive(c2, r.done, { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem }, tail); c2 = b.col; iw.bank = b.report; }
			report.stars += iw.stars; report.iw = iw;
			P.dive = r.run; saveDive(P.dive);
		} else { report.iwEnd = { id: dive.id, floor: m.floor, from: dive.from, found: dive.found.length }; if (dive.back) c2 = reholdItem(c2, dive.back, dive.uid, tail()); P.dive = null; saveDive(null); }
		hub.H.target = P.dive ? { kind: 'item', dive: P.dive } : null;
	} else if (P.map && P.map.floor) {   // a dungeon floor: a win pays its stars (a boss floor: the boss's figurine and a checkpoint) and goes one down; a loss ends the run
		const m = P.map, run = P.run;
		if (P.S.over === 'won') {
			const fl = { floor: m.floor, stars: m.reward.stars, fig: null, checkpoint: m.boss };
			if (m.boss) {
				c2 = markDeep(c2, m.floor);
				const id = bossFigId(m.reward.fig.sp, run.seed, m.floor);
				if (!c2.figs[id]) { const f = { ...makeFigurine(m.reward.fig.sp, m.reward.fig.lv, makeRng(P.seed + ':reward'), P.data, { id }), from: 'dungeon' }; c2 = addFig(c2, f); fl.fig = f; }
			}
			report.stars += fl.stars; report.floor = fl;
			P.run = { seed: run.seed, floor: m.floor + 1 }; saveRun(P.run);
		} else { report.runEnd = { floor: m.floor }; P.run = null; saveRun(null); }
		hub.H.target = P.run ? { kind: 'dungeon', run: P.run } : null;
	} else if (P.map && P.map.custom) {
		// a made map (a solo battle saved before made maps were Versus-only): EXP only (no stars, no first clear)
	} else if (P.map && P.S.over === 'won' && !(c2.cleared || []).includes(P.map.id)) {
		const m = P.map, first = { stars: m.reward.stars, fig: null };
		c2 = markCleared(c2, m.id);
		if (m.reward.fig && !c2.figs[rewardFigId(m)]) { const f = { ...makeFigurine(m.reward.fig.sp, m.reward.fig.lv, makeRng(P.seed + ':reward'), P.data, { id: rewardFigId(m) }), from: 'campaign' }; c2 = addFig(c2, f); first.fig = f; }
		report.stars += first.stars; report.first = first;
		hub.H.target = null;   // (camp's Continue then offers the next map)
	}
	saveCol(c2);
	// (the day's tasks, goals.js: counted on this device)
	if (MODE === 'normal' && !P.online) { const won = P.S.over === 'won', tk = P.target ? P.target.kind : ''; noteDaily({ kos: P.S.units.filter((u) => u.side === 'e' && u.hp <= 0).length, caught: (report.caught || []).length, ...(won ? { wins: 1, ...(tk === 'training' ? { training: 1 } : {}), ...(P.setup && P.setup.perma ? { deadly: 1 } : {}) } : {}) }); }
	if (report.stars > 0) { Stars.earn(report.stars); if (signedIn()) Stars.sync((a, b) => MP.call(a, b)).catch(() => {}); }
	P.report = report;
	finishLive();
	// the gauge's items and card packs, each into the game that owns it (gauge.js)
	P.paid = report.owed.length ? payOwed({ owed: report.owed, seed: P.seed, rng: makeRng(P.seed + ':owed'), call: (a, b) => MP.call(a, b), signedIn: !!signedIn() }).catch(() => null) : null;
	return report;
}

// ---------------------------------------------------------------- stage 8: live, replays, clips, bets
let live = null;
const battleName = () => (P.map ? P.map.name : 'Training Grounds');
const liveLabel = () => ('Poketactica · ' + battleName() + (P.S ? ' · Turn ' + P.S.turn : '')).slice(0, 48);
/** A signed-in player's battle goes live for friends: its view, a label, and the bet report (prog = the turn). */
function startLive() {
	stopLive();
	P.replayId = null;
	if (MODE !== 'normal' || !Net.isLoggedIn()) return;
	const seed = P.seed;
	live = Net.startPublisher(() => (P.S ? B.view(P.S) : null), liveLabel, { bet: () => (P.S && P.seed === seed && !P.S.pvp ? { run: seed, prog: P.S.turn, res: P.S.over === 'won' ? 'win' : P.S.over === 'lost' ? 'lose' : null } : null) });
}
function stopLive() { if (live) { live.stop(); live = null; } }
/** The battle ended: its recipe goes to the tape store (signed in), and the last push hands spectators its replay. */
function finishLive() {
	const won = P.S.pvp ? P.S.pvp.winner === ME() : P.S.over === 'won';
	const rec = recipeOf(P.seed, P.setup, P.actions, { label: battleName(), won });
	P.recipe = rec;
	const pub = live; live = null;
	Net.uploadReplay(rec).then((id) => {
		P.replayId = id;
		if (pub) pub.finish({ won, replay: id }).catch(() => {});
		if (id && !$('result').hidden) resultActs();
	});
}
/** The results' replay buttons (once the replay is stored): V watches it, C copies its link. */
function resultActs() {
	const box = $('r-again').parentNode;
	box.querySelectorAll('.pt-rp').forEach((b) => b.remove());
	const add = (label, color, go) => { const b = document.createElement('button'); b.className = 'bal-btn pt-rp ' + color; b.innerHTML = label; b.addEventListener('click', go); box.insertBefore(b, $('r-again')); return b; };
	// Z plays on: the next map or floor after a win, the same battle again after a loss (with the same team)
	if (P.next === undefined) P.next = P.online ? null : nextTarget();
	const nt = P.next, won = P.S.over === 'won';
	const keep = P.rfocusEl && P.rfocusEl.isConnected ? P.rfocusEl : null;
	if (nt) {
		const team = Object.values(P.teamMap || {}).map((id) => P.col.figs[id]).filter(Boolean);
		const what = nt.kind === 'map' ? mapById(nt.id).name : nt.kind === 'dungeon' ? 'floor ' + nt.run.floor : nt.kind === 'item' ? 'floor ' + nt.dive.floor : nt.kind === 'custom' ? nt.map.name : 'Training Grounds';
		// (a lost deadly battle took the team with it: "Try again" with nobody did nothing. It asks for a new team instead.)
		if (team.length) add((won ? 'Next: ' + what : 'Try again') + ' <span class="bal-key">Z</span>', 'bal-orange', () => { $('result').hidden = true; P.next = undefined; startBattle(nt, team); }).classList.add('pt-next');
		else if (nt.kind === 'map' || nt.kind === 'training') add('Pick a new team <span class="bal-key">Z</span>', 'bal-orange', () => { $('result').hidden = true; P.next = undefined; camp(); hub.team(nt); }).classList.add('pt-next');
	}
	if (P.replayId) {
		add('Watch replay <span class="bal-key">V</span>', 'bal-blue', watchReplay);
		add('Copy link <span class="bal-key">C</span>', 'bal-grey', copyReplay);
	}
	// the focus: where it was (the replay's buttons arrive later), else Next, else Back to camp
	const bs = resultButtons(), k = keep ? bs.indexOf(keep) : bs.findIndex((b) => b.classList.contains('pt-next'));
	resultFocus(k >= 0 ? k : bs.length - 1);
	P.rfocusEl = bs[P.rfocus];
}
const watchReplay = () => { if (P.replayId) location.href = '/poketactica/?replay=' + encodeURIComponent(P.replayId); };
async function copyReplay() { if (!P.replayId) return; try { await navigator.clipboard.writeText(Net.replayUrl(P.replayId)); toast('Replay link copied'); } catch { toast(Net.replayUrl(P.replayId)); } }
// (a battle in progress is saved on this device after every action: leaving is safe, the camp offers Resume)
window.mpLeaveGuard = () => (MODE === 'normal' && P.screen === 'battle' && P.S && !P.S.over && !savedBattle() ? { state: 'confirm', message: 'Leave this battle? It won\'t count (a dungeon run stays on its floor).' } : { state: 'safe' });

/** The end of a watched battle (a spectator's, or a replay's last step). */
/** A spectator: the Tower Defense run they were watching is over. */
function tdSpecOver() {
	const v = td.view();
	$('result').hidden = false;
	$('r-title').textContent = 'The run is over';
	$('r-body').innerHTML = `<p>${esc(SPECTATE)} cleared <b>wave ${v.cleared}</b>.</p>` + (P.spec && P.spec.replay ? '<p class="bal-muted">Its replay is ready.</p>' : '');
	$('r-again').textContent = P.spec && P.spec.replay ? 'Watch the whole run' : 'Close';
}
function watchResult() {
	const el = $('result'), S = P.S;
	if (MODE === 'replay') { if (P.rp.playing) rpPlay(false); return; }
	el.hidden = false;
	$('r-title').textContent = S.over === 'won' ? SPECTATE + ' won!' : SPECTATE + ' lost';
	$('r-body').innerHTML = '<p>The battle is over.</p>' + (P.spec && P.spec.replay ? '<p class="bal-muted">Its replay is ready.</p>' : '');
	$('r-again').textContent = P.spec && P.spec.replay ? 'Watch the full battle' : 'Close';
}

// ---- spectating: the friend's published views, drawn as the page's own state
function stateFromView(v) {
	return { turn: v.turn, phase: v.phase, over: v.over, field: v.field || {}, combo: v.combo || 0, bonus: v.bonus, queue: v.queue || [], geo: v.geo.slice(), symbols: v.symbols || [], log: [],
		map: { ...v.map, geo: v.geo, symbols: v.symbols || [] },
		units: v.units.map((u) => ({ ...u, fig: { equipped: u.moves.map((m) => m.id) }, pp: Object.fromEntries(u.moves.map((m) => [m.id, m.pp])) })) };
}
function startSpectating() {
	P.screen = 'spectate'; P.spec = { replay: null };
	document.body.classList.add('pt-watch');
	$('queue').textContent = 'Connecting to ' + SPECTATE + '…';
	let mapSig = null;
	Net.startSpectate(SPECTATE, {
		onSnapshot(v, meta) {
			if (v && v.mm) {   // (a Mystery Maze run: drawn from what the player sees)
				P.spec.replay = meta.replay || P.spec.replay;
				mm.follow(v, 'Watching ' + SPECTATE + (meta.watchers > 1 ? ' · ' + meta.watchers + ' watching' : ''));
				return;
			}
			if (v && v.td) {   // (a Tower Defense run: the same sim, run from their orders a moment behind them)
				P.spec.replay = meta.replay || P.spec.replay;
				td.follow(v, 'Watching ' + SPECTATE + (meta.watchers > 1 ? ' · ' + meta.watchers + ' watching' : ''));
				return;
			}
			if (!v || !v.map || !Array.isArray(v.units)) return;
			P.spec.replay = meta.replay || P.spec.replay;
			P.S = stateFromView(v); P.disp = null; P.anims = []; P.busy = false;
			const sig = v.map.w + 'x' + v.map.h + ':' + v.map.height.join(',');
			if (sig !== mapSig) { mapSig = sig; P.cursor = { ...P.S.map.base }; buildScene(P.S.map); placeCam(); }
			if (!P.S.over) $('result').hidden = true;
			refreshHud(); rebuildOverlay();
			$('queue').textContent = 'Watching ' + SPECTATE + (meta.label ? ' · ' + meta.label.replace(/^Poketactica\s*·\s*/, '') : '') + (meta.watchers > 1 ? ' · ' + meta.watchers + ' watching' : '');
		},
		onStatus(st, info) {
			if (st === 'over' && info && info.replay) P.spec.replay = info.replay;
			if (st === 'over' && td && td.active) { tdSpecOver(); return; }
			if (st === 'over' && mm && mm.active) { mmSpecOver(); return; }
			if (st === 'over' && P.S && P.S.over) watchResult();
			const say = { login: 'Sign in to watch ' + SPECTATE, forbidden: 'Only ' + SPECTATE + '\'s friends can watch', 'not-live': SPECTATE + ' isn\'t in a battle right now', offline: 'Offline: retrying…', full: 'Too many watching: retrying…' }[st];
			if (say) $('queue').textContent = say;
		},
	});
}

// ---- replays: the battle re-run from its recipe; ←/→ step, Z play / pause, X back to the start, V copies a link to this moment
P.rp = { k: 0, playing: false, rec: null, t: 0 };
async function startReplay() {
	P.screen = 'replay';
	document.body.classList.add('pt-watch');
	const got = await Net.fetchReplay(REPLAY_ID);
	if (!got.recipe) { $('queue').textContent = 'Replay: ' + got.error; toast('This replay could not be opened (' + got.error + ')'); return; }
	if (got.recipe.kind === 'mm') {   // (a Mystery Maze run: mmmode.js is its viewer; ?t=<floor> starts there)
		if (!mm.watch(got.recipe, { floor: clipStart(1e6) || 0 })) { $('queue').textContent = 'Replay: this run could not be read'; return; }
		window.__poketactica.replayTotal = got.recipe.n;
		return;
	}
	if (got.recipe.kind === 'td') {   // (a Tower Defense run: tdmode.js is its viewer; ?t=<wave> starts there)
		if (!td.watch(got.recipe, { wave: clipStart(1e6) || 0 })) { $('queue').textContent = 'Replay: this run could not be read'; return; }
		window.__poketactica.replayTotal = got.recipe.end;
		return;
	}
	const rec = P.rp.rec = got.recipe;
	P.setup = rec.setup; P.seed = rec.seed;
	rpJump(clipStart(rec.actions.length) || 0);
	buildScene(P.S.map); placeCam(); rebuildOverlay();
	$('rp-bar').hidden = false;
	banner(rec.label || 'Replay');
	window.__poketactica.replayTotal = rec.actions.length;
}
/** Jump to action k (no animation). */
function rpJump(k) {
	const rec = P.rp.rec; if (!rec) return;
	P.rp.k = Math.max(0, Math.min(rec.actions.length, k));
	P.S = replayTo(rec, P.rp.k, P.data); P.disp = null; P.anims = []; P.busy = false;
	if (!P.cursor || !isTile(P.S.map, P.cursor.x, P.cursor.y)) P.cursor = { ...P.S.map.base };
	rpHud(); refreshHud(); rebuildOverlay();
}
/** One step forward, animated as it was played. */
function rpStep() {
	const rec = P.rp.rec; if (!rec || P.busy) return;
	if (P.rp.k >= rec.actions.length) { rpPlay(false); return; }
	const before = snapshotDisp();
	const r = B.act(P.S, rec.actions[P.rp.k], P.data); P.rp.k++;
	if (r.ok) queueEvents(r.events, before);
	rpHud(); afterAct();
}
function rpPlay(on = !P.rp.playing) { P.rp.playing = on && !!P.rp.rec && P.rp.k < P.rp.rec.actions.length; P.rp.t = 0; rpHud(); }
function rpHud() {
	const rec = P.rp.rec; if (!rec) return;
	$('rp-pos').textContent = P.rp.k + ' / ' + rec.actions.length;
	$('rp-play').innerHTML = (P.rp.playing ? '⏸ Pause' : '▶ Play') + ' <span class="bal-key">Z</span>';
	$('queue').textContent = 'Replay · ' + (rec.label || 'a battle') + (rec.won != null ? (rec.won ? ' · won' : ' · lost') : '');
}
window.__poketactica.replayTo = (k) => rpJump(k);
window.__poketactica.replayAt = () => P.rp.k;
window.__poketactica.replayStep = () => rpStep();   // (tests: → without a trusted key)
/** The keys while watching: arrows look around (in a replay ←/→ step), Q/E turn the camera, C the unit panel. */
function onWatchAction(action, o) {
	if (mm && mm.active && $('result').hidden) {   // (a Mystery Maze replay or live run: its own keys; Q / E still turn the board)
		if (mm.onWatchAction(action, o)) return true;
		if ((action === 'prev' || action === 'next') && !o.repeat) { P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); }
		return true;
	}
	if (td && td.active && $('result').hidden) {   // (a Tower Defense replay or live run: its own keys; Q / E still turn the board)
		if (td.onWatchAction(action, o)) return true;
		if ((action === 'prev' || action === 'next') && !o.repeat) { P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); }
		return true;
	}
	if (MODE === 'replay' && (action === 'left' || action === 'right')) {
		if (o.repeat && P.busy) return true;
		if (action === 'right') rpStep(); else { rpPlay(false); rpJump(P.rp.k - 1); }
		return true;
	}
	if (['up', 'down', 'left', 'right'].includes(action)) { if (P.S) moveCursor(action); return true; }
	if (action === 'prev' || action === 'next') { if (o.repeat) return true; P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); return true; }
	if (action === 'secondary') { $('unit').classList.toggle('pt-open'); return true; }
	if (MODE === 'replay') {
		if (action === 'confirm') { sfx.press(); rpPlay(); return true; }
		if (action === 'context') { copyClip(P.rp.k).then(() => toast('Link to this moment copied')).catch(() => {}); return true; }
		if (action === 'cancel') { rpPlay(false); rpJump(0); return true; }
	}
	if (MODE === 'spectate' && action === 'confirm' && !$('result').hidden) { if (P.spec && P.spec.replay) location.href = '/poketactica/?replay=' + encodeURIComponent(P.spec.replay); else $('result').hidden = true; return true; }
	return true;
}
/** (every frame) a playing replay steps on once the last step's animation is done */
function rpTick(dt) {
	if (MODE !== 'replay' || !P.rp.playing || P.busy) return;
	P.rp.t += dt;
	if (P.rp.t >= 0.25) { P.rp.t = 0; rpStep(); }
}

// ---------------------------------------------------------------- boot
async function boot() {
	const canvas = $('c');
	({ renderer, scene } = makeRenderer(canvas));
	camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
	// no fog on a board seen from above: setFog moves the terrain's fog AND the sprites' own (their shader keeps its own copy;
	// left at MicaSurvivor's 26-78 m, every sprite 60 m from this camera was 65% sky-blue)
	setFog(renderer, scene, { color: 0x16242a, near: 900, far: 1000 });
	numCanvas = $('nums'); numCtx = numCanvas.getContext('2d');
	const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 1.5); renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false); numCanvas.width = innerWidth * Math.min(devicePixelRatio || 1, 2); numCanvas.height = innerHeight * Math.min(devicePixelRatio || 1, 2); if (P.S) placeCam(); };
	addEventListener('resize', resize); resize();
	P.data = await loadData();
	P.col = upgradeLearned(loadFigs(), 'local');
	P.sync = createSync({ kind: FIGS, call: (a, b) => MP.call(a, b), user: signedIn, getLocal: () => P.col, setLocal: (c) => { const u = upgradeLearned(c, 'account'); P.col = u; setFigs(u); if (u !== c && P.sync) P.sync.soon(); if (P.screen === 'camp' && ['home', 'starters'].includes(hub && hub.H.screen)) camp(); } });
	P.sync.now();
	if (signedIn()) claimBattlecards((a, b) => MP.call(a, b)).then((r) => { if (r.packs) toast(r.packs + ' Battlecards pack' + (r.packs > 1 ? 's' : '') + ' from the Bonus Gauge went to your pack inbox'); }).catch(() => {});   // (claims a closed page never heard back on)
	document.addEventListener('visibilitychange', () => { if (!document.hidden && P.sync) P.sync.now(); });
	newGame();
	hub = createHub({ root: $('hub'), data: P.data, mmSaved: () => { const o = savedMm(); return o ? { label: o.recipe.label, ts: o.ts } : null; }, mmResume: () => resumeMm(), tdSaved: () => { const o = savedTd(); return o ? { label: o.recipe.label, ts: o.ts } : null; }, tdResume: () => resumeTd(), startTd: (mapId, squad, startWave, hero) => startTd(mapId, squad, startWave, hero), startMm: (id, figs, opts) => startMm(id, figs, opts), getJSON: (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }), col: () => P.col, saveCol, makeStarters, start: ({ target, team }) => startBattle(target, team), toast,
		saved: () => { const b = savedBattle(); return b ? { label: b.label, turn: b.turn, ts: b.ts } : null; }, resume: () => resumeBattle(), dropSaved: () => clearBattle(),
		starsSpent: () => { if (signedIn()) Stars.sync((x, y) => MP.call(x, y)).catch(() => {}); },
		online, signedIn, syncFigs: () => (P.sync ? P.sync.now() : null), startOnline,
		// (the camp's Settings changed a switch: each mode reads its own key again the next time it asks)
		settings: () => { P.fast = lsGet(FAST_KEY) === '1'; if (td) Object.assign(td.T, { calm: null, allReach: null, auto: null }); if (mm) mm.M.small = null; },
		editMap: (entry, size) => { hub.close(); editor.open(entry, size); }, call: (a, b) => MP.call(a, b) });
	window.__poketactica.hub = hub;
	editor = createEditMode({ P, B, data: P.data, $, sfx, toast, banner, buildScene, rebuildOverlay, placeCam, setZoom, follow, stepFor, setMenu, menuMove, menuPick,
		versusOn: (id) => { camp('maps'); hub.versusOn(id); }, camp, call: (a, b) => MP.call(a, b), signedIn });
	window.__poketactica.editor = editor;
	// TOWER DEFENSE (tdmode.js; td/sim.js): not on the camp menu until its replays and spectating are in
	td = createTdMode({ P, B, data: P.data, $, sfx, toast, banner, buildScene, rebuildOverlay, placeCam, setZoom, follow, stepFor, setMenu, menuMove, menuPick, pop, moveFx,
		fx: (f) => P.fx.push(f), shake: (n) => { P.shake = Math.max(P.shake, n); },
		store: (o) => { if (MODE === 'normal') lsSet(TD_KEY, o ? JSON.stringify(o) : null); },
		live: (getSnap, getLabel, getBet) => tdLive(getSnap, getLabel, getBet),
		clip: (wave) => copyClip(wave).then(() => toast('Link to wave ' + wave + ' copied')).catch(() => {}),
		help: () => { P.screen = 'help'; hub.help(0, () => { hub.close(); P.screen = 'td'; }); },
		tileAt: (cx, cy) => pickTile(cx, cy, ray, ndc),
		onOver: (run) => tdResult(run) });
	window.__poketactica.td = td;
	// MYSTERY MAZE (mmmode.js; mm/turn.js): not on the camp menu until its dungeons, resume, replays and spectating are in
	mm = createMmMode({ P, B, data: P.data, $, sfx, toast, banner, buildScene, rebuildOverlay, placeCam, setZoom, follow, panToward, stepFor, setMenu, menuMove, menuPick, pop, moveFx,
		fx: (f) => P.fx.push(f), shake: (n) => { P.shake = Math.max(P.shake, n); },
		onLost: (e) => mmLost(e, mm.M.dungeon.name + ' B' + e.floor + 'F'),
		store: (o) => { if (MODE === 'normal') lsSet(MM_KEY, o ? JSON.stringify(o) : null); },
		live: (getSnap, getLabel, getBet) => mmLive(getSnap, getLabel, getBet),
		best: (id) => ((P.col.mm || {}).best || {})[id] || 0,
		clip: (floor) => copyClip(floor).then(() => toast('Link to B' + floor + 'F copied')).catch(() => {}),
		help: () => { P.screen = 'help'; hub.help('Mystery Maze', () => { hub.close(); P.screen = 'mm'; }); },
		// (a dive into an item, left by a Pull Cord from the maze's own menu: banked here, and the run then ends)
		cords: () => (MODE === 'normal' ? haveGood(P.col, 'pullcord') : 0),
		pull: (floorNo) => { const dive = loadDive(); if (!dive || dive.style !== 'maze') return false; const to = dive.from + Math.max(0, floorNo - 1); P.iwPull = pullCord(dive, to, diveFloors(dive.from).filter((f) => f <= to).flatMap((f) => findsOf(dive.seed, f))); return !!P.iwPull; },
		onOver: (run) => mmResult(run) });
	window.__poketactica.mm = mm;
	window.__poketactica.saveCol = saveCol;   // (tests: a storage to pack from)
	window.__poketactica.startMm = (dungeonId, team, opts) => startMm(dungeonId, team || list(P.col).slice(0, 4), opts);   // (tests; the camp's own screens come with the dungeons)
	window.__poketactica.startOnline = startOnline;   // (tests and tools/poketactica/perf_big.mjs: a Versus match from a lobby + match, no server)
	window.__poketactica.start = (target, team) => startBattle(target, team || list(P.col).slice(0, 6));   // (tests: a battle on any map at once)
	if (MODE === 'normal') {
		const found = takeFound();
		if (found.length) toast(found.length === 1 ? 'A figurine found in the overworld joined your collection' : found.length + ' figurines found in the overworld joined your collection');
		camp();
	} else if (MODE === 'spectate') startSpectating();
	else await startReplay();
	sfx.wire(document);
	// touch / mouse on the board: a tap picks a tile (a unit's sprite first); a drag looks around; two fingers (or the wheel) zoom
	const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
	const pts = new Map();
	let drag = null, pinch = null;
	canvas.addEventListener('pointerdown', (ev) => {
		hideTip();
		if (ev.pointerType === 'touch') P.input = 'touch'; else if (ev.pointerType === 'mouse') P.input = 'key';
		if (!P.S || P.screen === 'camp') return;
		canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
		pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
		if (pts.size === 1) drag = { x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, moved: false };
		if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: P.zoom }; drag = null; }
	});
	canvas.addEventListener('pointermove', (ev) => {
		if (!pts.has(ev.pointerId)) return;
		pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
		if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; setZoom(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0); return; }
		if (!drag) return;
		if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 12) drag.moved = true;
		if (drag.moved) {
			if (P.zoom <= 1.001) setZoom(1.25);   // (a drag on the fitted board zooms in a little, so there is somewhere to look)
			panBy(ev.clientX - drag.x, ev.clientY - drag.y);
		}
		if (drag.moved) { drag.x = ev.clientX; drag.y = ev.clientY; }   // (the first pan takes the whole way from where the finger came down)
	});
	const up = (ev) => {
		if (!pts.has(ev.pointerId)) return;
		pts.delete(ev.pointerId);
		if (pinch) { if (!pts.size) pinch = null; drag = null; return; }
		const d = drag; drag = null;
		if (!d || d.moved || ev.type === 'pointercancel') return;
		if (P.screen === 'editor' && editor) { const t = pickTile(ev.clientX, ev.clientY, ray, ndc); if (t) editor.tap(t[0], t[1]); return; }
		if (P.screen === 'td' && td) { const t = pickTile(ev.clientX, ev.clientY, ray, ndc); if (t) td.tap(t[0], t[1]); return; }
		if (P.screen === 'mm' && mm) { if (!$('result').hidden) return; const t = pickTile(ev.clientX, ev.clientY, ray, ndc); if (t) mm.tap(t[0], t[1]); return; }
		if (P.busy && MODE === 'normal' && P.screen === 'battle') { P.skip = true; return; }   // (a tap while it plays speeds it up)
		if (P.busy || MODE !== 'normal' || P.screen !== 'battle') { if (MODE !== 'normal' && P.S) { const t = pickTile(ev.clientX, ev.clientY, ray, ndc); if (t) { P.cursor = { x: t[0], y: t[1] }; rebuildOverlay(); refreshHud(); } } return; }
		const t = pickTile(ev.clientX, ev.clientY, ray, ndc);
		if (t) tapTile(t[0], t[1]);
	};
	canvas.addEventListener('pointerup', up);
	canvas.addEventListener('pointercancel', up);
	canvas.addEventListener('wheel', (ev) => { if (!P.S || P.screen === 'camp') return; ev.preventDefault(); setZoom(P.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
	$('tip').addEventListener('click', hideTip);
	$('menu-items').addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (b) menuPick(+b.dataset.i); });
	$('b-exec').addEventListener('click', () => onAction('context'));
	$('b-end').addEventListener('click', () => onAction('menu'));
	$('b-back').addEventListener('click', () => { if (!P.busy && (P.mode !== 'idle' || P.menu)) back(); });
	$('b-left').addEventListener('click', () => onAction('prev'));
	$('b-right').addEventListener('click', () => onAction('next'));
	$('b-danger').addEventListener('click', () => { if (P.S && P.screen === 'battle') toggleDanger(); });
	$('coach-skip').addEventListener('click', () => { lsSet(COACH_KEY, 'done'); P.coach = null; $('coach').hidden = true; toast('Tutorial skipped: How to play is in the field menu'); if (P.map && P.map.tip) showTip(P.map.name, P.map.tip); });
	$('log').addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) hideLog(); });
	$('b-zoom').addEventListener('click', () => { setZoom(P.zoom >= zoomMax() - 0.01 ? 1 : P.zoom < 1.6 ? 1.6 : zoomMax()); follow(true); });
	$('r-again').addEventListener('click', () => { if (MODE === 'spectate') return onWatchAction('confirm', {}); if (MODE === 'normal') camp(); });
	$('rp-back').addEventListener('click', () => onWatchAction('left', {}));
	$('rp-fwd').addEventListener('click', () => onWatchAction('right', {}));
	$('rp-play').addEventListener('click', () => onWatchAction('confirm', {}));
	$('rp-start').addEventListener('click', () => onWatchAction('cancel', {}));
	$('rp-clip').addEventListener('click', () => onWatchAction('context', {}));
	window.__poketacticaInput = startInput({ onAction, pad: true });
	requestAnimationFrame(frame);
	window.__poketactica.sheets = sheets;   // (tests)
	window.__poketactica.ready = true;
	$('boot').hidden = true;
}
boot().catch((e) => { console.error(e); $('boot').textContent = 'Could not load: ' + e.message; });
