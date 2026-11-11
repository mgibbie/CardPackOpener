// padnav.js — keyboard + controller navigation for Battlecards' DOM screens
// (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 3; the keyboard joined in controls
// sweep B3). Everyone, guests included (the owner dropped the signed-in-only
// rule on 2026-10-18).
//
// Runs on the site-wide navigator, site/focusnav.js, fed by site/input.js (one
// keyboard listener + one controller poller, the same logical actions from
// both): every visible, clickable thing on the TOP layer is a stop and the
// arrows / WASD / d-pad move to the nearest one in that direction. It covers the
// hub, the lobby, the ~115 run-mode overlay screens, every in-match modal
// (#scry-modal / #walker-menu / #inspect / #card-focus), game over, the deck
// builder, gallery, packs and replays.
//
// ACTIVATING an element replays exactly what a mouse click sends (pointerdown,
// mousedown, pointerup, mouseup, click at its centre). The in-match modals
// listen on pointerdown and stop its propagation; a synthetic click alone would
// never reach them, and switching them to 'click' would let the page-wide
// pointerdown handler close a menu before its button ran. Replaying the real
// sequence keeps every existing handler exactly as it is for mouse and touch.
//
// The owner's map (keyboard / Nintendo-layout pad):
//   arrows, WASD / d-pad, stick   move focus
//   Z / A                         activate            Enter / Start   activate (keyboard) / Space (pad: open a pack, play/pause)
//   X / B                         Esc (back / close)  Q E / L R       ← / → (pages, replay steps, tabs)
//   V / Y                         read the focused card (its rules tip; a page can answer 'bc-inspect')
// Tab still works: Z / Enter act on whatever Tab reached. Focus shows a hover
// (tooltips, card zoom) and a gold ring; moving the mouse hides the ring.
//
// On the match page the BOARD (padboard.js) takes the actions whenever no modal
// is open; this file routes them (one input, one rAF loop for both).
import { startInput, isTyping } from '../site/input.js';
import { createFocusNav, STOP_SELECTOR } from '../site/focusnav.js';

// padboard.js registers { active(), onAction(action, info), onFrame(pad) }
let board = null;
export const setBoard = b => { board = b; };
// a page (packs.js) may take an action first: return true when it did
let pageHandler = null;
export const setPageHandler = fn => { pageHandler = fn; };

const spaceKey = () => { const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
	t.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })); };

// The game's modal containers. A decision modal is a small box over a separate
// veil, so "a big fixed layer" alone can't find it; the page chrome (top bar,
// Back) stays clickable above the veil but must not steal a modal's focus.
const nav = typeof document === 'undefined' ? null : createFocusNav({
	modals: ['#scry-modal', '#walker-menu', '#inspect', '#dungeon-overlay'],
	ringClass: 'padnav-focus',
	pointer: true, hover: true, domFocus: false, scrollFallback: false,
	guard: () => !!(board && board.active()),
	// Enter on a keyboard acts (a DOM page has no "Start"); a pad's Start is Space
	onMenu: info => { if (info.source === 'key') nav.activate(info); else spaceKey(); },
});

export const openModal = () => nav.openModal();
export const candidates = () => nav.candidates();
export const move = dir => { nav.move(dir); };
export const activate = () => nav.activate({ source: 'pad' });

// ---------- Tab and the keyboard ----------
// padnav never moves the real DOM focus (domFocus:false), so a Tab press would
// leave the ring behind. When the DOM focus moved since the last action, the
// next key press starts from where it went: Tab + Z acts on what Tab reached.
let domMoved = false;
function syncFromDom() {
	if (!domMoved) return;
	domMoved = false;
	const el = document.activeElement;
	if (!el || el === document.body || el === nav.focused || !el.matches || !el.matches(STOP_SELECTOR) || isTyping(el)) return;
	if (nav.candidates().includes(el)) nav.focusTo(el);
}

// ---------- V: read the focused card ----------
// A page may answer a 'bc-inspect' event on the focused element (the deck
// builder's and gallery's card page; preventDefault = handled). Otherwise the
// card face nearest the focus that carries a rules tip ([data-tip], game.js
// attachTip) shows it, as a mouse hover would; V again (or moving) hides it.
let tipOn = null;
function tipFor(el) {
	for (let n = el, d = 0; n && n !== document.body && d < 4; n = n.parentElement, d++) {
		if (n.matches('[data-tip]')) return n;
		const all = n.querySelectorAll('[data-tip]');
		if (all.length === 1) return all[0];
		if (all.length > 1) return null;
	}
	return null;
}
function tipEvent(el, type) {
	const r = el.getBoundingClientRect();
	el.dispatchEvent(new PointerEvent(type, { bubbles: false, clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.3, pointerType: 'mouse' }));
}
function hideTip() { if (tipOn) { if (tipOn.isConnected) tipEvent(tipOn, 'pointerleave'); tipOn = null; } }
function inspect(info) {
	if (tipOn) { hideTip(); return true; }
	const list = nav.candidates();
	if (nav.ensureFocus(list) !== 'same') return true;   // first press only shows where you are
	const f = nav.focused;
	const ev = new CustomEvent('bc-inspect', { bubbles: true, cancelable: true, detail: { source: info.source } });
	f.dispatchEvent(ev);
	if (ev.defaultPrevented) return true;
	const t = tipFor(f);
	if (t) { tipEvent(t, 'pointerenter'); tipOn = t; }
	return true;
}

