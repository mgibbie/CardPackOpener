// ow_menuskin.js — the overworld MENUS' look: the site's Balatro-style kit (site/ui/canvas.js) behind the same small
// API battleui.js gives the menus (C, button, bar, badge, rr, hpColor, TYPE_COLORS, STATUS_BADGE).
//
// Why a module of its own: every overworld menu draws through battleui's helpers, and so does the Pokémon battle
// scene. The menus switch to the Balatro look by importing THIS file instead of battleui.js; the battle scene keeps
// battleui.js untouched (it is restyled on its own). The shapes are the same — `{x, y, w, h, label, ...}` boxes,
// `button(ctx, b, hovered, u)` — so no hit box, tap id or key path moves; only the paint changes.
//
// The look, from Micatro (the reference): grey-blue rounded panels standing on a darker lip, chunky buttons that
// stand on their darker bottom edge, the selected / hovered one ringed in white (Balatro's controller cursor), the
// m6x11 pixel font with a drop shadow, orange for "back", red / green / blue for meaning.
import * as BC from '../site/ui/canvas.js';
import { TYPE_COLORS, STATUS_BADGE } from './battleui.js';

export { TYPE_COLORS, STATUS_BADGE };
export const KIT = BC;   // the kit itself, for a screen that wants a helper the skin does not wrap

/** The menus' colours, under battleui's names (so `BUI.C.dim` etc. keep working), filled from the kit's palette. */
export const C = {
	text: BC.C.text, dim: BC.C.textMuted, faint: 'rgba(255,255,255,0.38)',
	accent: BC.C.attn,                     // a highlight: the chosen value, a flash line, a stat bar (Balatro's orange)
	panel: BC.C.panel, panelBorder: BC.C.panelLine,
	btn: BC.C.panelD, btnHover: '#34464a',  // a row inside a panel / the same row hovered
	hpGreen: BC.C.green, hpYellow: BC.C.gold, hpRed: BC.C.red, barBg: 'rgba(0,0,0,0.4)',
	xp: BC.C.blue, statUp: BC.C.green, statDown: BC.C.red,
	gold: BC.C.gold, money: BC.C.money, blue: BC.C.blue, red: BC.C.red, green: BC.C.green, orange: BC.C.orange,
	felt: BC.C.felt3, dark: BC.C.panelDD, textDark: BC.C.textDark,
};
export const FONT = (px) => BC.font(px);

export function rr(ctx, x, y, w, h, r) { BC.roundRect(ctx, x, y, w, h, r); }

export const hpColor = (frac) => (frac > 0.5 ? C.hpGreen : frac > 0.2 ? C.hpYellow : C.hpRed);

/** bar(ctx, x, y, w, h, frac, color, r) — battleui's signature; the kit's rounded well + fill. */
export function bar(ctx, x, y, w, h, frac, color) {
	BC.bar(ctx, x, y, w, h, frac, 1, { color, back: C.barBg });
}

/** badge(ctx, x, y, w, h, color, label, font) — a small coloured pill (a type, a status) with white shadowed text. */
export function badge(ctx, x, y, w, h, color, label, font) {
	ctx.save();
	ctx.fillStyle = color;
	BC.roundRect(ctx, x, y, w, h, h * 0.35); ctx.fill();
	ctx.fillStyle = 'rgba(0,0,0,0.22)';   // the darker bottom edge every kit shape stands on
	BC.roundRect(ctx, x, y + h * 0.78, w, h * 0.22, Math.min(h * 0.22, h * 0.35)); ctx.fill();
	const px = parseFloat(font) || h * 0.7;
	ctx.font = BC.font(px);
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, px * 0.22); ctx.strokeStyle = 'rgba(0,0,0,0.55)';
	ctx.strokeText(label, x + w / 2, y + h / 2, w - 4);
	ctx.fillStyle = '#fff';
	ctx.fillText(label, x + w / 2, y + h / 2, w - 4);
	ctx.restore();
}

/** panel(ctx, x, y, w, h, u, opts) — the kit's box (see site/ui/canvas.js panel). */
export function panel(ctx, x, y, w, h, u, opts) { BC.panel(ctx, x, y, w, h, u, opts); }

/** row(ctx, x, y, w, h, u, sel, hover, opts) — a list row / tile inside a menu panel: a darker inset on a small lip,
 *  ringed white when it is the selected one (the keyboard / pad cursor), a touch lighter under the mouse. opts.ring =
 *  another ring colour (a starter's type), opts.r = corner radius in design px. */
