// cardart.js — canvas-generated card faces shared by the game board, packs,
// deck builder, and gallery. Everything here is drawn procedurally: the frame
// layout follows collectible-card conventions (mana gem, name banner, art
// window, rarity gem, stat plates) but every pixel is ours. Rules text never
// appears on the face — cards with rules carry an iridescent gem instead, and
// the text lives in hover tooltips.
import * as THREE from 'three';

export const CARD_W = 2.5, CARD_H = 3.5, CARD_D = 0.02;

export const RARITY_COLORS = {
	common:   '#9aa0a6',
	uncommon: '#4caf50',
	rare:     '#2196f3',
	epic:     '#9c27b0',
	legendary:'#ff9800',
	special:  '#e8d56f',
};
// class tints the card BODY; type still colors the banner and border
export const CLASS_COLORS = {
	neutral:       '#5c554b',
	bounty_hunter: '#9a5426',
	centurion:     '#256d76',
	naturalist:    '#7a8a2e',
	mage:          '#3172b5',
	shaman:        '#243a8a',
	paladin:       '#a3822a',
	warlock:       '#5e2d8a',
	hunter:        '#3f7a2b',
	rogue:         '#43414f',
	warrior:       '#8a2626',
	priest:        '#8f8ba0',
	druid:         '#6b4a26',
};
export const CLASS_NAMES = {
	neutral: 'Neutral', bounty_hunter: 'Bounty Hunter', centurion: 'Centurion',
	naturalist: 'Naturalist', mage: 'Mage', shaman: 'Shaman', paladin: 'Paladin',
	warlock: 'Warlock', hunter: 'Hunter', rogue: 'Rogue', warrior: 'Warrior',
	priest: 'Priest', druid: 'Druid',
};
export const TYPE_COLORS = {
	creature:    '#7a3b2e',
	sorcery:     '#5b3b8c',
	instant:     '#2e6a7a',
	land:        '#3b7a2e',
	artifact:    '#6e6a5e',
	enchantment: '#7a2e6a',
	weapon:      '#7a5a2e',
	secret:      '#2e6a4a',
	trap:        '#8a4a2e',
	heropower:   '#2e5a7a',
	quest:       '#7a6a2e',
	planeswalker:'#5a2e7a',
	emblem:      '#8a7a3a',
};

// where the rules gem sits on the face, in UV terms (for the 3D glow overlay)
export const RULES_GEM = { x: 0.5, y: 560 / 716, r: 60 / 512 };

