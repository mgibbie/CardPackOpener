// cardart.js — canvas-generated card faces shared by the game board, packs,
// deck builder, and gallery. Everything here is drawn procedurally: the frame
// layout follows collectible-card conventions (mana gem top-right, name banner,
// art window, rarity gem, stat plates) but every pixel is ours. Rules text is
// printed in a tan text box (keywords bold); the gallery shows an owned-copies
// badge in the top-left corner.
import * as THREE from 'three';
import { richTokens } from './keywords.js';

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
	// paper-set classes
	magepunk:      '#6b56c2',
	death_knight:  '#3e6a75',
	demon_hunter:  '#295c46',
	sorcerer:      '#7a2e5c',
	wizard:        '#5a4ab5',
	bard:          '#a05a8c',
	barbarian:     '#b04a3a',
	ranger:        '#3d8a6b',
};

// dual classes ('druid__priest') fall back to their first class's color
export function classColorOf(cls) {
	const c = cls || 'neutral';
	return CLASS_COLORS[c] || CLASS_COLORS[c.split('__')[0]] || CLASS_COLORS.neutral;
}
export function classNameOf(cls) {
	const c = cls || 'neutral';
	if (CLASS_NAMES[c]) return CLASS_NAMES[c];
	return c.split('__')
		.map(p => p.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '))
		.join('/');
}
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
	location:    '#2e7a5e',
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

// ---------- real card art (crops from the user's paper scans) ----------
// art/index.json lists ids with a real crop; everything else stays
// procedural. Images load lazily; listeners fire so live faces refresh.
let artIndex = null;
const artImgs = new Map(); // id -> HTMLImageElement
export const artListeners = new Set(); // fn(id) called when an image (or the mana font) arrives

// the Mana font (Andrew Gioia, OFL) so card faces can draw real MTG symbols.
// Its glyph codepoints + the authentic 'cost' circle colours; we load the font
// then repaint every face (artListeners('*')) so the pips upgrade in place.
const MANA_CP = { tap: 0xe61a, W: 0xe600, U: 0xe601, B: 0xe602, R: 0xe603, G: 0xe604, C: 0xe904 };
const MANA_BG = { tap: '#cececa', W: '#f0f2c0', U: '#b5cde3', B: '#aca29a', R: '#db8664', G: '#93b483', C: '#ccc5b9', N: '#ccc5b9' };
let manaReady = false;
if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
	const ff = new FontFace('Mana', 'url(https://cdn.jsdelivr.net/npm/mana-font@1.18.0/fonts/mana.woff2) format("woff2")');
	ff.load().then(f => { document.fonts.add(f); manaReady = true; for (const fn of artListeners) fn('*'); }).catch(() => {});
}

const artIndexReady = fetch('art/index.json')
	.then(r => (r.ok ? r.json() : []))
	.then(ids => { artIndex = new Set(ids); })
	.catch(() => { artIndex = new Set(); });

function artFor(id) {
	if (!artIndex || !artIndex.has(id)) return null;
	let img = artImgs.get(id);
	if (!img) {
		img = new Image();
		img.onload = () => { for (const fn of artListeners) fn(id); };
		img.src = 'art/' + id + '.jpg';
		artImgs.set(id, img);
	}
	return img.complete && img.naturalWidth ? img : null;
}

// wait until the real art for these cards is fully loaded, so a consumer can
// draw the card complete (with its art) instead of flashing the procedural
// fallback first. Resolves immediately for cards that have no crop.
export async function preloadArt(ids) {
	await artIndexReady;
	await Promise.all([...new Set(ids)].map(id => new Promise(res => {
		if (!artIndex.has(id)) return res();
		let img = artImgs.get(id);
		if (!img) { img = new Image(); img.src = 'art/' + id + '.jpg'; artImgs.set(id, img); }
		if (img.complete) return res();
		img.addEventListener('load', () => { for (const fn of artListeners) fn(id); res(); }, { once: true });
		img.addEventListener('error', () => res(), { once: true });
	})));
}

