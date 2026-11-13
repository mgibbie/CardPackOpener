// m3d/main.js — MicaSurvivor 3D, P0 (Plans/MICASURVIVOR_3D_PLAN.md): the test room. Not a game mode and not linked from
// the menu: one hand-built room to answer two questions before anything is built on them —
//   1. does a phone hold 60 fps with a real 3D scene and 100 sprite billboards?
//   2. does the jump feel right?
// /micasurvivor/m3d/   ?n=100 the crowd · ?dex=25 who you play · ?still=1 a crowd that does not turn
// P2: ?gen=<seed> plays a GENERATED level instead (gen.js); ?biome=meadow|peaks|marsh; ?size=4..8 tiles a side. Reach
// the column of light (the exit; it is on the minimap) and the next seed loads.
import * as THREE from 'three';
import { K, CELL, step, newState, noInput, groundAt, stateName, facingRow, tuneFor, TYPE_TRAITS } from './sim.js';
import { buildRoom, SPOTS } from './room.js';
import { makeRenderer, buildTerrain, buildWater, buildRails, buildScatter, buildExit, drawMap, SpriteBatch, Shadows, Shots, Flashes, loadSheet, frameAt, spriteQuad, footLift, placeCamera, PX } from './render.js';
import { newWorld, addEnemy, addBoss, tick, dataFrom, choose, drop, CK, canFire } from './combat.js';
import { frame as netFrame, keepEvents, diff as netDiff, bundle, unbundle, Viewer, Tape, ballColour, typeName, NK, PICK } from './net.js';
import { Props, PROP_MON, BOBS } from './props.js';
import { hostAdd, hostStep, hostFrame, hostApply, guestWorld, guestSync, guestMsg, guestApply } from './coop.js';
import { generate, BIOMES } from './gen.js';
import { mountRunUi, pretty } from './runui.js';
import { HostLink, WatchLink, runId, SAYS as LIVE_SAYS } from './exprelay.js';
import { unfair, clean as cleanRun, deviceId, missing as saveMissing, runSum, recordOps, applyOps, scoreBody, WHY, SV, wildOf, catchOps, shinyOps, newlyMet, boardAsk, boardRows, hasMember, hasForm } from './expsave.js';
import { rng as seedRng } from './gen.js';
import { metaFor, spendBoosts, researchOf } from './expmeta.js';
import { canEvolve } from './expleague.js';
import { soundsOf, moveSounds, musicOf } from './runsound.js';
import { startInput } from '/site/input.js';
import { createFocusNav } from '/site/focusnav.js';
import { marksOf } from './exprx.js';
import { pressUlt, ultView, setCharge } from './expult.js';
import { perksOf } from './expperks.js';
import { expFrom, newRun, stepRun, hudLine, result as runResult, setZoneTime, fire as fireEvent, zoneRoom, XK } from './expedition.js';
import { runRow, rowView, teamSpot } from './expnet.js';
import { guestRun, guestRunApply, stepGuest } from './expcoop.js';
import { hazardsNow } from './expsurv.js';
import { newFog, reveal, found, fogOf, share as fogShare } from './expfog.js';
import { refresh as refreshCards, skip as skipCards, banish as banishCard } from './explevel.js';
import { EK, ecoView, pickTake, pickClose, shopPrices } from './expeco.js';
import { capView } from './expcap.js';
import { rulesFrom, newDive, stepDive, hudLine as diveHud, result as diveResult, pressSpecial, specials, LANDMARKS } from './dive.js';

const Q = new URLSearchParams(location.search);
// P3: ?gen=<seed>&fight=1 is a FIGHT on that level (combat.js): enemies arrive and come for you, your moves fire by
// themselves at what you can see. ?moves=ember:3,tackle picks them (id:level); R starts the level again.
// P3n: &host=<name> shows this fight to other tabs of this browser (a BroadcastChannel: the test room's transport);
// ?watch=<name> watches it, with a camera of its own; &tape=1 records it (window.__m3d.tape).
// ?join=<name> JOINS that fight as a second player (co-op: coop.js), with your own ?dex= and ?moves=.
// (the shipping path) ?live=<friend> watches a friend's run over the site's own lines (exprelay.js): as ?watch=, but polled from the server
const LIVE = Q.get('live') || null;
const WATCH = Q.get('watch') || LIVE || null, HOST = Q.get('host') || null, JOIN = !WATCH && Q.get('join') || null;
const MYID = JOIN ? +(Q.get('id') || 0) || 1 + (Date.now() % 90000) : 0;
// P4: ?exp=<seed> plays a Classic EXPEDITION run (expedition.js): &map=viridian|mtmoon|cerulean, &diff=normal|hard|nightmare.
// Find the altar (the column of light, on the minimap), stand on it, beat the guardian, take the portal.
const EXP = !WATCH && !JOIN && Q.has('exp');
// 3D Dive (dive.js): ?dive=<seed> plays a Dive run: &route=forest|…, &floor=<the floor to begin on>. Find the stairs (the
// column of light), stand on them; an alpha every 5th floor seals them. A preview: not linked from the menu, nothing is saved.
const DIVE = !WATCH && !JOIN && !EXP && Q.has('dive');
// (the 2D Dive's floors and rules, read by divegen.js and dive.js, are loaded only here: an Expedition's page is as it was. With them
// on every page, the 2D game's own Expedition object changed what an Expedition's save does.)
if (DIVE && window.G && !window.G.ExpDive) for (const src of ['../js/systems/expedition.js', '../js/expedition/dive-gen.js', '../js/expedition/dive.js']) await new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.async = false; el.onload = res; el.onerror = () => rej(new Error('3D Dive: could not load ' + src)); document.head.appendChild(el); });
const FIGHT = !WATCH && (!!JOIN || EXP || DIVE || (Q.has('gen') && Q.get('fight') === '1'));
const N = Math.max(0, Math.min(2000, +(Q.get('n') ?? (FIGHT || (WATCH && Q.has('xw')) ? 0 : 100)) || 0));   // (the test room's crowd: not in a fight, and not on a watched run)
const DEX = +(Q.get('dex') ?? 25) || 25;
const META = (window.G && window.G.SPRITE_META) || {};
const CROWD_DEX = [1, 4, 7, 16, 19, 25, 43, 74, 92, 133].filter((d) => META[d] && META[d].a && META[d].a.Idle && !META[d].src);
const hud = document.getElementById('hud'), canvas = document.getElementById('c');
const XW = WATCH && Q.has('xw') ? { seed: (+Q.get('xw') >>> 0) || 1, map: Q.get('map') || 'viridian' } : null;   // (P4) watching an Expedition run: its seed and map
const XJ = !WATCH && Q.get('join') && Q.has('xj') ? { seed: (+Q.get('xj') >>> 0) || 1, map: Q.get('map') || 'viridian', diff: Q.get('diff') || 'normal' } : null;   // (P4) joining an Expedition run
const XF = (EXP || XW || XJ || DIVE) && window.G && window.G.ExpClassic ? expFrom(window.G) : null;
const GEN = EXP ? (+Q.get('exp') >>> 0) || 1 : DIVE ? (+Q.get('dive') >>> 0) || 1 : XW ? XW.seed : XJ ? XJ.seed : Q.has('gen') ? (+Q.get('gen') >>> 0) : null, BIOME = BIOMES[Q.get('biome')] ? Q.get('biome') : 'meadow';
const SIZE = Q.has('size') ? Math.max(3, Math.min(8, +Q.get('size') | 0 || 5)) : null;
let room = EXP || XJ || DIVE ? null : XW ? zoneRoom(XW.seed, XW.map, 1, XF) : GEN === null ? buildRoom() : generate(GEN, BIOME, SIZE ? { size: SIZE } : null);
// (P1) who you play decides how it moves: its types' traits (sim.js TYPE_TRAITS). ?types=flying,water tries others.
const SPECIES = ((window.G && window.G.DEX) || []).find((p) => p.dex === DEX) || { name: '#' + DEX, types: [] };
const TYPES = Q.get('types') ? Q.get('types').split(',') : SPECIES.types;
const TUNE = tuneFor(TYPES);
const TRAITS = TYPES.filter((t) => TYPE_TRAITS[t]);
const GG = window.G || {};
const FIGHT_CAST = (Q.get('cast') ? Q.get('cast').split(',').map(Number) : [19, 16, 43, 74, 133, 41, 92, 1, 58, 63, 32, 39, 35, 95, 10]).filter((d) => d !== DEX && META[d] && META[d].a && META[d].a.Walk && !META[d].src);
const MOVES = !FIGHT ? [] : Q.get('moves') ? Q.get('moves').split(',').map((m) => { const [id, lv] = m.split(':'); return [id, +lv || 1]; }).filter((m) => GG.Moves.BY_ID[m[0]] || (GG.ExpMoves && GG.ExpMoves.isExpMove(m[0])))
	: [[GG.Moves.startFor(SPECIES), 3], ['tackle', 2]].filter((m, i, a) => a.findIndex((q) => q[0] === m[0]) === i);
// (P3) bosses arrive at the 2D game's times (3:00, 6:00, …): ?bosses=143,130; ?boss=143 puts one in at the start
const BOSSES = (Q.get('bosses') ? Q.get('bosses').split(',').map(Number) : [143, 130, 149, 6, 150]).filter((d) => META[d] && META[d].a && META[d].a.Walk && !META[d].src);
// (the shipping path) The Expedition save is opened before the run is made: a fair run brings the wild League members
// waiting in it (expsave.js). A practice run (any test parameter) reads and writes nothing.
const PRACTICE = EXP ? unfair([...Q.entries()]) : null;
const SAVE_OK = EXP && !PRACTICE && !!GG.ExpSave && await GG.ExpSave.open().then(() => !!GG.ExpSave.data, () => false);
const baseSave = () => { try { return JSON.parse(localStorage.getItem('micasurvivor_save.' + (GG.ExpSave.who || 'guest')) || 'null'); } catch (e) { return null; } };   // (read, never written: the collection decides what you have)
const WILD = SAVE_OK && GG.ExpLeague && GG.ExpCap ? wildOf(GEN, { L: GG.ExpLeague, Sv: GG.ExpSave, base: baseSave(), max: GG.ExpCap.K.PER_RUN, rng: seedRng }) : [];
// (going live) What the Lab gives this run (expmeta.js): only a run that can be kept has it (your member, a map and a
// tier you have open), and only then are the boosts you armed spent.
const LAB_META = (() => {
	if (!SAVE_OK || !GG.ExpMeta || !GG.ExpLeague || !GG.ExpTier || Q.get('league') === '0') return null;
	try {
		const L = GG.ExpLeague, T = GG.ExpTier, Sv = GG.ExpSave, member = L.BY[DEX] ? DEX : L.FAM[DEX] || DEX, map = Q.get('map') || 'viridian', diff = Q.get('diff') || 'normal';
		const form = +Q.get('form') || 0;
		if (!hasMember(member, { L, Sv, base: baseSave() }) || !T.mapOpen(map) || T.unlocked(map) < T.idx(diff) || (form && form !== member && !hasForm(form, { Sv, base: baseSave() }))) return null;
		return metaFor(GG.ExpMeta, { Sv, member, boosts: spendBoosts(GG.ExpMeta, Sv, deviceId(localStorage, Sv.who, crypto), localStorage) });
	} catch (e) { console.warn('the Lab could not be read: ' + (e && e.message)); return null; }
})();
const UPGRADES = SAVE_OK ? perksOf(GG, baseSave(), DEX) : null;   // (the upgrades bought for this Pokémon's family: a run that can be kept starts with them)
// (your League member plays shiny when a shiny of its family is yours: caught in an Expedition, or the one you chose to play as in the 2D game)
const LEAD_SHINY = SAVE_OK && (() => { const b = baseSave(), fam = GG.ExpLeague && (GG.ExpLeague.BY[DEX] ? DEX : GG.ExpLeague.FAM[DEX]); return (!!fam && GG.ExpSave.has('league.shiny', String(fam))) || !!(b && b.partnerShiny && b.shiny && b.shiny[DEX]); })();
const run = EXP ? newRun(dataFrom(GG), XF, { shiny: LEAD_SHINY, perks: UPGRADES, ultAuto: SAVE_OK && GG.ExpSave.get('ult.auto.on') > GG.ExpSave.get('ult.auto.off'), wild: WILD, meta: LAB_META, form: +Q.get('form') || 0, seed: GEN, map: Q.get('map'), diff: Q.get('diff'), mode: Q.get('mode') || undefined, dex: DEX, moves: MOVES, tune: TUNE, touch: matchMedia('(pointer: coarse)').matches, league: !Q.has('moves') && Q.get('league') !== '0', ability: Q.get('ability') === '0' ? null : Q.get('ability') || 'auto', items: Q.get('items') ? Q.get('items').split(',') : [], weather: Q.get('weather') === '0' ? false : undefined, autoPick: Q.has('auto') ? +Q.get('auto') | 0 : undefined }) : null;
if (run) room = run.w.room;
// 3D Dive: the run (dive.js), with the 2D game's own rules
const DR = DIVE && XF ? rulesFrom(GG) : null;
if (DIVE && !DR) throw new Error('3D Dive: the Dive rules did not load');
// (the kit: your League member's first three moves, the basic and two specials; ?moves= picks others)
const DMOVES = DR && !Q.get('moves') && GG.ExpLeague ? (() => { const L = GG.ExpLeague, m = L.BY[L.BY[DEX] ? DEX : L.FAM[DEX]], kit = m ? m.kit.filter((id) => { const d = GG.Moves.BY_ID[id] || (GG.ExpMoves && GG.ExpMoves.MOVES[id]); return !!d && canFire(d.kind); }).slice(0, DR.K.SLOTS) : []; return kit.length >= 2 ? kit.map((id) => [id, 1]) : MOVES; })() : MOVES;
const drun = DR ? newDive(dataFrom(GG), XF, DR, { route: Q.get('route') || 'forest', seed: GEN, start: +Q.get('floor') || 1, dex: DEX, moves: DMOVES, tune: TUNE, touch: matchMedia('(pointer: coarse)').matches, ability: Q.get('ability') === '0' ? null : Q.get('ability') || 'auto', items: Q.get('items') ? Q.get('items').split(',') : [], weather: false, autoPick: Q.has('auto') ? +Q.get('auto') | 0 : undefined }) : null;
if (drun) { room = drun.w.room; drun.w.cap = DR.K.REIN.cap + 60; }
const solo = run || drun;   // (a run of your own, alone on this page: an Expedition or a Dive)
// (P4) a guest in a run: its own League member in the host's run (expcoop.js); it builds each zone from the run's row
const grun = XJ ? guestRun(dataFrom(GG), XF, { seed: XJ.seed, map: XJ.map, diff: XJ.diff, id: MYID, dex: DEX, league: !Q.has('moves'), moves: MOVES, tune: TUNE, ability: Q.get('ability') === '0' ? null : Q.get('ability') || undefined, autoPick: Q.has('auto') ? +Q.get('auto') | 0 : undefined }) : null;
if (grun) room = grun.w.room;
const myRun = run || grun || drun;   // (the run this page plays in, as a host or a guest)
const world = run ? run.w : drun ? drun.w : grun ? grun.w : JOIN ? guestWorld(room, dataFrom(GG), { id: MYID, dex: DEX, moves: MOVES, seed: MYID * 7919 + 13, tune: TUNE, ability: Q.get('ability') === '0' ? null : Q.get('ability') || 'auto', items: Q.get('items') ? Q.get('items').split(',') : [], autoPick: Q.has('auto') ? +Q.get('auto') | 0 : undefined })
	: FIGHT ? newWorld(room, dataFrom(GG), { bosses: BOSSES, ability: Q.get('ability') === '0' ? null : Q.get('ability') || 'auto', items: Q.get('items') ? Q.get('items').split(',') : [], dex: DEX, moves: MOVES, seed: (GEN + 1) * 7919, tune: TUNE, cast: FIGHT_CAST, cap: Q.has('cap') ? +Q.get('cap') | 0 : undefined, weather: Q.get('weather') === '0' ? false : undefined, autoPick: Q.has('auto') ? +Q.get('auto') | 0 : undefined }) : null;
