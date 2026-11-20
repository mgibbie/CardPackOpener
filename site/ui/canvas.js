// site/ui/canvas.js — the Balatro-style UI kit for CANVAS UIs (the overworld's menus, Pokémon battles, anything
// drawn on a 2D canvas). The same look as site/ui/balatro.css: the same colours (C below = its --bal-* tokens),
// the m6x11 pixel font, rounded panels on a darker lip, buttons that stand on their darker bottom edge and sink
// when pressed, text with Balatro's drop shadow.
//
// Everything is sized by a unit `u` (canvas px per design px, as overworld/battleui.js and ow_menus.js use it), and
// takes a plain 2D context; no framework, no state. Shapes follow battleui.js's `{x, y, w, h, label}` buttons so a
// caller can switch helper without reshaping its hit boxes.
//
//   import * as BC from '/site/ui/canvas.js';
//   await BC.loadFont();                                         the m6x11 font (once; resolves when usable)
//   BC.panel(ctx, x, y, w, h, u, {fill, lip, outline, r})         a box
//   BC.button(ctx, {x, y, w, h, label, color, pressed, focused, hovered, disabled, size}, u)
//   BC.text(ctx, 'Hello', x, y, u, {size, color, align, baseline, shadow, outline, maxW})
//   BC.bar(ctx, x, y, w, h, frac, u, {color, back})               an HP-like bar
//   BC.tooltip(ctx, x, y, u, {title, body, maxW, anchor})         a small tooltip -> its rect
//   BC.font(px) -> '<px>px m6x11, m6x11plus, monospace'; BC.roundRect(ctx, x, y, w, h, r); BC.hit(b, px, py)

/** The palette (the same values as balatro.css :root --bal-*). */
export const C = {
	blue: '#009dff', blueD: '#0076c2', red: '#fe5f55', redD: '#c0453d', green: '#4bc292', greenD: '#33906b',
	orange: '#fda200', orangeD: '#c27c00', grey: '#5f7377', greyD: '#435357', purple: '#8867a5', purpleD: '#6b4585',
	gold: '#eac058', goldD: '#b48f34', money: '#f3b958', attn: '#ff9a00',
	tarot: '#a782d1', planet: '#13afce', spectral: '#4584fa',
	tabOff: '#7a4b48', tabOffD: '#4f302e', disabled: '#59676a', disabledD: '#3d4749', disabledText: '#b9c3c5',
	panel: '#3a4b4f', panelD: '#2a3739', panelDD: '#1f2a2c', panelLine: '#46595d', edge: '#4f6367', outlineLight: '#bfc7d5',
	text: '#ffffff', textDark: '#4f6367', textMuted: '#9fb0b3', textSoft: '#dfe7e8',
	felt1: '#5a9e83', felt2: '#3f6b5a', felt3: '#23332d', bg: '#2d3d40',
	shadow: 'rgba(0,0,0,0.3)',
};
/** A button colour by name -> [face, lip]. */
export const BUTTON = {
	grey: [C.grey, C.greyD], blue: [C.blue, C.blueD], red: [C.red, C.redD], green: [C.green, C.greenD], orange: [C.orange, C.orangeD],
	purple: [C.purple, C.purpleD], gold: [C.gold, C.goldD], tab: [C.tabOff, C.tabOffD], disabled: [C.disabled, C.disabledD],
};

export const FONT_FAMILY = 'm6x11';
const FONT_URL = new URL('../../micatro/assets/fonts/m6x11plus.ttf?v=2', import.meta.url).href;   // (one URL with micatro.css: one download)
/** A canvas font string. The overworld registers the same file as 'm6x11plus': either name will do. */
export const font = (px) => `${Math.max(1, Math.round(px))}px m6x11, m6x11plus, monospace`;

let fontP = null;
/** Load the m6x11 font for canvas use (document.fonts). Resolves true when it is usable, false if it could not load. */
export function loadFont() {
	if (fontP) return fontP;
	fontP = (async () => {
		try {
			if (document.fonts && document.fonts.check && document.fonts.check(font(16)) && [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === FONT_FAMILY && f.status === 'loaded')) return true;
			const f = new FontFace(FONT_FAMILY, `url(${FONT_URL})`);
			document.fonts.add(f);
			await f.load();
			return true;
		} catch { return false; }
	})();
	return fontP;
}