// ---------- back where you were ----------
// Z on a card opens its page / zoom (the ring follows into it); when that layer
// closes again (X, Esc, its ✕), the ring goes back to the card that opened it,
// so the next press acts there instead of only re-showing the focus.
let opener = null;
function reconcile() {
	const check = () => {
		if (!nav.ringOn && !engaged) return;
		const list = nav.candidates();
		if (nav.focused && nav.focused.isConnected && list.includes(nav.focused)) return;
		if (opener && opener.isConnected && list.includes(opener)) { nav.focusTo(opener); opener = null; }
		else if (nav.ringOn) nav.ensureFocus(list);
	};
	// next frame, and again once a closing layer's fade-out has finished
	requestAnimationFrame(check);
	setTimeout(check, 320);
}

// one action for the DOM screens; true = used
function domAction(action, info) {
	if (pageHandler && pageHandler(action, info, nav) === true) return true;
	if (action !== 'context') hideTip();
	if (action === 'confirm' || action === 'menu' || action === 'context') {
		const f = nav.focused;
		if (f && f.isConnected && !nav.openModal()) opener = f;   // a page-level stop opening something
	}
	if (action === 'context') { const r = inspect(info); reconcile(); return r; }
	if (action === 'secondary' || action === 'select') return false;
	const used = nav.onAction(action, info);
	if (action === 'cancel') reconcile();
	return used;
}

// what the player last used: once they're on the keyboard / a pad, a modal that
// opens shows its focus straight away, so the first Z / A acts on it
let engaged = false, lastModal = null;
function onAction(action, info = {}) {
	if (info.event && info.event.defaultPrevented) return false;   // the focused element already handled it (a deck tile's Enter)
	engaged = true;
	if (info.source === 'key') syncFromDom();
	if (board && board.active()) { hideTip(); return board.onAction(action, info) !== false; }
	return domAction(action, info);
}
// (kept for callers that fed pad presses in by hand)
export function onPress(action) { onAction(action, { source: 'pad' }); }

// the RIGHT stick scrolls the open dialog (the game log drawer, a long Discover
// list): its first scrollable box, a few px a frame in proportion to the tilt
function scrollWithRightStick() {
	const pads = window.__owFakePads || (navigator.getGamepads ? [...navigator.getGamepads()] : []);
	let y = 0;
	for (const p of pads) { const v = p && p.connected !== false && p.axes ? +p.axes[3] || 0 : 0; if (Math.abs(v) > Math.abs(y)) y = v; }
	if (Math.abs(y) < 0.3) return;
	const m = nav.openModal();
	if (!m) return;
	const box = [m, ...m.querySelectorAll('*')].find(el => el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY));
	if (box) box.scrollTop += y * 16;
}

let input = null, lastSource = null;
export const getInput = () => input;
export const lastInputSource = () => lastSource;
export function initPadnav() {
	if (input || typeof window === 'undefined') return input;
	document.addEventListener('focusin', () => { domMoved = true; });
	// a layer closed by a real Esc / its ✕ button: the ring goes back to its opener too
	addEventListener('keydown', e => { if (e.key === 'Escape') reconcile(); });   // (the Games switcher replays a quick Esc tap as a synthetic one)
	addEventListener('click', () => { if (nav.ringOn) reconcile(); });
	addEventListener('pointermove', e => { if (e.isTrusted) { engaged = false; hideTip(); } }, { passive: true });
	input = startInput({
		pad: true,
		onAction: (a, info) => { lastSource = info.source; return onAction(a, info); },
		onFrame: p => {
			scrollWithRightStick();
			if (board && board.onFrame) board.onFrame(p);
			// unplugged (the last pad gone, and it was the pad in use): drop the ring
			// and the hover it was showing; focus is kept for the next press
			if (lastSource === 'pad' && nav.ringOn && !p.connected()) { nav.dropRing(); engaged = false; }
			// a modal just opened while the player is on the keyboard / a pad: show its focus now
			if (engaged) {
				const m = (!board || !board.active()) ? nav.openModal() : null;
				if (m !== lastModal) { lastModal = m; if (m && !nav.candidates().includes(nav.focused)) nav.ensureFocus(nav.candidates()); }
			} else lastModal = null;
		},
	});
	window.__padnav = { get focused() { return nav.focused; }, candidates, move, activate, focusTo: nav.focusTo, nav,
		own: list => input.own(list), get source() { return lastSource; } };
	return input;
}
initPadnav();
