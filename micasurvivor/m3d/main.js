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
import { makeRenderer, buildTerrain, buildWater, buildScatter, buildExit, drawMap, SpriteBatch, Shadows, Shots, Flashes, loadSheet, frameAt, spriteQuad, footLift, placeCamera } from './render.js';
import { newWorld, addEnemy, tick, dataFrom, CK } from './combat.js';
import { generate, BIOMES } from './gen.js';

const Q = new URLSearchParams(location.search);
// P3: ?gen=<seed>&fight=1 is a FIGHT on that level (combat.js): enemies arrive and come for you, your moves fire by
// themselves at what you can see. ?moves=ember:3,tackle picks them (id:level); R starts the level again.
const FIGHT = Q.has('gen') && Q.get('fight') === '1';
const N = Math.max(0, Math.min(2000, +(Q.get('n') ?? (FIGHT ? 0 : 100)) || 0));
const DEX = +(Q.get('dex') ?? 25) || 25;
const META = (window.G && window.G.SPRITE_META) || {};
const CROWD_DEX = [1, 4, 7, 16, 19, 25, 43, 74, 92, 133].filter((d) => META[d] && META[d].a && META[d].a.Idle && !META[d].src);
const hud = document.getElementById('hud'), canvas = document.getElementById('c');
const GEN = Q.has('gen') ? (+Q.get('gen') >>> 0) : null, BIOME = BIOMES[Q.get('biome')] ? Q.get('biome') : 'meadow';
const SIZE = Q.has('size') ? Math.max(3, Math.min(8, +Q.get('size') | 0 || 5)) : null;
const room = GEN === null ? buildRoom() : generate(GEN, BIOME, SIZE ? { size: SIZE } : null);
// (P1) who you play decides how it moves: its types' traits (sim.js TYPE_TRAITS). ?types=flying,water tries others.
const SPECIES = ((window.G && window.G.DEX) || []).find((p) => p.dex === DEX) || { name: '#' + DEX, types: [] };
const TYPES = Q.get('types') ? Q.get('types').split(',') : SPECIES.types;
const TUNE = tuneFor(TYPES);
const TRAITS = TYPES.filter((t) => TYPE_TRAITS[t]);
const GG = window.G || {};
const FIGHT_CAST = [19, 16, 43, 74, 133, 41, 92, 1, 4, 7].filter((d) => d !== DEX && META[d] && META[d].a && META[d].a.Walk && !META[d].src);
const MOVES = !FIGHT ? [] : Q.get('moves') ? Q.get('moves').split(',').map((m) => { const [id, lv] = m.split(':'); return [id, +lv || 1]; }).filter((m) => GG.Moves.BY_ID[m[0]])
	: [[GG.Moves.startFor(SPECIES), 3], ['tackle', 2]].filter((m, i, a) => a.findIndex((q) => q[0] === m[0]) === i);
const world = FIGHT ? newWorld(room, dataFrom(GG), { dex: DEX, moves: MOVES, seed: (GEN + 1) * 7919, tune: TUNE, cast: FIGHT_CAST, cap: Q.has('cap') ? +Q.get('cap') | 0 : undefined }) : null;
const state = world ? world.pl.s : newState(room, TUNE);
const TYPE_COLOR = (GG.U && GG.U.TYPE_COLOR) || {};
const { renderer, scene, camera } = makeRenderer(canvas);
scene.add(buildTerrain(room));
scene.add(buildWater(room));
if (GEN !== null) { scene.add(buildScatter(room)); scene.add(buildExit(room.exit)); }

