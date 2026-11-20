// main.js — Poketactica's page (stage 4; Plans/POKETACTICA_PLAN.md): MicaSurvivor 3D's look (its terrain mesh, upright
// billboard sprites with blob shadows, PMD SpriteCollab sheets) on an isometric camera that turns in 90° steps, with the
// Balatro kit's HUD. The battle is the pure engine (js/engine/battle.js): the page only sends it actions and plays back
// the events it returns. Keyboard (arrows / WASD, Z = A, X = B, C = X info, V = Y Execute, Q / E turn, Enter end phase),
// controller (the same through site/input.js) and touch (tap a tile, tap a button) all play the whole game.
import * as THREE from 'three';
import { makeRenderer, buildTerrain, SpriteBatch, loadSheet, frameAt, footLift, spriteQuad, Shadows, setFog } from '../../micasurvivor/m3d/render.js';
import { makeRoom, setCell, CELL, facingRow } from '../../micasurvivor/m3d/sim.js';
import { startInput } from '/site/input.js';
import { sfx } from '/site/ui/sfx.js';
import * as B from './engine/battle.js';
import * as Geo from './engine/geo.js';
import { shapeTiles, DIRS, heightAt, isTile } from './engine/grid.js';
import { demoSetup } from './demo.js';

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

const P = { data: null, S: null, setup: null, seed: null, actions: [], mode: 'idle', sel: null, menu: null, cursor: { x: 1, y: 8 }, yawK: 0, zoom: 1, anims: [], disp: null, busy: false };
window.__poketactica = { ready: false, P, B, Geo };

// ---------------------------------------------------------------- the scene
let renderer, scene, camera, terrainMesh, overlay, shadows, symbolGroup, numCanvas, numCtx;
const sheets = new Map();   // dex/anim -> { batch, meta, img, lift } | null (loading)

function buildScene(map) {
	const room = makeRoom(map.w, map.h, 0);
	room.rimH = 999; room.maxH = 4 * LV;
	for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const h = heightAt(map, x, y); setCell(room, x, y, h == null ? -6 : h * LV); }
	if (terrainMesh) scene.remove(terrainMesh);
	P.room = room;
	terrainMesh = buildTerrain(room);
	scene.add(terrainMesh);
	if (!overlay) {
		overlay = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
		overlay.renderOrder = 3; scene.add(overlay);
	}
	if (!shadows) { shadows = new Shadows(64); scene.add(shadows.mesh); }
	if (symbolGroup) scene.remove(symbolGroup);
	symbolGroup = new THREE.Group(); scene.add(symbolGroup);
}

const topY = (x, y) => (heightAt(P.S.map, x, y) ?? 0) * LV;
const world = (x, y) => [x * CELL + CELL / 2, topY(x, y), y * CELL + CELL / 2];

/** The coloured tile overlay: Geo colours, then the current highlight layers, then the cursor. */
function rebuildOverlay() {
	const S = P.S, pos = [], col = [], c = new THREE.Color();
	const tile = (x, y, hex, inset = 0.06, lift = 0.02) => {
		if (!isTile(S.map, x, y)) return;
		const y0 = topY(x, y) + lift, a = x * CELL + inset, b = x * CELL + CELL - inset, d = y * CELL + inset, e = y * CELL + CELL - inset;
		c.setHex(hex);
		for (const p of [[a, y0, d], [a, y0, e], [b, y0, e], [a, y0, d], [b, y0, e], [b, y0, d]]) { pos.push(...p); col.push(c.r, c.g, c.b); }
	};
	const geo = (P.disp && P.disp.geo) || S.geo;
	for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) { const g = geo[y * S.map.w + x]; if (g) tile(x, y, GEO_HEX[g] || 0xffffff, 0.02, 0.01); }
	tile(S.map.base.x, S.map.base.y, 0x9be7ff, 0.2, 0.025);   // the base tile (deploy here; throw a weakened foe here to catch it)
	for (const t of P.hl.move || []) tile(t[0], t[1], 0x4aa8ff, 0.14, 0.03);
	for (const t of P.hl.aim || []) tile(t[0], t[1], 0xff5a5a, 0.14, 0.03);
	for (const t of P.hl.area || []) tile(t[0], t[1], 0xffb13c, 0.26, 0.04);
	tile(P.cursor.x, P.cursor.y, 0xffffff, 0.34, 0.05);
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	overlay.geometry.dispose(); overlay.geometry = g;
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
const FACE = { n: Math.PI, e: Math.PI / 2, s: 0, w: -Math.PI / 2 };