// an original gold coin, drawn for The Coin
function paintCoin(ctx, x, y, w, h) {
	const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.34;
	// warm vault backdrop
	const bg = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, Math.max(w, h) * 0.7);
	bg.addColorStop(0, '#3a2f14');
	bg.addColorStop(1, '#160f06');
	ctx.fillStyle = bg;
	ctx.fillRect(x, y, w, h);
	// scattered sparkle
	for (let i = 0; i < 14; i++) {
		const a = i * 2.399, rr = r * (1.2 + (i % 5) * 0.28);
		ctx.fillStyle = `rgba(255,225,150,${0.18 + (i % 3) * 0.12})`;
		ctx.beginPath();
		ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, 2 + (i % 3), 0, Math.PI * 2);
		ctx.fill();
	}
	// coin body
	const gold = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
	gold.addColorStop(0, '#fff4c2');
	gold.addColorStop(0.45, '#f2c94c');
	gold.addColorStop(0.85, '#c8962a');
	gold.addColorStop(1, '#8a5f18');
	ctx.fillStyle = gold;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	// rim
	ctx.lineWidth = r * 0.12;
	ctx.strokeStyle = '#a9781f';
	ctx.stroke();
	ctx.lineWidth = r * 0.04;
	ctx.strokeStyle = 'rgba(255,240,190,0.7)';
	ctx.beginPath();
	ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
	ctx.stroke();
	// embossed mana crystal in the centre
	ctx.save();
	ctx.translate(cx, cy);
	const gem = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
	gem.addColorStop(0, '#bfe0ff');
	gem.addColorStop(0.5, '#3f8fe0');
	gem.addColorStop(1, '#14508f');
	ctx.fillStyle = gem;
	ctx.beginPath();
	ctx.moveTo(0, -r * 0.52);
	ctx.lineTo(r * 0.34, -r * 0.1);
	ctx.lineTo(0, r * 0.52);
	ctx.lineTo(-r * 0.34, -r * 0.1);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = 'rgba(10,30,60,0.6)';
	ctx.lineWidth = r * 0.05;
	ctx.stroke();
	ctx.restore();
	// top-left glint
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	ctx.beginPath();
	ctx.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2);
	ctx.fill();
}

// deterministic per-card generative art, painted inside the art window clip
function paintArt(ctx, card, x, y, w, h) {
	// real art wins when it's ready: cover-fit the crop into the window
	const img = artFor(card.id);
	if (img) {
		const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
		const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
		ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
		return;
	}
	// The Coin: an original procedurally-drawn gold coin (no external art)
	if (card.id === 'coin') { paintCoin(ctx, x, y, w, h); return; }
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

// wrap rules text (keyword runs bold, inline mana/tap pips) as black text inside
// a box, shrinking the font until it fits and centring it vertically
const _meas = document.createElement('canvas').getContext('2d');
function drawPip(ctx, tok, cx, cy, size) {
	const key = tok.key;
	const r = size * 0.58;
	// the coloured cost circle
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = MANA_BG[key === 'N' ? 'N' : key] || MANA_BG.N;
	ctx.fill();
	ctx.lineWidth = Math.max(1, size * 0.06);
	ctx.strokeStyle = 'rgba(0,0,0,0.4)';
	ctx.stroke();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241f18';
	const cp = key === 'N' ? 0xe605 + Math.min(9, Math.max(0, parseInt(tok.label, 10) || 0)) : MANA_CP[key];
	if (manaReady && cp) {
		// the real MTG symbol glyph from the Mana font
		ctx.font = `${Math.round(size * 0.98)}px "Mana"`;
		ctx.fillText(String.fromCharCode(cp), cx, cy + size * 0.02);
	} else {
		// fallback until the font finishes loading: a letter / number / tap mark
		ctx.font = `bold ${Math.round(size * 0.72)}px 'Segoe UI Symbol', Georgia, sans-serif`;
		ctx.fillText(key === 'tap' ? '⟳' : tok.label, cx, cy + size * 0.03);
	}
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
}
function drawRulesText(ctx, tokens, x, y, w, h) {
	const F = (size, b) => `${b ? 'bold ' : ''}${size}px Georgia`;
	const noSpace = t => /^[,.;:!?)%]/.test(t);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillStyle = '#141018';
	for (let size = 23; size >= 11; size--) {
		const lineH = Math.round(size * 1.22), spaceW = size * 0.3, pipW = size * 1.24;
		const widthOf = tk => { if (tk.kind === 'sym') return pipW; _meas.font = F(size, tk.bold); return _meas.measureText(tk.text).width; };
		const lines = [[]]; let lineW = 0;
		for (const tk of tokens) {
			if (tk.kind === 'br') { lines.push([]); lineW = 0; continue; } // hard line break
			const iw = widthOf(tk);
			const cur = lines[lines.length - 1];
			const punct = tk.kind === 'word' && noSpace(tk.text);
			const need = (cur.length && !punct ? spaceW : 0) + iw;
			if (lineW + need > w && cur.length) { lines.push([tk]); lineW = iw; }
			else { cur.push(tk); lineW += need; }
		}
		if (lines.length * lineH > h) continue;
		let ly = y + Math.max(0, (h - lines.length * lineH) / 2);
		for (const line of lines) {
			let lx = x;
			for (let i = 0; i < line.length; i++) {
				const tk = line[i];
				const punct = tk.kind === 'word' && noSpace(tk.text);
				if (i && !punct) lx += spaceW;
				if (tk.kind === 'sym') { drawPip(ctx, tk, lx + size * 0.56, ly + size * 0.5, size); lx += pipW; }
				else { ctx.font = F(size, tk.bold); ctx.fillStyle = '#141018'; ctx.fillText(tk.text, lx, ly); lx += ctx.measureText(tk.text).width; }
			}
			ly += lineH;
		}
		break;
	}
	ctx.textBaseline = 'alphabetic';
}

