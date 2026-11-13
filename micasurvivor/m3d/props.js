// props.js — MicaSurvivor 3D: the pictures of what lies on the ground (owner, 2026-11-12: "the blue & red dots need
// to be replaced with actual graphics"). XP, berries, magnets, bombs, items, and what an Expedition zone holds (Poké
// Balls, berry bushes, gold rocks, altars, Meowth's stall, the slot machine, cages, comet shards) were beads in a
// colour. Here each is a small picture, the 2D game's own: its XP gem, its pixel icons (js/ui/icons.js), the
// overworld's item pictures (the balls, the berry), and the shapes js/expedition/economy.js draws for the rest.
//
// One atlas: a canvas of 64 px cells, a picture painted into a cell the first time it is asked for (a picture that
// waits for an image is painted again when the image arrives). A picture stands on the ground as a billboard: one
// canvas pixel is one 2D world unit (1/16 m), the feet 4 px above the cell's bottom, in the middle.
// No three.js here: the page gives the canvas to a texture and draws the cells with its sprite batch.
import { CELL } from './sim.js';

export const PK = { CELL: 64, COLS: 8, FOOT: 4, U: CELL / 32 };
/** The Pokémon that stands at a thing of the zone (the 2D game's): its species, and how far above the ground (m). */
export const PROP_MON = { meowth: [52, 0], ditto: [132, 0], hypno: [97, 0], greed: [94, 2.1], unown1: [201, 1.5], unown2: [201, 1.5], unown3: [201, 1.5], unown4: [201, 1.5] };
/** Which things bob (the 2D game's: the balls and the comet's shard). */
export const BOBS = new Set(['eco:ball', 'eco:freeball', 'eco:cursedball', 'eco:great', 'eco:comet']);
const ECO_ICON = { ball: 'poke_ball', freeball: 'premier_ball', cursedball: 'poke_ball', great: 'great_ball', comet: 'star_piece' };
const UI_ICON = { heal: 'berry', magnet: 'magnet', bomb: 'bomb' };
const GEM = { xp: ['#7fe0ff', '#2a8fd0', 6], xpBig: ['#ffd95e', '#c08a10', 9] };
const TAU = 6.2832;