// ---------------------------------------------------------------- the camera: isometric, turned in 90° steps
const camYaw = () => Math.PI / 4 + P.yawK * Math.PI / 2;
function placeCam() {
	const S = P.S, w = S.map.w * CELL, h = S.map.h * CELL, cx = w / 2, cz = h / 2;
	// fit the whole board's diamond on any screen: seen at 45°, it is (w + h)·√½ wide and that times sin(pitch) (+ its heights) tall
	const yaw = camYaw(), pitch = 0.62, d = 60;
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
	const r = B.act(P.S, a, P.data);
	if (!r.ok) { sfx.error(); toast(r.why || 'Not now'); return r; }
	P.actions.push(a);
	queueEvents(r.events);
	afterAct();
	return r;
}
window.__poketactica.act = act;
/** (tests) where a tile's top centre is on screen, in CSS pixels */
window.__poketactica.screenOf = (x, y) => { const [wx, wy, wz] = world(x, y); return project(wx, wy, wz); };

/** Turn engine events into short animations; the units are drawn from P.disp until the queue is empty. */
function queueEvents(evs) {
	if (!P.disp) P.disp = snapshotDisp();
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
	if (!P.anims.length && !cur) { if (P.busy) { P.busy = false; P.disp = null; refreshHud(); rebuildOverlay(); } return; }
	if (!cur) { cur = P.anims.shift(); animT = 0; startAnim(cur); }
	animT += dt;
	const dur = cur.t === 'move' ? DUR.move * Math.max(1, (cur.path || []).length - 1) : DUR[cur.t] || 0;
	tickAnim(cur, Math.min(1, dur ? animT / dur : 1));
	if (animT >= dur) { endAnim(cur); cur = null; }
}
function startAnim(e) {
	const D = P.disp, u = e.uid && D.units[e.uid];
	if (e.t === 'use' && u) { u.anim = 'Attack'; u.t0 = performance.now() / 1000; sfx.card && sfx.card(); }
	if (e.t === 'hit' && D.units[e.target]) { const v = D.units[e.target]; v.anim = 'Hurt'; v.flash = 1; v.hp = e.hp; pop(e.target, '-' + e.dmg, e.eff > 1 ? '#ffd23c' : '#ffffff'); }
	if (e.t === 'hurt' && u) { u.hp = Math.max(0, u.hp - e.n); pop(e.uid, '-' + e.n, '#c8a0ff'); }
	if (e.t === 'heal' && u) { u.hp += e.n; pop(e.uid, '+' + e.n, '#7cf08a'); }
	if (e.t === 'miss') pop(e.target || e.uid, 'Miss', '#cccccc');
	if (e.t === 'immune') pop(e.uid, 'Immune', '#cccccc');
	if (e.t === 'status' && u) pop(e.uid, e.st.toUpperCase(), '#e0b36b');
	if (e.t === 'ko' && u) { u.anim = 'Faint'; u.t0 = performance.now() / 1000; }
	if (e.t === 'deploy' && u) { u.x = e.x; u.y = e.y; u.alive = true; }
	if (e.t === 'repaint') { D.geo[e.y * P.S.map.w + e.x] = e.color; rebuildOverlay(); }
	if (e.t === 'geo-break') { banner('Geo chain!'); }
	if (e.t === 'phase') banner(e.phase === 'enemy' ? 'Enemy phase' : 'Turn ' + e.turn);
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
	if (e.t === 'move' && u) { const [x, y] = e.path[e.path.length - 1]; u.x = x; u.y = y; u.wx = null; u.anim = 'Idle'; }
	if ((e.t === 'dash' || e.t === 'leap') && u) { u.x = e.x; u.y = e.y; u.wx = null; u.arc = 0; }
	if (e.t === 'throw' && D.units[e.target]) { const v = D.units[e.target]; v.x = e.x; v.y = e.y; v.wx = null; v.arc = 0; }
	if (e.t === 'use' && u) u.anim = 'Idle';
	if (e.t === 'hit' && D.units[e.target]) D.units[e.target].anim = 'Idle';
	if (e.t === 'ko' && u) u.alive = false;
	if (e.t === 'undo' || e.t === 'swap' || e.t === 'broke-free') { P.disp = snapshotDisp(); }
	if (e.t === 'capture' && e.ok && D.units[e.target]) D.units[e.target].alive = false;
}