// opts: { attack, hp, maxHealth, durability, progress, goal, loyalty, count }
export function drawCardFace(card, opts = {}) {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');

	const rarity = RARITY_COLORS[card.rarity] || RARITY_COLORS.common;
	const typeCol = TYPE_COLORS[card.type] || '#444';
	const classCol = classColorOf(card.cardClass);

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

	// rules text box: black text on light tan, keywords bold (no more gem)
	const rbX = 60, rbY = 498, rbW = W - 120, rbH = 132;
	roundRect(ctx, rbX, rbY, rbW, rbH, 16);
	ctx.fillStyle = '#efe6cf';
	ctx.fill();
	ctx.strokeStyle = shade(typeCol, 0.5);
	ctx.lineWidth = 4;
	roundRect(ctx, rbX, rbY, rbW, rbH, 16);
	ctx.stroke();
	if (hasRules(card)) {
		drawRulesText(ctx, richTokens((card.description || '').trim()), rbX + 16, rbY + 12, rbW - 32, rbH - 22);
	}

	// mana cost gem — TOP RIGHT now (drawn late so it sits over the frame)
	const mgx = W - 64, mgy = 64;
	const mg = ctx.createRadialGradient(mgx - 12, mgy - 14, 6, mgx, mgy, 54);
	mg.addColorStop(0, '#9db9ff');
	mg.addColorStop(0.5, '#1c4fd6');
	mg.addColorStop(1, '#0d2a78');
	ctx.fillStyle = mg;
	ctx.beginPath();
	ctx.arc(mgx, mgy, 50, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.75)';
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.font = 'bold 58px Georgia';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 7;
	ctx.strokeStyle = '#000';
	ctx.strokeText(String(card.cost ?? ''), mgx, mgy + 4);
	ctx.fillStyle = '#fff';
	ctx.fillText(String(card.cost ?? ''), mgx, mgy + 4);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// owned-copies badge — TOP LEFT (gallery passes opts.count)
	if (opts.count != null) {
		const bx = 64, by = 64;
		ctx.fillStyle = 'rgba(16,12,26,0.92)';
		roundRect(ctx, bx - 46, by - 28, 92, 56, 14);
		ctx.fill();
		ctx.strokeStyle = opts.count > 0 ? '#ffd25f' : '#5a5470';
		ctx.lineWidth = 4;
		roundRect(ctx, bx - 46, by - 28, 92, 56, 14);
		ctx.stroke();
		ctx.font = 'bold 40px Georgia';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = opts.count > 0 ? '#ffe9a8' : '#8a84a0';
		ctx.fillText('×' + opts.count, bx, by + 3);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

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
		// a spell's tribe is its school — label it as such ("Frost Spell")
		const isSpell = card.type === 'sorcery' || card.type === 'instant' || card.type === 'secret' || card.type === 'trap';
		const SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];
		const plateLabel = isSpell && SCHOOLS.includes(card.tribe) ? `${card.tribe} Spell` : card.tribe;
		ctx.fillText(plateLabel, W / 2, H - 49);
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
	} else if (card.type === 'location') {
		// remaining taps, weapon-style but in the location green
		const dur = opts.durability ?? card.durability ?? 0;
		statPlate(ctx, W - 62, H - 62, 50, '#2e7a5e', String(dur));
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

// ---------- board tokens: HS-style minion ovals ----------
// once a creature is in play it stops looking like a card: oval art,
// heavy rim, and BIG stat gems that read from across the table
export const TOKEN_W = 512, TOKEN_H = 640;
export const TOKEN_GEM = { x: 0.5, y: 560 / TOKEN_H, r: 42 / TOKEN_W };

// opts: { attack, hp, maxHealth, baseAttack, baseHealth, taunt, shield, stealthed }
export function drawBoardToken(card, opts = {}) {
	const c = document.createElement('canvas');
	c.width = TOKEN_W; c.height = TOKEN_H;
	const ctx = c.getContext('2d');
	const cx = TOKEN_W / 2, cy = 288, rx = 200, ry = 258;

	// taunt: a heavy stone shield ring around the whole token
	if (opts.taunt) {
		ctx.strokeStyle = '#565d68';
		ctx.lineWidth = 34;
		ctx.beginPath(); ctx.ellipse(cx, cy, rx + 24, ry + 24, 0, 0, Math.PI * 2); ctx.stroke();
		ctx.strokeStyle = '#8b93a1';
		ctx.lineWidth = 12;
		ctx.beginPath(); ctx.ellipse(cx, cy, rx + 36, ry + 36, 0, 0, Math.PI * 2); ctx.stroke();
	}
	// divine shield: golden halo
	if (opts.shield) {
		ctx.strokeStyle = 'rgba(255,214,90,0.85)';
		ctx.lineWidth = 22;
		ctx.beginPath(); ctx.ellipse(cx, cy, rx + 18, ry + 18, 0, 0, Math.PI * 2); ctx.stroke();
	}

	// oval art window
	ctx.save();
	ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
	paintArt(ctx, card, cx - rx, cy - ry, rx * 2, ry * 2);
	if (opts.stealthed) {
		ctx.fillStyle = 'rgba(16,16,30,0.55)';
		ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
	}
	ctx.restore();

	// metallic rim (class-tinted)
	ctx.strokeStyle = shade(classColorOf(card.cardClass), 0.5);
	ctx.lineWidth = 16;
	ctx.beginPath(); ctx.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, Math.PI * 2); ctx.stroke();
	ctx.strokeStyle = 'rgba(255,255,255,0.28)';
	ctx.lineWidth = 4;
	ctx.beginPath(); ctx.ellipse(cx, cy, rx - 7, ry - 7, 0, 0, Math.PI * 2); ctx.stroke();

	// BIG stat gems: white normal, green when buffed, red health when hurt
	const baseA = opts.baseAttack ?? opts.attack;
	const baseH = opts.baseHealth ?? opts.maxHealth;
	const atkColor = opts.attack > baseA ? '#7cfc7c' : '#fff';
	const hpColor = opts.hp < opts.maxHealth ? '#ff6257' : (opts.maxHealth > baseH ? '#7cfc7c' : '#fff');
	statPlate(ctx, 88, 538, 84, '#e2a52e', String(opts.attack ?? 0), atkColor);
	statPlate(ctx, TOKEN_W - 88, 538, 84, '#c23b2e', String(opts.hp ?? 0), hpColor);
	return c;
}

