// m3d/main.js — MicaSurvivor 3D, P0 (Plans/MICASURVIVOR_3D_PLAN.md): the test room. Not a game mode and not linked from
// the menu: one hand-built room to answer two questions before anything is built on them —
//   1. does a phone hold 60 fps with a real 3D scene and 100 sprite billboards?
//   2. does the jump feel right?
// /micasurvivor/m3d/   ?n=100 the crowd · ?dex=25 who you play · ?still=1 a crowd that does not turn
import * as THREE from 'three';
import { K, CELL, step, newState, noInput, groundAt, stateName, facingRow, tuneFor, TYPE_TRAITS } from './sim.js';
import { buildRoom, SPOTS, ROOM_W, ROOM_H } from './room.js';
import { makeRenderer, buildTerrain, buildWater, SpriteBatch, Shadows, loadSheet, frameAt, spriteQuad, footLift, placeCamera } from './render.js';

const Q = new URLSearchParams(location.search);
const N = Math.max(0, Math.min(2000, +(Q.get('n') ?? 100) || 0));
const DEX = +(Q.get('dex') ?? 25) || 25;
const META = (window.G && window.G.SPRITE_META) || {};
const CROWD_DEX = [1, 4, 7, 16, 19, 25, 43, 74, 92, 133].filter((d) => META[d] && META[d].a && META[d].a.Idle && !META[d].src);
const hud = document.getElementById('hud'), canvas = document.getElementById('c');
const room = buildRoom();
// (P1) who you play decides how it moves: its types' traits (sim.js TYPE_TRAITS). ?types=flying,water tries others.
const SPECIES = ((window.G && window.G.DEX) || []).find((p) => p.dex === DEX) || { name: '#' + DEX, types: [] };
const TYPES = Q.get('types') ? Q.get('types').split(',') : SPECIES.types;
const TUNE = tuneFor(TYPES);
const TRAITS = TYPES.filter((t) => TYPE_TRAITS[t]);
const state = newState(room, TUNE);
const { renderer, scene, camera } = makeRenderer(canvas);
scene.add(buildTerrain(room));
scene.add(buildWater(room));