// vanilla bodies get an empty socket area; anything with actual rules gets the gem
export function hasRules(card) {
	const d = (card.description || '').trim();
	if (!d) return false;
	return !/^A \d+\/\d+ (creature|weapon)\.$/.test(d);
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function shade(hex, f) {
	const n = parseInt(hex.slice(1), 16);
	const ch = i => Math.max(0, Math.min(255, Math.round(((n >> i) & 255) * f)));
	return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function hashId(id) {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// deterministic per-card generative art, painted inside the art window clip
function paintArt(ctx, card, x, y, w, h) {
	const seed = hashId(card.id || card.name || '?');
	// mulberry32: deterministic per card, always in [0, 1)
	const rand = (() => {
		let s = seed >>> 0;
		return () => {
			s = (s + 0x6D2B79F5) >>> 0;
			let t = Math.imul(s ^ (s >>> 15), 1 | s);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	})();
	const hue = seed % 360;
	const typeCol = TYPE_COLORS[card.type] || '#444';

	// sky
	const sky = ctx.createLinearGradient(x, y, x, y + h);
	sky.addColorStop(0, `hsl(${hue}, 60%, 52%)`);
	sky.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 22%)`);
	ctx.fillStyle = sky;
	ctx.fillRect(x, y, w, h);

	const variant = (seed >> 4) % 4;
	if (variant === 0) {
		// desert peaks under a sun
		ctx.fillStyle = `hsla(${(hue + 180) % 360}, 70%, 72%, 0.9)`;
		ctx.beginPath();
		ctx.arc(x + w * (0.3 + rand() * 0.4), y + h * 0.3, 26 + rand() * 22, 0, Math.PI * 2);
		ctx.fill();
		for (let i = 0; i < 3; i++) {
			ctx.fillStyle = `hsla(${hue}, 42%, ${34 - i * 8}%, 0.95)`;
			ctx.beginPath();
			const base = y + h * (0.62 + i * 0.13);
			ctx.moveTo(x - 10, y + h + 10);
			for (let px = 0; px <= 6; px++) {
				ctx.lineTo(x + (w * px) / 6, base - (px % 2 ? 30 + rand() * 55 : rand() * 22));
			}
			ctx.lineTo(x + w + 10, y + h + 10);
			ctx.closePath();
			ctx.fill();
		}
	} else if (variant === 1) {
		// arcane orbits
		ctx.strokeStyle = `hsla(${(hue + 120) % 360}, 75%, 68%, 0.8)`;
		for (let i = 0; i < 4; i++) {
			ctx.lineWidth = 2 + rand() * 4;
			ctx.beginPath();
			ctx.ellipse(x + w / 2, y + h * 0.52, w * (0.12 + i * 0.11), h * (0.07 + i * 0.09),
				rand() * Math.PI, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fillStyle = `hsla(${(hue + 200) % 360}, 85%, 75%, 0.95)`;
			const a = rand() * Math.PI * 2;
			ctx.beginPath();
			ctx.arc(x + w / 2 + Math.cos(a) * w * (0.12 + i * 0.11), y + h * 0.52 + Math.sin(a) * h * (0.07 + i * 0.09),
				4 + rand() * 5, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = `hsla(${hue}, 80%, 70%, 0.9)`;
		ctx.beginPath();
		ctx.arc(x + w / 2, y + h * 0.52, 18 + rand() * 12, 0, Math.PI * 2);
		ctx.fill();
	} else if (variant === 2) {
		// crystal shards
		for (let i = 0; i < 7; i++) {
			const cx = x + rand() * w, cy = y + h * 0.45 + rand() * h * 0.5;
			const sw = 16 + rand() * 34, sh = 50 + rand() * 90;
			ctx.fillStyle = `hsla(${(hue + i * 22) % 360}, 62%, ${45 + rand() * 25}%, 0.9)`;
			ctx.beginPath();
			ctx.moveTo(cx, cy - sh);
			ctx.lineTo(cx + sw / 2, cy);
			ctx.lineTo(cx, cy + sh * 0.25);
			ctx.lineTo(cx - sw / 2, cy);
			ctx.closePath();
			ctx.fill();
		}
	} else {
		// standing stones
		for (let i = 0; i < 5; i++) {
			const bx = x + w * (0.12 + i * 0.19), bw = 26 + rand() * 26, bh = h * (0.3 + rand() * 0.4);
			ctx.fillStyle = `hsla(${hue}, 28%, ${30 + rand() * 16}%, 0.95)`;
			roundRect(ctx, bx - bw / 2, y + h - bh, bw, bh + 10, 10);
			ctx.fill();
		}
		ctx.strokeStyle = `hsla(${(hue + 160) % 360}, 80%, 70%, 0.85)`;
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(x + w / 2, y + h * 0.42, 30 + rand() * 16, 0, Math.PI * 2);
		ctx.stroke();
	}
	// drifting specks
	for (let i = 0; i < 26; i++) {
		ctx.fillStyle = `hsla(${(hue + 180) % 360}, 80%, 82%, ${0.25 + rand() * 0.5})`;
		ctx.beginPath();
		ctx.arc(x + rand() * w, y + rand() * h, 1 + rand() * 2.2, 0, Math.PI * 2);
		ctx.fill();
	}
	// type-family tint so card families read together
	ctx.fillStyle = typeCol + '22';
	ctx.fillRect(x, y, w, h);
}

function statPlate(ctx, cx, cy, r, color, text, textColor = '#fff') {
	const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r);
	g.addColorStop(0, shade(color, 1.6));
	g.addColorStop(1, shade(color, 0.65));
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.75)';
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.strokeStyle = 'rgba(255,255,255,0.35)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
	ctx.stroke();
	ctx.font = `bold ${Math.round(r * 1.15)}px Georgia`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 6;
	ctx.strokeStyle = '#000';
	ctx.strokeText(text, cx, cy + 2);
	ctx.fillStyle = textColor;
	ctx.fillText(text, cx, cy + 2);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
}

// opts: { attack, hp, maxHealth, durability, progress, goal, loyalty }
export function drawCardFace(card, opts = {}) {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');

	const rarity = RARITY_COLORS[card.rarity] || RARITY_COLORS.common;
	const typeCol = TYPE_COLORS[card.type] || '#444';
	const classCol = CLASS_COLORS[card.cardClass || 'neutral'] || CLASS_COLORS.neutral;

	// frame body carries the CLASS color; banner and border carry the type
	const body = ctx.createLinearGradient(0, 0, 0, H);
	body.addColorStop(0, shade(classCol, 1.0));
	body.addColorStop(0.5, shade(classCol, 0.55));
	body.addColorStop(1, shade(classCol, 0.78));
	ctx.fillStyle = body;
	roundRect(ctx, 6, 6, W - 12, H - 12, 30);
	ctx.fill();
	// metallic border in the type color, rarity pinline inside it
	const metal = ctx.createLinearGradient(0, 0, W, H);
	metal.addColorStop(0, shade(typeCol, 1.7));
	metal.addColorStop(0.5, shade(typeCol, 0.8));
	metal.addColorStop(1, shade(typeCol, 1.5));
	ctx.strokeStyle = metal;
	ctx.lineWidth = 12;
	roundRect(ctx, 12, 12, W - 24, H - 24, 26);
	ctx.stroke();
	ctx.strokeStyle = rarity;
	ctx.lineWidth = 3;
	roundRect(ctx, 22, 22, W - 44, H - 44, 20);
	ctx.stroke();

	// art window: arched oval
	ctx.save();
	ctx.beginPath();
	ctx.ellipse(W / 2, 236, 204, 168, 0, 0, Math.PI * 2);
	ctx.clip();
	paintArt(ctx, card, W / 2 - 204, 236 - 168, 408, 336);
	ctx.restore();
	ctx.strokeStyle = metal;
	ctx.lineWidth = 8;
	ctx.beginPath();
	ctx.ellipse(W / 2, 236, 204, 168, 0, 0, Math.PI * 2);
	ctx.stroke();

	// name banner: gently curved ribbon
	const bTop = 396, bBot = 462;
	ctx.beginPath();
	ctx.moveTo(30, bTop + 18);
	ctx.quadraticCurveTo(W / 2, bTop - 16, W - 30, bTop + 18);
	ctx.lineTo(W - 30, bBot - 6);
	ctx.quadraticCurveTo(W / 2, bBot + 20, 30, bBot - 6);
	ctx.closePath();
	const banner = ctx.createLinearGradient(0, bTop, 0, bBot);
	banner.addColorStop(0, shade(typeCol, 1.55));
	banner.addColorStop(1, shade(typeCol, 0.7));
	ctx.fillStyle = banner;
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.7)';
	ctx.lineWidth = 4;
	ctx.stroke();

	// name (shrink to fit)
	let size = 38;
	ctx.font = `bold ${size}px Georgia`;
	while (ctx.measureText(card.name).width > W - 120 && size > 19) {
		size -= 2;
		ctx.font = `bold ${size}px Georgia`;
	}
	ctx.textAlign = 'center';
	ctx.lineWidth = 6;
	ctx.strokeStyle = 'rgba(0,0,0,0.85)';
	ctx.strokeText(card.name, W / 2, 440);
	ctx.fillStyle = '#f4eede';
	ctx.fillText(card.name, W / 2, 440);
	ctx.textAlign = 'left';

	// rarity gem under the banner
	const rg = ctx.createRadialGradient(W / 2 - 4, 476, 2, W / 2, 480, 16);
	rg.addColorStop(0, '#fff');
	rg.addColorStop(0.35, rarity);
	rg.addColorStop(1, shade(rarity, 0.4));
	ctx.fillStyle = rg;
	ctx.beginPath();
	ctx.arc(W / 2, 480, 15, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.7)';
	ctx.lineWidth = 3;
	ctx.stroke();

	// body panel with the rules gem (or an empty etched socket for vanilla)
	roundRect(ctx, 60, 498, W - 120, 132, 18);
	ctx.fillStyle = 'rgba(10,7,16,0.32)';
	ctx.fill();
	const gx = RULES_GEM.x * W, gy = RULES_GEM.y * H, gr = RULES_GEM.r * W;
	if (hasRules(card)) {
		// iridescent gem base (the live color-shift is layered on top in-scene)
		ctx.save();
		ctx.beginPath();
		ctx.arc(gx, gy, gr, 0, Math.PI * 2);
		ctx.clip();
		let irid;
		if (ctx.createConicGradient) {
			irid = ctx.createConicGradient(0, gx, gy);
			['#ff5f4f', '#ffd25f', '#57e389', '#4fc3ff', '#8f6fff', '#ff5fd2', '#ff5f4f']
				.forEach((col, i, a) => irid.addColorStop(i / (a.length - 1), col));
		} else {
			irid = ctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
			irid.addColorStop(0, '#fff');
			irid.addColorStop(1, '#8f6fff');
		}
		ctx.fillStyle = irid;
		ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
		const sheen = ctx.createRadialGradient(gx - gr * 0.4, gy - gr * 0.45, 2, gx, gy, gr * 1.1);
		sheen.addColorStop(0, 'rgba(255,255,255,0.95)');
		sheen.addColorStop(0.35, 'rgba(255,255,255,0.12)');
		sheen.addColorStop(1, 'rgba(0,0,0,0.45)');
		ctx.fillStyle = sheen;
		ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
		ctx.restore();
	} else {
		ctx.strokeStyle = 'rgba(255,255,255,0.12)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(gx, gy, gr * 0.55, 0, Math.PI * 2);
		ctx.stroke();
	}
	// gem socket ring
	ctx.strokeStyle = metal;
	ctx.lineWidth = 6;
	ctx.beginPath();
	ctx.arc(gx, gy, gr + 3, 0, Math.PI * 2);
	ctx.stroke();

	// mana cost gem (drawn late so it sits over the frame)
	const mg = ctx.createRadialGradient(52, 50, 6, 64, 64, 54);
	mg.addColorStop(0, '#9db9ff');
	mg.addColorStop(0.5, '#1c4fd6');
	mg.addColorStop(1, '#0d2a78');
	ctx.fillStyle = mg;
	ctx.beginPath();
	ctx.arc(64, 64, 50, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.75)';
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.font = 'bold 58px Georgia';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 7;
	ctx.strokeStyle = '#000';
	ctx.strokeText(String(card.cost ?? ''), 64, 68);
	ctx.fillStyle = '#fff';
	ctx.fillText(String(card.cost ?? ''), 64, 68);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// tribe / quest progress plate at the very bottom center
	if (opts.goal != null) {
		roundRect(ctx, W / 2 - 78, H - 92, 156, 52, 12);
		ctx.fillStyle = shade(TYPE_COLORS.quest, 0.8);
		ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.7)';
		ctx.lineWidth = 3;
		ctx.stroke();
		ctx.font = 'bold 36px Georgia';
		ctx.textAlign = 'center';
		ctx.fillStyle = '#fff';
		ctx.fillText(`${opts.progress ?? 0} / ${opts.goal}`, W / 2, H - 54);
		ctx.textAlign = 'left';
	} else if (card.tribe) {
		roundRect(ctx, W / 2 - 90, H - 78, 180, 40, 18);
		ctx.fillStyle = 'rgba(0,0,0,0.65)';
		ctx.fill();
		ctx.strokeStyle = metal;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.font = 'italic 25px Georgia';
		ctx.textAlign = 'center';
		ctx.fillStyle = '#d9d2ea';
		ctx.fillText(card.tribe, W / 2, H - 49);
		ctx.textAlign = 'left';
	}

	// stat plates
	if (card.type === 'creature') {
		const atk = opts.attack ?? card.attack ?? 0;
		const health = opts.hp ?? card.health ?? 0;
		const damaged = opts.maxHealth != null && health < opts.maxHealth;
		statPlate(ctx, 62, H - 62, 50, '#b3902e', String(atk));
		statPlate(ctx, W - 62, H - 62, 50, '#b3402e', String(health), damaged ? '#ffb0a5' : '#fff');
	} else if (card.type === 'weapon') {
		const atk = opts.attack ?? card.attack ?? 0;
		const dur = opts.durability ?? card.durability ?? 0;
		statPlate(ctx, 62, H - 62, 50, '#b3902e', String(atk));
		statPlate(ctx, W - 62, H - 62, 50, '#5e6a72', String(dur));
	} else if (card.type === 'planeswalker') {
		statPlate(ctx, W - 62, H - 62, 50, '#5a2e7a', String(opts.loyalty ?? card.loyalty ?? 0));
	}

	return c;
}

export function makeFaceTexture(card, opts = {}) {
	const tex = new THREE.CanvasTexture(drawCardFace(card, opts));
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

export function makeBackTexture() {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');
	const bg = ctx.createLinearGradient(0, 0, W, H);
	bg.addColorStop(0, '#241a3e');
	bg.addColorStop(1, '#120c22');
	ctx.fillStyle = bg;
	roundRect(ctx, 4, 4, W - 8, H - 8, 30);
	ctx.fill();
	ctx.strokeStyle = '#5a4a8a';
	ctx.lineWidth = 12;
	roundRect(ctx, 14, 14, W - 28, H - 28, 26);
	ctx.stroke();
	ctx.strokeStyle = '#8f6fff';
	ctx.lineWidth = 8;
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(W / 2 + Math.cos(a) * 120, H / 2 + Math.sin(a) * 120);
		ctx.lineTo(W / 2 + Math.cos(a) * 150, H / 2 + Math.sin(a) * 150);
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = '#c9b8ff';
	ctx.font = 'bold 44px Georgia';
	ctx.textAlign = 'center';
	ctx.fillText('MAGEPUNK', W / 2, H / 2 + 14);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}
