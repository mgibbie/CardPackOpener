// m3d/render.js — MicaSurvivor 3D, P0: drawing. three.js (the copy Battlecards already ships, by the page's import map).
//   * the terrain: one mesh built from the height field (flat tops, slopes, and a wall wherever a cell stands above its
//     neighbour)
//   * sprites: UPRIGHT billboards — a quad that turns about the vertical axis only, so feet stay on the ground when the
//     camera pitches (think Doom, Paper Mario). One instanced batch per sprite sheet: a crowd of one species is one draw
//     call. The sheet's facing row is chosen per sprite from its heading as THIS camera sees it (sim.js facingRow).
//   * a blob shadow under every sprite, on the floor, shrinking as it leaves the ground: what stops a sprite floating
//   * fog and a flat light tint on the sprites, the same fog as the terrain's
import * as THREE from 'three';
import { CELL, groundAt, facingRow } from './sim.js';

// colours are authored for the screen (pixel art, flat tints): three.js is told not to convert them
THREE.ColorManagement.enabled = false;
export const PX = 0.11;   // metres per art pixel: a 2 m cell is about 18 px, as a tile is in the 2D game
const FOG = { color: new THREE.Color(0x9fc4e8), near: 26, far: 78 };

export function makeRenderer(canvas) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
	// colours are authored for the screen (pixel art, flat tints): no linear-light conversion on the way out
	renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
	renderer.setClearColor(FOG.color);
	const scene = new THREE.Scene();
	scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
	const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 160);
	return { renderer, scene, camera };
}

// ---------------------------------------------------------------- the terrain
// (no lamps: the terrain is unlit, each face a flat colour with its shade baked in by which way it faces — the retro
// look, and the cheapest thing a phone can draw)
const TOP = [0x7fbf6a, 0x74b45f], SLOPE = [0xd2b877, 0xc6ab69], SIDE = 0xa5855c, RIM = 0x8497ab;
const MAT = { ice: [0xcfeeff, 0xbfe4fa], mud: [0x7a5a3c, 0x705236], bounce: [0xff7ab8, 0xff5fa6] };   // (P1: a cell's surface)
const BED = [0xcdbb86, 0xc2af7b];   // (a pool's floor)
function cornerHeights(room, cx, cz) {
	const i = cz * room.w + cx, base = room.cells[i], s = room.slopes.get(i);
	// [nw, ne, sw, se]: x grows east, z grows south
	if (!s) return [base, base, base, base];
	return s.ax === 'x' ? [base, base + s.rise, base, base + s.rise] : [base, base, base + s.rise, base + s.rise];
}
export function buildTerrain(room) {
	const pos = [], col = [], c = new THREE.Color();
	const tri = (a, b, d, hex, shade = 1) => { c.setHex(hex).multiplyScalar(shade); for (const p of [a, b, d]) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); } };
	const quad = (a, b, d, e, hex, shade) => { tri(a, b, d, hex, shade); tri(a, d, e, hex, shade); };
	const inside = (x, z) => x >= 0 && z >= 0 && x < room.w && z < room.h;
	for (let cz = 0; cz < room.h; cz++) for (let cx = 0; cx < room.w; cx++) {
		const [nw, ne, sw, se] = cornerHeights(room, cx, cz), x0 = cx * CELL, x1 = x0 + CELL, z0 = cz * CELL, z1 = z0 + CELL;
		const rim = nw >= (room.rimH || 8) && !room.slopes.has(cz * room.w + cx), sl = room.slopes.has(cz * room.w + cx), k = (cx + cz) & 1;
		const ci = cz * room.w + cx, m = room.mats && room.mats.get(ci), wet = room.water && room.water.has(ci);
		// (P2) a generated level has height levels: higher floor is drawn lighter, so the lie of the land reads at a glance
		const lit = rim || !room.maxH ? 1 : 0.84 + 0.2 * Math.max(0, Math.min(1.2, (nw + se) / 2 / room.maxH));
		quad([x0, nw, z0], [x0, sw, z1], [x1, se, z1], [x1, ne, z0], rim ? RIM : (m ? MAT[m] : wet ? BED : sl ? SLOPE : TOP)[k], lit);
		// a wall on each side where this cell's edge stands above the neighbour's
		const side = (ax, az, bx, bz, ha, hb, nx, nz, shade) => {
			if (!inside(nx, nz)) return;
			const n = cornerHeights(room, nx, nz);
			// the neighbour's heights at the same two points of the shared edge
			const pick = (x, z) => { const ex = x === nx * CELL ? 0 : 1, ez = z === nz * CELL ? 0 : 2; return n[ex + ez]; };
			const la = pick(ax, az), lb = pick(bx, bz);
			if (ha <= la + 1e-6 && hb <= lb + 1e-6) return;
			quad([ax, ha, az], [ax, Math.min(la, ha), az], [bx, Math.min(lb, hb), bz], [bx, hb, bz], rim ? RIM : SIDE, shade);
		};
		side(x0, z0, x1, z0, nw, ne, cx, cz - 1, 0.82);   // north
		side(x1, z1, x0, z1, se, sw, cx, cz + 1, 0.92);   // south
		side(x0, z1, x0, z0, sw, nw, cx - 1, cz, 0.74);   // west
		side(x1, z0, x1, z1, ne, se, cx + 1, cz, 1.0);    // east
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
	mesh.matrixAutoUpdate = false;
	return mesh;
}