const state = world ? world.pl.s : newState(room, TUNE);
const TYPE_COLOR = (GG.U && GG.U.TYPE_COLOR) || {};
const PICK_COLOR = { xp: '#6fd3ff', xpBig: '#3da8ff', heal: '#5fe08a', magnet: '#ff9ed8', bomb: '#ff7b3d', item: '#ffd23f', held: '#ff8fd0' };
const { renderer, scene, camera } = makeRenderer(canvas);
let roomMeshes = [];
/** Show a level (P4: a run moves from one to the next: the old one's meshes go). */
let roomBuilds = 0;
function showRoom() {
	roomBuilds++;
	for (const m of roomMeshes) { scene.remove(m); m.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
	roomMeshes = [buildTerrain(room), buildWater(room)];
	if (room.rails && room.rails.length) roomMeshes.push(buildRails(room));
	if (GEN !== null) roomMeshes.push(buildScatter(room), buildExit(room.exit));
	for (const m of roomMeshes) scene.add(m);
}
showRoom();

// ---------------------------------------------------------------- the camera and the input
const cam = { yaw: Math.PI, pitch: 0.5, dist: 10.5, manual: 0, follow: Q.get('follow') !== '0' };   // (looking north, up the room)
state.facing = cam.yaw;                                  // (you start with your back to the camera)
const keys = new Set();
let override = null;        // (tests: a fixed input instead of the devices)
const acts = new Set();     // (the site's actions held now: site/input.js, from the keyboard and a controller alike)
const touch = { stick: null, look: null, jump: false, slide: false };
addEventListener('keydown', (e) => { keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyR') { if (world) location.reload(); else { Object.assign(state, newState(room, TUNE)); state.facing = cam.yaw; } } });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('keydown', (e) => { if (e.code === 'KeyM') toggleMap(); else if (e.code === 'Escape' && mapBig) toggleMap(false); });   // (P4) the zone map
document.getElementById('map').addEventListener('click', () => toggleMap());
addEventListener('blur', () => keys.clear());
// iPhone: two thumbs on the screen are how this is played (the stick and a button), and Safari took them for a pinch:
// the page zoomed in, and since every touch after that is the game's, there was no pinching back out (owner,
// 2026-11-12). Safari does not honour `touch-action: none` for this, so the pinch is refused here: its own gesture
// events, and any move with two fingers down. (/site/zoomfix.js, loaded by the page, snaps back whatever still gets
// through.) A text box keeps its normal behaviour.
{
	const typing = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
	for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => { if (!typing(e.target)) e.preventDefault(); }, { passive: false });
	document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1 && !typing(e.target)) e.preventDefault(); }, { passive: false });
	// …and a quick second tap on the field or on JUMP / SLIDE is a second jump, not a double-tap zoom. (Only there: they
	// are read as pointers, so no click is lost; a menu's buttons keep their taps.)
	let tapAt = -1e9;
	document.addEventListener('touchend', (e) => { const t = e.target, game = !!t && (t.id === 'c' || (t.classList && t.classList.contains('btn'))); if (!game) return; const now = performance.now(); if (now - tapAt < 400) e.preventDefault(); tapAt = now; }, { passive: false });
}
// the mouse turns the camera while a button is held
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
	if (e.pointerType === 'touch') {
		if (e.clientX < innerWidth / 2 && !touch.stick) touch.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 };
		else if (!touch.look) touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
	} else drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
	canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
	const turn = (o) => { cam.manual = performance.now(); cam.yaw -= (e.clientX - o.x) * 0.006; cam.pitch = Math.max(0.15, Math.min(1.1, cam.pitch + (e.clientY - o.y) * 0.004)); o.x = e.clientX; o.y = e.clientY; };
	if (drag && e.pointerId === drag.id) turn(drag);
	if (touch.look && e.pointerId === touch.look.id) turn(touch.look);
	if (touch.stick && e.pointerId === touch.stick.id) { const R = 56; touch.stick.x = Math.max(-1, Math.min(1, (e.clientX - touch.stick.x0) / R)); touch.stick.y = Math.max(-1, Math.min(1, (e.clientY - touch.stick.y0) / R)); }
});
const up = (e) => { if (drag && e.pointerId === drag.id) drag = null; if (touch.look && e.pointerId === touch.look.id) touch.look = null; if (touch.stick && e.pointerId === touch.stick.id) touch.stick = null; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
for (const [id, key] of [['b-jump', 'jump'], ['b-slide', 'slide']]) {
	const b = document.getElementById(id);
	const set = (v) => (e) => { e.preventDefault(); touch[key] = v; };
	b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); b.addEventListener('pointerleave', set(false));
}

/** (P1) Left alone for a moment, the camera swings gently round behind the way you are running — so one thumb can
 *  play. It never swings while you run toward it, and any camera input takes it back. */
function followCam(dt) {
	if (!cam.follow || performance.now() - cam.manual < 1200 || !(state.grounded || state.swimming)) return;
	const sp = Math.hypot(state.vx, state.vz);
	if (sp < 2.5) return;
	let d = Math.atan2(state.vx, state.vz) - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
	if (Math.abs(d) < 2.3) cam.yaw += d * Math.min(1, dt * 0.9);
}
/** This tick's input: the devices' stick, turned from the camera's axes into the world's. */
function readInput(dt) {
	if (override) return override;
	let ix = 0, iy = 0, jump = false, crouch = false, turn = 0;
	if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
	if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
	if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1;
	if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1;
	jump = keys.has('Space') || acts.has('confirm'); crouch = keys.has('ShiftLeft') || keys.has('ShiftRight') || acts.has('cancel') || (!drun && acts.has('secondary'));   // (a Dive: slide is the DODGE, and C / X is special 1)   // (the site's scheme: Z / A jumps, X / B and C slide)
	if (acts.has('prev')) turn += 1; if (acts.has('next')) turn -= 1;   // (Q / E, L / R)
	const pad = (window.__owFakePads || (navigator.getGamepads ? [...navigator.getGamepads()] : [])).find((p) => p && p.connected);   // (__owFakePads: a test's controller, as site/gamepad.js reads it)
	if (pad) {
		const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
		ix += dz(pad.axes[0] || 0); iy -= dz(pad.axes[1] || 0); turn -= dz(pad.axes[2] || 0) * 1.4;
		cam.pitch = Math.max(0.15, Math.min(1.1, cam.pitch + dz(pad.axes[3] || 0) * dt * 1.2));
	}
	if (touch.stick) { ix += touch.stick.x; iy -= touch.stick.y; }
	jump = jump || touch.jump; crouch = crouch || touch.slide;
	if (turn) cam.manual = performance.now();
	cam.yaw += turn * dt * 2.4;
	// camera axes -> world: forward is [sin yaw, cos yaw], right is forward × up = [-cos yaw, sin yaw]
	const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
	return { mx: fx * iy - fz * ix, mz: fz * iy + fx * ix, jump, crouch };
}

// ---------------------------------------------------------------- the crowd
const rnd = (() => { let a = 20261111; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const crowd = [];
{
	const flat = [];   // open floor cells (no slope; the test room: height 0; a level: dry floor below the rim), away from the spawn
	const open = (i) => (GEN === null ? room.cells[i] === 0 : room.cells[i] < room.rimH && !room.water.has(i));
	const sx = GEN === null ? SPOTS.start[0] : room.spawn[0], sz = GEN === null ? SPOTS.start[1] : room.spawn[2];
	for (let cz = 1; cz < room.h - 1; cz++) for (let cx = 1; cx < room.w - 1; cx++) { const i = cz * room.w + cx; if (open(i) && !room.slopes.has(i) && Math.hypot((cx + 0.5) * CELL - sx, (cz + 0.5) * CELL - sz) > 5) flat.push([cx, cz]); }
	for (let i = 0; i < N && CROWD_DEX.length && flat.length; i++) {
		const [cx, cz] = flat[Math.floor(rnd() * flat.length)];
		crowd.push({ dex: CROWD_DEX[i % CROWD_DEX.length], x: (cx + 0.15 + rnd() * 0.7) * CELL, z: (cz + 0.15 + rnd() * 0.7) * CELL, facing: rnd() * 6.2832, turn: Q.has('still') ? 0 : (rnd() - 0.5) * 1.2, t0: rnd() * 5 });
	}
}

// ---------------------------------------------------------------- sheets
const sheets = new Map();   // 'dex/Anim' -> { batch, meta, img }
/** The key of a species' sheets: its shiny ones' when it is shiny and has them (`sh` in the sprites' table), as the 2D game. */
const skey = (dex, shiny) => (shiny && META[dex] && META[dex].sh ? dex + 's' : String(dex));
async function sheet(dex, anim, max, shiny = false) {
	const pm = META[dex], meta = pm && pm.a && pm.a[anim], sh = !!shiny && !!pm && !!pm.sh, key = (sh ? dex + 's' : dex) + '/' + anim;
	if (!meta) return null;
	const tex = await loadSheet(`../assets/pokemon/${pm.al || dex}/${pm.src ? pm.src + '/' : ''}${sh ? 's/' : ''}${anim}.png`);   // (a fallback sheet is in a folder of its own: 42 species, the Megas, some formes)
	const batch = new SpriteBatch(tex, max);
	scene.add(batch.mesh);
	const o = { batch, meta, img: tex.image, lift: footLift(meta, tex.image, { perFrame: anim === 'Idle', hover: !!META[dex].hv }), shadow: 0.35 + 0.18 * ((META[dex].s | 0) + 1), dm: pm.dm || null, fx: pm.fx || null, k: pm.k || 1 };
	sheets.set(key, o);
	return o;
}
/** A sheet's quad for a direction (0-7). A fallback sheet has fewer rows (`dm`: which row is each direction's), may be
 *  mirrored (`fx`: in which directions, about its anchor), and may be drawn larger (`k`), as the 2D game draws it. */
function sq(s, frame, dir, scale) {
	const q = spriteQuad(s.meta, s.img, frame, s.dm ? s.dm[dir] || 0 : dir, scale * s.k, s.lift);
	if (s.fx && s.fx[dir]) { const r = q.rect, u = q.uv; q.rect = [-r[2], r[1], -r[0], r[3]]; q.uv = [u[2], u[1], u[0], u[3]]; }
	return q;
}
// A Mega has no walking sheet: it is drawn as its one battle sprite (the 2D game's own art for it), cut to what is
// drawn of it, mirrored when it faces the viewer's right, 1.12x the height of the form it came from (the 2D game's).
const megaSheets = new Map();   // Mega id -> { batch, img, box } (null while it loads)
let megaNow = 0;                // (the Mega drawn this frame)
/** What is drawn inside a part of an image: [x0, y0, x1, y1] in its pixels. */
function inkBox(img, x, y, w, h) {
	const c = document.createElement('canvas'); c.width = w; c.height = h;
	const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, x, y, w, h, 0, 0, w, h);
	const d = g.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
	for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 16) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
	return x1 < 0 ? [x, y, x + w, y + h] : [x + x0, y + y0, x + x1 + 1, y + y1 + 1];
}
/** One still of a species, as HTML: its Idle sheet's first frame, facing you, `px` tall (a fallback sheet has its own
 *  folder; a shiny its own sheet). For an evolution's card and the Ultimate's cut-in. */
function spriteHtml(dex, shiny, px) {
	const pm = META[dex], anim = pm && pm.a ? (pm.a.Idle ? 'Idle' : pm.a.Walk ? 'Walk' : '') : '', m = anim ? pm.a[anim] : null; if (!m) return '';
	const k = px / m.h, url = `../assets/pokemon/${pm.al || dex}/${pm.src ? pm.src + '/' : ''}${shiny && pm.sh ? 's/' : ''}${anim}.png`;
	return `<span class="rx-spr" style="width:${Math.round(m.w * k)}px;height:${Math.round(px)}px"><span style="width:${m.w}px;height:${m.h}px;background:url(${url}) 0 0 no-repeat;transform:scale(${k.toFixed(3)})"></span></span>`;
}
function megaSheet(id) {
	if (megaSheets.has(id)) return megaSheets.get(id);
	megaSheets.set(id, null);
	const M = GG.ExpMega, src = M && M.BY[id] && M.srcOf(M.BY[id]); if (!src) return null;
	loadSheet(src).then((tex) => { const batch = new SpriteBatch(tex, 1); scene.add(batch.mesh); megaSheets.set(id, { batch, img: tex.image, box: inkBox(tex.image, 0, 0, tex.image.width, tex.image.height) }); }).catch((e) => console.warn(e.message));
	return null;
}
/** How tall a sheet's first frame is drawn, in its pixels. */
function inkH(ps) { if (!ps.inkH) { const b = inkBox(ps.img, 0, 0, ps.meta.w, ps.meta.h); ps.inkH = b[3] - b[1]; } return ps.inkH; }
const shadows = new Shadows(N + 4 + (world ? world.cap : WATCH ? CK.CAP + 20 : 0));
scene.add(shadows.mesh);
const shots = world || WATCH ? new Shots(600) : null, flashes = world || WATCH ? new Flashes(scene) : null;
if (shots) scene.add(shots.mesh);
// what lies on the ground, as pictures (props.js): XP, berries, items, what a zone holds
const props = shots ? (() => {
	const cv = document.createElement('canvas'); cv.width = cv.height = 512;
	const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.colorSpace = THREE.NoColorSpace;
	const batch = new SpriteBatch(tex, 900); scene.add(batch.mesh);
	const atlas = new Props({ canvas: cv, onChange: () => { tex.needsUpdate = true; }, ecoCol: { ...EK.COL, ...Object.fromEntries(Object.entries(LANDMARKS).map(([k, v]) => ['lm_' + k, v[2]])) },
		uiIcon: (n) => (GG.Icons && GG.Icons.UI && GG.Icons.UI[n] ? GG.Icons.canvas(n) : null),
		imgUrl: (n) => (GG.ExpItems && GG.ExpItems.icon ? GG.ExpItems.icon(n) : '/overworld/item_icons/' + n + '.png'),
		itemIcon: (id) => { const it = GG.ExpItems && GG.ExpItems.IT && GG.ExpItems.IT[id]; return it && it.icon ? { img: it.icon } : GG.Icons && GG.Icons.UI && GG.Icons.UI[id] ? { ui: id } : null; } });
	return { atlas, batch, n: 0, beads: 0 };
})() : null;
/** A thing on the ground: its picture if it has one (-> true), else nothing is drawn here (the caller's bead). */
function prop(key, x, y, z, k = 1) {
	const c = props && props.atlas.get(key); if (!c) { if (props) props.beads++; return false; }
	if (!c.empty) { const r = c.rect; props.batch.add(x, y, z, k === 1 ? r : [r[0] * k, r[1] * k, r[2] * k, r[3] * k], c.uv, 1); }
	props.n++; return true;
}
/** The Pokémon that stands at a thing of the zone (Meowth at its stall, the Unown over its stone, who is in a cage). */
function propMon(dex, x, y, z, t) {
	const s = sheets.get(dex + '/Walk'); if (!s) { wantSheet(dex); return; }
	const q = sq(s, frameAt(s.meta, t), facingRow(cam.yaw + Math.PI, cam.yaw), 1);
	s.batch.add(x, y, z, q.rect, q.uv, 1);
}

