// scenery3d.js — what stands ROUND a Tower Defense board (owner, 2026-11-24: "scenery per map", drawn in code). A map
// names its surround (`scenery`: woods, crags, lake); this builds it as one vertex-coloured mesh: the ground the board's
// plinth stands on, fading into the page's dark, and the things on it. Nothing here is part of play: no tile, no
// height, nothing a tap lands on. It is laid out from the map's size alone (a hash of each spot), so it is the same
// every time; and everything is kept low enough for its distance that it never hides a tile, whichever way the board
// is turned.
import * as THREE from 'three';

import { CELL, BG, REACH, NEAR, rnd, hex, mix, lit, outside, SCENERY, sceneryProps, tallOf } from './td/scenery.js';

export function buildScenery(map, kind) {
	const sc = SCENERY[kind]; if (!sc) return null;
	const W = map.w, H = map.h, pos = [], col = [];
	const fade = (c, d) => (sc.ground == null ? c : mix(c, BG, Math.max(0, Math.min(1, (d - NEAR) / (REACH - NEAR))) ** 1.4));   // (on a sea there is no dark to fade into)
	const tri = (a, b, c, ca, cb = ca, cc = ca) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); };
	const quad = (a, b, c, d, ca, cb = ca, cc = ca, cd = ca) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
	/** A box standing on y0: its four sides shaded, its top lighter. */
	const box = (x0, z0, x1, z1, y0, y1, c, top = lit(c, 1.18)) => {
		quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top);
		quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], lit(c, 0.92));
		quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], lit(c, 0.78));
		quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], lit(c, 0.7));
		quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], lit(c, 0.84));
	};
	/** A four-sided point (a tree's tier, a bush). */
	const cone = (x, z, y0, r, h, c) => {
		const p = [x, y0 + h, z], q = [[x - r, y0, z - r], [x + r, y0, z - r], [x + r, y0, z + r], [x - r, y0, z + r]], sh = [0.72, 0.8, 1, 0.9];
		for (let i = 0; i < 4; i++) tri(q[i], q[(i + 1) % 4], p, lit(c, sh[i] * 0.86), lit(c, sh[i] * 0.86), lit(c, sh[i] * 1.12));
	};
	// the ground: a sheet under the plinth, a shade a tile, fading out
	if (sc.ground != null) {
		const g1 = hex(sc.ground), g2 = hex(sc.ground2);
		const at = (gx, gz) => { const d = outside(gx, gz, W, H); return fade(mix(g1, g2, rnd(gx, gz, 3)), d); };
		for (let gz = -REACH; gz < H + REACH; gz++) for (let gx = -REACH; gx < W + REACH; gx++) {
			const x0 = gx * CELL, z0 = gz * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
			quad([x0, sc.y, z0], [x0, sc.y, z1], [x1, sc.y, z1], [x1, sc.y, z0], at(gx, gz), at(gx, gz + 1), at(gx + 1, gz + 1), at(gx + 1, gz));
		}
	}
	const props = sceneryProps(map, kind);
	for (const p of props) {
		const x = p.x * CELL, z = p.z * CELL, y = sc.y + 0.01, t = tallOf(kind, p), f = (c) => fade(hex(c), p.d);
		if (p.k === 'tree') {
			const r = 0.55 + p.s * 0.35, trunk = Math.min(0.7, t * 0.25), leaf = f(p.s > 0.5 ? 0x2f7a3a : 0x3c8f45);
			box(x - 0.14, z - 0.14, x + 0.14, z + 0.14, y, y + trunk, f(0x6b4a2c));
			const h = (t - trunk) / 2.2;
			cone(x, z, y + trunk, r * 1.25, h * 1.2, leaf); cone(x, z, y + trunk + h * 0.7, r, h * 1.1, lit(leaf, 1.08)); cone(x, z, y + trunk + h * 1.35, r * 0.7, h * 0.85, lit(leaf, 1.16));
		} else if (p.k === 'bush') cone(x, z, y, 0.4 + p.s * 0.25, t, f(0x3f8f48));
		else if (p.k === 'flower') { const c = f([0xf4d23a, 0xf08ab0, 0xffffff, 0xd8463a][Math.floor(p.s * 4) % 4]); box(x - 0.03, z - 0.03, x + 0.03, z + 0.03, y, y + t, f(0x3c8f45)); box(x - 0.1, z - 0.1, x + 0.1, z + 0.1, y + t, y + t + 0.08, c, c); }
		else if (p.k === 'crag') {
			const w = 0.7 + p.s * 0.5, c = f(p.s > 0.5 ? 0x8a7f6e : 0x7a7466);
			box(x - w, z - w, x + w, z + w, y, y + t * 0.55, c);
			box(x - w * 0.62, z - w * 0.55, x + w * 0.5, z + w * 0.62, y + t * 0.55, y + t, lit(c, 1.06));
		} else if (p.k === 'rock') { const w = 0.25 + p.s * 0.3, c = f(kind === 'lake' ? 0x7d8790 : 0x8a8172); box(x - w, z - w * 0.8, x + w, z + w * 0.8, y - 0.2, y + t * 0.55, c); box(x - w * 0.55, z - w * 0.5, x + w * 0.35, z + w * 0.4, y + t * 0.55, y + t, lit(c, 1.08)); }
		else if (p.k === 'shrub') cone(x, z, y, 0.3, t, f(0x7d7a45));
		else if (p.k === 'reed') { for (let i = 0; i < 4; i++) { const ox = (rnd(i, Math.floor(p.s * 99), 5) - 0.5) * 0.5, oz = (rnd(i, Math.floor(p.s * 99), 6) - 0.5) * 0.5, c = f(0x6fa05a); box(x + ox - 0.04, z + oz - 0.04, x + ox + 0.04, z + oz + 0.04, y, y + t * (0.7 + 0.3 * rnd(i, 1, 7)), c, f(0x8a6a3a)); } }
		else if (p.k === 'pad') { const r = 0.3 + p.s * 0.25, c = f(0x4fa860); quad([x - r, y + 0.02, z - r * 0.7], [x - r * 0.7, y + 0.02, z + r], [x + r, y + 0.02, z + r * 0.7], [x + r * 0.7, y + 0.02, z - r], c, lit(c, 1.1), lit(c, 1.2), c); if (p.s > 0.7) box(x - 0.08, z - 0.08, x + 0.08, z + 0.08, y + 0.02, y + 0.14, f(0xf6c0d8), f(0xffffff)); }
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
	mesh.matrixAutoUpdate = false; mesh.name = 'scenery:' + kind;
	const group = new THREE.Group(); group.add(mesh);
	return { group, kind, count: props.length, dispose() { geo.dispose(); mesh.material.dispose(); } };
}