/** (P2) A level's scatter: tufts of grass, flowers and pebbles, as a few flat-coloured triangles each (one mesh, one
 *  draw call; they block nothing). */
export function buildScatter(room) {
	const pos = [], col = [], c = new THREE.Color();
	const tri = (a, b, d, hex) => { c.setHex(hex); for (const p of [a, b, d]) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); } };
	const PETAL = [0xffe36e, 0xff8fb3, 0xffffff, 0xb79cff];
	(room.scatter || []).forEach((o, n) => {
		const { x, y, z, s } = o;
		if (o.kind === 'pebble') { const r = 0.22 * s, h = 0.14 * s, top = [x, y + h, z]; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + n, b = a + Math.PI / 2; tri([x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(b) * r, y, z + Math.sin(b) * r], top, k & 1 ? 0x9aa3ad : 0x868f99); } return; }
		// blades: thin upright triangles, fanned
		const blades = o.kind === 'grass' ? 4 : 2;
		for (let k = 0; k < blades; k++) { const a = n * 1.7 + k * 1.9, dx = Math.cos(a) * 0.09 * s, dz = Math.sin(a) * 0.09 * s, h = (0.34 + 0.1 * (k & 1)) * s; tri([x - dx, y, z - dz], [x + dx, y, z + dz], [x + dz * 1.6, y + h, z - dx * 1.6], k & 1 ? 0x4f9a48 : 0x5fae55); }
		if (o.kind === 'flower') { const h = 0.46 * s, r = 0.11 * s, hex = PETAL[n % PETAL.length]; for (const [ax, az] of [[1, 0], [0, 1]]) { tri([x - ax * r, y + h, z - az * r], [x + ax * r, y + h, z + az * r], [x, y + h + r, z], hex); tri([x - ax * r, y + h, z - az * r], [x + ax * r, y + h, z + az * r], [x, y + h - r, z], hex); } }
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
	mesh.matrixAutoUpdate = false;
	return mesh;
}
/** (P2) The exit: a column of light you can see from across the level. */
export function buildExit(at) {
	const g = new THREE.CylinderGeometry(0.9, 0.9, 30, 10, 1, true);
	const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, fog: false }));
	mesh.position.set(at[0], at[1] + 15, at[2]); mesh.renderOrder = 3;
	return mesh;
}
/** (P2) The minimap, drawn FROM the level (so it cannot disagree with it): one pixel block per cell — higher floor
 *  lighter, water blue, ice / mud / bounce in their colours, ramps sand, the rim dark. -> a canvas, `px` a cell. */