// ---------------------------------------------------------------- the loop
const perf = { frames: [], sim: [], last: 0, acc: 0 };
let right = new THREE.Vector3(1, 0, 0), camDist = cam.dist, bob = 0, ready = false, simTicks = 0;
function resize() {
	const dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // (the 2D game's cap)
	renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
	camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function draw(t) {
	// the camera: behind the lead, a little farther back at speed, a dip on a hard landing
	const sp = Math.hypot(state.vx, state.vz);
	camDist += ((cam.dist + Math.min(3, sp * 0.18)) - camDist) * 0.08;
	bob *= 0.86;
	right = placeCamera(camera, room, [state.x, state.y + 1.3 - bob, state.z], cam.yaw, cam.pitch, camDist);

	for (const s of sheets.values()) s.batch.begin();
	for (const s of megaSheets.values()) if (s) s.batch.begin();
	if (props) { props.batch.begin(); props.n = 0; props.beads = 0; }
	shadows.begin();
	// the crowd
	for (const e of crowd) {
		const s = sheets.get(e.dex + '/Idle'); if (!s) continue;
		const y = groundAt(room, e.x, e.z), q = sq(s, frameAt(s.meta, t + e.t0), facingRow(e.facing + e.turn * t, cam.yaw), 1);
		s.batch.add(e.x, y, e.z, q.rect, q.uv, 1);
		shadows.add(room, e.x, e.z, y, s.shadow);
	}
	// (P3) the fight: enemies (brighter for a moment when hit), shots and orbs
	const E = world ? world.enemies : view ? view.enemies : null;
	if (E) {
		for (const e of E) {
			let s = sheets.get(e.dex + '/Walk');
			if (e.shiny) { const ss = sheets.get(skey(e.dex, true) + '/Walk'); if (ss) s = ss; else wantSheet(e.dex, true); }   // (a shiny: its own colours, once its sheet is here)
			if (!s) { wantSheet(e.dex); continue; }
			const q = sq(s, e.asleep ? 0 : frameAt(s.meta, t + e.id * 0.37), facingRow(e.a.facing, cam.yaw), e.scale || 1);
			s.batch.add(e.a.x, e.a.y, e.a.z, q.rect, q.uv, e.flash > 0 ? 1.7 : e.asleep ? 0.62 : 1);
			shadows.add(room, e.a.x, e.a.z, e.a.y, s.shadow * (e.scale || 1));
		}
		shots.begin();
		const ball = (b) => { if (!(b[4] >= 32 && PICK[b[4] - 32] && prop(PICK[b[4] - 32], b[0], b[1] - 0.3, b[2]))) shots.add(b[0], b[1], b[2], b[3], ballColour(b[4], TYPE_COLOR, PICK_COLOR)); };
		for (const e of E) if (e.shiny) for (let k = 0; k < 3; k++) { const a = t * 2.6 + k * 2.094, r = (e.cr || 0.4) + 0.35; shots.add(e.a.x + Math.cos(a) * r, e.a.y + 0.5 + (e.cr || 0.4) * (1 + Math.sin(t * 4 + k * 1.7)) , e.a.z + Math.sin(a) * r, 0.07, '#fff3c4'); }   // (a shiny's sparkles)
		if (!world) {   // watching: everything that is a ball comes ready-made in the frame
			for (const b of view.balls) ball(b);
			for (const e of E) if (e.shield > 0) shots.add(e.a.x, e.a.y + 1.6 * (e.scale || 1), e.a.z, 0.16, '#7fc8ff');
		}
		for (const p of world ? world.shots : []) shots.add(p.x, p.y, p.z, Math.max(0.14, p.r), TYPE_COLOR[p.mtype]);
		if (JOIN && coView) for (const b of coView.balls) if (b[4] !== 31) ball(b);   // (a guest: the host's shots and the floor's pickups; enemy shots are its own copies)
		if (world) for (const p of world.orbs) shots.add(p.x, p.y, p.z, Math.max(0.16, p.r), TYPE_COLOR[p.mtype]);
		// what lies in the world: mines (a small ball on the floor), turrets (a ball that hangs and bobs), meteors (a ball
		// coming down on its mark), patches (a disc on the floor, drawn once, fading over its life)
		// pickups: the 2D game's pictures, bobbing over the floor (the XP gem, the berry, the magnet, the bomb, an item on its gold disc)
		if (world) for (const p of world.pickups) {
			const up = Math.abs(Math.sin(p.t * 0.8)) * 0.18, key = p.kind === 'item' || p.kind === 'held' ? 'item:' + p.value : p.kind;
			if (prop(key, p.x, p.y + up, p.z)) shadows.add(room, p.x, p.z, p.y + up, p.kind === 'xp' ? 0.2 : 0.3);
			else shots.add(p.x, p.y + 0.3 + up, p.z, p.kind === 'xpBig' ? 0.24 : p.kind === 'xp' ? 0.15 : 0.26, PICK_COLOR[p.kind]);
		}
		// (P4) what the zone holds: its picture (one being charged swells), with the Pokémon that stands at it
		for (const o of run && run.eco ? ecoView(run) : rv ? rv.eco : []) {
			const key = 'eco:' + o.kind, up = BOBS.has(key) ? 0.12 + Math.sin(t * 3 + o.i) * 0.12 : 0, pm = PROP_MON[o.kind];
			if (prop(key, o.x, o.y + up, o.z, 1 + (o.ch || 0) * 0.3)) { shadows.add(room, o.x, o.z, o.y + up, /ball|great|comet/.test(o.kind) ? 0.45 : 0.9); if (pm) propMon(pm[0], o.x, o.y + pm[1] + (pm[1] ? Math.sin(t * 3 + o.i) * 0.12 : 0), o.z, t + o.i); else if (o.kind === 'cage' && o.v) propMon(o.v, o.x, o.y, o.z, t + o.i); }
			else { const big = /unown|comet|challenge|cursedaltar|greed|meowth|slots/.test(o.kind); shots.add(o.x, o.y + (big ? 1.1 : 0.55) + Math.sin(t * 2 + o.i) * 0.08, o.z, (big ? 0.42 : EK.SMALL.includes(o.kind) ? 0.22 : 0.3) * (1 + o.ch * 0.8), EK.COL[o.kind]); }
		}
		if (world) for (const e of world.enemies) if (e.shield > 0) shots.add(e.a.x, e.a.y + Math.max(1.2, e.cr * 2) + 0.35, e.a.z, 0.16, '#7fc8ff');   // a shield: a blue bead over its head
		if (world) for (const p of world.eshots) shots.add(p.x, p.y, p.z, Math.max(0.2, p.r), '#ff5f8f');   // an enemy's shot: always the same angry pink
		// Expedition's effects: a bomb on its arc, a whirl on the floor, a wave's ring spreading
		for (const f of world ? world.effects : []) {
			const c = TYPE_COLOR[f.m.type];
			if (f.k === 'lob') { const k = Math.min(1, f.t / f.dur); shots.add(f.x0 + (f.x - f.x0) * k, f.y0 + (f.y - f.y0) * k + Math.sin(k * Math.PI) * CK.EXP.lobHigh * 0.0625, f.z0 + (f.z - f.z0) * k, 0.3, c); if (!f.seen) { f.seen = true; flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, f.dur, 0.9); } }
			else if (f.k === 'smite' && !f.seen) { f.seen = true; flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, f.dur, 0.85); }
			else if (f.k === 'vortex' && !f.seen) { f.seen = true; flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, f.dur, 0.25); }
			else if (f.k === 'wave' && (simTicks & 3) === 0) flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, 0.12, 0.93);
		}
		for (const f of world ? world.fields : []) {
			const c = TYPE_COLOR[f.m.type];
			if (f.kind === 'mine') shots.add(f.x, f.y + 0.18, f.z, 0.2, c);
			else if (f.kind === 'turret') shots.add(f.x, f.y + 1 + Math.sin(t * 4 + f.id) * 0.12, f.z, 0.34, c);
			else if (f.kind === 'meteor') { const k = Math.max(0, Math.min(1, f.t / f.fall)); if (f.t > 0) shots.add(f.x + (1 - k) * 2.5, f.y + 0.3 + (1 - k) * 10, f.z, 0.45, c); if (!f.seen) { f.seen = true; flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, f.fall - Math.min(0, f.t), 0.9); } }
			else if (f.kind === 'patch' && !f.seen) { f.seen = true; flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, f.life, 0); }
		}
		if (drun) {   // a Dive: who sleeps (a pale bead that bobs), the elites (a bead in their affix's colour), the lost Pokémon
			for (const e of world.enemies) { if (e.dead) continue; const top = e.a.y + Math.max(1.1, (e.cr || 0.4) * 2) + 0.4; if (e.asleep) shots.add(e.a.x + 0.25, top + Math.sin(t * 1.6 + e.id) * 0.12, e.a.z, 0.09, '#dbe8ff'); else if (e.xaff) shots.add(e.a.x, top, e.a.z, 0.13, DIVE_AFF[e.xaff]); }
			// (part 5) the chests (a Poké Ball that bobs), the shut plugs (a boulder, a thicket, against the rock), the landmark
			for (const c of drun.chests) if (!c.open) { const up = 0.12 + Math.sin(t * 3 + c.x) * 0.12; if (prop('eco:freeball', c.x, up, c.z)) shadows.add(room, c.x, c.z, up, 0.45); }
			for (const pg of room.plugs) if (!pg.open) for (const fc of pg.faces) prop('eco:' + pg.kind, fc[0], 0, fc[2], 1.9);
			if (drun.lm) { const lm = drun.lm; prop('eco:lm_' + lm.kind, lm.x, 0, lm.z, 1.7); shadows.add(room, lm.x, lm.z, 0, 0.9); if (!lm.used) shots.add(lm.x, 3.6 + Math.sin(t * 2.2) * 0.15, lm.z, 0.16, LANDMARKS[lm.kind][2]); }
			const lo = drun.stray;
			if (lo && !lo.done) { propMon(lo.dex, lo.x, lo.y, lo.z, lo.follow ? t : 0); shadows.add(room, lo.x, lo.z, lo.y, 0.5); if (!lo.follow) shots.add(lo.x, lo.y + 1.7 + Math.sin(t * 4) * 0.12, lo.z, 0.2, '#7dffb0'); }
		}
		if (!paused && state.rail >= 0 && simTicks % 3 === 0) burst(state.x, state.y + 0.05, state.z, '#ffe9a0', 2, 2.2, { up: 2.2, life: 0.3, r: 0.06 });   // (grinding a rail: sparks under you)
		drawSparks(t);
		shots.end();
	}
	// (P3n) the other players
	for (const m of mates()) {
		const sh = sheets.get(m.dex + '/Walk'); if (!sh) { wantSheet(m.dex); continue; }
		const moving = Math.hypot(m.s.vx || 0, m.s.vz || 0) > 0.6 || !m.s.grounded, q = sq(sh, moving ? frameAt(sh.meta, t) : 0, facingRow(m.s.facing, cam.yaw), 1.15);
		sh.batch.add(m.s.x, m.s.y, m.s.z, q.rect, q.uv, m.dead ? 0.45 : 1);
		shadows.add(room, m.s.x, m.s.z, m.s.y, sh.shadow * 1.15);
	}
	// (P4) capture: your Support Alphas (sprites that follow you), the fainted (dimmed, a bead over them while the window
	// is open), and the ball while it shakes
	if ((run && run.cap) || rv) {
		const cv = run ? capView(run) : { faint: rv.faint, cine: rv.cine, sa: rv.sa.map((dex, i) => { const who = grun && mates()[0] ? mates()[0].s : state, [x, z] = teamSpot(who, who.facing, i, rv.sa.length); return { dex, x, z, y: Math.min(groundAt(room, x, z), who.y + 2), facing: who.facing, moving: Math.hypot(who.vx || 0, who.vz || 0) > 0.6 }; }) };
		if (grun && grun.cap) { const own = capView(grun); cv.sa = cv.sa.concat(own.sa); if (own.cine) cv.cine = own.cine; }   // (a guest: its own team and its own ball, with the host's)
		// (co-op) the others' teams, behind each of them: a host has its guests' from their own word, a guest or a watcher from the run's row
		for (const m of mates()) { const theirs = run ? (world.mates.find((q) => q.id === m.id) || {}).sa : rv && rv.mateSa.get(m.id); if (!theirs || m.id === MYID) continue; theirs.forEach((dex, i) => { const [x, z] = teamSpot(m.s, m.s.facing, i, theirs.length); cv.sa.push({ dex, x, z, y: Math.min(groundAt(room, x, z), m.s.y + 2), facing: m.s.facing, moving: false }); }); }
		for (const a of cv.sa) { const sh = sheets.get(a.dex + '/Walk'); if (!sh) { wantSheet(a.dex); continue; } const q = sq(sh, a.moving ? frameAt(sh.meta, t) : 0, facingRow(a.facing, cam.yaw), 1.15); sh.batch.add(a.x, a.y, a.z, q.rect, q.uv, 1); shadows.add(room, a.x, a.z, a.y, sh.shadow * 1.15); }
		for (const f of cv.faint) { const fs2 = f.kind === 'shiny' ? sheets.get(skey(f.dex, true) + '/Walk') : null, sh = fs2 || sheets.get(f.dex + '/Walk'); if (f.kind === 'shiny' && !fs2) wantSheet(f.dex, true); if (sh) { const q = sq(sh, 0, 0, 1.4); sh.batch.add(f.x, f.y, f.z, q.rect, q.uv, 0.45); } else wantSheet(f.dex); shots.add(f.x, f.y + 1.9 + Math.sin(t * 6) * 0.12, f.z, 0.28, f.kind === 'alpha' ? '#ff4d5e' : '#9ae6ff'); }
		if (cv.cine) { const p = cv.cine.phase, wob = p.n === 'shake' ? Math.sin(p.u * 6.2832) * 0.18 : 0; shots.add(cv.cine.x + wob, cv.cine.y + (p.n === 'throw' ? 1.6 - p.u * 1.2 : 0.4), cv.cine.z, 0.34, p.n === 'click' ? '#ffe14d' : cv.cine.kind === 'alpha' ? '#3fa35a' : '#ff4d5e'); note(p.n === 'click' ? 'Gotcha!' : p.n === 'shake' ? '. '.repeat(p.k + 1) : cv.cine.kind === 'alpha' ? 'Friend Ball!' : 'Poké Ball!', 250); }
	}
	// the lead
	const name = stateName(state), anim = name === 'idle' || name === 'staggered' ? 'Idle' : 'Walk', LD = world && world.pl.mon.dex !== DEX ? world.pl.mon.dex : rv && rv.league ? rv.league.form : DEX, LS = !!(myRun && myRun.lg ? myRun.lg.shiny : rv && rv.league && rv.league.shiny), LK = skey(LD, LS), ps = sheets.get(LK + '/' + anim) || sheets.get(LK + '/Idle') || (wantLead(LD, LS), sheets.get(LD + '/' + anim) || sheets.get(LD + '/Idle')) || (wantLead(LD), sheets.get(DEX + '/' + anim) || sheets.get(DEX + '/Idle'));   // (P4: a League member is drawn as the stage it is)
	const MG = myRun && myRun.lg ? myRun.lg.mega : rv && rv.league ? rv.league.mega : 0, ms = MG && ps ? megaSheet(MG) : null;
	megaNow = ms ? MG : 0;
	if (myRun && myRun.ult && myRun.ult.hidden) { /* (a Flying Ultimate: you are in the sky until you come down) */ } else if (ms) {
		const b = ms.box, bw = b[2] - b[0], bh = b[3] - b[1], k = PX * 1.15 * GG.ExpMega.K.H_K * inkH(ps) / bh, row = facingRow(state.facing, cam.yaw), flip = row >= 1 && row <= 3;
		const u0 = b[0] / ms.img.width, u1 = b[2] / ms.img.width;
		ms.batch.add(state.x, state.y, state.z, [-bw / 2 * k, 0, bw / 2 * k, bh * k], [flip ? u1 : u0, b[1] / ms.img.height, flip ? u0 : u1, b[3] / ms.img.height], 1);
		shadows.add(room, state.x, state.z, state.y, ps.shadow * 1.15 * GG.ExpMega.K.H_K);
	} else if (ps) {
		const q = sq(ps, name === 'sliding' || name === 'grinding' || name === 'surfing' ? 0 : frameAt(ps.meta, state.t * (name === 'running' || name === 'wallrunning' ? 1.25 : 1)), facingRow(state.facing, cam.yaw), 1.15);
		ps.batch.add(state.x, state.y, state.z, q.rect, q.uv, 1);
		shadows.add(room, state.x, state.z, state.y, ps.shadow * 1.15);
	}
	for (const s of sheets.values()) s.batch.end(right);
	for (const s of megaSheets.values()) if (s) s.batch.end(right);
	if (props) props.batch.end(right);
	shadows.end();
	renderer.render(scene, camera);
}

