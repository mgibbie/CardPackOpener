// battleui.js — the battle scene's presentation layer, ported from the
// Love2D battle UI (pokemon_ui.lua + battle_anim.lua): dark rounded panels,
// type-colored move buttons, status/stat badges, HP+XP bars, team dots,
// sprite platforms with a type glow, and the m6x11plus pixel font.
// Draws at FULL canvas resolution (the overworld's 3x screen), not the
// 240x160 pixel frame, so text is crisp and buttons are finger-sized.
// The look is the site's Balatro-style kit (site/ui/canvas.js): Micatro's palette,
// panels and buttons on a darker lip, white m6x11 text with a drop shadow. The
// battle scenery and sprites are untouched; only this chrome changed.
import * as BC from '../site/ui/canvas.js';

export const TYPE_COLORS = {
	Normal: '#a8a090', Fire: '#f08030', Water: '#6890f0', Electric: '#f8d030',
	Grass: '#78c850', Ice: '#98d8d8', Fighting: '#c03028', Poison: '#a040a0',
	Ground: '#e0c068', Flying: '#a890f0', Psychic: '#f85888', Bug: '#a8b820',
	Rock: '#b8a038', Ghost: '#705898', Dragon: '#7038f8', Dark: '#705848',
	Steel: '#b8b8d0', Fairy: '#ee99ac',
};

// the kit's tokens (balatro.css --bal-*) under the names every caller already reads
export const C = {
	text: BC.C.text, dim: 'rgba(255,255,255,0.7)', faint: 'rgba(255,255,255,0.5)',
	accent: BC.C.attn, panel: BC.C.panel, panelBorder: BC.C.panelLine,
	btn: BC.C.grey, btnHover: '#6f8488',
	hpGreen: BC.C.green, hpYellow: BC.C.gold, hpRed: BC.C.red, barBg: BC.C.panelDD,
	xp: BC.C.blue,
	statUp: BC.C.green, statDown: BC.C.red,
	textSoft: BC.C.textSoft, money: BC.C.money,
};

export const STATUS_BADGE = {
	par: '#f2d933', brn: '#f26633', psn: '#b34dcc', slp: '#9999b3', frz: '#66ccf2',
};

// Per-species battle-sprite tuning, hand-adjusted in the ?spritetune=1 overlay:
// { speciesId: { front: {s, x, y}, back: {s, x, y} } } — s multiplies the
// sprite's drawn scale (on top of battleScale), x/y nudge it in scene units (u).
// Sparse: untuned species render exactly as before. Live singleton — the tuner
// mutates it and the battle scene picks the change up next frame.
export const SPRITE_TUNING = {};
const _stBase = (() => { try { return new URL('.', import.meta.url).href; } catch (e) { return ''; } })();
// committed file first, then the server override on top (per species) — the
// override is what the owner saves from the LIVE ?spritetune=1 overlay
Promise.allSettled([
	fetch(_stBase + 'sprite_tuning.json').then(r => (r.ok ? r.json() : {})),
	fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"tuning-get"}' })
		.then(r => (r.ok ? r.json() : {})).then(d => d.sprite || {}),
]).then(([f, o]) => Object.assign(SPRITE_TUNING, f.value || {}, o.value || {}));

// Scene geometry, shared by battle.js and pvp.js. Landscape keeps the GBA
// 3:2 layout (unit = height/480, 118u bottom bar) byte-for-byte. On portrait
// phones main.js frees the canvas from the 3:2 frame and lets it fill the
// screen; there the unit comes from the WIDTH (the constraining axis) and the
// bottom bar becomes a tall thumb deck — 512 units across means a 390px-wide
// phone gets ~0.76 CSS px per unit, so a 58u button clears the 44px minimum.
export function layout(W, H) {
	const portrait = H > W;
	const u = portrait ? W / 512 : H / 480;
	// ubar scales ONLY the bottom bar. A wide-short canvas (aspect > 1.7 = a
	// landscape phone freed from the 3:2 frame; the GBA frame is exactly 1.5,
	// so desktop stays untouched) keeps the scene unit but draws the bar half
	// again as large, lifting its buttons from ~29 to ~44 CSS px.
	const compact = !portrait && W / H > 1.7;
	const ubar = compact ? u * 1.5 : u;
	const barH = portrait ? 270 * u : 118 * ubar;
	return { portrait, compact, u, ubar, barH, barY: H - barH };
}