export function drawMap(room, px = 4) {
	const c = document.createElement('canvas'); c.width = room.w * px; c.height = room.h * px;
	const g = c.getContext('2d'), top = room.maxH || 4, rim = room.rimH || 8;
	for (let cz = 0; cz < room.h; cz++) for (let cx = 0; cx < room.w; cx++) {
		const i = cz * room.w + cx, h = room.cells[i], m = room.mats.get(i);
		let fill;
		if (h >= rim) fill = '#1c2433';
		else if (room.water.has(i)) fill = '#3f8fe0';
		else if (m) fill = m === 'ice' ? '#cfeeff' : m === 'mud' ? '#7a5a3c' : '#ff5fa6';
		else if (room.slopes.has(i)) fill = '#d2b877';
		else { const t = Math.max(0, Math.min(1.25, h / top)); fill = `rgb(${Math.round(70 + 90 * t)},${Math.round(130 + 95 * t)},${Math.round(70 + 60 * t)})`; }
		g.fillStyle = fill; g.fillRect(cx * px, cz * px, px, px);
	}
	return c;
}

/** The water: a flat sheet at each wet cell's surface, see-through, drawn after everything solid. */
export function buildWater(room) {
	const pos = [];
	for (const [i, level] of room.water || []) {
		const cx = i % room.w, cz = Math.floor(i / room.w), x0 = cx * CELL, x1 = x0 + CELL, z0 = cz * CELL, z1 = z0 + CELL;
		pos.push(x0, level, z0, x0, level, z1, x1, level, z1, x0, level, z0, x1, level, z1, x1, level, z0);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3f8fe0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
	mesh.matrixAutoUpdate = false; mesh.renderOrder = 2;
	return mesh;
}

// ---------------------------------------------------------------- sprites
const VERT = `
attribute vec3 iPos; attribute vec4 iRect; attribute vec4 iUv; attribute vec3 iTint;
uniform vec3 uRight; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying vec3 vTint; varying float vFog;
void main() {
	vec2 q = position.xy;                                   // the unit quad: (0,0) bottom-left .. (1,1) top-right
	vec3 wp = iPos + uRight * mix(iRect.x, iRect.z, q.x) + vec3(0.0, 1.0, 0.0) * mix(iRect.y, iRect.w, q.y);
	vUv = vec2(mix(iUv.x, iUv.z, q.x), mix(iUv.w, iUv.y, q.y));   // the image's first row is the top of the quad
	vec4 mv = viewMatrix * vec4(wp, 1.0);
	gl_Position = projectionMatrix * mv;
	vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
	vTint = iTint;
}`;
const FRAG = `
uniform sampler2D map; uniform vec3 uFogColor;
varying vec2 vUv; varying vec3 vTint; varying float vFog;
void main() {
	vec4 c = texture2D(map, vUv);
	if (c.a < 0.5) discard;                                 // a hard edge: the sprite writes depth, so it sorts against the world
	gl_FragColor = vec4(mix(c.rgb * vTint, uFogColor, vFog), 1.0);
}`;
const QUAD = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; })();

/** One sprite sheet's worth of billboards: up to `max` sprites, one draw call. */
export class SpriteBatch {
	constructor(texture, max) {
		this.max = max; this.n = 0; this.texture = texture;
		const g = new THREE.InstancedBufferGeometry();
		g.index = QUAD.index; g.setAttribute('position', QUAD.getAttribute('position'));
		const attr = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
		this.aPos = attr('iPos', 3); this.aRect = attr('iRect', 4); this.aUv = attr('iUv', 4); this.aTint = attr('iTint', 3);
		this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: {
			map: { value: texture }, uRight: { value: new THREE.Vector3(1, 0, 0) },
			uFogColor: { value: FOG.color }, uFogNear: { value: FOG.near }, uFogFar: { value: FOG.far } } });
		this.mesh = new THREE.Mesh(g, this.material);
		this.mesh.frustumCulled = false;   // (the instances are anywhere; the quad's own bounds say nothing)
		this.geometry = g;
	}
	begin() { this.n = 0; }
	/** x, y, z: the feet. rect: [left, bottom, right, top] metres from the feet. uv: [u0, v0, u1, v1] (v0 the top). */
	add(x, y, z, rect, uv, tint = 1) {
		if (this.n >= this.max) return;
		const i = this.n++;
		this.aPos.setXYZ(i, x, y, z); this.aRect.setXYZW(i, rect[0], rect[1], rect[2], rect[3]); this.aUv.setXYZW(i, uv[0], uv[1], uv[2], uv[3]); this.aTint.setXYZ(i, tint, tint, tint);
	}
	end(right) {
		this.geometry.instanceCount = this.n; this.mesh.visible = this.n > 0;
		this.aPos.needsUpdate = this.aRect.needsUpdate = this.aUv.needsUpdate = this.aTint.needsUpdate = true;
		this.material.uniforms.uRight.value.copy(right);
	}
}