let hudAt = -1e9, hazAt = -1e9;   // (when the screen's text, and a watched run's hostile ground, were last drawn)
function frame(now) {
	requestAnimationFrame(frame);
	if (SITE_HOST) SITE_HOST.tick();   // (asks whether a friend is watching; sends a second's frames while one is)
	const dt = Math.min(0.1, (now - (perf.last || now)) / 1000);
	if (perf.last) { perf.frames.push(now - perf.last); if (perf.frames.length > 240) perf.frames.shift(); }
	perf.last = now;
	perf.acc += dt;
	if (paused) perf.acc = 0;   // (the menu is up, alone: the fight waits)
	const t0 = performance.now();
	const input = readInput(dt);
	followCam(dt);
	while (perf.acc >= K.TICK) {
		if (WATCH) { perf.acc -= K.TICK; simTicks++; continue; }   // (watching: nothing is simulated here)
		if (world) {
			if (JOIN) coView = guestSync(world); else if (world.mates.length) hostStep(world);   // (co-op: the copies / the puppets, brought up to now)
			if (run) {   // (P4) the run's own rules round the fight's tick: banners, the next zone's level, the end
				stepRun(run, input, K.TICK);
				for (const q of run.says) note(q.text, q.s * 1000);
				if (run.pick !== shownPick) showPick();
				if (run.sv && simTicks % 30 === 0) {   // (P4) Survival: the hostile ground near you, kept lit, and the night's dark
					for (const o of hazardsNow(run)) if (Math.hypot(o.x - state.x, o.z - state.z) < 60) flashes.arc(o.x, o.y + 0.04, o.z, o.r, 0, 6.2832, HAZ_COL[o.kind], 0.95, 0);
					const dark = GG.ExpSurv ? GG.ExpSurv.nightOf(world.t).dark : 0; canvas.style.filter = dark > 0 ? `brightness(${(1 - dark).toFixed(2)})` : '';
				}
				if (run.rx && simTicks % 12 === 0) {   // the marks a reaction needs, shown on the foes near you: wet (blue), chilled (pale, a ring a stack)
					for (const e of world.enemies) { if (e.dead || Math.hypot(e.a.x - state.x, e.a.z - state.z) > 40) continue; const [wet, ch] = marksOf(e, world.t); if (wet) flashes.arc(e.a.x, e.a.y + 0.05, e.a.z, e.cr * 1.3 + 0.2, 0, 6.2832, '#4fa3ff', 0.4, 0.55); for (let i = 0; i < ch; i++) flashes.arc(e.a.x, e.a.y + 0.07, e.a.z, e.cr * 0.5 + 0.25 * i + 0.15, 0, 6.2832, '#bff2ff', 0.4, 0.85); }
				}
				if (run.w.room !== room) { room = run.w.room; mapBase = null; showRoom(); state.facing = cam.yaw; }
				if (run.ended && !runOver) { runOver = runResult(run); keepRun(runOver); if (SITE_HOST) setTimeout(() => SITE_HOST.end(), 1300);   /* (the last second's frames carry the end) */ note(runOver.survival ? `${runOver.lines.join(' · ')} · score ${runOver.score}` : `${runOver.title} ${runOver.line} · score ${runOver.score} · pay ${runOver.pay.pay}${runOver.medal ? ' · ' + runOver.medal + ' medal' : ''}`, 600000); }
			} else if (drun) {   // a Dive: the floor's rules round the fight's tick; the next floor's room; the end
				stepDive(drun, input, K.TICK);
				for (const q of drun.says) note(q.text, q.s * 1000);
				if (drun.w.room !== room) { room = drun.w.room; mapBase = null; showRoom(); state.facing = cam.yaw; }
				if (simTicks % 45 === 0) {   // the rope's circle where you arrived (gold); sealed stairs (red)
					if (drun.cadence.rope) flashes.arc(room.spawn[0], room.spawn[1] + 0.05, room.spawn[2], DR.K.ROPE_R * CELL, 0, 6.2832, '#ffd23f', 0.8, 0.9);
					if (drun.sealed) flashes.arc(room.stairs[0], room.stairs[1] + 0.05, room.stairs[2], DR.K.STAIRS_R * CELL + 0.6, 0, 6.2832, '#ff4d5e', 0.8, 0.8);
				}
				if (drun.ended && !runOver) { runOver = diveResult(drun); kept = { ok: false, text: '3D Dive is a preview: nothing is saved yet.' }; note(runOver.title, 600000); }
			} else if (grun) { stepGuest(grun, input, K.TICK); for (const q of grun.says) note(q.text, q.s * 1000); if (grun.pick !== shownPick) showPick(); if (runOver === null && grun.ended) { runOver = grun.won ? 'won' : 'lost'; note(grun.won ? 'EXPEDITION COMPLETE!' : 'RUN OVER', 600000); } }
			else tick(world, input, K.TICK);
			fightEvents(world.events);
			if (coView && coView.events.length) fightEvents(coView.events.filter((ev) => !(ev.k === 'hit' && ev.by === MYID) && ev.k !== 'levelup' && ev.k !== 'hurt' && ev.k !== 'level'));   // what the host and the others did
			share();
		} else step(state, input, room, K.TICK, TUNE);
		perf.acc -= K.TICK; simTicks++;
		play(moveSounds(state));
		if (state.landed > 9) bob = Math.min(0.5, state.landed * 0.02);
		if (state.hard) note('hard landing: hold SLIDE as you land to break a fall', 2200); else if (state.broke) note('fall broken (' + state.broke + ')', 1400);
	}
	perf.sim.push(performance.now() - t0); if (perf.sim.length > 240) perf.sim.shift();
	if (WATCH) watchStep(dt);
	if (flashes) flashes.update(dt);
	draw(now / 1000);
	if (world || WATCH) drawNumbers(dt);
	// The screen's text, four times a second BY THE CLOCK. (It used to be "when the tick count is a multiple of 16": a slow
	// device runs about 6 ticks a frame, and from an odd count that seldom lands on a multiple of 16: the screen stood still for seconds.)
	if (now - hudAt >= 250 || now < hudAt) { hudAt = now; showHud(); }
	if (GEN !== null) { showMap(); if (!WATCH && !EXP && !DIVE && !XJ && !leaving && state.grounded && exitDist() < 1.5) { leaving = true; note('exit reached: next level…', 4000); nextLevel(); } }
}
// ---------------------------------------------------------------- (P2) a generated level: the exit and the minimap
let leaving = false, mapBase = null, runOver = null;
const DIVE_AFF = { swift: '#ffe14d', tough: '#7fc8ff', rage: '#ff4d5e' };
const HAZ_COL = { mud: '#7a5a34', brambles: '#3f7a3a', quicksand: '#d9b56a', burning: '#ff6a2a' };   // (the 2D game's colours for them)
const exitDist = () => Math.hypot(state.x - room.exit[0], state.z - room.exit[2]);
/** The next level: the next seed, same biome and options (a fresh page: nothing of this level is kept). */
function nextLevel() { const q = new URLSearchParams(location.search); q.set('gen', String((GEN + 1) >>> 0)); if (!window.__m3d.holdExit) setTimeout(() => { location.search = q.toString(); }, 700); }
let mapBig = false, watchFog = null, fogCv = null, fogN = -1;
/** (P4) The fog of this screen: a run's own (yours, a guest's), or a watcher's (it follows the player it watches). null: no fog (not a run). */
function fogNow() {
	if (myRun) return fogOf(myRun);
	if (!rv) return null;
	if (!watchFog || watchFog.room !== room) watchFog = newFog(room);
	reveal(watchFog, state.x, state.z);
	return watchFog;
}
/** (P4) The zone map: the minimap, big, with what you have found named under it. M or a tap on the minimap. */
function toggleMap(on = !mapBig) {
	mapBig = !!on && GEN !== null;
	document.getElementById('map').classList.toggle('big', mapBig);
	const lg = document.getElementById('maplegend'); lg.style.display = mapBig ? 'block' : 'none';
	return mapBig;
}
function showMap() {
	const el = document.getElementById('map'), px = 4;
	if (!mapBase) { mapBase = drawMap(room, px); el.width = mapBase.width; el.height = mapBase.height; el.style.display = 'block'; fogN = -1; }
	const g = el.getContext('2d'), k = px / CELL, fog = fogNow();
	g.drawImage(mapBase, 0, 0);
	if (fog) {   // what you have not explored is all but black (the overlay is redrawn only when more is explored)
		if (!fogCv || fogCv.width !== el.width) { fogCv = document.createElement('canvas'); fogCv.width = el.width; fogCv.height = el.height; fogN = -1; }
		if (fogN !== fog.n) { fogN = fog.n; const fg = fogCv.getContext('2d'); fg.clearRect(0, 0, fogCv.width, fogCv.height); fg.fillStyle = 'rgba(6, 9, 18, 0.9)'; for (let cz = 0; cz < fog.h; cz++) for (let cx = 0; cx < fog.w; cx++) if (!fog.a[cz * fog.w + cx]) fg.fillRect(cx * px, cz * px, px, px); }
		g.drawImage(fogCv, 0, 0);
	}
	const seen = (o) => !fog || found(fog, o, state);
	// the exit: a ring that beats; the spawn: a small dot
	g.lineWidth = 2; g.strokeStyle = '#fff2a0'; g.beginPath(); g.arc(room.exit[0] * k, room.exit[2] * k, 5 + 2 * Math.sin(performance.now() / 260), 0, 6.2832); g.stroke();
	g.fillStyle = '#fff'; g.fillRect(room.spawn[0] * k - 1.5, room.spawn[2] * k - 1.5, 3, 3);
	const things = (run && run.eco ? ecoView(run) : rv ? rv.eco : []).filter(seen);
	for (const o of things) { g.fillStyle = EK.COL[o.kind]; g.fillRect(o.x * k - 1.5, o.z * k - 1.5, 4, 4); }
	if (mapBig) { const n = {}; for (const o of things) n[o.kind] = (n[o.kind] || 0) + 1; document.getElementById('maplegend').innerHTML = (fog ? `explored ${Math.round(fogShare(fog) * 100)} %` : '') + Object.keys(n).map((kd) => `<i style="background:${EK.COL[kd]}"></i>${EK.NAME[kd] || kd}${n[kd] > 1 ? ' ×' + n[kd] : ''}`).join('') + ' <i style="background:#fff2a0"></i>altar'; }   // (P4) what the zone holds, in its colours
	for (const o of (run && run.sv ? hazardsNow(run) : rv && rv.surv ? rv.hazards : []).filter(seen)) { g.strokeStyle = HAZ_COL[o.kind]; g.lineWidth = 1.5; g.beginPath(); g.arc(o.x * k, o.z * k, Math.max(2, o.r * k), 0, 6.2832); g.stroke(); }   // (P4) Survival: hostile ground, as rings
	g.fillStyle = '#5fc8ff'; for (const m of mates()) g.fillRect(m.s.x * k - 2, m.s.z * k - 2, 5, 5);   // (P3n) the other players: blue squares
	if (world || view) { g.fillStyle = '#5b1630'; for (const e of world ? world.enemies : view.enemies) if (!fog || found(fog, e.a, null, 0)) g.fillRect(e.a.x * k - 1, e.a.z * k - 1, 3, 3); }   // (P3) enemies: dark dots
	// you: an arrow the way you face (map: +x right, +z down)
	const fx = Math.sin(state.facing), fz = Math.cos(state.facing), x = state.x * k, z = state.z * k;
	g.fillStyle = '#ff3b3b'; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + fx * 7, z + fz * 7); g.lineTo(x - fx * 4 - fz * 4, z - fz * 4 + fx * 4); g.lineTo(x - fx * 4 + fz * 4, z - fz * 4 - fx * 4); g.closePath(); g.fill(); g.stroke();
}
/** (P3) What this tick of the fight did, as things to see. */
/** (going live) A run's sound: the 2D game's own effects and themes (G.Audio), named by runsound.js. Only on a run's page. */
const SOUND = () => (RUNUI && GG.Audio ? GG.Audio : null);
const moveOf = (id) => GG.Moves.BY_ID[id] || (GG.ExpMoves && GG.ExpMoves.MOVES[id]) || null;
function play(list) { const A = SOUND(); if (A) for (const [name, o] of list) A.sfx(name, o); }
let cutIn = null, cutN = 0;   // (the Ultimate's cut-in on screen now)
// Sparks: small balls that fly out and fade, in the colour of what made them (an Ultimate's rings, beams and strikes, a
// reaction, a Second chance, a rail under you). Drawn with the shots, after them (never in place of one). A look only:
// the fight does not know them, so their scatter is the page's own.
const sparks = []; let sparkAt = 0;
function burst(x, y, z, col, n, speed, o = {}) {
	if (document.hidden) return;
	for (let i = 0; i < n; i++) { const a = Math.random() * 6.2832, s = speed * (0.45 + Math.random() * 0.55), d = o.ring ? o.ring * Math.sqrt(0.6 + Math.random() * 0.4) : 0; sparks.push({ x: x + Math.cos(a) * d, y: y + (o.h || 0) * Math.random(), z: z + Math.sin(a) * d, vx: Math.cos(a) * s, vy: (o.up === undefined ? 3 : o.up) * (0.4 + Math.random() * 0.8), vz: Math.sin(a) * s, t: 0, life: (o.life || 0.5) * (0.6 + Math.random() * 0.7), col, r: o.r || 0.09 }); }
	if (sparks.length > 420) sparks.splice(0, sparks.length - 420);
}
function drawSparks(t) {
	const dt = Math.min(0.05, Math.max(0, t - sparkAt)); sparkAt = t;
	for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.t += dt; if (p.t >= p.life) { sparks.splice(i, 1); continue; } p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; shots.add(p.x, p.y, p.z, p.r * (1 - p.t / p.life) + 0.02, p.col); }
}
/** Auto-Ultimate on or off: the run's, and the Expedition save's setting (two counters: the latest switch wins on every device, as in the 2D game). */
function setUltAuto(on) {
	if (!run || !run.ult) return false;
	run.ult.auto = !!on;
	if (SAVE_OK) { const Sv = GG.ExpSave; applyOps(Sv, [['best', on ? 'ult.auto.on' : 'ult.auto.off', Math.max(Sv.get('ult.auto.on'), Sv.get('ult.auto.off')) + 1]]); }
	note('Auto-Ultimate: ' + (on ? 'on' : 'off'), 1400);
	if (RUNUI) RUNUI.update(runView());
	return run.ult.auto;
}
addEventListener('keydown', (e) => { if (e.code === 'KeyU' && !e.repeat && run && run.ult && !runOver) setUltAuto(!run.ult.auto); });
function fightEvents(events) {
	play(soundsOf(events, moveOf));
	const col = (id) => TYPE_COLOR[(GG.Moves.BY_ID[id] || (GG.ExpMoves && GG.ExpMoves.MOVES[id]) || {}).type];
	for (const ev of events) if (ev.k === 'caught' && run) { if (ev.kind === 'league') keepCatch(ev.member || ev.dex); else if (ev.kind === 'shiny') keepShiny(ev.dex); }   // (a wild League member, a shiny: saved at once)
	for (const ev of events) {
		if (ev.k === 'mark') { flashes.arc(ev.x, ev.y, ev.z, ev.r, 0, 6.2832, TYPE_COLOR[typeName(ev.type)], ev.life, ev.inner); continue; }   // (watching: something was put down)
		if (ev.k === 'melee') flashes.arc(state.x, state.y, state.z, ev.r, ev.aim, Math.min(ev.arc, 6.2832), col(ev.id));
		else if (ev.k === 'aura') flashes.arc(state.x, state.y, state.z, ev.r, 0, 6.2832, col(ev.id));
		else if (ev.k === 'beam') flashes.bar(ev.from, ev.dir, ev.len, ev.w, col(ev.id));
		else if (ev.k === 'chain') { let a = [state.x, state.y + CK.MUZZLE, state.z]; for (const b of ev.links) { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1; flashes.bar(a, [d[0] / l, d[1] / l, d[2] / l], l, 0.18, col(ev.id), 0.16); a = b; } }
		else if (ev.k === 'blast') flashes.arc(ev.x, ev.y, ev.z, ev.r, 0, 6.2832, col(ev.id), 0.3, 0.4);
		else if (ev.k === 'dash') flashes.bar(ev.from, ev.dir, Math.max(0.1, ev.len), ev.w * 0.5, col(ev.id), 0.25);
		else if (ev.k === 'hazard' || ev.k === 'boom') {   // a mark on the ground fills in as a warning, then flashes when it goes off
			const h = ev.h, c = ev.k === 'boom' ? '#ffffff' : TYPE_COLOR[h.type] || '#ff7b3d', life = ev.k === 'boom' ? 0.3 : h.delay;
			if (h.kind === 'zone') flashes.arc(h.x, h.y, h.z, h.r, 0, 6.2832, c, life, ev.k === 'boom' ? 0 : 0.86);
			else flashes.bar([h.x, h.y + (ev.k === 'boom' ? 0.6 : 0.1), h.z], [Math.cos(h.angle), 0, Math.sin(h.angle)], h.len, ev.k === 'boom' ? h.w : h.w * 0.5, c, life);
		}
		else if (ev.k === 'smite') { flashes.bar([ev.x, ev.y + 14, ev.z], [0, -1, 0], 14, 0.3, col(ev.id), 0.2); flashes.arc(ev.x, ev.y, ev.z, ev.r, 0, 6.2832, col(ev.id), 0.3, 0.3); }
		else if (ev.k === 'bomb') flashes.arc(ev.x, ev.y, ev.z, ev.r, 0, 6.2832, '#ff7b3d', 0.5, 0.92);
		else if (ev.k === 'levelup') { if (world) showCards(); }
		else if (ev.k === 'say') { if (WATCH || grun) note(ev.text, (ev.s || 3) * 1000); }   // (a run's banner, on a watcher's screen)
		else if (ev.k === 'weather') { const d = ev.kind && GG.Weather.KINDS[ev.kind], el = document.getElementById('wx'); if (el) { el.style.background = d ? `rgba(${d.tint[0]}, ${d.tint[1]}, ${d.tint[2]}, ${Math.min(0.3, d.tint[3] * 2.2)})` : 'transparent'; } if (ev.kind) note('the weather turns: ' + ev.kind, 3000); }
		else if (ev.k === 'boss') note(`a wild ${(GG.DEX_BY[ev.dex] || {}).name || 'boss'} appeared!`, 3200);
		else if (ev.k === 'enrage') note('it is enraged!', 2400);
		else if (ev.k === 'heal') flashes.arc(ev.x, ev.y, ev.z, ev.r, 0, 6.2832, '#5fe08a', 0.5, 0.9);
		else if (ev.k === 'shield') flashes.arc(ev.x, ev.y, ev.z, ev.r, 0, 6.2832, '#7fc8ff', 0.5, 0.9);
		else if (ev.k === 'summon') flashes.arc(ev.x, ev.y, ev.z, 3, 0, 6.2832, '#c47bff', 0.4, 0.5);
		else if (ev.k === 'hit') numbers.push({ x: ev.x, y: ev.y + 0.6, z: ev.z, text: String(Math.max(1, Math.round(ev.d))), css: ev.crit ? '#ffe14d' : (WATCH ? ev.eff === 2 : ev.eff > 1.2) ? '#ffffff' : (WATCH ? ev.eff === 0 : ev.eff < 0.9) ? '#9aa6b5' : '#f2ede2', big: ev.crit || ev.eff > 1.2, t: 0 });
		else if (ev.k === 'secondchance') { burst(ev.x, ev.y + 0.4, ev.z, '#ff8ad8', 30, 7, { up: 6, life: 0.8, r: 0.11 }); note('Second chance!', 2200); flashes.arc(ev.x, ev.y + 0.06, ev.z, ev.r, 0, 6.2832, '#ff8ad8', 0.8, 0.2); bob = 0.6; const A = SOUND(); if (A) A.sfx('legend'); if (RUNUI) RUNUI.update(runView()); }
		else if (ev.k === 'ult') {   // an Ultimate: its cut-in, its rings, beams and strikes
			const c = TYPE_COLOR[ev.type] || '#ffd23f', A = SOUND();
			if (ev.sub === 'cast') { const cm = myRun && myRun.lg ? myRun.lg.mega : rv && rv.league ? rv.league.mega : 0, cM = GG.ExpMega, cd = world ? world.pl.mon.dex : rv && rv.league ? rv.league.form : DEX, cs = !!(myRun && myRun.lg ? myRun.lg.shiny : rv && rv.league && rv.league.shiny); cutIn = { art: cm && cM && cM.BY[cm] && cM.srcOf(cM.BY[cm]) ? `<img src="${cM.srcOf(cM.BY[cm])}" alt="">` : spriteHtml(cd, cs, 168), id: ++cutN, name: ev.name, sub: 'ULTIMATE' + (ev.tier > 0 ? ' · TIER ' + ev.tier : ''), col: c, until: performance.now() + 1100 }; flashes.arc(ev.x, ev.y + 0.05, ev.z, 15, 0, 6.2832, c, 0.7, 0.05); bob = 0.5; if (A) A.sfx('legend'); if (RUNUI) RUNUI.update(runView()); }
			else if (ev.sub === 'piece') note(ev.name, 1400);
			else if (ev.sub === 'ring') { flashes.arc(ev.x, ev.y + 0.06, ev.z, ev.r, 0, 6.2832, c, ev.life || 0.4, ev.life > 0.6 ? 0.9 : 0.3); if (!(ev.life > 0.6)) burst(ev.x, ev.y + 0.1, ev.z, c, Math.min(26, 6 + Math.round(ev.r * 1.6)), 3 + ev.r * 0.5, { ring: ev.r * 0.8, up: 4, life: 0.55 }); }
			else if (ev.sub === 'bar') { flashes.bar(ev.from, ev.dir, ev.len, ev.w, c, ev.life || 0.25); for (let q = 0; q < 4; q++) { const u = Math.random() * ev.len; burst(ev.from[0] + ev.dir[0] * u, ev.from[1] - 0.5, ev.from[2] + ev.dir[2] * u, c, 1, 2, { up: 3, life: 0.4 }); } }
			else if (ev.sub === 'strike') { flashes.bar([ev.x, ev.y + 14, ev.z], [0, -1, 0], 14, 0.35, c, 0.2); flashes.arc(ev.x, ev.y + 0.06, ev.z, ev.r, 0, 6.2832, c, 0.3, 0.2); burst(ev.x, ev.y + 0.1, ev.z, c, 8, 4, { up: 5, life: 0.45 }); }
			else if (ev.sub === 'heal') numbers.push({ x: ev.x, y: ev.y + 2, z: ev.z, text: '+' + ev.amount, css: '#7dffb0', big: true, t: 0 });
			else if (ev.sub === 'ready') { note('Ultimate ready!', 1500); if (A) A.sfx('select'); }
			else if (ev.sub === 'no') { if (A) A.sfx('error'); }
			else if (ev.sub === 'end') { if (RUNUI) RUNUI.update(runView()); }
		}
		else if (ev.k === 'rx') {   // a reaction: its name over the foe, a ring as wide as it reaches
			const R = GG.ExpRx, c = ev.kind === 'frozen' ? '#8fe3ff' : (R && R.COL[ev.kind]) || '#ffffff';
			numbers.push({ x: ev.x, y: ev.y + 1.6, z: ev.z, text: ev.kind === 'frozen' ? 'Frozen solid!' : (R && GG.ExpEN[R.NAME[ev.kind]]) || ev.kind, css: c, big: true, t: 0 });
			flashes.arc(ev.x, ev.y + 0.05, ev.z, ev.r > 0 ? ev.r : 1.2, 0, 6.2832, c, 0.42, ev.r > 0 ? 0.9 : 0.4);
			burst(ev.x, ev.y + 0.6, ev.z, c, 10, 3.5, { up: 4, life: 0.5 });
		}
		else if (ev.k === 'rxchain') { for (const b of ev.links) { const a = ev.from, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1; flashes.bar([a[0], a[1] + 0.6, a[2]], [d[0] / l, d[1] / l, d[2] / l], l, 0.12, '#ffe14d', 0.25); } }
		else if (ev.k === 'hurt') { bob = 0.35; note(`hit for ${(+ev.d).toFixed(0)}`, 700); }
		else if (ev.k === 'plug') { showRoom(); mapBase = null; burst(ev.x, 1, ev.z, ev.kind === 'boulder' ? '#9c917f' : '#ff9a3d', 26, 5, { up: 3, life: 0.6, r: 0.12 }); play([['break']]); }   // (the rock is gone: the floor is built again)
		else if (ev.k === 'chest') { burst(ev.x, 0.6, ev.z, '#ffe9a0', 16, 3.5, { up: 3, life: 0.5, r: 0.08 }); play([['chest']]); }
		else if (ev.k === 'landmark') { const c = LANDMARKS[ev.kind][2]; flashes.arc(ev.x, 0.05, ev.z, 3, 0, 6.2832, c, 0.9, 0.9); burst(ev.x, 1.5, ev.z, c, 22, 4, { up: 3.5, life: 0.7, r: 0.1 }); play([['heal']]); }
		else if (ev.k === 'dodge') { burst(state.x, state.y + 0.3, state.z, '#cfe3ff', 10, 3, { up: 1.5, life: 0.3, r: 0.07 }); play([['shot', { kind: 'melee' }]]); }
	}
	if (world && world.pl.dead && !mates().length) note('you are down: R to start the level again', 60000);
}
// ---------------------------------------------------------------- (P3n) showing a fight to others, and watching one
// (the shipping path) Logged in, your own run is shown to your friends over the site's lines; ?live=<friend> watches one.
const siteCall = GG.MicaAccount && GG.MicaAccount.name() ? (a, b) => GG.MicaAccount.call(a, b) : null;
const SITE_HOST = run && !HOST && siteCall ? new HostLink({ call: siteCall, run: runId(crypto), label: '3D Expedition · ' + ((GG.DEX_BY[run.lg ? run.lg.member : DEX] || {}).name || ''), dex: DEX, now: () => performance.now() }) : null;
const SITE_WATCH = LIVE ? new WatchLink({ call: siteCall || (async () => ({ ok: false, status: 401, body: {} })), who: LIVE.toLowerCase(), later: (fn, ms) => setTimeout(fn, ms) }) : null;
const chan = SITE_WATCH || SITE_HOST || ((HOST || WATCH || JOIN) && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('m3d:' + (HOST || WATCH || JOIN)) : null);
let coView = null;
/** The other players in the fight: a host's puppets of its guests; a guest's view of the host and the other guests. */
const mates = () => (!world ? [] : JOIN ? world.co.mates : world.mates);
const HEAD = { gen: GEN, biome: BIOME, size: SIZE, dex: DEX };
if (run) HEAD.exp = { seed: GEN, map: run.map, diff: run.diff };   // (P4) a run: a watcher needs its seed and map to build the zones
/** (P4) A frame with the run's row on it (expnet.js), when this is a run. */
const rowed = (f) => { if (run) f.r = runRow(run); return f; };
const tape = FIGHT && Q.get('tape') === '1' ? new Tape({ ...HEAD, at: 0 }) : null;
const net = { sent: 0, chars: 0, got: 0, evLive: [], evTape: [], prev: null, n: 0, batch: [], relay: false };
const RELAY = Q.get('relay') === '1' || !!SITE_HOST;   // (the site's lines carry one message a second)
/** The host's side, once a tick: a frame every 6 ticks to whoever is watching (a whole one every second, the rest as
 *  differences), and one every 12 onto the tape. */