// ---------------------------------------------------------------- the camera and the input
const cam = { yaw: Math.PI, pitch: 0.5, dist: 10.5, manual: 0, follow: Q.get('follow') !== '0' };   // (looking north, up the room)
state.facing = cam.yaw;                                  // (you start with your back to the camera)
const keys = new Set();
let override = null;        // (tests: a fixed input instead of the devices)
const touch = { stick: null, look: null, jump: false, slide: false };
addEventListener('keydown', (e) => { keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyR') { if (world) location.reload(); else { Object.assign(state, newState(room, TUNE)); state.facing = cam.yaw; } } });
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
const shadows = new Shadows(N + 4 + (world ? world.cap : 0));
scene.add(shadows.mesh);
const shots = world ? new Shots(600) : null, flashes = world ? new Flashes(scene) : null;
if (shots) scene.add(shots.mesh);

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
	// (P3) the fight: enemies (brighter for a moment when hit), shots and orbs
	if (world) {
		for (const e of world.enemies) {
			const s = sheets.get(e.dex + '/Walk'); if (!s) continue;
			const q = spriteQuad(s.meta, s.img, frameAt(s.meta, t + e.id * 0.37), facingRow(e.a.facing, cam.yaw), 1, s.lift);
			s.batch.add(e.a.x, e.a.y, e.a.z, q.rect, q.uv, e.flash > 0 ? 1.7 : 1);
			shadows.add(room, e.a.x, e.a.z, e.a.y, s.shadow);
		}
		shots.begin();
		for (const p of world.shots) shots.add(p.x, p.y, p.z, Math.max(0.14, p.r), TYPE_COLOR[p.mtype]);
		for (const p of world.orbs) shots.add(p.x, p.y, p.z, Math.max(0.16, p.r), TYPE_COLOR[p.mtype]);
		// what lies in the world: mines (a small ball on the floor), turrets (a ball that hangs and bobs), meteors (a ball
		// coming down on its mark), patches (a disc on the floor, drawn once, fading over its life)
		for (const f of world.fields) {
			const c = TYPE_COLOR[f.m.type];
			if (f.kind === 'mine') shots.add(f.x, f.y + 0.18, f.z, 0.2, c);
			else if (f.kind === 'turret') shots.add(f.x, f.y + 1 + Math.sin(t * 4 + f.id) * 0.12, f.z, 0.34, c);
			else if (f.kind === 'meteor') { const k = Math.max(0, Math.min(1, f.t / f.fall)); if (f.t > 0) shots.add(f.x + (1 - k) * 2.5, f.y + 0.3 + (1 - k) * 10, f.z, 0.45, c); if (!f.seen) { f.seen = true; flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, f.fall - Math.min(0, f.t), 0.9); } }
			else if (f.kind === 'patch' && !f.seen) { f.seen = true; flashes.arc(f.x, f.y, f.z, f.r, 0, 6.2832, c, f.life, 0); }
		}
		shots.end();
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
		if (world) { tick(world, input, K.TICK); fightEvents(); } else step(state, input, room, K.TICK, TUNE);
		perf.acc -= K.TICK; simTicks++;
		if (state.landed > 9) bob = Math.min(0.5, state.landed * 0.02);
		if (state.hard) note('hard landing: hold SLIDE as you land to break a fall', 2200); else if (state.broke) note('fall broken (' + state.broke + ')', 1400);
	}
	perf.sim.push(performance.now() - t0); if (perf.sim.length > 240) perf.sim.shift();
	if (flashes) flashes.update(dt);
	draw(now / 1000);
	if ((simTicks & 15) === 0) showHud();
	if (GEN !== null) { showMap(); if (!leaving && state.grounded && exitDist() < 1.5) { leaving = true; note('exit reached: next level…', 4000); nextLevel(); } }
}
// ---------------------------------------------------------------- (P2) a generated level: the exit and the minimap
let leaving = false, mapBase = null;
const exitDist = () => Math.hypot(state.x - room.exit[0], state.z - room.exit[2]);
/** The next level: the next seed, same biome and options (a fresh page: nothing of this level is kept). */
function nextLevel() { const q = new URLSearchParams(location.search); q.set('gen', String((GEN + 1) >>> 0)); if (!window.__m3d.holdExit) setTimeout(() => { location.search = q.toString(); }, 700); }
function showMap() {
	const el = document.getElementById('map'), px = 4;
	if (!mapBase) { mapBase = drawMap(room, px); el.width = mapBase.width; el.height = mapBase.height; el.style.display = 'block'; }
	const g = el.getContext('2d'), k = px / CELL;
	g.drawImage(mapBase, 0, 0);
	// the exit: a ring that beats; the spawn: a small dot
	g.lineWidth = 2; g.strokeStyle = '#fff2a0'; g.beginPath(); g.arc(room.exit[0] * k, room.exit[2] * k, 5 + 2 * Math.sin(performance.now() / 260), 0, 6.2832); g.stroke();
	g.fillStyle = '#fff'; g.fillRect(room.spawn[0] * k - 1.5, room.spawn[2] * k - 1.5, 3, 3);
	if (world) { g.fillStyle = '#5b1630'; for (const e of world.enemies) g.fillRect(e.a.x * k - 1, e.a.z * k - 1, 3, 3); }   // (P3) enemies: dark dots
	// you: an arrow the way you face (map: +x right, +z down)
	const fx = Math.sin(state.facing), fz = Math.cos(state.facing), x = state.x * k, z = state.z * k;
	g.fillStyle = '#ff3b3b'; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + fx * 7, z + fz * 7); g.lineTo(x - fx * 4 - fz * 4, z - fz * 4 + fx * 4); g.lineTo(x - fx * 4 + fz * 4, z - fz * 4 - fx * 4); g.closePath(); g.fill(); g.stroke();
}
/** (P3) What this tick of the fight did, as things to see. */
function fightEvents() {
	const col = (id) => TYPE_COLOR[(GG.Moves.BY_ID[id] || {}).type];
	for (const ev of world.events) {
		if (ev.k === 'melee') flashes.arc(state.x, state.y, state.z, ev.r, ev.aim, Math.min(ev.arc, 6.2832), col(ev.id));
		else if (ev.k === 'aura') flashes.arc(state.x, state.y, state.z, ev.r, 0, 6.2832, col(ev.id));
		else if (ev.k === 'beam') flashes.bar(ev.from, ev.dir, ev.len, ev.w, col(ev.id));
		else if (ev.k === 'chain') { let a = [state.x, state.y + CK.MUZZLE, state.z]; for (const b of ev.links) { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1; flashes.bar(a, [d[0] / l, d[1] / l, d[2] / l], l, 0.18, col(ev.id), 0.16); a = b; } }
		else if (ev.k === 'blast') flashes.arc(ev.x, ev.y, ev.z, ev.r, 0, 6.2832, col(ev.id), 0.3, 0.4);
		else if (ev.k === 'dash') flashes.bar(ev.from, ev.dir, Math.max(0.1, ev.len), ev.w * 0.5, col(ev.id), 0.25);
		else if (ev.k === 'hurt') { bob = 0.35; note(`hit for ${ev.d.toFixed(0)}`, 700); }
	}
	if (world.pl.dead) note('you are down: R to start the level again', 60000);
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
		+ `${SPECIES.name} (${TYPES.join(' / ') || 'no type'})${TRAITS.length ? ' · traits: ' + TRAITS.join(', ') : ''}`
		+ (GEN === null ? '' : `\nlevel ${GEN} · ${BIOME} · ${room.size} × ${room.size} tiles · exit ${Math.round(exitDist())} m`)
		+ (!world ? '' : `\nHP ${Math.ceil(world.pl.hp)} / ${world.pl.maxHp} · ${world.enemies.length} enemies · ${world.stats.kills} KOs · ${Math.floor(world.t / 60)}:${String(Math.floor(world.t % 60)).padStart(2, '0')} · ${world.pl.moves.map((m) => m.id + ' Lv' + m.lvl).join(', ')}`) + (noteText && performance.now() < noteUntil ? `\n» ${noteText}` : '');
}