// ---------------------------------------------------------------- the camera and the input
const cam = { yaw: Math.PI, pitch: 0.5, dist: 10.5, manual: 0, follow: Q.get('follow') !== '0' };   // (looking north, up the room)
state.facing = cam.yaw;                                  // (you start with your back to the camera)
const keys = new Set();
let override = null;        // (tests: a fixed input instead of the devices)
const touch = { stick: null, look: null, jump: false, slide: false };
addEventListener('keydown', (e) => { keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyR') { Object.assign(state, newState(room, TUNE)); state.facing = cam.yaw; } });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
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
	jump = keys.has('Space') || keys.has('KeyZ'); crouch = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyC') || keys.has('KeyX');
	if (keys.has('KeyQ')) turn += 1; if (keys.has('KeyE')) turn -= 1;
	const pad = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find((p) => p && p.connected);
	if (pad) {
		const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
		ix += dz(pad.axes[0] || 0); iy -= dz(pad.axes[1] || 0); turn -= dz(pad.axes[2] || 0) * 1.4;
		cam.pitch = Math.max(0.15, Math.min(1.1, cam.pitch + dz(pad.axes[3] || 0) * dt * 1.2));
		jump = jump || !!(pad.buttons[0] && pad.buttons[0].pressed); crouch = crouch || !!(pad.buttons[1] && pad.buttons[1].pressed) || !!(pad.buttons[2] && pad.buttons[2].pressed);
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
	const flat = [];   // open floor cells (height 0, no slope), away from the spawn
	for (let cz = 1; cz < ROOM_H - 1; cz++) for (let cx = 1; cx < ROOM_W - 1; cx++) { const i = cz * room.w + cx; if (room.cells[i] === 0 && !room.slopes.has(i) && Math.hypot((cx + 0.5) * CELL - SPOTS.start[0], (cz + 0.5) * CELL - SPOTS.start[1]) > 5) flat.push([cx, cz]); }
	for (let i = 0; i < N && CROWD_DEX.length && flat.length; i++) {
		const [cx, cz] = flat[Math.floor(rnd() * flat.length)];
		crowd.push({ dex: CROWD_DEX[i % CROWD_DEX.length], x: (cx + 0.15 + rnd() * 0.7) * CELL, z: (cz + 0.15 + rnd() * 0.7) * CELL, facing: rnd() * 6.2832, turn: Q.has('still') ? 0 : (rnd() - 0.5) * 1.2, t0: rnd() * 5 });
	}
}

// ---------------------------------------------------------------- sheets
const sheets = new Map();   // 'dex/Anim' -> { batch, meta, img }
async function sheet(dex, anim, max) {
	const key = dex + '/' + anim, meta = META[dex] && META[dex].a && META[dex].a[anim];
	if (!meta) return null;
	const tex = await loadSheet(`../assets/pokemon/${dex}/${anim}.png`);
	const batch = new SpriteBatch(tex, max);
	scene.add(batch.mesh);
	const o = { batch, meta, img: tex.image, lift: footLift(meta, tex.image), shadow: 0.35 + 0.18 * ((META[dex].s | 0) + 1) };
	sheets.set(key, o);
	return o;
}
const shadows = new Shadows(N + 4);
scene.add(shadows.mesh);

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
	shadows.begin();
	// the crowd
	for (const e of crowd) {
		const s = sheets.get(e.dex + '/Idle'); if (!s) continue;
		const y = groundAt(room, e.x, e.z), q = spriteQuad(s.meta, s.img, frameAt(s.meta, t + e.t0), facingRow(e.facing + e.turn * t, cam.yaw), 1, s.lift);
		s.batch.add(e.x, y, e.z, q.rect, q.uv, 1);
		shadows.add(room, e.x, e.z, y, s.shadow);
	}
	// the lead
	const name = stateName(state), anim = name === 'idle' || name === 'staggered' ? 'Idle' : 'Walk', ps = sheets.get(DEX + '/' + anim) || sheets.get(DEX + '/Idle');
	if (ps) {
		const q = spriteQuad(ps.meta, ps.img, name === 'sliding' ? 0 : frameAt(ps.meta, state.t * (name === 'running' ? 1.25 : 1)), facingRow(state.facing, cam.yaw), 1.15, ps.lift);
		ps.batch.add(state.x, state.y, state.z, q.rect, q.uv, 1);
		shadows.add(room, state.x, state.z, state.y, ps.shadow * 1.15);
	}
	for (const s of sheets.values()) s.batch.end(right);
	shadows.end();
	renderer.render(scene, camera);
}

function frame(now) {
	requestAnimationFrame(frame);
	const dt = Math.min(0.1, (now - (perf.last || now)) / 1000);
	if (perf.last) { perf.frames.push(now - perf.last); if (perf.frames.length > 240) perf.frames.shift(); }
	perf.last = now;
	perf.acc += dt;
	const t0 = performance.now();
	const input = readInput(dt);
	followCam(dt);
	while (perf.acc >= K.TICK) {
		step(state, input, room, K.TICK, TUNE); perf.acc -= K.TICK; simTicks++;
		if (state.landed > 9) bob = Math.min(0.5, state.landed * 0.02);
		if (state.hard) note('hard landing: hold SLIDE as you land to break a fall', 2200); else if (state.broke) note('fall broken (' + state.broke + ')', 1400);
	}
	perf.sim.push(performance.now() - t0); if (perf.sim.length > 240) perf.sim.shift();
	draw(now / 1000);
	if ((simTicks & 15) === 0) showHud();
}
let noteText = '', noteUntil = 0;
function note(t, ms) { noteText = t; noteUntil = performance.now() + ms; }
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
		+ `${SPECIES.name} (${TYPES.join(' / ') || 'no type'})${TRAITS.length ? ' · traits: ' + TRAITS.join(', ') : ''}` + (noteText && performance.now() < noteUntil ? `\n» ${noteText}` : '');
}

// ---------------------------------------------------------------- boot
(async () => {
	resize();
	// how many sprites each sheet must hold (the lead's Idle sheet is also a crowd sheet when it is one of the crowd's species)
	const need = new Map();
	const want = (d, a, n) => need.set(d + '/' + a, { d, a, n: ((need.get(d + '/' + a) || {}).n || 0) + n });
	want(DEX, 'Idle', 1); want(DEX, 'Walk', 1);
	for (const e of crowd) want(e.dex, 'Idle', 1);
	await Promise.all([...need.values()].map(({ d, a, n }) => sheet(d, a, n).catch((e) => console.warn(e.message))));
	ready = true;
	document.getElementById('boot').remove();
	requestAnimationFrame(frame);
})();

// what a test (and a curious owner in the console) can reach
window.__m3d = {
	get ready() { return ready; }, state, room, K, TUNE, TYPES, TRAITS, cam, crowd, sheets, stats,
	setInput(o) { override = o ? { ...noInput(), ...o } : null; },
	rowOf: (facing, yaw) => facingRow(facing, yaw === undefined ? cam.yaw : yaw),
	quadOf: (key, frame, row) => { const s = sheets.get(key); return spriteQuad(s.meta, s.img, frame, row, 1, s.lift); },
	respawn() { Object.assign(state, newState(room, TUNE)); state.facing = cam.yaw; },
	put(x, z, y) { Object.assign(state, newState(room, TUNE)); state.x = x; state.z = z; state.y = y === undefined ? groundAt(room, x, z) : y; state.grounded = y === undefined; },
};