function share() {
	if (!chan && !tape) return;
	if (JOIN) {   // a guest: where you are, what you hit, what touched you — ten times a second; and "let me in" until the host has you
		if (simTicks % Math.round(60 / NK.HZ) !== 0) return;
		const msg = JSON.stringify({ g: MYID, m: guestMsg(world) }); chan.postMessage(msg); net.sent++; net.chars += msg.length;
		if (!net.joined && simTicks % 60 < 6) chan.postMessage(JSON.stringify({ join: { id: MYID, dex: DEX } }));
		return;
	}
	keepEvents(net.evLive, world.events); if (tape) keepEvents(net.evTape, world.events);
	if (SITE_HOST && !SITE_HOST.watched) { net.evLive.length = 0; net.batch.length = 0; }   // (no friend is watching: nothing is built)
	else if (chan && RELAY && simTicks % Math.round(60 / NK.HZ) === 0) {   // &relay=1: as the site's relay would carry it — ONE message a second, holding that second's frames (you in all ten, the enemies in two)
		net.batch.push(rowed(netFrame(world, net.evLive))); net.evLive = [];
		if (net.batch.length >= NK.HZ) { const msg = JSON.stringify({ h: HEAD, b: bundle(net.batch) }); chan.postMessage(msg); net.sent++; net.chars += msg.length; net.biggest = Math.max(net.biggest || 0, msg.length); net.batch = []; }
	} else if (chan && simTicks % Math.round(60 / NK.HZ) === 0) {   // (by this page's own count: the fight's clock stands still while a card is being chosen, and the others must still hear)
		const f = rowed(world.mates.length ? hostFrame(world, net.evLive) : netFrame(world, net.evLive)), whole = net.n % NK.HZ === 0 || !net.prev, msg = JSON.stringify(whole ? { h: HEAD, f } : { f: netDiff(net.prev, f) });
		chan.postMessage(msg); net.prev = f; net.n++; net.sent++; net.chars += msg.length; net.evLive = [];
	}
	if (tape && world.tick % Math.round(60 / NK.TAPE_HZ) === 0 && world.tick !== net.taped) { net.taped = world.tick; tape.add(rowed(netFrame(world, net.evTape))); net.evTape = []; }   // (once a tick: the clock stands still while a card or a choice is up)
}
/** The watcher's side. Frames come in; the fight is drawn a moment in the past, so there is always a frame on each
 *  side of what is on screen. The camera is this screen's own. */
