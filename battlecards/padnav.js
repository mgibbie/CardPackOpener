// padnav.js — controller navigation for Battlecards' DOM screens
// (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 3). Everyone, guests included
// (the owner dropped the signed-in-only rule on 2026-10-18).
//
// Runs on the site-wide navigator, site/focusnav.js (controls sweep B1): every
// visible, clickable thing on the TOP layer is a stop and the d-pad moves to the
// nearest one in that direction. It covers the lobby, the ~115 run-mode overlay
// screens, every in-match modal (#scry-modal / #walker-menu / #inspect), game
// over, the deck builder, gallery, packs and replays.
//
// ACTIVATING an element replays exactly what a mouse click sends (pointerdown,
// mousedown, pointerup, mouseup, click at its centre). The in-match modals
// listen on pointerdown and stop its propagation; a synthetic click alone would
// never reach them, and switching them to 'click' would let the page-wide
// pointerdown handler close a menu before its button ran. Replaying the real
// sequence keeps every existing handler exactly as it is for mouse and touch.
//
// Buttons (Nintendo layout, site/gamepad.js):
//   d-pad / stick  move focus            confirm (right face)  activate
//   cancel (bottom) Esc (back / close)   LB / RB  ← / → (pages, replay steps)
//   Start           Space (open a pack, play/pause)
// Focus shows a hover (tooltips, card zoom) and a gold ring; moving the mouse
// hides the ring so mouse players never see it.
// (Controller only for now: the keyboard joins in controls sweep B3.)
import { startGamepad } from '../site/gamepad.js';
import { createFocusNav } from '../site/focusnav.js';

// On the match page the BOARD owns the pad whenever no modal is open
// (padboard.js registers this); padnav then handles only the DOM modals.
let boardGuard = null;
export const setBoardGuard = fn => { boardGuard = fn; };

const spaceKey = () => { const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
	t.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); };

// The game's modal containers. A decision modal is a small box over a separate
// veil, so "a big fixed layer" alone can't find it; the page chrome (top bar,
// Back) stays clickable above the veil but must not steal a modal's focus.
const nav = typeof document === 'undefined' ? null : createFocusNav({
	modals: ['#scry-modal', '#walker-menu', '#inspect', '#dungeon-overlay'],
	ringClass: 'padnav-focus',
	pointer: true, hover: true, domFocus: false, scrollFallback: false,
	guard: () => !!(boardGuard && boardGuard()),
	onMenu: spaceKey,
});

export const openModal = () => nav.openModal();
export const candidates = () => nav.candidates();
export const move = dir => { nav.move(dir); };
export const activate = () => nav.activate({ source: 'pad' });
export function onPress(action) { nav.onAction(action, { source: 'pad' }); }

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

let pad = null;
export function initPadnav() {
	if (pad || typeof window === 'undefined') return null;
	pad = startGamepad({
		readPads: window.__owFakePads ? () => window.__owFakePads : undefined,
		onPress,
		// unplugged (the last pad gone): drop the ring and the hover it was showing;
		// focus is kept, so the next press on a reconnected pad picks up there
		onFrame: p => {
			scrollWithRightStick();
			if (!nav.ringOn || p.connected()) return;
			nav.dropRing();
		},
	});
	window.__padnav = { get focused() { return nav.focused; }, candidates, move, activate, focusTo: nav.focusTo, nav };
	return pad;
}
initPadnav();