// ---------------------------------------------------------------- boot
(async () => {
	resize();
	// how many sprites each sheet must hold (the lead's Idle sheet is also a crowd sheet when it is one of the crowd's species)
	const need = new Map();
	const want = (d, a, n) => need.set(d + '/' + a, { d, a, n: ((need.get(d + '/' + a) || {}).n || 0) + n });
	want(DEX, 'Idle', 1); want(DEX, 'Walk', 1);
	for (const e of crowd) want(e.dex, 'Idle', 1);
	if (world) for (const d of FIGHT_CAST) want(d, 'Walk', world.cap);
	await Promise.all([...need.values()].map(({ d, a, n }) => sheet(d, a, n).catch((e) => console.warn(e.message))));
	ready = true;
	document.getElementById('boot').remove();
	requestAnimationFrame(frame);
})();

// what a test (and a curious owner in the console) can reach
window.__m3d = {
	get ready() { return ready; }, state, room, K, TUNE, TYPES, TRAITS, cam, crowd, sheets, stats, gen: GEN, biome: BIOME, world, addEnemy: (dex, x, z, o) => addEnemy(world, dex, x, z, o), holdExit: false, get leaving() { return leaving; },
	setInput(o) { override = o ? { ...noInput(), ...o } : null; },
	rowOf: (facing, yaw) => facingRow(facing, yaw === undefined ? cam.yaw : yaw),
	quadOf: (key, frame, row) => { const s = sheets.get(key); return spriteQuad(s.meta, s.img, frame, row, 1, s.lift); },
	respawn() { Object.assign(state, newState(room, TUNE)); state.facing = cam.yaw; },
	put(x, z, y) { Object.assign(state, newState(room, TUNE)); state.x = x; state.z = z; state.y = y === undefined ? groundAt(room, x, z) : y; state.grounded = y === undefined; },
};