let rv = null; const rowKeep = {};
let viewer = WATCH ? new Viewer() : null, view = null, watchT = -1, watchSrc = WATCH ? 'live' : null, tapeEnd = 0;
if (chan && HOST && world) chan.onmessage = (m) => {   // the host: a guest asks to join, or reports
	const o = JSON.parse(m.data); net.got++;
	if (o.join && !world.mates.some((q) => q.id === o.join.id) && world.mates.length < 3) { coopSeen = true; hostAdd(world, o.join.id, o.join.dex); note(`${(GG.DEX_BY[o.join.dex] || {}).name || 'a player'} joined`, 2500); }
	else if (o.g) hostApply(world, o.g, o.m);
};
if (chan && JOIN) chan.onmessage = (m) => {   // a guest: the host's frames
	const o = JSON.parse(m.data); if (!o.f) return; net.got++;
	// the level being played is not the one this page built: load it (once), as the same player
	if (o.h && (o.h.gen !== GEN || o.h.biome !== BIOME || (o.h.size || null) !== (SIZE || null))) { if (!net.moving) { net.moving = true; const q = new URLSearchParams(location.search); q.set('gen', o.h.gen); q.set('biome', o.h.biome); if (o.h.size) q.set('size', o.h.size); else q.delete('size'); q.set('id', MYID); q.set('dex', DEX); if (o.h.exp) { q.set('xj', o.h.exp.seed); q.set('map', o.h.exp.map); q.set('diff', o.h.exp.diff); } location.search = q.toString(); } return; }
	if (!o.h && !world.co.viewer.frames.length) return;   // (wait for a whole frame to start from)
	guestApply(world, o.f);
	if (grun) { const last = world.co.viewer.last; if (last && last.r) { rv = guestRunApply(grun, last.r); if (grun.w.room !== room) { room = grun.w.room; mapBase = null; showRoom(); state.facing = cam.yaw; } } }   // (P4) the run: its zone's level, its things, its line
	if (o.f.m && o.f.m.some((r) => r[0] === MYID)) net.joined = true;
};
if (chan && WATCH) chan.onmessage = (m) => {
	const o = JSON.parse(m.data); net.got++; net.chars += m.data.length;
	// the level being played is not the one this page built: load it (once), keeping the watch
	if (o.h && (o.h.gen !== GEN || o.h.biome !== BIOME || (o.h.size || null) !== (SIZE || null) || o.h.dex !== DEX || (o.h.exp ? !XW || XW.map !== o.h.exp.map : !!XW))) { if (!net.moving) { net.moving = true; const q = new URLSearchParams(); q.set(LIVE ? 'live' : 'watch', WATCH); if (o.h.exp) { q.set('xw', o.h.exp.seed); q.set('map', o.h.exp.map); } q.set('gen', o.h.gen); q.set('biome', o.h.biome); if (o.h.size) q.set('size', o.h.size); q.set('dex', o.h.dex); location.search = q.toString(); } return; }
	if (watchSrc !== 'live') return;
	if (o.b) { net.relay = true; for (const f of unbundle(o.b)) viewer.push(f); } else viewer.push(o.f);   // (a relay's message: a second's frames at once)
};
if (SITE_WATCH) {   // a friend's run over the site's lines: what its state is, on the screen; then start asking
	SITE_WATCH.onstatus = (st) => { if (LIVE_SAYS[st]) note(LIVE_SAYS[st], st === 'over' ? 600000 : 5000); };
	SITE_WATCH.start();
}
const sheetAsked = new Set();
/** A species walks into view that this page has no sheet for yet (a watcher does not know the cast beforehand). */
const leadAsked = new Set();
function wantLead(dex, shiny = false) { const k = skey(dex, shiny); if (leadAsked.has(k)) return; leadAsked.add(k); for (const a of ['Idle', 'Walk']) sheet(dex, a, 1, shiny).catch((e) => console.warn(e.message)); }
function wantSheet(dex, shiny = false) { const k = skey(dex, shiny); if (sheetAsked.has(k) || !META[dex] || !META[dex].a || !META[dex].a.Walk) return; sheetAsked.add(k); sheet(dex, 'Walk', k === String(dex) ? 130 : 8, shiny).catch((e) => console.warn(e.message)); }   // (a shiny is rare: its sheet holds a few)
function watchStep(dt) {
	if (!viewer.frames.length) return;
	const newest = viewer.newest;
	if (watchSrc === 'tape') watchT = Math.min(tapeEnd, watchT + dt);
	else { const want = newest - (LIVE ? NK.SITE_DELAY : net.relay ? NK.RELAY_DELAY : NK.DELAY); watchT = watchT < 0 || Math.abs(want - watchT) > 0.6 ? want : Math.min(newest, watchT + dt * (want - watchT > 0.05 ? 1.08 : want - watchT < -0.05 ? 0.92 : 1)); }
	view = viewer.sample(watchT);
	if (!view) return;
	Object.assign(state, view.pl.s);
	if (XW && view.fa && view.fa.r) {   // (P4) the run as it was at that moment: its zone's level, its things, its team
		rv = rowView(view.fa.r, XF, rowKeep);
		if (rv.room !== room) { room = rv.room; mapBase = null; showRoom(); }
		if (rv.over && !runOver) { runOver = rv.over; note(rv.over === 'won' ? 'EXPEDITION COMPLETE!' : 'RUN OVER', 600000); }
		if (rv.surv && performance.now() - hazAt >= 500) { hazAt = performance.now();   /* (by the clock, as the screen's text: see frame()) */ for (const o of rv.hazards) if (Math.hypot(o.x - state.x, o.z - state.z) < 60) flashes.arc(o.x, o.y + 0.04, o.z, o.r, 0, 6.2832, HAZ_COL[o.kind], 0.95, 0); canvas.style.filter = rv.night > 0 ? `brightness(${(1 - rv.night).toFixed(2)})` : ''; }   // (a watched Survival run: its hostile ground and its night)
	}
	fightEvents(view.events);
	if (view.pl.dead) note('down', 2000);
}
/** Play a tape (its text) on this page instead of a live fight. */
function playTape(text) { const t = Tape.unpack(text), p = t.play(); viewer = p.viewer; watchSrc = 'tape'; watchT = p.from; tapeEnd = p.to; return { header: t.h, from: p.from, to: p.to, frames: p.viewer.frames.length }; }
/** (P3) Damage numbers: text that rises from where a hit landed, drawn on a flat canvas over the scene (each is placed
 *  by projecting its point in the world through the camera). */
const numbers = [], V3 = new THREE.Vector3();
function drawNumbers(dt) {
	const el = document.getElementById('nums'); if (!el) return;
	if (el.width !== innerWidth || el.height !== innerHeight) { el.width = innerWidth; el.height = innerHeight; }
	const g = el.getContext('2d'); g.clearRect(0, 0, el.width, el.height);
	if (numbers.length > 80) numbers.splice(0, numbers.length - 80);
	g.textAlign = 'center'; g.lineJoin = 'round';
	for (let i = numbers.length - 1; i >= 0; i--) {
		const n = numbers[i]; n.t += dt; if (n.t > 0.7) { numbers.splice(i, 1); continue; }
		V3.set(n.x, n.y + n.t * 1.6, n.z).project(camera); if (V3.z > 1 || V3.z < -1) continue;
		const x = (V3.x * 0.5 + 0.5) * el.width, y = (-V3.y * 0.5 + 0.5) * el.height;
		g.globalAlpha = Math.min(1, (0.7 - n.t) * 4); g.font = `700 ${n.big ? 20 : 15}px ui-sans-serif, system-ui, sans-serif`;
		g.lineWidth = 3; g.strokeStyle = 'rgba(12, 18, 30, .85)'; g.strokeText(n.text, x, y); g.fillStyle = n.css; g.fillText(n.text, x, y);
	}
	g.globalAlpha = 1;
}
/** (P3) A level-up: the fight is waiting; three cards to choose from (click or tap one, or press 1 / 2 / 3). */
function showCards() {
	const el = document.getElementById('cards'), cs = world.pl.choices; if (!el || !cs) return;
	const lv = myRun && myRun.lv, RC = (GG.ExpItems && GG.ExpItems.RAR_COL) || [];   // (P4) an Expedition card has a rarity, and the run its three tools
	const tools = !lv ? '' : `<div class="tools"><button data-tool="refresh"${lv.refreshes ? '' : ' disabled'}>F · Refresh (${lv.refreshes})</button><button data-tool="skip"${lv.skips ? '' : ' disabled'}>G · Skip (${lv.skips})</button><button data-tool="banish"${lv.bans ? '' : ' disabled'}>${banMode ? 'pick a card to banish…' : 'B · Banish (' + lv.bans + ')'}</button></div>`;
	el.innerHTML = `<h2>Level ${world.pl.level}</h2>` + cs.map((c, i) => `<button data-i="${i}" style="border-color:${c.tier > 0 && RC[c.tier] ? RC[c.tier] : TYPE_COLOR[c.mtype] || '#8fa3c4'}">${cardArt(c)}<b>${i + 1} · ${RUNUI && c.kind === 'move' ? pretty(c.title) : c.title}</b><i>${(c.tier > 0 ? c.rarName.toUpperCase() + ' · ' : '') + (RUNUI ? String(c.tag || '').replace(/^Replaces (.+)$/, (q, id) => 'Replaces ' + pretty(id)) : c.tag || '')}</i><span>${c.desc || (GG.Moves.BY_ID[c.id] ? GG.Moves.BY_ID[c.id].kind : '')}</span></button>`).join('') + tools;
	el.style.display = 'grid'; el.classList.toggle('four', cs.length === 4);
}
/** (the shipping path) A card's art on a run's screen: an item's or a vitamin's picture (the overworld's own, as the
 *  2D game shows them), a Mega's sprite, a move's type. */
function cardArt(c) {
	if (!RUNUI) return '';
	const I = GG.ExpItems, M = GG.ExpMega, img = (src) => `<em><img src="${src}" alt=""></em>`;
	if (c.mega && M && M.BY[c.mega] && M.srcOf(M.BY[c.mega])) return img(M.srcOf(M.BY[c.mega]));
	const Ic = GG.Icons, LS = !!(myRun && myRun.lg && myRun.lg.shiny);
	if (c.kind === 'evo' && c.id && META[c.id]) return `<em class="tall">${spriteHtml(c.id, LS, 76)}</em>`;   // (an evolution: who you would become)
	if (c.kind === 'move' && c.mtype) return `<em>${Ic && c.id ? Ic.html('move:' + c.id, 36) : ''}<span class="rx-type" style="background:${TYPE_COLOR[c.mtype] || '#5f7377'}">${c.mtype}</span></em>`;
	if (c.kind === 'train' && Ic) return `<em>${Ic.html({ 'xtrain:dmg': 'fist', 'xtrain:hp': 'heart', 'xtrain:rest': 'berry' }[c.key] || 'up', 36)}</em>`;
	if (I && c.kind === 'vit' && I.VIT[c.id]) return img(I.icon(I.VIT[c.id].icon));
	if (I && c.item && I.IT[c.item]) return img(I.icon(I.IT[c.item].icon));
	return '<em></em>';
}
let banMode = false, shownPick = null;
/** (P4) A choice of the run's economy: a ball's or an altar's items, Meowth's stall (with prices), Hypno's question. */
function showPick() {
	const el = document.getElementById('cards'), P = myRun.pick; shownPick = P;
	if (!P) { if (!world.pl.choices) { el.style.display = 'none'; el.innerHTML = ''; } return; }
	const I = GG.ExpItems, EN = GG.ExpEN || {}, en = (s) => EN[s] || s, prices = P.kind === 'shop' ? (run ? shopPrices(run, P.ids) : P.prices) : null, coins = run ? run.coins : (rv ? rv.coins : 0);
	const list = P.cards ? P.cards.map((c) => ({ ...c, col: '#3fa35a' })) : P.vit ? P.vit.map((id) => ({ kind: 'vit', id, title: en(I.VIT[id].name), tag: 'Vitamin', desc: 'Forget it', col: '#f6d860' }))
		: P.ids.map((id, i) => ({ item: id, title: en(I.IT[id].name), tag: I.RAR[I.IT[id].rar].toUpperCase() + (prices ? ' · ' + prices[i] + ' ₽' : ''), desc: I.itemText(id), col: I.RAR_COL[I.IT[id].rar] }));
	el.innerHTML = `<h2>${P.title}${P.sub ? ' · ' + P.sub : ''}${prices ? ' · you have ' + coins + ' ₽' : ''}</h2>` + list.map((c, i) => `<button data-p="${i}"${P.taken.includes(i) ? ' disabled style="opacity:.35' : ' style="'};border-color:${c.col}">${cardArt(c)}<b>${i + 1} · ${c.title}</b><i>${c.tag}</i><span>${c.desc}</span></button>`).join('')
		+ (P.kind === 'shop' || P.kind === 'hypno' || P.onClose ? `<div class="tools"><button data-p="-1">Esc · ${P.cancel || 'Leave'}</button></div>` : '');
	el.style.display = 'grid';
}
function takePick(i) { if (!myRun || !myRun.pick) return false; const ok = i < 0 ? pickClose(myRun) : pickTake(myRun, i); shownPick = null; showPick(); return ok; }
/** (P4) A run's tools at a level-up: 'refresh' (other cards), 'skip' (no card, a little money), 'banish' (then pick a card). */
function useTool(name) {
	if (!myRun || !myRun.lv || !world.pl.choices) return false;
	if (name === 'banish') { banMode = myRun.lv.bans > 0 && !banMode; showCards(); return banMode; }
	const ok = name === 'refresh' ? refreshCards(myRun) : name === 'skip' ? skipCards(myRun) : false;
	if (!ok) return false;
	if (world.pl.choices) showCards(); else { const el = document.getElementById('cards'); el.style.display = 'none'; el.innerHTML = ''; if (world.pl.pending > 0) { tick(world, null, K.TICK); fightEvents(world.events); } }
	return true;
}
function pickCard(i) {
	if (banMode) { banMode = false; if (world && world.pl.choices) { banishCard(myRun, i); showCards(); } return; }
	if (!world || !world.pl.choices || !choose(world, i)) return;
	play([['confirm']]);
	if (myRun) { for (const q of myRun.says) note(q.text, q.s * 1000); myRun.says.length = 0; }   // (what a card you picked says: an evolution, a Mega. The run's next step would clear it unshown)
	const el = document.getElementById('cards'); el.style.display = 'none'; el.innerHTML = '';
	if (world.pl.pending > 0) { tick(world, null, K.TICK); fightEvents(world.events); }   // (another level waiting: its cards come up at once)
}
if (FIGHT) {
	document.getElementById('cards').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.p !== undefined) takePick(+b.dataset.p); else if (b && b.dataset.tool) useTool(b.dataset.tool); else if (b) pickCard(+b.dataset.i); });
	addEventListener('keydown', (e) => { const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (myRun && myRun.pick) { if (i >= 0) takePick(i); else if (e.code === 'Escape') takePick(-1); return; } if (i >= 0 && i < 4) pickCard(i); const tl = { KeyF: 'refresh', KeyG: 'skip', KeyB: 'banish' }[e.code]; if (tl) useTool(tl); });
}
// A Dive's specials: 1 / 2 (or J / K), C / V (the pad's X / Y), or a tap on the move's chip; 3 (or L) is the Ultimate.
function special(i) { if (!drun || runOver || menuUp || world.pl.choices) return false; const ok = pressSpecial(drun, i); if (!ok) play([['error']]); if (RUNUI) RUNUI.update(runView()); return ok; }
if (drun) {
	addEventListener('keydown', (e) => { if (e.repeat || world.pl.choices || menuUp) return; if (e.code === 'Digit1' || e.code === 'KeyJ') special(1); else if (e.code === 'Digit2' || e.code === 'KeyK') special(2); else if ((e.code === 'Digit3' || e.code === 'KeyL') && drun.ult) pressUlt(drun); });
	document.getElementById('b-slide').textContent = 'DODGE';
}
/** (the shipping path) A run's own screen, in Micatro's look: runui.js draws this view of the run. The test room's
 *  readout is still filled (tests and ?debug=1 read it), but it is not what a player sees. */