export function loadSheet(url) {
	return new Promise((resolve, reject) => new THREE.TextureLoader().load(url, (t) => {
		t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.colorSpace = THREE.NoColorSpace;
		resolve(t);
	}, undefined, () => reject(new Error('sprite sheet missing: ' + url))));
}

/** Which frame of an animation at time t (seconds). meta.d: each frame's length in 60ths of a second. */
export function frameAt(meta, t) {
	let total = 0; for (const d of meta.d) total += d;
	let k = (t * 60) % total;
	for (let i = 0; i < meta.d.length; i++) { if (k < meta.d[i]) return i; k -= meta.d[i]; }
	return 0;
}
/** How far below its anchor each facing row of a sheet draws, in art px: the lowest opaque pixel of any of the row's
 *  frames, measured from (ax, ay). The sheets' anchor is the middle of the body's FOOTPRINT (where the 2D game puts the
 *  shadow), not its lowest pixel: front feet, a tail, a rump are drawn below it. Top-down that is right; on an upright
 *  billboard everything below the anchor would be under the floor. So a sprite is stood on its lowest pixel instead:
 *  lifted by this much. One number per row (not per frame), so a walk cycle's bob stays a bob. */
export function footLift(meta, img) {
	const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
	const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
	const rows = Math.min(meta.r, Math.floor(img.height / meta.h)), frames = Math.min(meta.n, Math.floor(img.width / meta.w)), out = [];
	for (let r = 0; r < rows; r++) {
		const d = g.getImageData(0, r * meta.h, frames * meta.w, meta.h).data, w = frames * meta.w;
		let low = -1;
		for (let y = meta.h - 1; y >= 0 && low < 0; y--) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 127) { low = y; break; }
		out.push(low < 0 ? 0 : Math.max(0, low + 1 - meta.ay));
	}
	return out;
}
/** A sprite's quad and texture window: a sheet's frame `frame` of row `row`. meta: {w, h, n, r, ax, ay} (art px; (ax, ay)
 *  is the middle of the footprint). img: the sheet (its real width / height). lift: footLift(meta, img) — the sprite
 *  is raised so its lowest pixel, not its anchor, is on the ground. */
export function spriteQuad(meta, img, frame, row, scale = 1, lift = null) {
	const s = PX * scale, W = img.width, H = img.height;
	const up = lift ? (lift[Math.min(row, lift.length - 1)] || 0) * s : 0;
	const rect = [-meta.ax * s, -(meta.h - meta.ay) * s + up, (meta.w - meta.ax) * s, meta.ay * s + up];
	const r = Math.min(row, meta.r - 1);
	const uv = [frame * meta.w / W, r * meta.h / H, (frame + 1) * meta.w / W, (r + 1) * meta.h / H];
	return { rect, uv };
}

// ---------------------------------------------------------------- shadows
export class Shadows {
	constructor(max) {
		const g = new THREE.CircleGeometry(1, 14); g.rotateX(-Math.PI / 2);
		this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, fog: false }), max);
		this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
		this.m = new THREE.Matrix4(); this.n = 0;
	}
	begin() { this.n = 0; }
	/** A shadow on the floor under (x, z); `above`: how far the feet are above that floor (it shrinks and thins). */
	add(room, x, z, y, radius) {
		const g = groundAt(room, x, z);
		if (g > 100 || this.n >= this.mesh.instanceMatrix.count) return;
		const k = Math.max(0.35, 1 - Math.max(0, y - g) * 0.16), r = radius * k;
		this.m.makeScale(r, 1, r * 0.8).setPosition(x, g + 0.03, z);
		this.mesh.setMatrixAt(this.n++, this.m);
	}
	end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------- (P3) a fight's shots and flashes