// ---------------------------------------------------------------- the frame
let last = performance.now();
function frame(now) {
	const dt = Math.min(0.05, (now - last) / 1000); last = now;
	stepAnims(dt);
	drawUnits(now / 1000);
	const right = new THREE.Vector3(-Math.cos(camYaw()), 0, Math.sin(camYaw()));
	for (const s of sheets.values()) if (s) s.batch.end(right);
	renderer.render(scene, camera);
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
		sh.batch.add(wx, wy, wz, q.rect, q.uv, d.flash > 0 ? 2 : u.side === 'e' ? 0.94 : 1);
		if (d.flash > 0) d.flash = Math.max(0, d.flash - 0.08);
		list.push({ u, wx, wy, wz, shadow: sh.shadow });
	}
	for (const o of list) shadows.add(P.room, o.wx, o.wz, o.wy, o.shadow);
	shadows.end();
	P.drawn = list;
}

// ---------------------------------------------------------------- HP bars and numbers (2D, projected)
const pops = [];
function pop(uid, text, color) { pops.push({ uid, text, color, t: 0 }); }
const project = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
function drawNumbers(dt) {
	const g = numCtx, dpr = Math.min(devicePixelRatio || 1, 2);
	g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
	const S = P.S, D = P.disp;
	for (const o of P.drawn || []) {
		const [sx, sy] = project(o.wx, o.wy + 2.6, o.wz), hp = D ? D.units[o.u.uid].hp : o.u.hp, f = Math.max(0, hp / o.u.maxHP);
		g.fillStyle = '#1c1f24'; g.fillRect(sx - 18, sy, 36, 6);
		g.fillStyle = o.u.side === 'p' ? (f > 0.5 ? '#3fd36b' : f > 0.25 ? '#f5c542' : '#fe5f55') : '#fe5f55';
		g.fillRect(sx - 17, sy + 1, 34 * f, 4);
	}
	for (let i = pops.length - 1; i >= 0; i--) {
		const p = pops[i]; p.t += dt;
		const o = (P.drawn || []).find((d) => d.u.uid === p.uid);
		if (!o || p.t > 0.9) { pops.splice(i, 1); continue; }
		const [sx, sy] = project(o.wx, o.wy + 3.2, o.wz);
		g.font = 'bold 18px m6x11, monospace'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#1c1f24';
		g.strokeText(p.text, sx, sy - p.t * 28); g.fillStyle = p.color; g.fillText(p.text, sx, sy - p.t * 28);
	}
}