const circle = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
const poly = (c, col, pts) => { c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); };
/** The 2D game's XP gem: a diamond with a rim and a glint. */
function gem(c, col, rim, r) {
	const y = -r - 3;
	poly(c, rim, [[0, y - r - 1.5], [r * 0.78 + 1.5, y], [0, y + r + 1.5], [-r * 0.78 - 1.5, y]]);
	poly(c, col, [[0, y - r], [r * 0.78, y], [0, y + r], [-r * 0.78, y]]);
	circle(c, -r * 0.25, y - r * 0.3, Math.max(1.2, r * 0.28), '#ffffff');
}
/** What the zone holds, as js/expedition/economy.js draws it (still: no charge ring, no "used" look: a used thing is not drawn). */
const ECO = {
	ball: (c, P, k, col) => { if (!P.img(ECO_ICON[k], 0, -15, 26)) circle(c, 0, -15, 9, col); },
	cursedball: (c, P, k, col) => { circle(c, 0, -15, 14, '#5a1f9a'); if (!P.img(ECO_ICON[k], 0, -15, 26)) circle(c, 0, -15, 9, col); c.globalAlpha = 0.45; circle(c, 0, -15, 10, '#5a1f9a'); c.globalAlpha = 1; },
	comet: (c, P, k, col) => { circle(c, 0, -18, 15, col); if (!P.img(ECO_ICON.comet, 0, -18, 28)) circle(c, 0, -18, 8, '#ffffff'); },
	meowth: (c, P) => {   // a little stall: a striped awning on two posts, a counter with its wares (Meowth stands behind it)
		for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fff3c8' : '#e2483d'; c.fillRect(-30 + i * 10, -50, 10, 10); }
		c.fillStyle = '#6b4320'; c.fillRect(-28, -40, 3, 36); c.fillRect(25, -40, 3, 36);
		c.fillStyle = '#8a5a2c'; c.fillRect(-26, -10, 52, 14);
		P.img('nugget', -14, -3, 14); P.img('amulet_coin', 14, -3, 14);
	},
	unown: (c, P, k, col) => { c.fillStyle = '#4c493f'; c.fillRect(-8, -3, 16, 3); c.fillStyle = '#6f6b5f'; c.fillRect(-6, -22, 12, 20); c.fillStyle = col; c.fillRect(-7, -25, 14, 4); c.fillRect(-2, -17, 4, 4); },
	altar: (c, P, k, col) => { poly(c, '#2f2c38', [[-14, 0], [14, 0], [9, -36], [-9, -36]]); poly(c, '#4a4656', [[-12, 0], [12, 0], [7, -34], [-7, -34]]); c.fillStyle = col; c.fillRect(-3, -28, 6, 14); },
	rock: (c) => { poly(c, '#5f5440', [[-15, 0], [-10, -16], [2, -20], [14, -11], [15, 0]]); poly(c, '#8a7a5c', [[-13, 0], [-9, -14], [2, -18], [12, -10], [13, 0]]); c.fillStyle = '#ffd95e'; c.fillRect(-6, -11, 4, 3); c.fillRect(3, -8, 3, 3); c.fillRect(-1, -4, 3, 2); c.fillStyle = '#ffffff'; c.fillRect(4, -14, 2, 2); },
	berry: (c, P, k, col) => {
		for (const [dx, dy, r] of [[-7, -8, 9.5], [6, -9, 9.5], [0, -15, 9.5], [0, -6, 10.5]]) circle(c, dx, dy, r, '#1f5f28');
		for (const [dx, dy, r] of [[-7, -8, 8], [6, -9, 8], [0, -15, 8], [0, -6, 9]]) circle(c, dx, dy, r, '#2f8a3a');
		if (!P.img('oran_berry', 0, -12, 16)) for (const [dx, dy] of [[-5, -10], [5, -12], [1, -5]]) circle(c, dx, dy, 3, col);
	},
	slots: (c, P) => {   // a cabinet: its three reels, its lever
		c.fillStyle = '#c2185b'; c.fillRect(-20, -50, 40, 50); c.fillStyle = '#7a0e3a'; c.fillRect(-20, -8, 40, 8);
		c.fillStyle = '#ffd23f'; c.fillRect(-22, -54, 44, 6); c.fillStyle = '#1b1020'; c.fillRect(-16, -42, 32, 14);
		['great_ball', 'nugget', 'oran_berry'].forEach((n, i) => { const cx = -10 + i * 10; c.fillStyle = '#f4f0e8'; c.fillRect(cx - 4, -41, 9, 12); P.img(n, cx + 0.5, -35, 10); });
		c.fillStyle = '#9aa3b2'; c.fillRect(21, -44, 2, 15); circle(c, 24, -45, 3.5, '#e53935');
	},
	cage: (c) => { c.fillStyle = '#c9ced8'; for (let i = 0; i <= 5; i++) c.fillRect(-17 + i * 6.4, -34, 2, 34); c.fillRect(-17, -2, 34, 2); c.fillStyle = '#9aa3b2'; c.fillRect(-18, -37, 36, 4); },
};
// A Dive's things: a boulder and a thicket (the plugs of the secret pockets), a landmark (a standing stone in its colour)
ECO.boulder = (c) => { poly(c, '#4a4338', [[-24, 0], [-21, -24], [-9, -40], [10, -42], [23, -26], [25, 0]]); poly(c, '#7d7262', [[-21, 0], [-18, -22], [-8, -36], [9, -38], [20, -24], [22, 0]]); poly(c, '#9c917f', [[-12, -20], [-6, -33], [7, -35], [3, -22]]); c.fillStyle = '#4a4338'; c.fillRect(-3, -16, 2, 12); c.fillRect(-1, -6, 9, 2); };
ECO.thicket = (c) => { for (const [dx, dy, r] of [[-13, -10, 13], [12, -11, 13], [0, -26, 14], [-9, -32, 10], [10, -33, 10], [0, -9, 13]]) circle(c, dx, dy, r, '#173f1c'); for (const [dx, dy, r] of [[-13, -10, 11], [12, -11, 11], [0, -26, 12], [-9, -32, 8], [10, -33, 8], [0, -9, 11]]) circle(c, dx, dy, r, '#2a6b2f'); c.strokeStyle = '#5a3d1e'; c.lineWidth = 2; for (const [x0, x1] of [[-16, 6], [15, -4], [-4, 12]]) { c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, -34); c.stroke(); } };
ECO.lm = (c, P, k, col) => { poly(c, '#2c2a36', [[-15, 0], [15, 0], [11, -6], [-11, -6]]); poly(c, '#3a3846', [[-9, -6], [9, -6], [6, -46], [0, -52], [-6, -46]]); poly(c, '#565368', [[-7, -6], [7, -6], [4, -44], [0, -49], [-4, -44]]); c.fillStyle = col; c.fillRect(-2, -38, 4, 22); c.fillRect(-5, -31, 10, 4); circle(c, 0, -44, 2.5, col); };
const ecoPainter = (kind) => ECO[kind] || (/^lm_/.test(kind) ? ECO.lm : /^unown/.test(kind) ? ECO.unown : /ball$|^great$/.test(kind) ? ECO.ball : /challenge|cursedaltar|greed/.test(kind) ? ECO.altar : null);