export function makeTokenTexture(card, opts) {
	const tex = new THREE.CanvasTexture(drawBoardToken(card, opts));
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// ---------- hero portraits + power orbs (DOM panels) ----------
export function drawHeroPortrait(classId, size = 128) {
	const c = document.createElement('canvas');
	c.width = size; c.height = size;
	const ctx = c.getContext('2d');
	const r = size / 2 - 5;
	ctx.save();
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.clip();
	paintArt(ctx, { id: 'hero_' + (classId || 'neutral'), type: 'creature' }, 0, 0, size, size);
	// grounding vignette
	const v = ctx.createRadialGradient(size / 2, size / 2, r * 0.55, size / 2, size / 2, r);
	v.addColorStop(0, 'rgba(0,0,0,0)');
	v.addColorStop(1, 'rgba(0,0,0,0.45)');
	ctx.fillStyle = v;
	ctx.fillRect(0, 0, size, size);
	ctx.restore();
	ctx.strokeStyle = 'rgba(0,0,0,0.8)';
	ctx.lineWidth = 7;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.stroke();
	ctx.strokeStyle = classColorOf(classId);
	ctx.lineWidth = 4;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.stroke();
	return c;
}

export function drawPowerOrb(cost, size = 96) {
	const c = document.createElement('canvas');
	c.width = size; c.height = size;
	const ctx = c.getContext('2d');
	const r = size / 2 - 5;
	const g = ctx.createRadialGradient(size * 0.38, size * 0.34, r * 0.15, size / 2, size / 2, r);
	g.addColorStop(0, '#8fd0ff');
	g.addColorStop(0.55, '#2c6fd4');
	g.addColorStop(1, '#123058');
	ctx.fillStyle = g;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.fill();
	ctx.strokeStyle = '#b8952e';
	ctx.lineWidth = 5;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.stroke();
	ctx.strokeStyle = 'rgba(255,255,255,0.35)';
	ctx.lineWidth = 2;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r - 4, 0, Math.PI * 2); ctx.stroke();
	ctx.font = `bold ${Math.round(size * 0.42)}px Georgia`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 5;
	ctx.strokeStyle = '#000';
	ctx.strokeText(String(cost), size / 2, size / 2 + 1);
	ctx.fillStyle = '#fff';
	ctx.fillText(String(cost), size / 2, size / 2 + 1);
	return c;
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