// ---------------------------------------------------------------- the HUD (Balatro kit)
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 1600); }
function banner(t) { const el = $('banner'); el.textContent = t; el.hidden = false; el.classList.remove('pt-in'); void el.offsetWidth; el.classList.add('pt-in'); clearTimeout(banner.t); banner.t = setTimeout(() => { el.hidden = true; }, 1100); }
function unitAtCursor() { return B.unitAt(P.S, P.cursor.x, P.cursor.y); }
function refreshHud() {
	const S = P.S;
	$('turn').textContent = S.over ? (S.over === 'won' ? 'Victory' : 'Defeat') : (S.phase === 'player' ? 'Turn ' + S.turn : 'Enemy phase');
	$('queue').textContent = S.queue.length ? S.queue.length + ' queued' : '';
	const b = S.bonus || { points: 0, level: 0 };
	$('gauge-fill').style.width = Math.min(100, (b.points % 100)) + '%';
	$('gauge-lv').textContent = b.level;
	const u = unitAtCursor() || (P.sel && B.unit(S, P.sel));
	const el = $('unit');
	if (!u) { el.hidden = true; } else {
		el.hidden = false;
		const sp = P.data.species[u.species] || {};
		$('u-name').textContent = (sp.name || u.species) + '  Lv ' + u.level;
		$('u-side').textContent = u.side === 'p' ? 'Yours' : 'Wild';
		$('u-side').className = 'bal-badge ' + (u.side === 'p' ? 'bal-blue' : 'bal-orange');
		$('u-hp').textContent = u.hp + ' / ' + u.maxHP; $('u-hpbar').style.width = (100 * u.hp / u.maxHP) + '%';
		$('u-sp').textContent = 'SP ' + u.sp + ' / ' + u.maxSP + (u.status ? '  ' + u.status.toUpperCase() : '');
		$('u-moves').innerHTML = u.fig.equipped.map((m) => { const d = P.data.moves[m] || {}; return `<li><b>${d.name || m}</b> <span class="bal-muted">${d.type || ''} · PP ${u.pp[m]}</span></li>`; }).join('');
		const g = Geo.effectsAt(S, u.x ?? -1, u.y ?? -1);
		$('u-geo').textContent = g.length ? 'Geo: ' + g.map((e) => e.k + (e.stat ? ' ' + e.stat : '') + (e.type ? ' ' + e.type : '')).join(', ') : '';
	}
	// the reserve list (deploy)
	const res = S.units.filter((x) => x.side === 'p' && x.x == null && x.hp > 0);
	$('reserve').innerHTML = res.map((x) => `<button class="bal-btn bal-sm bal-blue" data-deploy="${x.uid}">${(P.data.species[x.species] || {}).name || x.species}</button>`).join('');
	$('reserve-wrap').hidden = !res.length || S.phase !== 'player';
	if (S.over) showResult();
}
function setMenu(items) {
	P.menu = items ? { items, i: 0 } : null;
	const el = $('menu');
	if (!items) { el.hidden = true; el.innerHTML = ''; return; }
	el.hidden = false;
	el.innerHTML = items.map((it, i) => `<button class="bal-btn ${it.color || 'bal-blue'} ${i === 0 ? 'is-focus' : ''}" data-i="${i}" ${it.off ? 'disabled' : ''}>${it.label}</button>`).join('');
}
function menuMove(d) { if (!P.menu) return; const n = P.menu.items.length; P.menu.i = (P.menu.i + d + n) % n; [...$('menu').children].forEach((b, i) => b.classList.toggle('is-focus', i === P.menu.i)); sfx.select && sfx.select(); }
function menuPick(i) { if (!P.menu) return; const it = P.menu.items[i ?? P.menu.i]; if (!it || it.off) { sfx.error(); return; } sfx.press(); it.go(); }