export function row(ctx, x, y, w, h, u, sel, hover, opts = {}) {
	const r = (opts.r == null ? 8 : opts.r) * u;
	ctx.save();
	if (sel) { ctx.fillStyle = opts.ring || '#ffffff'; BC.roundRect(ctx, x - 2.5 * u, y - 2.5 * u, w + 5 * u, h + 5 * u, r + 2.5 * u); ctx.fill(); }
	ctx.fillStyle = C.dark; BC.roundRect(ctx, x, y + 2 * u, w, h - 2 * u, r); ctx.fill();
	ctx.fillStyle = opts.fill || (sel || hover ? C.btnHover : C.btn); BC.roundRect(ctx, x, y, w, h - 3 * u, r); ctx.fill();
	ctx.restore();
}

/** card(ctx, x, y, w, h, u) — a raised info card inside a menu (the trainer card, the map's rail). */
export function card(ctx, x, y, w, h, u) { BC.panel(ctx, x, y, w, h, u, { fill: C.btn, lip: 4, outline: BC.C.edge, r: 12 }); }

/** text(ctx, s, x, y, u, opts) — the kit's label (m6x11 + Balatro's drop shadow). */
export function text(ctx, s, x, y, u, opts) { return BC.text(ctx, s, x, y, u, opts); }

// a button's colour from what it does: back / close = orange (Balatro's Back), a go / buy / confirm = green,
// a refusal or release = red; everything else the kit's grey. A caller's b.color wins.
const BACKS = /^(CLOSE|BACK|CANCEL|KEEP|NO|DONE|EXIT|LEAVE)$/i;
const GOES = /^(YES|BATTLE|FLY HERE|CONFIRM|OK|BUY|PLAY|GO|START)$/i;
const REDS = /^(RELEASE|DELETE|FORGET)$/i;
export function colorFor(b) {
	if (b.color) return b.color;
	if (b.type && TYPE_COLORS[b.type]) return 'grey';
	const l = String(b.label || '').trim();
	if (b.id === 'close' || BACKS.test(l)) return 'orange';
	if (REDS.test(l)) return 'red';
	if (GOES.test(l)) return 'green';
	return 'grey';
}

/** button(ctx, b, hovered, u) — battleui's signature, the kit's button. b {x, y, w, h, label, sub?, right?, type?,
 *  disabled?, center?, big?, iconPad?, subColor?, color?, tab?, on?}. `hovered` is "hovered OR selected" at every call site, so it
 *  draws the kit's white focus ring (the cursor). The box includes the lip: the hit test stays b. */
export function button(ctx, b, hovered, u) {
	const sel = !!hovered && !b.disabled;
	// a tab (b.tab): Balatro's tabs — the chosen one (b.on) red, the others its dark red; the ring only follows the cursor
	const color = b.tab ? (b.on ? 'red' : 'tab') : colorFor(b);
	BC.button(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: '', color, focused: sel, hovered: sel, disabled: b.disabled }, u);
	const lip = Math.max(3 * u, Math.min(7 * u, b.h * 0.15)), fh = b.h - lip;
	const col = b.disabled ? BC.C.disabledText : C.text;
	const size = (b.big ? 18 : 15);
	const lx = b.x + (b.iconPad || 10 * u);
	const two = !!b.sub;   // a second line under the label
	if (b.center) {
		BC.text(ctx, b.label, b.x + b.w / 2, b.y + (two ? fh * 0.38 : fh / 2), u, { size, align: 'center', baseline: 'middle', color: col, maxW: b.w - 12 * u });
	} else {
		BC.text(ctx, b.label, lx, b.y + (two ? fh * 0.38 : fh / 2), u, { size, baseline: 'middle', color: col, maxW: b.x + b.w - lx - (b.right ? 60 * u : 8 * u) - (b.type ? 52 * u : 0) });
	}
	if (b.sub) BC.text(ctx, b.sub, b.center ? b.x + b.w / 2 : lx, b.y + fh * 0.76, u, { size: 11, align: b.center ? 'center' : 'left', baseline: 'middle', color: b.subColor || BC.C.textSoft, shadow: false, maxW: b.w - 20 * u });
	if (b.right) BC.text(ctx, b.right, b.x + b.w - 10 * u, b.y + (two ? fh * 0.76 : fh / 2), u, { size: two ? 12 : 14, align: 'right', baseline: 'middle', color: b.disabled ? col : /^\$/.test(b.right) ? BC.C.money : BC.C.textSoft });
	if (b.type) {
		badge(ctx, b.x + b.w - 54 * u, b.y + 6 * u, 46 * u, 15 * u, TYPE_COLORS[b.type] || '#888',
			b.type.toUpperCase().slice(0, 8), `${Math.round(10 * u)}px m6x11plus, monospace`);
	}
}