const RUNUI = myRun || XW ? mountRunUi(document, { debug: Q.has('debug'), onMenu: () => setMenu(!menuUp), onResume: () => setMenu(false), onBoard: (id) => openBoard(id), onMute: () => { if (GG.Audio) { GG.Audio.toggleMute(); RUNUI.update(runView()); } }, onUlt: () => { if (solo) pressUlt(solo); }, onAuto: () => { if (run && run.ult) setUltAuto(!run.ult.auto); } }) : null;
/** The 3D boards of this run's map and tier (the menu's or the run's end's button): the server's top ten and yours. */
let boardUp = null;
async function openBoard(id) {
	const show = () => RUNUI.update(runView()), map = myRun ? myRun.map : XW ? XW.map : 'viridian', diff = myRun ? myRun.diff : 'normal';
	if (!id) { boardUp = null; return show(); }
	const view = id === 'open' ? (myRun && myRun.surv ? 'survival' : 'score') : id, A = GG.MicaAccount, me = A && A.name();
	const mine = boardUp = { view, map, diff, rows: [], note: me ? 'Loading…' : 'Log in to Magepunk to see the 3D boards.' };
	show(); if (!me) return;
	const d = await A.call('run-leaderboard', boardAsk(map, diff, view));
	if (boardUp !== mine) return;   // (another board was asked for meanwhile, or this one closed)
	if (!d.ok || !d.body) mine.note = "Couldn't load the board.";
	else { mine.rows = boardRows(d.body, (dex) => (GG.DEX_BY[dex] || {}).name || '', me); mine.note = mine.rows.length ? (d.body.you && d.body.you.rank ? `Your best: #${d.body.you.rank}` : 'You have no mark on this board yet.') : 'No one has a mark on this board yet.'; }
	show();
}
/** The menu (Esc, P, or its button). Alone in your own run the fight waits while it is up; a guest's or a watcher's
 *  fight is someone else's and goes on. */
let menuUp = false, paused = false, escAt = 0;
const CONTROLS = 'Move: arrows / WASD · Jump: Z or Space · Slide: X or Shift · Wall-run: jump beside a wall and lean into it (jump again to kick off) · Rails: come down on one to grind it (jump to leap off, slide to drop) · Surf: on a steep bank, hold along it and into it · Ultimate: V when its meter is full (U: cast by itself) · Camera: Q / E or drag · Map: Backspace or M · Menu: Enter or Esc';
const DIVE_CONTROLS = 'Move: arrows / WASD · Jump: Z or Space · Dodge: X or Shift (nothing hurts you while it lasts) · Specials: 1 and 2 (or C and V) · Ultimate: 3 when its meter is full · Stairs: stand on the column of light · Camera: Q / E or drag · Map: Backspace or M · Menu: Enter or Esc';
function setMenu(on) {
	if (!RUNUI || runOver) on = false;
	menuUp = !!on; paused = menuUp && !!solo && !world.mates.length;
	if (menuUp) { keys.clear(); acts.clear(); }   // (nothing stays held under the menu)
	RUNUI && RUNUI.update(runView());
	return menuUp;
}
if (RUNUI) addEventListener('keydown', (e) => {
	if (e.code !== 'Escape' && e.code !== 'KeyP') return;
	// (the Games switcher holds an Esc tap back and replays it when the key comes up: one press is one Esc here)
	if (e.code === 'Escape') { if (e.isTrusted) escAt = performance.now(); else if (performance.now() - escAt < 1500) return; }
	if (boardUp) { openBoard(null); return; }
	if (!menuUp && (mapBig || (myRun && myRun.pick) || (world && world.pl.choices))) return;   // (Esc closes those first)
	setMenu(!menuUp);
}, true);
function runView() {
	const pl = world ? world.pl : null, vp = view ? view.pl : null, I = GG.ExpItems, en = (s) => (GG.ExpEN && GG.ExpEN[s]) || s, nameOf = (d) => (GG.DEX_BY[d] || {}).name || '';
	const M = GG.ExpMega, lg = rv && rv.league, mg = lg && lg.mega && M && M.BY[lg.mega];
	const v = { name: pl ? pl.mon.name : mg ? M.nameOf(mg) : lg ? nameOf(lg.form) : SPECIES.name, level: pl ? pl.level : vp ? vp.level : 1, hp: pl ? pl.hp : vp ? vp.hp : 0, maxHp: pl ? pl.maxHp : vp ? vp.maxHp : 0,
		shield: pl && pl.xproc ? pl.xproc.shield || 0 : 0, xp: pl ? pl.xp : 0, xpNext: pl ? pl.xpNext : 0, time: world ? world.t : view ? view.t : 0, kos: world ? world.stats.kills : view ? view.kills : null, parts: [], bag: [], boss: null, over: null };
	if (SITE_HOST && SITE_HOST.watched) v.bag.push({ text: SITE_HOST.watchers + ' watching', kind: 'on' });
	if (LIVE) v.bag.push({ text: 'Watching ' + LIVE, kind: 'on' });
	if (run) { v.parts = hudLine(run).split(' · '); if (run.ph === 0 && !run.surv && run.charge > 0) v.parts.push(`CHARGE ${Math.round(run.charge * 100)} %`); }
	else if (drun) v.parts = diveHud(drun).split(' · ');
	else if (rv) v.parts = rv.hud(state).split(' · ');
	if (solo && solo.ult && !runOver) { v.ult = ultView(solo); v.ult.col = TYPE_COLOR[v.ult.type]; v.ult.key = matchMedia('(pointer: coarse)').matches ? '' : drun ? '3' : 'V'; }
	if (cutIn && performance.now() < cutIn.until) v.cut = cutIn;
	if (pl) v.moves = pl.moves.map((m) => ({ icon: GG.Icons ? GG.Icons.html('move:' + m.id, 18) : '', name: pretty(m.id), lv: m.xlv || m.lvl, col: TYPE_COLOR[(GG.Moves.BY_ID[m.id] || (GG.ExpMoves && GG.ExpMoves.MOVES[m.id]) || {}).type] }));
	if (drun && v.moves) specials(drun).forEach((q, i) => { const m = v.moves[i + 1]; if (m) { m.sub = q.cd > 0.05 ? q.cd.toFixed(1) + ' s' : q.queued ? '…' : (matchMedia('(pointer: coarse)').matches ? 'TAP' : 'KEY ' + (i + 1)); m.dim = q.cd > 0.05; } });
	if (pl && pl.xv && I) for (const q of pl.xv) v.bag.push({ text: `${en(I.VIT[q.id].name)} ${q.lvl}`, kind: 'dim' });
	if (pl && pl.xi && I) for (const id of Object.keys(pl.xi)) v.bag.push({ text: en(I.IT[id].name) + (pl.xi[id] > 1 ? ' ×' + pl.xi[id] : ''), kind: '' });
	if (run && run.up && run.up.revives > 0) v.bag.push({ text: 'Second chance' + (run.up.revives > 1 ? ' ×' + run.up.revives : ''), kind: 'on' });
	if (myRun && myRun.held) v.bag.push({ text: 'Holding ' + pretty(myRun.held), kind: 'money' });
	for (const d of myRun && myRun.cap ? myRun.cap.sa.map((a) => a.dex) : rv ? rv.sa : []) v.bag.push({ text: nameOf(d), kind: 'warn' });
	const b = drun ? (drun.boss && !drun.boss.dead ? drun.boss : null) : world && !JOIN ? world.enemies.find((e) => e.boss) : null;
	if (b) v.boss = { name: nameOf(b.dex), hp: b.hp, maxHp: b.maxHp, enraged: !!(b.ai && b.ai.fury) };
	if (boardUp) v.board = { title: `3D · ${XK.MAP_NAME[boardUp.map] || boardUp.map} · ${boardUp.diff[0].toUpperCase() + boardUp.diff.slice(1)}`, tabs: [['score', 'Score'], ['time', 'Time attack'], ['survival', 'Survival']].map(([id, text]) => ({ id, text, on: id === boardUp.view })), rows: boardUp.rows, note: boardUp.note };
	if (menuUp && !runOver) v.menu = { auto: run && run.ult ? (run.ult.auto ? 'on' : 'off') : null, boards: !drun, sound: GG.Audio ? (GG.Audio.settings.muted ? 'off' : 'on') : null, title: paused ? 'PAUSED' : 'MENU', line: (paused ? '' : 'The fight goes on while this is open. ') + (drun ? DIVE_CONTROLS : CONTROLS), restart: solo ? location.search || '?' : null, leave: '../' };
	if (runOver) {
		const r = runOver, q = new URLSearchParams(location.search); q.set('exp', (+q.get('exp') || 0) + 1);
		if (drun) { const qd = new URLSearchParams(location.search); qd.set('dive', (+qd.get('dive') || 0) + 1);
			v.over = { won: r.won, title: r.title, line: r.lines[0], again: '?' + qd, leave: '../', boards: false, kept: kept ? { ok: kept.ok, text: kept.text } : null,
				rows: [['Floor', String(r.parts.floor)], ['Time', `${Math.floor(r.parts.time / 60)}:${String(r.parts.time % 60).padStart(2, '0')}`], ['KOs', String(r.parts.kills)], ['Level', String(v.level)], ['Loot kept', String(r.parts.divePay)], ['Rescued', String(r.parts.rescued)], ['Best combo', String(r.parts.combo)], ['Poké Balls', String(r.parts.chests)], ['Secrets', String(r.parts.secrets)], ['Alphas', String(r.parts.alphas)], ['Guardians', String(r.parts.guardians)]] };
		} else
		v.over = typeof r === 'string' ? { won: r === 'won', title: r === 'won' ? 'EXPEDITION COMPLETE!' : 'RUN OVER', line: '', rows: [], again: null, leave: '../' }
			: { won: r.won, title: r.title, line: r.survival ? r.lines.join(' · ') : r.line, again: run ? '?' + q : null, leave: '../', boards: true, kept: kept ? { ok: kept.ok, text: kept.text } : null,
				rows: [['Time', `${Math.floor(r.parts.time / 60)}:${String(r.parts.time % 60).padStart(2, '0')}`], ['KOs', String(r.parts.kills)], ['Level', String(v.level)], ['Score', String(r.score)], ['Pay', '₽ ' + r.pay.pay]].concat(r.medal ? [['Medal', r.medal]] : []) };
	} else if (noteText && performance.now() < noteUntil) v.note = noteText;
	return v;
}
// ---------------------------------------------------------------- the site's controls (the shipping path, part 3)
// One vocabulary from the keyboard and a controller (site/input.js + site/gamepad.js, the owner's scheme): Z / A
// confirms and jumps, X / B cancels and slides, Q / E and L / R turn the camera, Enter / Start is the menu, Backspace
// / Select the zone map. While a screen is up (the run's end, the menu, a level's cards, a choice) the same actions
// move a focus ring over its buttons and press them (site/focusnav.js), so a run can be played with no mouse.
const uiLayer = () => { const el = (id) => document.getElementById(id); return RUNUI && boardUp ? el('rx-board') : RUNUI && el('rx-end').classList.contains('show') ? el('rx-end') : menuUp ? el('rx-menu') : el('cards').style.display === 'grid' ? el('cards') : null; };
const uiNav = createFocusNav({ scope: uiLayer, domFocus: false, scrollFallback: false, onCancel: () => { if (boardUp) openBoard(null); else if (menuUp) setMenu(false); else if (myRun && myRun.pick) takePick(-1); }, onMenu: () => { if (menuUp) setMenu(false); } });
if (drun && RUNUI) { const el = document.getElementById('rx-moves'); el.style.pointerEvents = 'auto'; el.addEventListener('click', (e) => { const c = e.target.closest('.rx-move'); if (c) special([...el.children].indexOf(c)); }); }
const siteInput = startInput({ pad: true,
	onAction(a, info) {
		if (!info.repeat) acts.add(a);
		if (uiLayer()) return uiNav.onAction(a, info);
		if (info.repeat) return false;
		if (a === 'menu' && RUNUI) { setMenu(true); return true; }
		if (drun && (a === 'secondary' || a === 'context')) { special(a === 'secondary' ? 1 : 2); return true; }   // (a Dive: C / V, the pad's X / Y: the specials)
		if (a === 'context' && solo && solo.ult) { pressUlt(solo); return true; }   // (V / the pad's Y: the Ultimate)
		if (a === 'select' && FIGHT) { toggleMap(); return true; }
		if (a === 'cancel' && mapBig) { toggleMap(false); return true; }
		return false;   // (moving, jumping, sliding and the camera read what is held: readInput)
	},
	onRelease(a) { acts.delete(a); } });