/** Shots and orbs: one instanced ball each, in the move's type colour. One draw call for all of them. */
export class Shots {
	constructor(max) {
		this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ fog: false }), max);
		this.mesh.frustumCulled = false; this.m = new THREE.Matrix4(); this.c = new THREE.Color(); this.n = 0; this.max = max;
		this.mesh.setColorAt(0, this.c.setHex(0xffffff));
	}
	begin() { this.n = 0; }
	add(x, y, z, r, css) { if (this.n >= this.max) return; this.m.makeScale(r, r, r).setPosition(x, y, z); this.mesh.setMatrixAt(this.n, this.m); this.mesh.setColorAt(this.n++, this.c.set(css || '#ffffff')); }
	end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}
/** Short-lived shapes for what has no ball: a swing's arc and an aura's ring on the floor, a beam, a chain's links. */
export class Flashes {
	constructor(scene) { this.scene = scene; this.list = []; }
	push(mesh, life) { mesh.renderOrder = 4; this.scene.add(mesh); this.list.push({ mesh, t: 0, life, o: mesh.material.opacity }); }
	mat(css, opacity) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(css || '#ffffff'), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false }); }
	/** An arc (or a full ring) lying on the floor. aim: the ground-plane angle ((cos, sin) on (x, z)). */
	arc(x, y, z, r, aim, arc, css) {
		const full = arc >= 6.2, g = new THREE.RingGeometry(full ? r * 0.82 : r * 0.35, r, 28, 1, full ? 0 : -aim - arc / 2, full ? 6.2832 : arc); g.rotateX(-Math.PI / 2);
		const m = new THREE.Mesh(g, this.mat(css, 0.55)); m.position.set(x, y + 0.12, z); this.push(m, 0.22);
	}
	/** A straight bar from a point along a unit direction. */
	bar(from, dir, len, width, css, life = 0.2) {
		const g = new THREE.BoxGeometry(width, width * 0.5, len), m = new THREE.Mesh(g, this.mat(css, 0.75));
		m.position.set(from[0] + dir[0] * len / 2, from[1] + dir[1] * len / 2, from[2] + dir[2] * len / 2); m.lookAt(from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len); this.push(m, life);
	}
	update(dt) {
		for (let i = this.list.length - 1; i >= 0; i--) { const f = this.list[i]; f.t += dt; f.mesh.material.opacity = f.o * Math.max(0, 1 - f.t / f.life);
			if (f.t >= f.life) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); this.list.splice(i, 1); } }
	}
}

// ---------------------------------------------------------------- the camera
/** A third-person camera behind and above a point. yaw: where it looks on the ground plane ([sin, cos]). */
export function placeCamera(camera, room, target, yaw, pitch, dist) {
	const fx = Math.sin(yaw), fz = Math.cos(yaw), ch = Math.cos(pitch), sh = Math.sin(pitch);
	// walk out from the lead toward where the camera wants to be, and stop before the first thing in the way (a wall,
	// a rise, the room's edge): the camera never sits inside the terrain or outside the room
	let d = dist;
	for (let t = 0.6; t <= dist + 1e-6; t += 0.4) {
		const px = target[0] - fx * ch * t, py = target[1] + sh * t, pz = target[2] - fz * ch * t;
		if (groundAt(room, px, pz) > py - 0.45) { d = Math.max(0.8, t - 0.5); break; }
	}
	const x = target[0] - fx * ch * d, y = target[1] + sh * d, z = target[2] - fz * ch * d;
	camera.position.set(x, y, z);
	camera.lookAt(target[0], target[1], target[2]);
	// the camera's right on the ground plane (forward × up), for the billboards
	return new THREE.Vector3(-fz, 0, fx);
}
export { facingRow };