// ---------------------------------------------------------------- the controls: a small state machine
function setHl(o) { P.hl = o || {}; rebuildOverlay(); }
function back() {
	sfx.back();
	if (P.mode === 'aim' || P.mode === 'throw-to') return openMoves(B.unit(P.S, P.sel));
	if (P.mode === 'move' || P.mode === 'moves' || P.mode === 'throw-from') return openUnit(B.unit(P.S, P.sel));
	P.mode = 'idle'; P.sel = null; setMenu(null); setHl(null);
}
function openUnit(u) {
	P.sel = u.uid; P.mode = 'unit'; setHl(null);
	const items = [];
	if (!u.moved && !u.acted) items.push({ label: 'Move', go: () => { P.mode = 'move'; setMenu(null); setHl({ move: [...B.moveTiles(P.S, u).values()].map((t) => [t.x, t.y]) }); } });
	if (!u.acted) items.push({ label: 'Attack', color: 'bal-red', go: () => openMoves(u) });
	if (!u.acted && u.lift) items.push({ label: 'Throw', color: 'bal-orange', go: () => { P.mode = 'throw-from'; setMenu(null); setHl({ aim: Object.values(DIRS).map(([dx, dy]) => [u.x + dx, u.y + dy]).filter(([x, y]) => B.unitAt(P.S, x, y) || Geo.symbolAt(P.S, x, y)) }); } });
	if (u.moved && !u.acted) items.push({ label: 'Undo move', color: 'bal-grey', go: () => { act({ t: 'undo', uid: u.uid }); P.mode = 'idle'; setMenu(null); } });
	if (!u.acted) items.push({ label: 'Wait', color: 'bal-grey', go: () => { act({ t: 'wait', uid: u.uid }); P.mode = 'idle'; setMenu(null); } });
	items.push({ label: 'Back', color: 'bal-grey', go: back });
	setMenu(items);
}
function openMoves(u) {
	P.mode = 'moves'; setHl(null);
	setMenu(u.fig.equipped.map((mid) => {
		const m = B.moveOf(u, mid, P.data), d = P.data.moves[mid] || {};
		const off = !m || u.pp[mid] < 1 || u.sp < m.spCost;
		return { label: `${d.name || mid} <small>SP ${m ? m.spCost : '?'} · PP ${u.pp[mid]}</small>`, color: 'bal-red', off, go: () => {
			P.mode = 'aim'; P.aimMove = mid; setMenu(null);
			setHl({ aim: B.aimTiles(P.S, u, m) });
			previewArea();
		} };
	}).concat([{ label: 'Back', color: 'bal-grey', go: back }]));
}
function previewArea() {
	if (P.mode !== 'aim') return;
	const u = B.unit(P.S, P.sel), m = B.moveOf(u, P.aimMove, P.data);
	const ok = P.hl.aim.some(([x, y]) => x === P.cursor.x && y === P.cursor.y);
	P.hl.area = ok ? shapeTiles(P.S.map, m, u.x, u.y, P.cursor.x, P.cursor.y) : [];
	rebuildOverlay();
}
function openField() {
	P.mode = 'field';
	setMenu([
		{ label: 'Execute', color: 'bal-orange', off: !P.S.queue.length, go: () => { act({ t: 'execute' }); P.mode = 'idle'; setMenu(null); } },
		{ label: 'End phase', color: 'bal-red', go: () => { act({ t: 'end' }); P.mode = 'idle'; setMenu(null); } },
		{ label: 'Back', color: 'bal-grey', go: back },
	]);
}
function confirm() {
	const S = P.S, c = P.cursor;
	if (S.over || S.phase !== 'player') return;
	if (P.menu) return menuPick();
	if (P.mode === 'idle') {
		const u = unitAtCursor();
		if (u && u.side === 'p') { sfx.press(); return openUnit(u); }
		if (c.x === S.map.base.x && c.y === S.map.base.y && !u) { const r = S.units.find((x) => x.side === 'p' && x.x == null && x.hp > 0); if (r) { sfx.press(); act({ t: 'deploy', uid: r.uid }); return; } }
		sfx.press(); return openField();
	}
	if (P.mode === 'move') {
		if (!(P.hl.move || []).some(([x, y]) => x === c.x && y === c.y)) { sfx.error(); return; }
		act({ t: 'move', uid: P.sel, x: c.x, y: c.y }); const u = B.unit(S, P.sel); setHl(null); return openUnit(u);
	}
	if (P.mode === 'aim') {
		if (!(P.hl.aim || []).some(([x, y]) => x === c.x && y === c.y)) { sfx.error(); return; }
		const r = act({ t: 'attack', uid: P.sel, move: P.aimMove, x: c.x, y: c.y });
		if (r.ok) { P.mode = 'idle'; P.sel = null; setHl(null); }
		return;
	}
	if (P.mode === 'throw-from') {
		if (!(P.hl.aim || []).some(([x, y]) => x === c.x && y === c.y)) { sfx.error(); return; }
		const u = B.unit(S, P.sel); P.throwFrom = { x: c.x, y: c.y }; P.mode = 'throw-to';
		const t = []; for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) if (Math.abs(x - u.x) + Math.abs(y - u.y) <= u.throw && isTile(S.map, x, y) && !B.unitAt(S, x, y) && !Geo.symbolAt(S, x, y)) t.push([x, y]);
		setHl({ aim: t });
		return;
	}
	if (P.mode === 'throw-to') {
		const r = act({ t: 'throw', uid: P.sel, from: P.throwFrom, x: c.x, y: c.y });
		if (r.ok) { P.mode = 'idle'; P.sel = null; setHl(null); }
	}
}
function moveCursor(action) {
	const [dx, dy] = stepFor(action), S = P.S;
	P.cursor.x = Math.max(0, Math.min(S.map.w - 1, P.cursor.x + dx)); P.cursor.y = Math.max(0, Math.min(S.map.h - 1, P.cursor.y + dy));
	previewArea(); rebuildOverlay(); refreshHud();
}
function onAction(action, o = {}) {
	if (!P.S || P.busy) return true;
	if (P.S.over && action === 'confirm') { $('result').hidden ? showResult() : newGame(); return true; }
	if (['up', 'down', 'left', 'right'].includes(action)) {
		if (P.menu) { menuMove(action === 'up' || action === 'left' ? -1 : 1); return true; }
		moveCursor(action); return true;
	}
	if (action === 'confirm') { confirm(); return true; }
	if (action === 'cancel') { if (P.mode !== 'idle' || P.menu) back(); return true; }
	if (action === 'context') { if (P.S.queue.length) { sfx.press(); act({ t: 'execute' }); } return true; }   // V / Y: Execute
	if (action === 'menu') { if (!P.menu) { sfx.press(); openField(); } return true; }
	if (action === 'prev' || action === 'next') { if (o.repeat) return true; P.yawK += action === 'next' ? 1 : -1; placeCam(); sfx.tab && sfx.tab(); return true; }
	if (action === 'secondary') { const el = $('unit'); el.classList.toggle('pt-open'); return true; }   // C / X: info
	return false;
}
function afterAct() { refreshHud(); rebuildOverlay(); }