export function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	r = Math.max(0, Math.min(r, w / 2, h / 2));
	if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
	ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Is (px, py) inside b {x, y, w, h}? */
export const hit = (b, px, py) => !!b && px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h;

/** panel(ctx, x, y, w, h, u, opts) — the Balatro box: a darker lip below (opts.lip design px, default 6), the face
 *  (opts.fill, default the panel grey) and an inner outline (opts.outline: a colour, 'light' = the tooltip / dialog
 *  outline, false = none; default the panel's own line). opts.r = corner radius (design px, default 12). */
export function panel(ctx, x, y, w, h, u, opts = {}) {
	const r = (opts.r == null ? 12 : opts.r) * u, lip = (opts.lip == null ? 6 : opts.lip) * u;
	ctx.save();
	if (lip > 0) { ctx.fillStyle = opts.lipColor || C.panelDD; roundRect(ctx, x, y + lip, w, h, r); ctx.fill(); }
	ctx.fillStyle = opts.fill || C.panel;
	roundRect(ctx, x, y, w, h, r); ctx.fill();
	const line = opts.outline === 'light' ? C.outlineLight : opts.outline === undefined ? C.panelLine : opts.outline;
	if (line) {
		const lw = (opts.outlineWidth || (opts.outline === 'light' ? 3 : 2.5)) * u;
		ctx.strokeStyle = line; ctx.lineWidth = lw;
		roundRect(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, Math.max(0, r - lw / 2)); ctx.stroke();
	}
	ctx.restore();
}

/** text(ctx, str, x, y, u, opts) — the Balatro label: m6x11, white, a drop shadow under it (opts.shadow false to
 *  drop it), or a dark outline (opts.outline: true / a colour) for text over busy art. opts.size in design px
 *  (default 16), align / baseline as canvas, maxW squeezes a long label. Returns the drawn width. */
export function text(ctx, str, x, y, u, opts = {}) {
	str = String(str == null ? '' : str);
	ctx.save();
	ctx.font = font((opts.size || 16) * u);
	ctx.textAlign = opts.align || 'left';
	ctx.textBaseline = opts.baseline || 'alphabetic';
	const maxW = opts.maxW ? opts.maxW : undefined;
	if (opts.outline) {
		ctx.lineJoin = 'round'; ctx.lineWidth = 3 * u; ctx.strokeStyle = opts.outline === true ? 'rgba(0,0,0,0.75)' : opts.outline;
		ctx.strokeText(str, x, y, maxW);
	} else if (opts.shadow !== false) {
		ctx.fillStyle = opts.shadowColor || C.shadow;
		ctx.fillText(str, x, y + Math.max(1, Math.round(0.1 * (opts.size || 16) * u)), maxW);
	}
	ctx.fillStyle = opts.color || C.text;
	ctx.fillText(str, x, y, maxW);
	const w = Math.min(ctx.measureText(str).width, maxW || Infinity);
	ctx.restore();
	return w;
}

/** button(ctx, b, u) — b {x, y, w, h, label, color ('grey'|'blue'|'red'|'green'|'orange'|'purple'|'gold'|'tab' or
 *  [face, lip]), pressed, focused, hovered, disabled, on (a chosen tab: red with a white ring), size (label px), sub}.
 *  The face stands on its darker bottom edge (lip = 15% of the height, 3..7 design px); pressed sinks it onto the edge.
 *  The box (x, y, w, h) includes the lip, so a hit test on b is right in every state. */
