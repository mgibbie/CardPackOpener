// m3d/fx.js — MicaSurvivor 3D: the effects layer (Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, part B: B1 + B2). The owner,
// 2026-11-13: "the worst part of those 3d modes is how unpolished the attacks look". Until now a shot was a flat
// coloured sphere. Here it is the 2D game's own pixel art for that move (js/entities/vfx.js: a flame, a drop, a leaf, a
// bolt … in its type's palette, with its frames), standing in the 3D world:
//   * an ATLAS: every shape × every palette × every frame, baked once from G.VFX into one texture;
//   * SPRITES: camera-facing quads from the atlas, turned on the screen to point the way they fly; hard-edged, so they
//     write depth and sort against the world like the Pokémon do. One draw call;
//   * GLOWS: soft additive light behind them, in the type's colour. One draw call;
//   * PARTICLES: short-lived sprites (a trail, an impact, a swing's bite) that fly, fall, grow and animate;
//   * LIGHTS (B3): soft textures drawn as light and tinted in the type's colour: a flare where a hit lands, a slash
//     through a swing, a shockwave ring, lightning along a chain, a muzzle flash at a beam's mouth. They come from one
//     downloaded atlas, fx/particles.png: Kenney's Particle Pack, CC0 (tools/micasurvivor/pack_fx_atlas.mjs packs
//     it; micasurvivor/CREDITS.md). Until it has loaded, and if it never does, everything else still draws. One draw call;
//   * ANIMS (the owner, 2026-11-14: "real games' animations"): the Pokémon games' own battle-animation sprites, from the
//     Emerald decomp, in one atlas, assets/fx/anims1.png (tools/micasurvivor/pack_anim_atlas.mjs; not in the repository:
//     with the game's other art, in its assets project). A hit's burst, an explosion, a slash, a bite, a claw, and a
//     type's own piece on a hard hit. Hard-edged pixel art like the Pokémon. Without the atlas the 2D shapes and
//     the lights stand in, as before. One draw call.
// It only DRAWS: the rules (combat.js) are untouched, and it reads what a fight already publishes.
import * as THREE from 'three';

export const CELL_PX = 16;          // one atlas cell (the largest shape is 15 × 15)
export const FX = { SPRITES: 1400, GLOWS: 700, LIGHTS: 500, ANIMS: 400, PARTS: 900, IMPACTS_A_FRAME: 16 };
export const ANIM_PX = 0.075;   // metres an art pixel of the games' animations is drawn at (a Pokémon's is 0.11: these are drawn a little finer, so a 32 px burst is 2.4 m)
// a type's own piece on a hard hit, and a swing's blow by its kind (sheets of the anims atlas)
const TYPE_ANIM = { fire: 'fire_plume', water: 'bubble_burst', electric: 'electricity', ice: 'ice_chunk', grass: 'leaf', poison: 'poison_bubble', ghost: 'ghostly_spirit', dark: 'shadow_ball', psychic: 'sparkle_1', fairy: 'sparkle_1', rock: 'rocks', ground: 'rocks', flying: 'gust', dragon: 'wisp_fire', steel: 'cut', bug: 'needle' };
const SWING_ANIM = { impact: 'punch_impact', jaws: 'teeth', claw: 'claw_slash', vine: 'slash', feather: 'gust' };
// a 2D shape in a palette -> the games' own sprite for it, where the Emerald set has the right one (the rest keep the 2D
// shape: a water drop, a rock, a crescent, a note … have no single sprite there that reads as a thing in flight)
const SHAPE_ANIM = { 'fire|fire': 'small_ember', 'fire|dragon': 'wisp_fire', 'bubble|water': 'bubble', 'bubble|poison': 'poison_bubble', 'blob|poison': 'poison_bubble',
	'leaf|grass': 'leaf', 'bolt|electric': 'spark_2', 'shard|ice': 'ice_crystals_0', 'shadow|ghost': 'shadow_ball', 'wind|flying': 'gust', 'web|bug': 'web', 'star|fairy': 'sparkle_1' };
export const animFor = (shape, pal) => SHAPE_ANIM[shape + '|' + pal] || null;
// a move's trail in the 2D game (a kind of particle there) -> the shape that stands for it here
const TRAIL = { ember: 'fire', drip: 'drop', spark: 'star', wisp: 'shadow', bubbles: 'bubble', dirt: 'rock' };
const MELEE = { impact: 'impact', jaws: 'jaws', claw: 'claw', vine: 'claw', feather: 'wind' };

/** Bake G.VFX into one canvas. -> { canvas, cols, rows, has(shape), frames(shape), uv(shape, pal, frame), dir(shape), spins(shape), px(shape) } */
export function bakeAtlas(VFX, doc = document) {
	const shapes = Object.keys(VFX.SHAPES), pals = Object.keys(VFX.PAL), col = {}, C = CELL_PX;
	let cols = 0; for (const s of shapes) { col[s] = cols; cols += VFX.frames(s); }
	const canvas = doc.createElement('canvas'); canvas.width = cols * C; canvas.height = pals.length * C;
	const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
	pals.forEach((pal, r) => { for (const s of shapes) for (let f = 0; f < VFX.frames(s); f++) { const cv = VFX.sprite(s, pal, f); g.drawImage(cv, (col[s] + f) * C + ((C - cv.width) >> 1), r * C + ((C - cv.height) >> 1)); } });
	const row = {}; pals.forEach((p, i) => { row[p] = i; });
	const W = canvas.width, H = canvas.height;
	return {
		canvas, cols, rows: pals.length, shapes, pals, has: (s) => col[s] !== undefined, frames: (s) => (col[s] === undefined ? 1 : VFX.frames(s)), dir: (s) => VFX.isDir(s), spins: (s) => VFX.spins(s),
		px: (s) => { const S = VFX.SHAPES[s] || VFX.SHAPES.ball; return Math.max(S.w, S.h); },
		/** The cell's texture window: [u0, v0, u1, v1] (v0 the top row of the image). */
		uv(shape, pal, frame = 0) { const s = col[shape] === undefined ? 'ball' : shape, c = col[s] + ((frame | 0) % VFX.frames(s)), r = row[pal] === undefined ? row.normal : row[pal]; return [c * C / W, r * C / H, (c + 1) * C / W, (r + 1) * C / H]; },
	};
}