export function rr(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

export function panel(ctx, x, y, w, h, r = 8, opts = {}) {
	// the Balatro box (site/ui/canvas.js): a darker lip under the face and an inner
	// outline. Callers pass the corner as ~8-10 scene units, so the unit is
	// recovered from it and every existing call keeps its signature.
	const k = Math.max(0.2, r / 10);
	BC.panel(ctx, x, y, w, h, k, { r: r / k, lip: 5, ...opts });
}

export function bar(ctx, x, y, w, h, frac, color, r = 3) {
	BC.bar(ctx, x, y, w, h, frac, 1, { color, back: C.barBg });
}

export const hpColor = frac => frac > 0.5 ? C.hpGreen : frac > 0.2 ? C.hpYellow : C.hpRed;
// lerp two #rrggbb colors (t = 0 → a, 1 → b) — used for the low-HP pulse
function mix(a, b, t) {
	const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
	const l = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
	return `rgb(${l(16)},${l(8)},${l(0)})`;
}
// a #rrggbb darkened by f (0.72 = 28% darker): the lip under a coloured face
export function shade(hex, f = 0.72) {
	if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return BC.C.panelDD;
	const n = parseInt(hex.slice(1), 16);
	const c = (sh) => Math.round(((n >> sh) & 255) * f).toString(16).padStart(2, '0');
	return '#' + c(16) + c(8) + c(0);
}
// pale faces (Electric, Ice, Normal...) take the kit's dark text, like Balatro's white boxes
function pale(hex) {
	if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return false;
	const n = parseInt(hex.slice(1), 16);
	return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.66;
}
const pxOf = f => +(/(\d+(?:\.\d+)?)px/.exec(f || '') || [0, 12])[1];

// the Balatro label (canvas.js text): m6x11, white, a drop shadow. size is in the
// caller's unit (so `text(ctx, s, x, y, ub, {size: 17})` draws the old 17*ub px)
export const text = BC.text;
export const font = BC.font;

export function badge(ctx, x, y, w, h, color, label, fnt) {
	// a Balatro chip: the colour on a darker lip, a white label (dark on a pale colour)
	const lip = Math.max(1, h * 0.14), r = h * 0.4;
	ctx.save();
	ctx.fillStyle = shade(color, 0.7);
	rr(ctx, x, y + lip, w, h - lip, r); ctx.fill();
	ctx.fillStyle = color;
	rr(ctx, x, y, w, h - lip, r); ctx.fill();
	ctx.restore();
	const p = pale(color);
	BC.text(ctx, label, x + w / 2, y + (h - lip) / 2 + 0.5, 1, { size: pxOf(fnt), align: 'center', baseline: 'middle',
		color: p ? BC.C.textDark : C.text, shadow: !p, maxW: w - 2 });
}

// one mon's info panel; opts: { showXP, showNumbers, shownHP, boosts, expFrac }
export function monPanel(ctx, mon, x, y, w, u, opts = {}) {
	const h = (opts.showXP ? 96 : 78) * u;
	panel(ctx, x, y, w, h, 8 * u);
	const pad = 10 * u;
	// self-contained text alignment: the name/gender are drawn before the first
	// explicit textAlign below, so a caller that leaves ctx.textAlign as 'center'
	// (e.g. the PokéChess capture battle) would otherwise centre the name on x+pad
	// and clip it off the box's left edge. Lock both to the panel's assumptions.
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	const nameW = BC.text(ctx, (mon.shiny ? '★' : '') + mon.name, x + pad, y + pad + 13 * u, u, { size: 17, align: 'left', baseline: 'alphabetic' });
	// gender mark right after the name, GBA-colored
	if (mon.gender) {
		BC.text(ctx, mon.gender === 'M' ? '♂' : '♀', x + pad + nameW + 5 * u, y + pad + 13 * u, u,
			{ size: 15, color: mon.gender === 'M' ? '#5fb4ff' : '#ff8fb0' });
	}
	BC.text(ctx, `Lv${mon.level}`, x + w - pad, y + pad + 12 * u, u, { size: 13, align: 'right', color: BC.C.money });
	ctx.textAlign = 'left';
	// status badge under the level
	if (mon.status) {
		badge(ctx, x + w - pad - 34 * u, y + pad + 18 * u, 34 * u, 15 * u,
			STATUS_BADGE[mon.status] || '#999',
			{ par: 'PAR', brn: 'BRN', psn: 'PSN', slp: 'SLP', frz: 'FRZ' }[mon.status],
			`${Math.round(11 * u)}px m6x11plus, monospace`);
	}
	// type badges
	let tx = x + pad;
	for (const t of mon.types) {
		badge(ctx, tx, y + pad + 18 * u, 44 * u, 15 * u, TYPE_COLORS[t] || '#888', t.toUpperCase().slice(0, 8),
			`${Math.round(10 * u)}px m6x11plus, monospace`);
		tx += 48 * u;
	}
	// stat-stage chips
	if (opts.boosts) {
		const order = [['atk', 'ATK'], ['def', 'DEF'], ['spa', 'SPA'], ['spd', 'SPD'], ['spe', 'SPE'], ['acc', 'ACC'], ['eva', 'EVA']];
		for (const [k, label] of order) {
			const v = opts.boosts[k] || 0;
			if (!v) continue;
			if (tx > x + w - 40 * u) break;
			const col = v > 0 ? C.statUp : C.statDown;
			badge(ctx, tx, y + pad + 18 * u, 36 * u, 15 * u, col,
				label + (v > 0 ? '+' : '') + v, `${Math.round(9 * u)}px m6x11plus, monospace`);
			tx += 40 * u;
		}
	}
	// HP bar, in a dark well like Balatro's number slots
	const shown = opts.shownHP ?? mon.curHP;
	const frac = Math.max(0, shown / mon.maxHP);
	const barW = w - pad * 2 - (opts.showNumbers ? 74 * u : 0);
	const hpY = y + h - (opts.showXP ? 38 : 24) * u;
	// low-HP pulse: brighten the red bar toward white on the caller's sine (Batch 5)
	let hpCol = hpColor(frac);
	if (opts.pulse) hpCol = mix(hpCol, '#ffffff', 0.55 * opts.pulse);
	bar(ctx, x + pad, hpY, barW, 11 * u, frac, hpCol, 4 * u);
	// (drawn after the HP bar so the bar's rounded well never covers the text's descenders)
	// ability + held item under the level, dim (matches the Love2D panel).
	// Baseline 43u: at 46u the text sat on the HP bar's top edge whenever the
	// bar ran full width (no showNumbers gutter — every foe panel).
	// ownerTag names an in-game partner's mon ("STEVEN'S") in the same slot
	if (opts.abilityName || opts.ownerTag) {
		BC.text(ctx, opts.ownerTag || (opts.abilityName + (opts.itemName ? ' · ' + opts.itemName : '')), x + w - pad, y + pad + 43 * u, u,
			{ size: 10, align: 'right', color: C.faint, shadow: false });
	}
	if (opts.showNumbers) {
		BC.text(ctx, `${Math.round(Math.max(0, shown))}/${mon.maxHP}`, x + w - pad, hpY + 10 * u, u, { size: 12, align: 'right' });
	}
	if (opts.showXP) {
		bar(ctx, x + pad, y + h - 18 * u, barW, 6 * u, opts.expFrac ?? 0, C.xp, 2 * u);
		BC.text(ctx, 'EXP', x + w - pad, y + h - 12 * u, u, { size: 10, align: 'right', color: C.faint, shadow: false });
	}
	ctx.textAlign = 'left';
	return h;
}

// team dots (filled = healthy, dark = fainted, white ring = active)
export function teamDots(ctx, mons, active, x, y, u) {
	mons.forEach((m, i) => {
		const cx = x + i * 18 * u;
		ctx.beginPath();
		ctx.arc(cx, y + 1.5 * u, 6 * u, 0, Math.PI * 2);   // the dot's lip
		ctx.fillStyle = m.curHP > 0 ? BC.C.greenD : BC.C.panelDD;
		ctx.fill();
		ctx.beginPath();
		ctx.arc(cx, y, 6 * u, 0, Math.PI * 2);
		ctx.fillStyle = m.curHP > 0 ? C.hpGreen : BC.C.disabled;
		ctx.fill();
		if (m === active) {
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2 * u;
			ctx.stroke();
		}
	});
}

// the face/lip pair a button draws in: b.color (a kit colour name or [face, lip]),
// else its move type's colour, else the kit's grey
export function buttonColors(b) {
	if (b.disabled) return BC.BUTTON.disabled;
	if (Array.isArray(b.color)) return b.color;
	if (b.color && BC.BUTTON[b.color]) return BC.BUTTON[b.color];
	if (b.type && TYPE_COLORS[b.type]) return [TYPE_COLORS[b.type], shade(TYPE_COLORS[b.type])];
	return BC.BUTTON.grey;
}

// generic button; b: {x,y,w,h,label,sub?,right?,type?,color?,disabled?,pressed?}
// Drawn as a Balatro button (site/ui/canvas.js): the face stands on a darker lip
// and sinks when pressed; hover / the keyboard-pad cursor is the white ring.
// The box (x, y, w, h) includes the lip, so every hit test is unchanged.
export function button(ctx, b, hovered, u) {
	const [face, lipC] = buttonColors(b);
	const lip = Math.max(3 * u, Math.min(7 * u, b.h * 0.15));
	const sink = b.pressed && !b.disabled ? lip * 0.7 : 0;
	BC.button(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, color: [face, lipC], pressed: !!b.pressed && !b.disabled,
		focused: !!hovered && !b.disabled, hovered: !!hovered }, u);
	// the kit's own colours always take white text (as Balatro's orange / gold buttons do);
	// only a pale move-type face (Electric, Ice...) switches to the dark text
	const dark = !b.disabled && !b.color && pale(face);
	const col = b.disabled ? BC.C.disabledText : dark ? BC.C.textDark : C.text;
	const soft = b.disabled ? BC.C.disabledText : dark ? 'rgba(40,52,56,0.85)' : C.dim;
	const top = b.y + sink, fh = b.h - lip;
	const size = b.big ? 17 : 14;
	const lx = b.x + (b.iconPad || 9 * u); // iconPad: leave room for a left-aligned icon
	const typeW = b.type ? 52 * u : 0;
	if (b.center) {
		BC.text(ctx, b.label, b.x + b.w / 2, top + fh / 2 + 1 * u, u, { size, align: 'center', baseline: 'middle', color: col, shadow: !dark, maxW: b.w - 10 * u });
	} else {
		BC.text(ctx, b.label, lx, top + Math.min(17 * u, fh * 0.5), u, { size, color: col, shadow: !dark, maxW: Math.max(20 * u, b.w - (lx - b.x) - typeW - 6 * u) });
	}
	if (b.sub) {
		// a caller's own sub colour (a red "PP 0/10") wins over the soft default
		const sc = b.disabled ? soft : (b.subColor && b.subColor !== C.dim ? b.subColor : soft);
		BC.text(ctx, b.sub, lx, top + fh - 6 * u, u, { size: 11, color: sc, shadow: false });
	}
	if (b.right) {
		BC.text(ctx, b.right, b.x + b.w - 8 * u, top + fh - 6 * u, u, { size: 11, align: 'right', color: soft, shadow: false });
	}
	if (b.type) {
		// the type chip, a dark pill on the type-coloured face
		const cx = b.x + b.w - 52 * u, cy = top + 6 * u;
		ctx.save();
		ctx.fillStyle = 'rgba(0,0,0,0.24)';
		rr(ctx, cx, cy, 44 * u, 14 * u, 7 * u); ctx.fill();
		ctx.restore();
		BC.text(ctx, b.type.toUpperCase().slice(0, 8), cx + 22 * u, cy + 7.5 * u, u, { size: 9, align: 'center', baseline: 'middle', shadow: false });
	}
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
}

// a procedurally drawn poke ball (no asset needed)
export function drawBall(ctx, x, y, r, wobble = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(wobble);
	ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fillStyle = '#e64d4d'; ctx.fill();
	ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fillStyle = '#f2f2f2'; ctx.fill();
	ctx.fillStyle = '#1a1a26';
	ctx.fillRect(-r, -r * 0.14, r * 2, r * 0.28);
	ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
	ctx.beginPath(); ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2); ctx.fillStyle = '#f2f2f2'; ctx.fill();
	ctx.restore();
}

// text wrapping for the message panel
export function wrap(ctx, text, maxW) {
	const words = String(text).split(' ');
	const lines = [];
	let line = '';
	for (const w of words) {
		const probe = line ? line + ' ' + w : w;
		if (ctx.measureText(probe).width > maxW && line) { lines.push(line); line = w; }
		else line = probe;
	}
	if (line) lines.push(line);
	return lines;
}