// the Games switcher (site/switcher.js): the fight waits under it, and leaving a run asks first
addEventListener('mp-switcher-open', () => { acts.clear(); keys.clear(); if (RUNUI && !runOver) setMenu(true); });
window.mpLeaveGuard = () => (myRun && !runOver ? { state: 'confirm', message: 'Leaving ends this run.' } : { state: 'safe' });
// ---------------------------------------------------------------- what a run leaves behind (the shipping path, part 4)
// expsave.js: a fair, clean run of your own is written into the Expedition save (its pay as owed: the 2D game pays
// it into the wallet) and, signed in and alone, posted to the 3D boards. `kept` is what the run's end says of it.
const runBegan = performance.now();
let kept = null, coopSeen = false;
/** A wild League member caught: a member of your League from this moment (as in the 2D game, whatever the run's end). */
function keepCatch(member) {
	if (!run || PRACTICE || !SAVE_OK || !member || !cleanRun(run, (performance.now() - runBegan) / 1000)) return false;
	applyOps(GG.ExpSave, catchOps(member)); return true;
}
/** A shiny caught: kept at once too. */
function keepShiny(dex) {
	if (!run || PRACTICE || !SAVE_OK || !dex || !cleanRun(run, (performance.now() - runBegan) / 1000)) return false;
	applyOps(GG.ExpSave, shinyOps(dex, GG.ExpLeague && GG.ExpLeague.FAM[dex] || 0)); return true;
}
async function keepRun(res) {
	const say = (ok, text, extra) => { kept = { ok, text, ...extra }; if (RUNUI) RUNUI.update(runView()); return kept; };
	if (PRACTICE) return say(false, WHY.practice, { why: 'practice', param: PRACTICE });
	try {
		const Sv = GG.ExpSave, real = (performance.now() - runBegan) / 1000, fine = cleanRun(run, real);
		if (!SAVE_OK || !Sv.data) return say(false, WHY.nosave, { why: 'nosave' });
		if (!fine) return say(false, WHY.unclean, { why: 'unclean' });
		const miss = saveMissing(run, { L: GG.ExpLeague, T: GG.ExpTier, Sv, base: baseSave() });
		if (miss) return say(false, WHY[miss], { why: miss });
		const dev = deviceId(localStorage, Sv.who, crypto), ops = recordOps(run, res, { T: GG.ExpTier, dev, research: researchOf(run), seen: Sv.get('m3d.seen.' + dev), final: !!run.lg && !canEvolve(run) });
		applyOps(Sv, ops);
		// (a family researched to its need: its avatar, as the 2D game gives it)
		if (GG.ExpMeta && GG.ExpMeta.research) { let got = false; for (const [fam] of researchOf(run)) if (GG.ExpMeta.research(fam) >= GG.ExpMeta.needOf(fam) && Sv.add('avatar', String(fam))) got = true; if (got) Sv.commit(); }
		const pay = res.pay ? res.pay.pay : 0;
		const met = newlyMet({ L: GG.ExpLeague, Sv, base: baseSave() });   // (challenges now complete: those members are wild in your next runs)
		say(true, (pay > 0 ? `Saved. ₽ ${pay} will be in your wallet when you next open the Expedition.` : 'Saved.') + (met.length ? ` New in the wild: ${met.slice(0, 3).map((d) => (GG.DEX_BY[d] || {}).name).join(', ')}${met.length > 3 ? ' and ' + (met.length - 3) + ' more' : ''}.` : ''), { ops: ops.length, pay, met });
		const A = GG.MicaAccount;
		if (A && A.name() && !coopSeen) {
			const d = await A.call('run-score', scoreBody(runSum(run, res, SV.DV)));
			if (d.ok && d.body && d.body.rank) say(true, kept.text + (d.body.better ? ` New best on the 3D board: #${d.body.rank}.` : ` 3D board: #${d.body.rank}.`), { rank: d.body.rank, board: d.body.board });
		}
	} catch (e) { console.warn('the run was not saved: ' + (e && e.message)); say(false, WHY.nosave, { why: 'error' }); }
	return kept;
}
let noteText = '', noteUntil = 0;
const noteLog = [];   // (the last notes shown: one can be gone from the screen in a moment)
function note(t, ms) { noteText = t; noteUntil = performance.now() + ms; if (noteLog[noteLog.length - 1] !== t) { noteLog.push(t); if (noteLog.length > 60) noteLog.shift(); } }
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
function stats() {
	const info = renderer.info.render;
	return { frames: perf.frames.length, p50: +pct(perf.frames, 0.5).toFixed(2), p95: +pct(perf.frames, 0.95).toFixed(2), simP95: +pct(perf.sim, 0.95).toFixed(3),
		calls: info.calls, triangles: info.triangles, crowd: crowd.length, sheets: sheets.size, dpr: renderer.getPixelRatio(), size: [innerWidth, innerHeight] };
}
function showHud() {
	const s = stats(), sp = Math.hypot(state.vx, state.vz);
	hud.textContent = `${s.p50 ? Math.round(1000 / s.p50) : 0} fps · frame ${s.p50} ms (p95 ${s.p95}) · rules ${s.simP95} ms\n`
		+ `${s.crowd} sprites · ${s.calls} draw calls · ${s.triangles} triangles\n`
		+ `${stateName(state)} · ${sp.toFixed(1)} m/s · height ${state.y.toFixed(2)} m · air jumps ${state.airJumps}\n`
		+ (rv && rv.league && !grun ? `${rv.league.mega && GG.ExpMega.BY[rv.league.mega] ? GG.ExpMega.nameOf(GG.ExpMega.BY[rv.league.mega]) : (GG.DEX_BY[rv.league.form] || {}).name} (${((rv.league.mega && GG.ExpMega.BY[rv.league.mega] || GG.DEX_BY[rv.league.form] || {}).types || []).join(' / ')}) · League member ${(GG.DEX_BY[rv.league.member] || {}).name}`
			: myRun && myRun.lg ? `${world.pl.mon.name} (${(world.pl.mon.types || []).join(' / ')}) · League member ${(GG.DEX_BY[myRun.lg.member] || {}).name} · ${myRun.lg.role} · kit ${myRun.lg.kit}/4${myRun.lg.mat ? ' · Maturity ' + myRun.lg.mat : ''}`
			: `${SPECIES.name} (${TYPES.join(' / ') || 'no type'})${TRAITS.length ? ' · traits: ' + TRAITS.join(', ') : ''}`)
		+ (!run ? '' : `\n${hudLine(run)}${run.ph === 0 && !run.surv ? ' · charge ' + Math.round(run.charge * 100) + ' %' : ''}${run.sv && run.sv.pacts.length ? '\npacts: ' + run.sv.pacts.join(', ') : ''}`)
		+ (GEN === null || run || XW || XJ ? '' : `\nlevel ${GEN} · ${BIOME} · ${room.size} × ${room.size} tiles · exit ${Math.round(exitDist())} m`)
		+ (!rv ? '' : `\n${rv.hud(state)}${rv.league ? ' · ' + ((GG.DEX_BY[rv.league.form] || {}).name || '') + ' · kit ' + rv.league.kit + '/4' : ''}${rv.sa.length ? ' · team: ' + rv.sa.map((d) => (GG.DEX_BY[d] || {}).name).join(', ') : ''}`)
		+ (!WATCH ? '' : `\n${watchSrc === 'tape' ? 'replay' : 'watching ' + WATCH}` + (!view ? ' · waiting for the fight…' : ` · ${Math.floor(view.t / 60)}:${String(Math.floor(view.t % 60)).padStart(2, '0')}\nLv ${view.pl.level} · HP ${view.pl.hp} / ${view.pl.maxHp} · ${view.enemies.length} enemies · ${view.kills} KOs` + (view.weather ? ` · ${view.weather[0]}` : '')))
		+ (!world || !mates().length ? '' : `\nco-op: ${mates().length + 1} players${JOIN && world.co.stalled ? ' · waiting for the host…' : world.waiting ? ' · waiting for the others to choose' : ''}`
			+ (world.pl.dead ? `\ndown: a teammate beside you gets you up (${world.pl.reviveT.toFixed(1)} / ${CK.REVIVE.time} s)` : ''))
		+ (!world || JOIN || !world.enemies.some((e) => e.boss) ? '' : world.enemies.filter((e) => e.boss).map((e) => `\nBOSS ${(GG.DEX_BY[e.dex] || {}).name}: ${Math.max(0, e.hp)} / ${e.maxHp}${e.ai.fury ? ' · enraged' : ''}`).join(''))
		+ (!world || !world.weather ? '' : `\nweather: ${world.weather.kind} (${Math.ceil(world.weather.dur - world.weather.t)} s)`)
		+ (!world || !world.pl.ability ? '' : `\nability: ${world.pl.ability}${world.pl.items.length ? ' · holding: ' + world.pl.items.join(', ') : ''}`)
		+ (!world ? '' : `\nLv ${world.pl.level} · XP ${Math.floor(world.pl.xp)} / ${world.pl.xpNext}\nHP ${Math.ceil(world.pl.hp)} / ${world.pl.maxHp} · ${world.enemies.length} enemies · ${world.stats.kills} KOs · ${Math.floor(world.t / 60)}:${String(Math.floor(world.t % 60)).padStart(2, '0')} · ${world.pl.moves.map((m) => m.id + ' Lv' + (m.xlv || m.lvl)).join(', ')}`)
		+ (!myRun || !myRun.lv ? '' : `\nvitamins: ${world.pl.xv.map((v) => v.id + ' ' + v.lvl).join(', ') || 'none'} · ₽ ${run ? run.coins : rv ? rv.coins : 0} · luck ${Math.round(world.pl.xluck || 0)}${world.pl.xproc.shield > 0 ? ' · shield ' + Math.round(world.pl.xproc.shield) : ''}${myRun.cap && myRun.cap.sa.length ? '\nteam: ' + myRun.cap.sa.map((a) => (GG.DEX_BY[a.dex] || {}).name + ' (' + a.type + ')').join(', ') : ''}${myRun.held ? ' · holding ' + myRun.held : ''}\nitems: ${Object.keys(world.pl.xi).map((id) => id + (world.pl.xi[id] > 1 ? ' ×' + world.pl.xi[id] : '')).join(', ') || 'none'}`) + (noteText && performance.now() < noteUntil ? `\n» ${noteText}` : '');
	if (RUNUI) RUNUI.update(runView());
	{ const A = SOUND(); if (A && G_MUSIC) A.music(menuUp && paused ? null : musicOf({ over: !!runOver, boss: !!(world && world.enemies.some((e) => e.boss && !e.dead)), mapIndex: XK_MAPS.indexOf(myRun ? myRun.map : XW ? XW.map : ''), tracks: G_MUSIC })); }
}
const G_MUSIC = GG.BIOME_MUSIC || null, XK_MAPS = ['viridian', 'mtmoon', 'cerulean'];

// ---------------------------------------------------------------- boot
(async () => {
	resize();
	// how many sprites each sheet must hold (the lead's Idle sheet is also a crowd sheet when it is one of the crowd's species)
	const need = new Map();
	const want = (d, a, n) => need.set(d + '/' + a, { d, a, n: ((need.get(d + '/' + a) || {}).n || 0) + n });
	want(DEX, 'Idle', 1); want(DEX, 'Walk', 1);
	for (const e of crowd) want(e.dex, 'Idle', 1);
	if (world && !JOIN && !drun) for (const d of FIGHT_CAST) want(d, 'Walk', world.cap);
	if (world && !JOIN && !drun) for (const d of BOSSES) if (!FIGHT_CAST.includes(d)) want(d, 'Walk', 2);
	if (world && Q.get('boss') && BOSSES.includes(+Q.get('boss'))) addBoss(world, +Q.get('boss'), state.x + 12, state.z, { slot: 0 });
	await Promise.all([...need.values()].map(({ d, a, n }) => sheet(d, a, n).catch((e) => console.warn(e.message))));
	ready = true;
	document.getElementById('boot').remove();
	requestAnimationFrame(frame);
})();

// what a test (and a curious owner in the console) can reach
window.__m3d = {
	dive: drun, diveRules: DR, special, propKeys: () => (props ? [...props.atlas.cells.keys()] : []), roomBuilds: () => roomBuilds,
	meta: LAB_META, upgrades: UPGRADES, leadShiny: LEAD_SHINY, skey,
	keepShiny,
	siteHost: SITE_HOST, siteWatch: SITE_WATCH,
	openBoard, get boardUp() { return boardUp; },
	wild: WILD, saveOk: SAVE_OK, keepCatch,
	get kept() { return kept; }, practice: PRACTICE,
	acts, uiNav, siteInput,
	setMenu, get paused() { return paused; },
	ult: { press: () => { if (run) pressUlt(run); }, charge: (v) => { if (run) setCharge(run, v); }, view: () => (run ? ultView(run) : null), setAuto: (on) => setUltAuto(on), get cut() { return cutIn; } },
	runView: () => (RUNUI ? runView() : null),
	get megaNow() { return megaNow; }, megaSheets,
	get ready() { return ready; }, state, get room() { return room; }, run, setZoneTime: (sec) => run && setZoneTime(run, sec), useTool, takePick, ecoView: () => (run ? ecoView(run) : []), capView: () => (run ? capView(run) : null), hazards: () => (run ? hazardsNow(run) : []), fog: () => fogNow(), toggleMap, get mapBig() { return mapBig; }, get rv() { return rv; }, noteLog, grun, fire: (ev) => run && fireEvent(run, ev), K, TUNE, TYPES, TRAITS, cam, crowd, sheets, stats, gen: GEN, biome: BIOME, world, numbers, net, tape, myId: MYID, mates, get coView() { return coView; }, playTape, get view() { return view; }, get viewer() { return viewer; }, get watchT() { return watchT; }, addBoss: (dex, x, z, o) => addBoss(world, dex, x, z, o), drop: (kind, x, z, v) => drop(world, kind, x, groundAt(room, x, z), z, v), pickCard, addEnemy: (dex, x, z, o) => addEnemy(world, dex, x, z, o), holdExit: false, get leaving() { return leaving; },
	setInput(o) { override = o ? { ...noInput(), ...o } : null; },
	rowOf: (facing, yaw) => facingRow(facing, yaw === undefined ? cam.yaw : yaw),
	sq: (key, frame, dir, scale = 1) => sq(sheets.get(key), frame, dir, scale),
	sparks, burst, spriteHtml,
	props: () => (props ? { n: props.n, beads: props.beads, keys: [...props.atlas.cells.keys()], canvas: props.atlas.cv, ink: (key) => { const c = props.atlas.cells.get(key); if (!c) return -1; const d = props.atlas.ctx.getImageData(c.x, c.y, 64, 64).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; }, colours: (key) => { const c = props.atlas.cells.get(key); if (!c) return 0; const d = props.atlas.ctx.getImageData(c.x, c.y, 64, 64).data, s = new Set(); for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; } } : null),
	quadOf: (key, frame, row) => { const s = sheets.get(key); return spriteQuad(s.meta, s.img, frame, row, 1, s.lift); },
	respawn() { Object.assign(state, newState(room, TUNE)); state.facing = cam.yaw; },
	put(x, z, y) { Object.assign(state, newState(room, TUNE)); state.x = x; state.z = z; state.y = y === undefined ? groundAt(room, x, z) : y; state.grounded = y === undefined; },
};