/** The atlas. o: { canvas (512 x 512 or any multiple of the cell), uiIcon(name) -> a small canvas or null (the game's
 *  pixel icons), imgUrl(name) -> the URL of an item picture, itemIcon(id) -> { ui } | { img } | null (an item's
 *  picture), ecoCol: { kind: colour }, onChange() (a cell was painted: the texture must be sent again),
 *  newImage() (tests) } */
export class Props {
	constructor(o) {
		this.o = o; this.cv = o.canvas; this.ctx = this.cv.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
		this.cols = Math.floor(this.cv.width / PK.CELL); this.max = this.cols * Math.floor(this.cv.height / PK.CELL);
		this.cells = new Map(); this.imgs = new Map(); this.n = 0;
		const h = PK.CELL, U = PK.U;
		this.rect = [-h / 2 * U, -PK.FOOT * U, h / 2 * U, (h - PK.FOOT) * U];
	}
	/** Is there a picture for this? 'xp' | 'xpBig' | 'heal' | 'magnet' | 'bomb' | 'item' | 'item:<id>' | 'eco:<kind>' */
	has(key) { return !!GEM[key] || !!UI_ICON[key] || key === 'item' || key.startsWith('item:') || (key.startsWith('eco:') && (!!ecoPainter(key.slice(4)) || !!PROP_MON[key.slice(4)])); }
	/** The cell of a picture: { uv: [u0, v0, u1, v1] (v0 the top), rect: [left, bottom, right, top] m from the feet,
	 *  empty (nothing is painted in it: only its Pokémon shows) }. null: no picture for this (or the atlas is full). */
	get(key) {
		let c = this.cells.get(key);
		if (c) return c;
		if (!this.has(key) || this.n >= this.max) return null;
		const i = this.n++, x = (i % this.cols) * PK.CELL, y = Math.floor(i / this.cols) * PK.CELL, W = this.cv.width, H = this.cv.height;
		c = { key, i, x, y, uv: [x / W, y / H, (x + PK.CELL) / W, (y + PK.CELL) / H], rect: this.rect, empty: false, waits: 0 };
		this.cells.set(key, c);
		this.paint(c);
		return c;
	}
	paint(c) {
		const g = this.ctx, key = c.key;
		g.save();
		g.clearRect(c.x, c.y, PK.CELL, PK.CELL);
		g.beginPath(); g.rect(c.x, c.y, PK.CELL, PK.CELL); g.clip();
		g.translate(c.x + PK.CELL / 2, c.y + PK.CELL - PK.FOOT);
		const P = { img: (name, x, y, s) => this.image(c, name, x, y, s), ui: (name, x, y, s) => this.ui(name, x, y, s) };
		c.empty = false;
		if (GEM[key]) gem(g, ...GEM[key]);
		else if (UI_ICON[key]) { if (!P.ui(UI_ICON[key], 0, -13, 18)) circle(g, 0, -13, 7, '#5fe08a'); }
		else if (key === 'item' || key.startsWith('item:')) {
			const it = key === 'item' ? null : this.o.itemIcon(key.slice(5));
			circle(g, 0, -16, 15, '#b8860b'); circle(g, 0, -16, 13.5, '#ffe14d');   // (an item: on a gold disc, to be seen from afar)
			if (!(it && (it.img ? P.img(it.img, 0, -16, 22) : P.ui(it.ui, 0, -16, 22)))) gem(g, '#fff6c8', '#b8860b', 6);
		} else {
			const kind = key.slice(4), paint = ecoPainter(kind);
			if (paint) paint(g, P, kind, (this.o.ecoCol && this.o.ecoCol[kind]) || '#ffffff'); else c.empty = true;
		}
		g.restore();
		if (this.o.onChange) this.o.onChange(c);
	}
	/** One of the game's pixel icons, s px wide, centred on (x, y). -> drawn? */
	ui(name, x, y, s) {
		const cv = name && this.o.uiIcon ? this.o.uiIcon(name) : null; if (!cv) return false;
		const k = Math.max(1, Math.round(s / cv.width)), w = cv.width * k, h = cv.height * k;
		this.ctx.drawImage(cv, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
		return true;
	}
	/** An item picture, s px, centred on (x, y). Not here yet: it is asked for, and the cell is painted again when it comes. -> drawn? */
	image(c, name, x, y, s) {
		let im = this.imgs.get(name);
		if (!im) {
			im = { el: this.o.newImage ? this.o.newImage() : new Image(), ok: false, cells: new Set() };
			this.imgs.set(name, im);
			im.el.onload = () => { im.ok = true; for (const q of im.cells) this.paint(q); };
			im.el.src = this.o.imgUrl(name);
		}
		if (!im.ok) { im.cells.add(c); return false; }
		this.ctx.drawImage(im.el, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
		return true;
	}
}