function showResult() {
	const S = P.S, r = B.results(S), el = $('result');
	el.hidden = false;
	$('r-title').textContent = S.over === 'won' ? 'Victory!' : 'Defeat';
	$('r-body').innerHTML = S.over === 'won'
		? `<p>Bonus Gauge level ${r.bonusLevel}</p><ul class="bal-list">${r.bonus.map((b) => `<li>Lv ${b.level}: ${b.kind}${b.n ? ' ' + b.n : ''}${b.game ? ' (' + b.game + ')' : ''}${b.rarity ? ' (' + b.rarity + ')' : ''}</li>`).join('') || '<li class="bal-muted">nothing yet: fill the gauge with KOs, combos and Geo chains</li>'}</ul>${r.captured.length ? `<p>Caught: ${r.captured.map((f) => (P.data.species[f.species] || {}).name).join(', ')}</p>` : ''}`
		: '<p>Your figurines were all knocked out.</p>';
}
function newGame() {
	$('result').hidden = true;
	P.seed = 'training-' + Date.now().toString(36);
	P.setup = demoSetup(P.data);
	P.S = B.newBattle(P.seed, P.setup, P.data);
	P.actions = []; P.anims = []; P.disp = null; P.busy = false; P.mode = 'idle'; P.sel = null; P.cursor = { ...P.S.map.base };
	buildScene(P.S.map); placeCam(); setMenu(null); setHl(null); refreshHud();
	banner('Turn 1');
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
	newGame();
	sfx.wire(document);
	// touch / mouse: tap a tile (the ground under the pointer), tap a button
	const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
	canvas.addEventListener('pointerdown', (ev) => {
		if (P.busy) return;
		ndc.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
		ray.setFromCamera(ndc, camera);
		const hit = ray.intersectObject(terrainMesh)[0];
		if (!hit) return;
		const x = Math.floor(hit.point.x / CELL), y = Math.floor(hit.point.z / CELL);
		if (!isTile(P.S.map, x, y)) return;
		const same = x === P.cursor.x && y === P.cursor.y;
		P.cursor = { x, y }; previewArea(); rebuildOverlay(); refreshHud();
		if (same || P.mode !== 'idle') confirm();
	});
	$('menu').addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (b) menuPick(+b.dataset.i); });
	$('reserve').addEventListener('click', (ev) => { const b = ev.target.closest('[data-deploy]'); if (b) act({ t: 'deploy', uid: b.dataset.deploy }); });
	$('b-exec').addEventListener('click', () => onAction('context'));
	$('b-end').addEventListener('click', () => { if (!P.busy && P.S.phase === 'player') openField(); });
	$('b-left').addEventListener('click', () => onAction('prev'));
	$('b-right').addEventListener('click', () => onAction('next'));
	$('b-zoom').addEventListener('click', () => { P.zoom = P.zoom >= 1.6 ? 1 : P.zoom + 0.3; placeCam(); });
	$('r-again').addEventListener('click', () => newGame());
	window.__poketacticaInput = startInput({ onAction, pad: true });
	requestAnimationFrame(frame);
	window.__poketactica.sheets = sheets;   // (tests)
	window.__poketactica.ready = true;
	$('boot').hidden = true;
}
boot().catch((e) => { console.error(e); $('boot').textContent = 'Could not load: ' + e.message; });