export function button(ctx, b, u) {
	let [face, edge] = Array.isArray(b.color) ? b.color : BUTTON[b.on ? 'red' : b.color || 'grey'] || BUTTON.grey;
	if (b.disabled) [face, edge] = BUTTON.disabled;
	const lip = Math.max(3 * u, Math.min(7 * u, b.h * 0.15)), r = Math.min(10 * u, b.h * 0.3);
	const sink = b.pressed && !b.disabled ? lip * 0.7 : 0, fh = b.h - lip;
	ctx.save();
	if (b.focused || b.on) {   // the white focus ring (a controller / keyboard cursor; a chosen tab)
		ctx.fillStyle = '#ffffff';
		roundRect(ctx, b.x - 3 * u, b.y + sink - 3 * u, b.w + 6 * u, b.h - sink + 6 * u, r + 3 * u); ctx.fill();
	}
	ctx.fillStyle = edge; roundRect(ctx, b.x, b.y + sink, b.w, b.h - sink, r); ctx.fill();
	ctx.fillStyle = face; roundRect(ctx, b.x, b.y + sink, b.w, fh, r); ctx.fill();
	if (b.hovered && !b.disabled && !b.pressed) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(ctx, b.x, b.y, b.w, fh, r); ctx.fill(); }
	ctx.restore();
	if (b.label != null && b.label !== '') {
		const size = b.size || Math.min(20, (fh / u) * 0.5);
		const cy = b.y + sink + fh / 2 + (b.sub ? -size * 0.35 * u : 0);
		text(ctx, b.label, b.x + b.w / 2, cy, u, { size, align: 'center', baseline: 'middle', color: b.disabled ? C.disabledText : C.text, maxW: b.w - 10 * u });
		if (b.sub) text(ctx, b.sub, b.x + b.w / 2, cy + size * 0.85 * u, u, { size: size * 0.7, align: 'center', baseline: 'middle', color: b.disabled ? C.disabledText : C.textSoft, maxW: b.w - 10 * u, shadow: false });
	}
}

/** bar(ctx, x, y, w, h, frac, u, opts) — a rounded track (opts.back, default a dark well) filled to frac (0..1) in
 *  opts.color (default red; e.g. an HP colour). */
export function bar(ctx, x, y, w, h, frac, u, opts = {}) {
	const r = h / 2;
	ctx.save();
	ctx.fillStyle = opts.back || 'rgba(0,0,0,0.4)';
	roundRect(ctx, x, y, w, h, r); ctx.fill();
	const f = Math.max(0, Math.min(1, +frac || 0));
	if (f > 0) { ctx.fillStyle = opts.color || C.red; roundRect(ctx, x, y, Math.max(h, w * f), h, r); ctx.fill(); }
	ctx.restore();
}

function wrapLines(ctx, str, maxW) {
	const out = [];
	for (const para of String(str).split('\n')) {
		let line = '';
		for (const word of para.split(' ')) {
			const t = line ? line + ' ' + word : word;
			if (line && ctx.measureText(t).width > maxW) { out.push(line); line = word; } else line = t;
		}
		out.push(line);
	}
	return out;
}

/** tooltip(ctx, x, y, u, {title, body, maxW = 220, anchor = 'top-left' | 'above' (x, y = the point it sits above)})
 *  — a small Balatro tooltip: the panel with the light outline, the title in white, the body as dark text on a white
 *  box. Returns its rect {x, y, w, h}. */
export function tooltip(ctx, x, y, u, opts = {}) {
	const pad = 6 * u, maxW = (opts.maxW || 220) * u, ts = 16, bs = 13;
	ctx.save();
	ctx.font = font(bs * u);
	const lines = opts.body ? wrapLines(ctx, opts.body, maxW - 4 * pad) : [];
	const bodyW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
	ctx.font = font(ts * u);
	const titleW = opts.title ? ctx.measureText(opts.title).width : 0;
	ctx.restore();
	const w = Math.min(maxW, Math.max(titleW + 4 * pad, bodyW + 4 * pad, 80 * u));
	const titleH = opts.title ? (ts + 8) * u : 0, bodyH = lines.length ? lines.length * (bs + 3) * u + 2 * pad : 0;
	const h = pad * 2 + titleH + bodyH + (titleH && bodyH ? pad / 2 : 0);
	if (opts.anchor === 'above') { x -= w / 2; y -= h + 8 * u; }
	panel(ctx, x, y, w, h, u, { outline: 'light', lip: 4, r: 10 });
	let cy = y + pad;
	if (opts.title) { text(ctx, opts.title, x + w / 2, cy + titleH / 2, u, { size: ts, align: 'center', baseline: 'middle' }); cy += titleH + (bodyH ? pad / 2 : 0); }
	if (lines.length) {
		ctx.save(); ctx.fillStyle = '#ffffff'; roundRect(ctx, x + pad, cy, w - 2 * pad, bodyH, 7 * u); ctx.fill(); ctx.restore();
		lines.forEach((l, i) => text(ctx, l, x + w / 2, cy + pad + (i + 0.5) * (bs + 3) * u, u, { size: bs, align: 'center', baseline: 'middle', color: C.textDark, shadow: false }));
	}
	return { x, y, w, h };
}
