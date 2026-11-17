// sheen.js — the holographic surface of a card, drawn with the site's own card shaders.
//
// The shaders are Micatro's (micatro/js/ui/gl.js CardFX: the holo, foil and polychrome passes the owner's Love2D
// project carried as assets/shaders/*.glsl, ported to WebGL there). A pass is run over a plain grey card and the result
// is laid over the card's own drawing, so the card keeps its text and art and takes the shader's colours and lines.
// What is under the pointer drives the pass (as tilting a real card does) and the card leans toward it.
//
// A face says what it has with data-sheen on its .f (main.js face()):
//   holo-art   a holographic rare: the art's background shimmers, the Pokémon itself does not
//   holo       a full-art card: the whole card
//   poly       a rainbow card: the polychrome pass over the whole card
//   gold       a gold card: the holo pass, in gold
//   reverse    a reverse holo (a Deluxe Pack's foil printing): bands of light across the card BODY, not the art.
//              This one is not a shader: the face carries an <i class="rv"> the styles draw, and the pointer moves it.
// Only cards being looked at are drawn live: the one under the mouse, and the ones on show (the inspect view, the
// hover panel, a pack's cards once turned over). Every other card keeps the still sheen of the styles, so a list of
// two thousand cards costs nothing. Without WebGL nothing here draws and the still sheen stays.
import { CardFX } from '../../micatro/js/ui/gl.js';

const W = 142, H = 190, MAX_LIVE = 14;
const PASS = { 'holo-art': 'holo', holo: 'holo', poly: 'polychrome', gold: 'holo' };
const SHOWN = '.pe-insp .big, .pe-tip .pf, .pe-pull.up, .pe-wpick .pf';   // (cards on show: live without a pointer on them)
const TILT = '.pe-insp .big, .pe-pull.up';                                  // (cards that lean toward the pointer)

export function createSheen(stage) {
	let fx = null, grey = null, raf = 0, t0 = performance.now();
	const live = new Map();   // card element -> { kind, canvas, x, y, tx, ty, hover }
	const init = () => {
		if (fx) return fx.usable();
		fx = new CardFX(W, H);
		grey = document.createElement('canvas'); grey.width = 4; grey.height = 4; grey._ver = 1;
		const g = grey.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 4, 4);
		return fx.usable();
	};
	const faceOf = card => card.querySelector(':scope > .f[data-sheen]');
	function add(card) {
		let rec = live.get(card); if (rec) return rec;
		const f = faceOf(card); if (!f || live.size >= MAX_LIVE) return null;
		const kind = f.dataset.sheen;
		rec = { kind, canvas: null, x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, hover: false };
		if (PASS[kind] && init()) {
			const c = document.createElement('canvas'); c.width = W; c.height = H; c.className = 'sheen sh-' + kind; c.setAttribute('aria-hidden', 'true');
			(kind === 'holo-art' ? f.querySelector('.art') || f : f.querySelector('.full') || f).appendChild(c);
			rec.canvas = c;
		}
		card.classList.add('sheen-live');
		live.set(card, rec);
		if (!raf) raf = requestAnimationFrame(tick);
		return rec;
	}
	function drop(card) {
		const rec = live.get(card); if (!rec) return;
		if (rec.canvas) rec.canvas.remove();
		card.classList.remove('sheen-live'); card.style.removeProperty('--sx'); card.style.removeProperty('--sy'); card.style.removeProperty('--tilt');
		live.delete(card);
	}
	function tick(now) {
		raf = 0;
		// the cards on show join; a card that has left the page, or is neither on show nor under the pointer, leaves
		// (on show and actually showing: the hover panel stays in the page, hidden, between uses)
		const shown = card => card.matches(SHOWN) && card.offsetParent !== null;
		for (const card of stage.querySelectorAll(SHOWN)) if (!live.has(card) && card.offsetParent !== null && faceOf(card)) add(card);
		for (const [card, rec] of [...live]) if (!card.isConnected || card.offsetParent === null || (!rec.hover && !shown(card))) drop(card);
		const t = (now - t0) / 1000;
		for (const [card, rec] of live) {
			if (!rec.hover) { rec.tx = 0.5 + 0.32 * Math.sin(t * 0.7); rec.ty = 0.5 + 0.22 * Math.cos(t * 0.53); }   // (no pointer on it: it turns slowly by itself)
			rec.x += (rec.tx - rec.x) * 0.18; rec.y += (rec.ty - rec.y) * 0.18;
			card.style.setProperty('--sx', (rec.x * 100).toFixed(1) + '%'); card.style.setProperty('--sy', (rec.y * 100).toFixed(1) + '%');
			if (card.matches(TILT)) card.style.setProperty('--tilt', rec.hover ? `perspective(46em) rotateY(${((rec.x - 0.5) * 16).toFixed(2)}deg) rotateX(${((0.5 - rec.y) * 14).toFixed(2)}deg)` : 'none');
			if (rec.canvas && fx.usable()) fx.render(grey, rec.canvas, { edition: PASS[rec.kind], t: t * 1.4, fx: [(rec.x - 0.5) * 3.2 + t * 0.12, (rec.y - 0.5) * 2.4] });
		}
		if (live.size) raf = requestAnimationFrame(tick);
	}
	const cardAt = ev => { const c = ev.target && ev.target.closest ? ev.target.closest('.pf') : null; return c && stage.contains(c) && faceOf(c) ? c : null; };
	let over = null;
	stage.addEventListener('pointermove', ev => {
		const card = cardAt(ev);
		if (over && over !== card) { const r = live.get(over); if (r) r.hover = false; over = null; if (!raf && live.size) raf = requestAnimationFrame(tick); }
		if (!card) return;
		const rec = add(card); if (!rec) return;
		const b = card.getBoundingClientRect();
		rec.hover = true; over = card; rec.tx = Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)); rec.ty = Math.max(0, Math.min(1, (ev.clientY - b.top) / b.height));
	});
	// (the pointer left, or pressed: what it pressed may have opened something over the card it was on)
	const rest = () => { if (over) { const r = live.get(over); if (r) r.hover = false; over = null; } };
	stage.addEventListener('pointerleave', rest); stage.addEventListener('pointerdown', rest);
	/** Look for cards on show (called when the page changes: a modal opened, a card turned over). */
	const wake = () => { if (!raf && [...stage.querySelectorAll(SHOWN)].some(c => c.offsetParent !== null)) raf = requestAnimationFrame(tick); };
	return { wake, live: () => [...live.values()].map(r => ({ kind: r.kind, canvas: !!r.canvas, hover: r.hover })), ok: () => init() };
}