const VERT = `
attribute vec3 iPos; attribute vec4 iSR; attribute vec4 iUv; attribute vec4 iTint;
uniform vec3 uRight; uniform vec3 uUp;
varying vec2 vUv; varying vec4 vTint;
void main() {
	vec2 q = (position.xy - 0.5) * iSR.xy;                       // the unit quad, centred, sized in metres
	float c = cos(iSR.z), s = sin(iSR.z);
	vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c);         // turned on the screen
	vec3 wp = iSR.w > 0.5 ? iPos + vec3(r.x, 0.0, r.y) : iPos + uRight * r.x + uUp * r.y;   // (flat: it lies on the floor, as a ring round a blast does)
	vUv = vec2(mix(iUv.x, iUv.z, position.x), mix(iUv.w, iUv.y, position.y));
	vTint = iTint;
	gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FRAG_SPRITE = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vTint;
void main() { vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * vTint.rgb, 1.0); }`;
const FRAG_GLOW = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vTint;
void main() { float a = min(1.0, texture2D(map, vUv).a * vTint.a); gl_FragColor = vec4(mix(vTint.rgb, vec3(1.0), a * a * 0.7) * a, a * 0.72); }`;   // (premultiplied: part cover, part glow, a white-hot core. Pure additive vanished on sunlit grass.)
const QUAD = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; })();

/** Up to `max` camera-facing quads from one texture, one draw call. glow: additive, soft, no depth written. */
class Batch {
	constructor(texture, max, glow) {
		this.max = max; this.n = 0;
		const g = new THREE.InstancedBufferGeometry(); g.index = QUAD.index; g.setAttribute('position', QUAD.getAttribute('position'));
		const attr = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
		this.aPos = attr('iPos', 3); this.aSR = attr('iSR', 4); this.aUv = attr('iUv', 4); this.aTint = attr('iTint', 4);
		this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: glow ? FRAG_GLOW : FRAG_SPRITE, uniforms: { map: { value: texture }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
			transparent: !!glow, depthWrite: !glow, ...(glow ? { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } : { blending: THREE.NormalBlending }) });
		this.mesh = new THREE.Mesh(g, this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = glow ? 6 : 3; this.geometry = g;
	}
	add(x, y, z, w, h, rot, uv, r, gg, b, a, flat = 0) {
		if (this.n >= this.max) return false;
		const i = this.n++;
		this.aPos.setXYZ(i, x, y, z); this.aSR.setXYZW(i, w, h, rot, flat); this.aUv.setXYZW(i, uv[0], uv[1], uv[2], uv[3]); this.aTint.setXYZW(i, r, gg, b, a);
		return true;
	}
	end(right, up) {
		this.geometry.instanceCount = this.n; this.mesh.visible = this.n > 0;
		this.aPos.needsUpdate = this.aSR.needsUpdate = this.aUv.needsUpdate = this.aTint.needsUpdate = true;
		this.material.uniforms.uRight.value.copy(right); this.material.uniforms.uUp.value.copy(up);
	}
}

function glowTexture(doc) {
	const c = doc.createElement('canvas'); c.width = c.height = 64;
	const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
	gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
const FULL = [0, 0, 1, 1], COL = new THREE.Color();

/** The effects of one scene. VFX: the 2D game's G.VFX. moveDef: (id) -> the move's definition (its type, its id). */
export class Effects {
	constructor(scene, VFX, moveDef, doc = document) {
		this.VFX = VFX; this.moveDef = moveDef; this.atlas = bakeAtlas(VFX, doc);
		const tex = new THREE.CanvasTexture(this.atlas.canvas); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.colorSpace = THREE.NoColorSpace;
		this.sprites = new Batch(tex, FX.SPRITES, false); this.glows = new Batch(glowTexture(doc), FX.GLOWS, true);
		scene.add(this.sprites.mesh); scene.add(this.glows.mesh);
		this.scene = scene; this.lights = null; this.cells = null;   // (the downloaded lights: loadLights)
		this.anims = null; this.sheets = null;   // (the games' own animations: loadAnims)
		this.parts = []; this.right = new THREE.Vector3(1, 0, 0); this.up = new THREE.Vector3(0, 1, 0); this.at = 0; this.t = 0; this.impacts = 0; this.looks = new Map();
		this.stats = { sprites: 0, glows: 0, lights: 0, byLight: {}, anims: 0, bySheet: {}, parts: 0, shots: 0, impacts: 0, swings: 0, ownShots: 0, beams: 0, auras: 0, chains: 0, blasts: 0, dashes: 0, kos: 0, flat: 0, vortexes: 0, waves: 0, patches: 0, ults: 0, marks: {}, weather: {}, byShape: {} };   // (the last frame's; `byShape`, `impacts`, `swings`: since the page opened)
	}
	/** The downloaded lights: the atlas and its list of cells ({ cell, cols, rows, names }). */
	loadLights(url, info) {
		return new Promise((resolve) => new THREE.TextureLoader().load(url, (t) => {
			t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter;
			this.lights = new Batch(t, FX.LIGHTS, true); this.lights.mesh.renderOrder = 7; this.scene.add(this.lights.mesh);
			this.cells = {}; info.names.forEach((n, i) => { const c = i % info.cols, r = Math.floor(i / info.cols); this.cells[n] = [c / info.cols, r / info.rows, (c + 1) / info.cols, (r + 1) / info.rows]; });
			resolve(true);
		}, undefined, () => resolve(false)));
	}
	/** The games' own battle animations: the atlas and its list ({ w, h, sprites: { name: { y, w, h, n } } }). */
	loadAnims(url, info) {
		return new Promise((resolve) => { const L = new THREE.TextureLoader(); L.setCrossOrigin('anonymous'); L.load(url, (t) => {
			t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.NearestFilter;
			this.anims = new Batch(t, FX.ANIMS, false); this.anims.mesh.renderOrder = 4; this.scene.add(this.anims.mesh); this.sheets = info;
			resolve(true);
		}, undefined, () => resolve(false)); });
	}
	hasSheet(name) { return !!(this.anims && this.sheets.sprites[name]); }
	/** One frame of one of the games' animations, now. scale: 1 = its own size (ANIM_PX a pixel). */
	sheet(name, frame, x, y, z, scale = 1, rot = 0, flat = false) {
		const S = this.anims && this.sheets.sprites[name]; if (!S) return false;
		const f = Math.max(0, Math.min(S.n - 1, frame | 0)), W = this.sheets.w, H = this.sheets.h;
		if (this.anims.add(x, y, z, S.w * ANIM_PX * scale, S.h * ANIM_PX * scale, rot, [f * S.w / W, S.y / H, (f + 1) * S.w / W, (S.y + S.h) / H], 1, 1, 1, 1, flat ? 1 : 0)) this.stats.bySheet[name] = (this.stats.bySheet[name] || 0) + 1;
		return true;
	}
	/** One of the games' animations, played once through where it is. o: { sheet, x, y, z, life, scale, rot, loop (frames a second: it loops instead), vx, vy, vz, g } */
	play(o) { if (!this.hasSheet(o.sheet)) return false; this.part(o); return true; }
	/** One light, now. name: a cell of the lights atlas. size: metres across. */
	light(name, x, y, z, size, css, alpha = 0.7, rot = 0, flat = false) {
		if (!this.lights || !this.cells[name]) return;
		COL.set(css || '#ffffff'); if (this.lights.add(x, y, z, size, size, rot, this.cells[name], COL.r, COL.g, COL.b, alpha, flat ? 1 : 0)) this.stats.byLight[name] = (this.stats.byLight[name] || 0) + 1;
	}
	/** A light that lives a moment: it grows from s0 to s1 and fades. o: { light, x, y, z, life, s0, s1, css, a, rot, spin, vx, vy, vz } */
	flash(o) { if (this.lights) this.part(o); }
	/** How a move looks: { proj, pal, trail, melee, … } (the 2D game's table, by move id; a type's default without one). */
	look(mid, type) {
		const k = (mid || '') + '|' + (type || '');
		let v = this.looks.get(k);
		if (!v) { const def = mid ? this.moveDef(mid) : null; v = def ? this.VFX.forMove({ id: def.id || mid, type: def.type || type }) : this.VFX.forType(type || 'normal'); this.looks.set(k, v); }
		return v;
	}
	begin(camera, t) {
		this.sprites.n = 0; this.glows.n = 0; if (this.lights) this.lights.n = 0; if (this.anims) this.anims.n = 0; this.stats.ownShots = 0; this.stats.shots = 0; this.impacts = 0; this.stats.marks = {};
		const e = camera.matrixWorld.elements; this.right.set(e[0], e[1], e[2]); this.up.set(e[4], e[5], e[6]);
		this.dt = Math.min(0.05, Math.max(0, t - this.at)); this.at = t; this.t = t;
	}
	/** The angle on the screen of a direction in the world. */
	screenAngle(dx, dy, dz) { return Math.atan2(dx * this.up.x + dy * this.up.y + dz * this.up.z, dx * this.right.x + dy * this.right.y + dz * this.right.z); }
	/** One atlas sprite, centred on (x, y, z). size: metres across the cell. */
	sprite(shape, pal, frame, x, y, z, size, rot = 0, tint = 1) {
		if (this.sprites.add(x, y, z, size, size, rot, this.atlas.uv(shape, pal, frame), tint, tint, tint, 1)) this.stats.byShape[shape] = (this.stats.byShape[shape] || 0) + 1;
	}
	/** A soft light. r: metres across. */
	glow(x, y, z, r, css, alpha = 0.5) { COL.set(css || '#ffffff'); this.glows.add(x, y, z, r, r, 0, FULL, COL.r, COL.g, COL.b, alpha); }
	/** A shot in flight: the move's own shape, pointing where it goes (or spinning, or as it is), with its light and its trail.
	 *  v: [vx, vy, vz] or null (a watcher's ball: no direction known). seed: any number of its own (its id). */
	shot(x, y, z, r, mid, type, v, seed = 0, css = null) {
		const L = this.look(mid, type), A = this.atlas, shape = A.has(L.proj) ? L.proj : 'ball', t = this.t;
		const size = Math.max(0.62, r * 2.7) * CELL_PX / A.px(shape);
		const rot = A.dir(shape) ? (v ? this.screenAngle(v[0], v[1], v[2]) : 0) : A.spins(shape) ? t * 9 + seed : 0;
		const own = this.anims && animFor(shape, L.pal), S = own && this.sheets.sprites[own];
		if (S) { this.sheet(own, Math.floor(t * 12 + seed) % S.n, x, y, z, size * 1.25 / (S.w * ANIM_PX), A.spins(shape) ? t * 9 + seed : 0); this.stats.ownShots = (this.stats.ownShots || 0) + 1; }   // (the games' own sprite for it)
		else this.sprite(v || !A.dir(shape) ? shape : 'ball', L.pal, Math.floor(t * 10 + seed), x, y, z, size, rot);
		this.glow(x, y, z, size * 2.3, css || this.VFX.PAL[L.pal][2], 0.62);
		this.stats.shots++;
		if (v && this.dt > 0 && Math.random() < this.dt * 26) {   // its trail: small, left behind, sinking or rising a little
			const ts = TRAIL[L.trail] || shape, up = L.trail === 'ember' || L.trail === 'wisp' || L.trail === 'bubbles' ? 0.9 : L.trail ? -1.2 : 0;
			this.part({ shape: A.has(ts) ? ts : 'ball', pal: L.pal, x: x + (Math.random() - 0.5) * 0.2, y: y + (Math.random() - 0.5) * 0.2, z: z + (Math.random() - 0.5) * 0.2, vx: v[0] * 0.08, vy: up, vz: v[2] * 0.08, life: 0.3 + Math.random() * 0.2, s0: size * 0.5, s1: size * 0.12, rot: Math.random() * 6.28, spin: 3 });
		}
	}
	/** Something short-lived. o: { shape, pal, x, y, z, vx, vy, vz, g (gravity), life, s0, s1 (size at its start and end), rot, spin, anim (frames a second), glow (css), ga } */
	part(o) {
		if (this.parts.length >= FX.PARTS) this.parts.shift();
		if (o.shape && !o.sheet && !o.light && this.anims) { const a = animFor(o.shape, o.pal); if (a && this.sheets.sprites[a]) { o.sheet = a; o.loop = o.anim || 10; } }
		o.t = 0; this.parts.push(o); return o;
	}
	/** A hit lands: the type's impact, a flash of light, a few pieces thrown off. big: a super-effective or critical hit. */
	impact(x, y, z, type, big = false, weak = false) {
		if (this.impacts++ >= FX.IMPACTS_A_FRAME) return;
		const pal = this.VFX.PAL[type] ? type : 'normal', k = big ? 1.5 : weak ? 0.7 : 1, L = this.VFX.forType(pal);
		const P = this.VFX.PAL[pal], lit = !!this.lights;
		const own = !weak && this.play({ sheet: 'hit', x, y, z, life: big ? 0.3 : 0.22, scale: big ? 1.15 : 0.7, rot: Math.random() * 6.28 });
		if (own && big && TYPE_ANIM[pal]) this.play({ sheet: TYPE_ANIM[pal], x: x + (Math.random() - 0.5) * 0.5, y: y + 0.5, z: z + (Math.random() - 0.5) * 0.5, life: 0.4, scale: 0.8, vy: 0.8 });
		if (!own) this.part({ shape: 'impact', pal, x, y, z, life: 0.16, s0: 0.7 * k, s1: (lit ? 1.05 : 1.45) * k, anim: 12, glow: P[3], ga: weak ? 0.25 : 0.6 });
		if (!weak) this.flash({ light: big ? 'burst' : 'star', x, y, z, life: big ? 0.26 : 0.18, s0: 1.3 * k, s1: 3 * k, css: P[3], a: 1.3, rot: Math.random() * 6.28 });
		if (big) this.flash({ light: 'ring', x, y, z, life: 0.3, s0: 0.6, s1: 3.4, css: P[2], a: 1.1 });
		else if (weak) this.flash({ light: 'puff', x, y, z, life: 0.25, s0: 0.6, s1: 1.2, css: '#8b93a0', a: 0.35 });
		for (let i = 0, n = weak ? 1 : big ? 5 : 3; i < n; i++) { const a = Math.random() * 6.2832, sp = 2.2 + Math.random() * 2.4; this.part({ shape: L.proj, pal, x, y, z, vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * sp, g: 9, life: 0.28 + Math.random() * 0.2, s0: 0.42 * k, s1: 0.1, rot: a, spin: 8 }); }
		this.stats.impacts++;
	}
	/** A swing: the move's bite, claw or blow, in front of whoever swings. aim: the ground-plane angle. */
	swing(x, y, z, aim, reach, mid, type) {
		const L = this.look(mid, type), shape = MELEE[L.melee] || 'impact', d = Math.max(0.6, reach * 0.62), px = x + Math.cos(aim) * d, pz = z + Math.sin(aim) * d;
		if (!this.play({ sheet: SWING_ANIM[L.melee] || 'slash', x: px, y: y + 0.9, z: pz, life: 0.24, scale: Math.max(0.8, Math.min(1.4, reach * 0.45)) }))
			this.part({ shape, pal: L.pal, x: px, y: y + 0.85, z: pz, life: 0.2, s0: this.lights ? 0.8 : Math.max(1.1, reach * 0.7), s1: this.lights ? 1.2 : Math.max(1.5, reach * 1.05), anim: 10, glow: this.VFX.PAL[L.pal][3], ga: 0.45 });
		const sl = L.melee === 'claw' ? 'scratch' : L.melee === 'jaws' ? 'crescent' : 'slash', turn = this.screenAngle(Math.cos(aim), 0, Math.sin(aim));
		this.flash({ light: sl, x: px, y: y + 0.85, z: pz, life: 0.2, s0: Math.max(1.6, reach * 1.2), s1: Math.max(2.3, reach * 1.9), css: this.VFX.PAL[L.pal][3], a: 1.6, rot: turn - 1.5708 });
		this.stats.swings++;
	}
	/** A beam: the move's shape streaming along it from the mouth, a flare where it starts, light all the way. */
	beam(from, dir, len, w, mid, type) {
		const L = this.look(mid, type), A = this.atlas, b = L.beam === 'lightning' ? 'bolt' : L.beam, shape = A.has(b) ? b : A.has(L.proj) ? L.proj : 'ball', rot = A.dir(shape) ? this.screenAngle(dir[0], dir[1], dir[2]) : 0;
		const size = Math.max(0.7, w * 1.5), step = Math.max(0.55, size * 0.6), sp = 14, css = this.VFX.PAL[L.pal][3];
		for (let d = 0.3; d < len; d += step) { const j = (Math.random() - 0.5) * w * 0.35; this.part({ shape, pal: L.pal, x: from[0] + dir[0] * d, y: from[1] + dir[1] * d + j, z: from[2] + dir[2] * d, vx: dir[0] * sp, vy: dir[1] * sp, vz: dir[2] * sp, life: 0.2 + Math.random() * 0.08, s0: size, s1: size * 0.45, rot, spin: A.spins(shape) ? 9 : 0, anim: 10, glow: css, ga: 0.5 }); }
		if (this.lights) {
			this.flash({ light: 'muzzle', x: from[0] + dir[0] * 0.7, y: from[1] + dir[1] * 0.7, z: from[2] + dir[2] * 0.7, life: 0.2, s0: size * 2.2, s1: size * 3.2, css, a: 1.5, rot: rot - 1.5708 });
			this.flash({ light: 'flare', x: from[0] + dir[0] * len, y: from[1] + dir[1] * len, z: from[2] + dir[2] * len, life: 0.24, s0: size * 2, s1: size * 4.5, css, a: 1.5 });
			for (let d = 1; d < len; d += 2.2) this.flash({ light: 'streak', x: from[0] + dir[0] * d, y: from[1] + dir[1] * d, z: from[2] + dir[2] * d, life: 0.2, s0: Math.max(2.4, size * 2.6), s1: Math.max(2.8, size * 3), css, a: 1.1, rot: rot - 1.5708 });
		} else {
			this.part({ shape: 'impact', pal: L.pal, x: from[0] + dir[0] * 0.4, y: from[1] + dir[1] * 0.4, z: from[2] + dir[2] * 0.4, life: 0.18, s0: size * 1.2, s1: size * 2, anim: 12, glow: css, ga: 0.8 });
			this.part({ shape: 'impact', pal: L.pal, x: from[0] + dir[0] * len, y: from[1] + dir[1] * len, z: from[2] + dir[2] * len, life: 0.2, s0: size, s1: size * 1.8, anim: 10, glow: css, ga: 0.6 });
		}
		this.stats.beams++;
	}
	/** An aura: the move's pieces thrown out from the middle to its edge (drawn in, for a drain; rising, for what comes out of the ground). */
	aura(x, y, z, r, mid, type) {
		const L = this.look(mid, type), A = this.atlas, shape = A.has(L.aura) ? L.aura : A.has(L.proj) ? L.proj : 'ball', n = Math.max(8, Math.min(26, Math.round(r * 5))), life = 0.3, css = this.VFX.PAL[L.pal][2];
		for (let i = 0; i < n; i++) {
			const a = (i / n) * 6.2832 + Math.random() * 0.3, c = Math.cos(a), s = Math.sin(a), sp = r / life, size = 0.5 + Math.random() * 0.3, rot = A.dir(shape) ? this.screenAngle(c, 0, s) : Math.random() * 6.28;
			if (L.rise) this.part({ shape, pal: L.pal, x: x + c * r * Math.sqrt(Math.random()), y: y + 0.1, z: z + s * r * Math.sqrt(Math.random()), vy: 3 + Math.random() * 2.5, life: life + Math.random() * 0.2, s0: size, s1: size * 0.3, rot, spin: 4 });
			else if (L.inward) this.part({ shape, pal: L.pal, x: x + c * r, y: y + 0.7, z: z + s * r, vx: -c * sp, vz: -s * sp, life, s0: size, s1: size * 0.4, rot });
			else this.part({ shape, pal: L.pal, x: x + c * 0.3, y: y + 0.5 + Math.random() * 0.5, z: z + s * 0.3, vx: c * sp, vz: s * sp, life, s0: size, s1: size * 0.35, rot, spin: A.spins(shape) ? 8 : 0, anim: 8 });
		}
		this.part({ shape: 'ring', pal: L.pal, x, y: y + 0.8, z, life: 0.22, s0: 0.8, s1: Math.min(6, r * 1.4), glow: css, ga: 0.55 });
		this.flash({ flat: true, light: L.inward ? 'twirl' : 'ringsoft', x, y: y + 0.1, z, life: 0.32, s0: L.inward ? r * 2.4 : 1, s1: L.inward ? 1 : r * 2.6, css, a: 1, spin: L.inward ? 6 : 0 });
		this.stats.auras++;
	}
	/** A chain: a jagged run of sparks from link to link, a burst on each. from: [x, y, z]. links: [[x, y, z], …] */
	chain(from, links, mid, type) {
		const L = this.look(mid, type), A = this.atlas, shape = A.has(L.proj) && A.dir(L.proj) ? L.proj : 'bolt', css = this.VFX.PAL[L.pal][3];
		let a = from;
		for (const b of links) {
			const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1, rot = this.screenAngle(d[0], d[1], d[2]);
			for (let q = 0.35; q < l; q += 0.7) { const k = q / l, j = () => (Math.random() - 0.5) * 0.45; this.part({ shape, pal: L.pal, x: a[0] + d[0] * k + j(), y: a[1] + d[1] * k + j(), z: a[2] + d[2] * k + j(), life: 0.14 + Math.random() * 0.1, s0: 0.95, s1: 0.5, rot: rot + (Math.random() - 0.5) * 0.9, anim: 14, glow: css, ga: 0.6 }); }
			this.part({ shape: 'impact', pal: L.pal, x: b[0], y: b[1], z: b[2], life: 0.18, s0: 0.8, s1: this.lights ? 1 : 1.5, anim: 12, glow: css, ga: 0.8 });
			this.flash({ light: 'bolt', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, life: 0.2, s0: l * 1.15, s1: l * 1.25, css, a: 1.6, rot: rot - 1.5708 });
			this.flash({ light: 'star', x: b[0], y: b[1], z: b[2], life: 0.2, s0: 1, s1: 2.2, css, a: 1.3 });
			if (L.pal === 'electric' && this.hasSheet('lightning')) { for (let q = 1.2; q < l; q += 2.2) this.play({ sheet: 'lightning', x: a[0] + d[0] * q / l, y: a[1] + d[1] * q / l, z: a[2] + d[2] * q / l, life: 0.22, scale: 1, rot: rot - 1.5708 }); this.play({ sheet: 'electricity', x: b[0], y: b[1], z: b[2], life: 0.25, scale: 0.8 }); }
			a = b;
		}
		this.stats.chains++;
	}
	/** Something goes off on the ground (a mine, a meteor, a bomb): a burst, a ring of pieces flung out and up, a flash of light. */
	blast(x, y, z, r, mid, type) {
		const L = this.look(mid, type), A = this.atlas, shape = A.has(L.proj) ? L.proj : 'ball', css = this.VFX.PAL[L.pal][3], n = Math.max(6, Math.min(18, Math.round(r * 4)));
		this.play({ sheet: 'explosion_2', x, y: y + Math.max(0.9, r * 0.5), z, life: 0.42, scale: Math.max(0.9, Math.min(2.4, r * 0.75)) });
		if (this.lights) {
			this.flash({ light: 'burst', x, y: y + 0.6, z, life: 0.26, s0: Math.max(1.4, r), s1: Math.max(3, r * 2.6), css, a: 1.6, rot: Math.random() * 6.28 });
			this.flash({ flat: true, light: 'ring', x, y: y + 0.1, z, life: 0.34, s0: 0.8, s1: Math.max(3, r * 2.4), css: this.VFX.PAL[L.pal][2], a: 1.2 });
			this.flash({ flat: true, light: 'scorch', x, y: y + 0.07, z, life: 1.6, s0: Math.max(1.6, r * 1.5), s1: Math.max(1.8, r * 1.7), css: '#1c1d22', a: 0.9, rot: Math.random() * 6.28 });   // (what it leaves on the floor, for a moment)
			for (let i = 0; i < 3; i++) this.flash({ light: i ? 'puff' : 'smoke', x: x + (Math.random() - 0.5) * r * 0.8, y: y + 0.5, z: z + (Math.random() - 0.5) * r * 0.8, vy: 1.4 + Math.random(), life: 0.6 + Math.random() * 0.3, s0: Math.max(1, r * 0.8), s1: Math.max(2, r * 1.6), css: '#4a4f58', a: 0.55, rot: Math.random() * 6.28, spin: 0.6 });
		} else this.part({ shape: 'impact', pal: L.pal, x, y: y + 0.6, z, life: 0.24, s0: Math.max(1, r * 0.8), s1: Math.max(1.8, r * 1.9), anim: 9, glow: css, ga: 0.9 });
		for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832 + Math.random() * 0.4, sp = r * (2 + Math.random() * 1.5); this.part({ shape, pal: L.pal, x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 4, vz: Math.sin(a) * sp, g: 12, life: 0.35 + Math.random() * 0.25, s0: 0.6, s1: 0.15, rot: a, spin: 7 }); }
		this.stats.blasts++;
	}
	/** An enemy goes down: a puff where it stood, a star in its own type's colour, pieces thrown up. A boss: all of it larger, and a ring. */
	ko(x, y, z, type, boss = false) {
		if (!boss && this.impacts++ >= FX.IMPACTS_A_FRAME) return;
		const pal = this.VFX.PAL[type] ? type : 'normal', P = this.VFX.PAL[pal], L = this.VFX.forType(pal), k = boss ? 2.6 : 1;
		for (let i = 0; i < (boss ? 5 : 2); i++) this.flash({ light: i % 2 ? 'smoke' : 'puff', x: x + (Math.random() - 0.5) * 0.6 * k, y: y + (Math.random() - 0.3) * 0.5 * k, z: z + (Math.random() - 0.5) * 0.6 * k, vy: 0.9 + Math.random() * 0.8, life: 0.45 + Math.random() * 0.25, s0: 0.9 * k, s1: 1.9 * k, css: '#c9d2df', a: 0.7, rot: Math.random() * 6.28, spin: 0.8 });
		this.play({ sheet: 'explosion', x, y, z, life: 0.3, scale: boss ? 2.4 : 0.8 });
		this.flash({ light: 'glint', x, y, z, life: 0.24, s0: 1.2 * k, s1: 2.6 * k, css: P[3], a: 1.3 });
		if (boss) this.flash({ flat: true, light: 'ring', x, y: y - 0.45, z, life: 0.5, s0: 1, s1: 9, css: P[2], a: 1.2 });
		for (let i = 0, n = boss ? 14 : 4; i < n; i++) { const a = Math.random() * 6.2832, sp = (1.6 + Math.random() * 2) * (boss ? 1.8 : 1); this.part({ shape: L.proj, pal, x, y, z, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 3, vz: Math.sin(a) * sp, g: 11, life: 0.4 + Math.random() * 0.25, s0: 0.45, s1: 0.1, rot: a, spin: 7 }); }
		this.stats.kos++;
	}
	/** A whirl on the floor (Whirlpool, Fire Spin …), every frame it lasts: it turns, and the move's pieces circle in to its middle. t: its age. */
	vortex(x, y, z, r, t, mid, type) {
		const L = this.look(mid, type), A = this.atlas, P = this.VFX.PAL[L.pal], shape = A.has(L.proj) ? L.proj : 'ball';
		this.light('twirl', x, y + 0.1, z, r * 2.5, P[2], 0.75, -t * 5, true); this.light('twirl', x, y + 0.14, z, r * 1.5, P[3], 0.7, -t * 8 + 2, true);
		if (this.dt > 0 && Math.random() < this.dt * 22) { const a = Math.random() * 6.2832, c = Math.cos(a), s = Math.sin(a), sp = r / 0.45; this.part({ shape, pal: L.pal, x: x + c * r, y: y + 0.25 + Math.random() * 0.5, z: z + s * r, vx: -c * sp * 0.6 - s * sp * 0.8, vy: 1.2, vz: -s * sp * 0.6 + c * sp * 0.8, life: 0.45, s0: 0.55, s1: 0.2, rot: a, spin: 9, anim: 8 }); }
		this.stats.vortexes++;
	}
	/** A wave spreading over the floor (Surf, Earthquake …), every frame it travels: a ring at its front, the move's pieces thrown up along it. */
	wave(x, y, z, r, max, mid, type) {
		const L = this.look(mid, type), A = this.atlas, P = this.VFX.PAL[L.pal], shape = A.has(L.proj) ? L.proj : 'ball', k = Math.max(0, 1 - r / Math.max(0.1, max));
		this.light('ring', x, y + 0.1, z, r * 2.15, P[3], 0.35 + 0.75 * k, 0, true); this.light('ringsoft', x, y + 0.12, z, r * 1.5, P[2], 0.3 * k, 0, true);
		if (this.dt > 0) for (let i = 0, n = Math.min(5, Math.ceil(this.dt * r * 22)); i < n; i++) { const a = Math.random() * 6.2832; this.part({ shape, pal: L.pal, x: x + Math.cos(a) * r, y: y + 0.15, z: z + Math.sin(a) * r, vx: Math.cos(a) * 2, vy: 2.5 + Math.random() * 2, vz: Math.sin(a) * 2, g: 10, life: 0.35, s0: 0.5, s1: 0.15, rot: a, spin: 6 }); }
		this.stats.waves++;
	}
	/** A patch left on the floor (a trail's puddle, a pool of poison), every frame it lasts: a stain of light, and now and then one of the move's pieces rising. k: 1 fresh … 0 about to go. */
	patch(x, y, z, r, k, mid, type, seed = 0) {
		const L = this.look(mid, type), A = this.atlas, P = this.VFX.PAL[L.pal], shape = A.has(L.aura) ? L.aura : A.has(L.proj) ? L.proj : 'ball', a = Math.min(1, k * 3);
		this.light('smoke', x, y + 0.08, z, r * 2.5, P[1], 0.8 * a, seed, true); this.light('magic', x, y + 0.1, z, r * 1.9, P[3], 0.45 * a, this.t * 0.7 + seed, true);
		if (this.dt > 0 && Math.random() < this.dt * 5) { const q = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * r * 0.85; this.part({ shape, pal: L.pal, x: x + Math.cos(q) * d, y: y + 0.15, z: z + Math.sin(q) * d, vy: 1.3 + Math.random(), life: 0.5, s0: 0.42, s1: 0.12, rot: q, spin: 3, anim: 6 }); }
		this.stats.patches++;
	}
	/** An Ultimate is cast: a circle of light opens under you and turns, a burst, and your type's pieces rise all round. */
	ultCast(x, y, z, type) {
		const pal = this.VFX.PAL[type] ? type : 'normal', P = this.VFX.PAL[pal], L = this.VFX.forType(pal);
		this.flash({ flat: true, light: 'rune', x, y: y + 0.1, z, life: 1.1, s0: 2, s1: 9, css: P[3], a: 1.5, spin: 2.2 });
		this.flash({ flat: true, light: 'magic', x, y: y + 0.12, z, life: 1.1, s0: 6, s1: 7, css: P[2], a: 1.1, spin: -1.4 });
		this.flash({ light: 'burst', x, y: y + 1, z, life: 0.5, s0: 2, s1: 7, css: P[4], a: 1.6 });
		this.flash({ light: 'flare', x, y: y + 1, z, life: 0.8, s0: 5, s1: 9, css: P[3], a: 1.2 });
		for (let i = 0; i < 22; i++) { const a = (i / 22) * 6.2832, d = 1.2 + Math.random() * 2.2; this.part({ shape: L.proj, pal, x: x + Math.cos(a) * d, y: y + 0.1, z: z + Math.sin(a) * d, vy: 3 + Math.random() * 3.5, life: 0.7 + Math.random() * 0.4, s0: 0.7, s1: 0.2, rot: a, spin: 5, anim: 8, glow: P[3], ga: 0.35 }); }
		this.stats.ults++;
	}
	/** …one of its rings: light running out over the floor to its reach, pieces thrown up along the rim. long: one that stays (a field). */
	ultRing(x, y, z, r, type, life = 0.4, long = false) {
		const pal = this.VFX.PAL[type] ? type : 'normal', P = this.VFX.PAL[pal], L = this.VFX.forType(pal);
		this.flash({ flat: true, light: 'ring', x, y: y + 0.12, z, life, s0: long ? r * 2 : 1, s1: r * 2.15, css: P[3], a: long ? 0.9 : 1.5 });
		this.flash({ flat: true, light: long ? 'magic' : 'ringsoft', x, y: y + 0.1, z, life, s0: long ? r * 1.8 : 1, s1: r * 1.9, css: P[2], a: 0.9, spin: long ? 0.8 : 0 });
		if (!long) for (let i = 0, n = Math.max(8, Math.min(28, Math.round(r * 3))); i < n; i++) { const a = (i / n) * 6.2832 + Math.random() * 0.3; this.part({ shape: L.proj, pal, x: x + Math.cos(a) * r * 0.2, y: y + 0.3, z: z + Math.sin(a) * r * 0.2, vx: Math.cos(a) * r / 0.4, vy: 2 + Math.random() * 3, vz: Math.sin(a) * r / 0.4, g: 9, life: 0.4 + Math.random() * 0.15, s0: 0.8, s1: 0.25, rot: a, spin: 7, anim: 8 }); }
		this.stats.ults++;
	}
	/** …one of its strikes from the sky: a shaft of light coming down, and what it does where it lands. */
	ultStrike(x, y, z, r, type) {
		const pal = this.VFX.PAL[type] ? type : 'normal', P = this.VFX.PAL[pal];
		this.flash({ light: type === 'electric' ? 'bolt' : 'streak', x, y: y + 7, z, life: 0.22, s0: 14, s1: 15, css: P[4], a: 1.8 });
		this.flash({ light: 'streak', x, y: y + 7, z, life: 0.3, s0: 15, s1: 17, css: P[2], a: 1.1 });
		this.blast(x, y, z, Math.max(1.2, r), null, pal);
		this.stats.ults++;
	}
	/** What an enemy is suffering, drawn on it every frame: flames licking it (burn), bubbles rising (poison), a shell of ice (frozen), sparks
	 *  jumping (paralysed), rings drifting up (asleep), stars circling its head (confused), a drag of dust (slowed).
	 *  e: { x, y, z, r (its radius), h (its height), id }. st: { burn, poison, frozen, para, sleep, conf, slow } (truthy: it has it). */
	status(e, st) {
		const t = this.t, top = e.y + e.h, mid = e.y + e.h * 0.5, k = e.id * 1.7, S = this.stats.marks, hit = (n) => { S[n] = (S[n] || 0) + 1; };
		if (st.frozen) { hit('frozen'); this.light('glint', e.x, mid, e.z, e.h * 1.9, '#bff3ff', 0.75, k); for (let i = 0; i < 3; i++) { const a = k + i * 2.094; this.sprite('shard', 'ice', 0, e.x + Math.cos(a) * e.r * 0.9, mid + Math.sin(a * 2) * e.h * 0.25, e.z + Math.sin(a) * e.r * 0.9, 0.62, a); } }
		if (st.burn) { hit('burn'); for (let i = 0; i < 2; i++) { const a = t * 3 + k + i * 3.14; this.sprite('fire', 'fire', Math.floor(t * 9 + i), e.x + Math.cos(a) * e.r * 0.7, e.y + e.h * (0.35 + 0.3 * i) + Math.sin(t * 7 + i) * 0.08, e.z + Math.sin(a) * e.r * 0.7, 0.85, 1.5708); } this.glow(e.x, mid, e.z, e.h * 1.5, '#ff6a1f', 0.28); }
		if (st.poison) { hit('poison'); for (let i = 0; i < 2; i++) { const u = (t * 0.9 + k * 0.13 + i * 0.5) % 1; this.sprite('bubble', 'poison', Math.floor(t * 4 + i), e.x + Math.sin(k + i * 2.4) * e.r * 0.8, e.y + e.h * (0.3 + u * 0.9), e.z + Math.cos(k + i * 2.4) * e.r * 0.8, 0.75 * (1 - u * 0.5)); } }
		if (st.para) { hit('para'); if (Math.floor(t * 9 + k) % 3 === 0) { const a = t * 23 + k; this.sprite('bolt', 'electric', Math.floor(t * 12), e.x + Math.cos(a) * e.r, mid + Math.sin(a * 1.7) * e.h * 0.3, e.z + Math.sin(a) * e.r, 0.6, a); } }
		if (st.sleep) { hit('sleep'); for (let i = 0; i < 2; i++) { const u = (t * 0.5 + i * 0.5 + k * 0.1) % 1; this.sprite('ring', 'psychic', 0, e.x + 0.25 + u * 0.35, top + 0.1 + u * 0.8, e.z, 0.3 + u * 0.3); } }
		if (st.conf) { hit('conf'); for (let i = 0; i < 3; i++) { const a = t * 4.5 + k + i * 2.094; this.sprite('star', 'electric', Math.floor(t * 6 + i), e.x + Math.cos(a) * (e.r + 0.2), top + 0.25, e.z + Math.sin(a) * (e.r + 0.2), 0.6, a); } }
		if (st.slow && !st.frozen) { hit('slow'); this.light('puff', e.x, e.y + 0.25, e.z, e.r * 3, '#8fb6ff', 0.35, k + t, true); }
	}
	/** The weather, in the air round (x, y, z): rain coming down, snow drifting, sand blowing across, fog hanging, light in the sun.
	 *  level: 0 … 1 (it fades in and out). Called every frame it lasts. */
	weatherAir(kind, level, x, y, z) {
		if (!this.lights || !(level > 0) || !(this.dt > 0)) return;
		const W = this.stats.weather, R = 12, at = () => { const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * R; return [x + Math.cos(a) * d, z + Math.sin(a) * d]; }, n = (rate) => { const q = rate * level * this.dt; return Math.floor(q) + (Math.random() < q % 1 ? 1 : 0); };
		const put = (o) => { this.part(o); W[kind] = (W[kind] || 0) + 1; };
		if (kind === 'rain') for (let i = n(170); i > 0; i--) { const p = at(); put({ light: 'streak', x: p[0], y: y + 9 + Math.random() * 3, z: p[1], vx: -1.5, vy: -22, life: 0.5, s0: 1.7, s1: 1.7, css: '#cfe6ff', a: 1.1 }); }
		else if (kind === 'snow') for (let i = n(60); i > 0; i--) { const p = at(); put({ light: 'glint', x: p[0], y: y + 6 + Math.random() * 3, z: p[1], vx: Math.random() - 0.5, vy: -2.2, vz: Math.random() - 0.5, life: 2.6, s0: 0.32, s1: 0.26, css: '#ffffff', a: 0.9, spin: 1 }); }
		else if (kind === 'sand') for (let i = n(26); i > 0; i--) { const p = at(); put({ light: Math.random() < 0.5 ? 'dirt' : 'puff', x: p[0] - 6, y: y + 0.4 + Math.random() * 2.5, z: p[1], vx: 11 + Math.random() * 5, vy: 0.3, life: 1.1, s0: 1.2, s1: 2.4, css: '#d9b36a', a: 0.5, spin: 1.5, rot: Math.random() * 6.28 }); }
		else if (kind === 'fog') for (let i = n(5); i > 0; i--) { const p = at(); put({ light: 'smoke', x: p[0], y: y + 0.8 + Math.random() * 1.5, z: p[1], vx: 0.5, life: 3.2, s0: 4, s1: 7, css: '#cfd8e3', a: 0.32, rot: Math.random() * 6.28, spin: 0.15 }); }
		else if (kind === 'sun') for (let i = n(4); i > 0; i--) { const p = at(); put({ light: 'glint', x: p[0], y: y + 0.5 + Math.random() * 4, z: p[1], vy: 0.5, life: 1.4, s0: 0.3, s1: 0.7, css: '#fff2a0', a: 0.8 }); }
	}
	/** A dash: streaks left along the way. */
	dash(from, dir, len, mid, type) {
		const L = this.look(mid, type), rot = this.screenAngle(dir[0], dir[1], dir[2]), css = this.VFX.PAL[L.pal][2];
		for (let d = 0; d < len; d += 0.5) this.part({ shape: 'streak', pal: L.pal, x: from[0] + dir[0] * d, y: from[1] + dir[1] * d + (Math.random() - 0.5) * 0.7, z: from[2] + dir[2] * d, vx: -dir[0] * 2, vz: -dir[2] * 2, life: 0.18 + d / Math.max(1, len) * 0.14, s0: 1.3, s1: 0.5, rot, glow: css, ga: 0.35 });
		this.stats.dashes++;
	}
	/** Move and draw what is short-lived, then hand the frame to the GPU. */
	end() {
		const dt = this.dt, P = this.parts;
		for (let i = P.length - 1; i >= 0; i--) {
			const p = P[i]; p.t += dt;
			if (p.t >= p.life) { P.splice(i, 1); continue; }
			if (p.g) p.vy -= p.g * dt;
			if (p.vx) p.x += p.vx * dt; if (p.vy) p.y += p.vy * dt; if (p.vz) p.z += p.vz * dt;
			const k = p.t / p.life, s = p.s0 + (p.s1 - p.s0) * k;
			if (p.sheet) { const S = this.sheets.sprites[p.sheet]; this.sheet(p.sheet, p.loop ? Math.floor(p.t * p.loop) % S.n : Math.floor(k * S.n), p.x, p.y, p.z, p.s0 != null ? s / (S.w * ANIM_PX) : p.scale || 1, p.rot || 0, !!p.flat); if (p.glow) this.glow(p.x, p.y, p.z, s * 2.2, p.glow, (p.ga || 0.5) * (1 - k)); continue; }
			if (p.light) { this.light(p.light, p.x, p.y, p.z, s, p.css, (p.a || 0.7) * (1 - k * k), (p.rot || 0) + (p.spin || 0) * p.t, !!p.flat); continue; }
			this.sprite(p.shape, p.pal, p.anim ? Math.floor(p.t * p.anim) : 0, p.x, p.y, p.z, s, (p.rot || 0) + (p.spin || 0) * p.t);
			if (p.glow) this.glow(p.x, p.y, p.z, s * 2.2, p.glow, (p.ga || 0.5) * (1 - k));
		}
		this.stats.sprites = this.sprites.n; this.stats.glows = this.glows.n; this.stats.parts = P.length;
		this.stats.lights = this.lights ? this.lights.n : 0; if (this.lights) { let fl = 0; const a = this.lights.aSR.array; for (let i = 0; i < this.lights.n; i++) if (a[i * 4 + 3] > 0.5) fl++; this.stats.flat = fl; }
		this.stats.anims = this.anims ? this.anims.n : 0;
		this.sprites.end(this.right, this.up); this.glows.end(this.right, this.up); if (this.lights) this.lights.end(this.right, this.up); if (this.anims) this.anims.end(this.right, this.up);
	}
}
