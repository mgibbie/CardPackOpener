// site/input.js — the site-wide KEYBOARD layer (controls sweep B1).
//
// Turns key presses into the same logical actions site/gamepad.js gives a
// controller, so a game handles ONE vocabulary from both:
//
//   confirm cancel secondary context prev next menu select   up down left right
//
// The owner's map (2026-11-10), by PHYSICAL key (e.code), so Shift and Caps Lock
// never change what a key does:
//
//   Arrows / W A S D   up down left right    (d-pad / left stick)
//   Z                  confirm                (A)
//   X                  cancel                 (B)
//   C                  secondary              (X, the top face button)
//   V                  context                (Y, the left face button)
//   Q / E              prev / next            (L / R)
//   Enter              menu                   (Start)
//   Backspace          select                 (Select)
//
// Esc, Tab, Space and the digits are NOT mapped: they keep their native / in-game
// meaning (a quick Esc tap is each game's own; a held Esc opens the Games
// switcher, site/switcher.js).
//
// Typing never moves anything: while focus is in a text field, a textarea, a
// dropdown, a slider, something contenteditable or the on-screen keyboard
// (site/osk.js), no key becomes an action. Checkboxes and buttons don't count.
//
// Synthetic key events (isTrusted false: padnav's replayed Esc / arrows, a test's
// dispatchEvent) are ignored, so a surface that turns an action back into a key
// can never loop.
//
// USAGE
//   import { startInput } from '/site/input.js';
//   const inp = startInput({
//     onAction(action, { repeat, source, event }) { ...; return true; },  // true = handled (preventDefault)
//     onRelease(action, { forced, source }) {},
//     pad: true,              // also run a site/gamepad.js poller into the same handler
//     own: ['Digit1', 'KeyP'],// keys this surface handles itself (by e.code or e.key)
//   });
//   inp.held('cancel'); inp.direction(); inp.own(['KeyR']); inp.stop();
//
// The pure helpers (actionForKey, isTyping, createKeyboard) take plain objects,
// so node tests drive them without a browser.
import { startGamepad, pausePads, padsPaused, DIRECTIONS } from './gamepad.js';

// physical key (KeyboardEvent.code) -> logical action
export const KEYMAP = Object.freeze({
	ArrowUp: 'up', KeyW: 'up',
	ArrowDown: 'down', KeyS: 'down',
	ArrowLeft: 'left', KeyA: 'left',
	ArrowRight: 'right', KeyD: 'right',
	KeyZ: 'confirm',
	KeyX: 'cancel',
	KeyC: 'secondary',
	KeyV: 'context',
	KeyQ: 'prev',
	KeyE: 'next',
	Enter: 'menu', NumpadEnter: 'menu',
	Backspace: 'select',
});
// e.key fallback, for the rare event with no code (some virtual keyboards)
const BY_KEY = {
	arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
	z: 'confirm', x: 'cancel', c: 'secondary', v: 'context', q: 'prev', e: 'next', enter: 'menu', backspace: 'select',
};
// what to print for an action's key (help text, hint bars)
export const KEY_LABELS = Object.freeze({
	up: '↑/W', down: '↓/S', left: '←/A', right: '→/D', confirm: 'Z', cancel: 'X', secondary: 'C', context: 'V',
	prev: 'Q', next: 'E', menu: 'Enter', select: 'Backspace',
});
export const keyLabel = a => KEY_LABELS[a] || '';

// the action a key event means, or null (modifier chords are never actions:
// Ctrl+C copies, Ctrl+W closes the tab, Alt+← goes back)
export function actionForKey(e) {
	if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
	if (e.code && Object.prototype.hasOwnProperty.call(KEYMAP, e.code)) return KEYMAP[e.code];
	if (e.code) return null;
	return BY_KEY[String(e.key || '').toLowerCase()] || null;
}

// input types that take typed text or arrow keys of their own
const NON_TYPING_INPUTS = /^(checkbox|radio|button|submit|reset|image|file|color|hidden)$/i;
// is this element one the player types into (or steers with the arrows)?
export function isTyping(el = typeof document !== 'undefined' ? document.activeElement : null) {
	if (!el || !el.tagName) return false;
	if (el.closest && el.closest('#osk')) return true;   // the on-screen keyboard
	const tag = String(el.tagName).toUpperCase();
	if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if (tag === 'INPUT') return !NON_TYPING_INPUTS.test(el.type || 'text');
	return !!el.isContentEditable;
}

// ---------- the shared suspend flag ----------
// One for the whole page (on globalThis, so two copies of this module loaded under
// different URLs still agree). Suspending the keyboard pauses the pads too.
const SUSP = globalThis.__mpInputSuspend || (globalThis.__mpInputSuspend = { owners: new Set(), boards: new Set() });
// take the input exclusively (an overlay). Returns the release function. Every
// keyboard surface lets go of what it holds (forced release), every pad poller
// too (site/gamepad.js pausePads), except the ones started with exclusive:true.
export function suspendInput(owner = {}) {
	const unpause = pausePads(owner);
	SUSP.owners.add(owner);
	for (const kb of SUSP.boards) kb.releaseAll();
	let done = false;
	return () => { if (done) return; done = true; SUSP.owners.delete(owner); unpause(); };
}
export const inputSuspended = () => SUSP.owners.size > 0;

// ---------- the keyboard core (pure: feed it event-like objects) ----------
export function createKeyboard(opts = {}) {
	const onPress = opts.onPress || (() => false);
	const onRelease = opts.onRelease || (() => {});
	const owned = new Set(opts.own || []);
	const typing = opts.isTyping || (e => isTyping(e && e.target && e.target.tagName ? e.target : undefined));
	const exclusive = !!opts.exclusive;
	const held = new Set(), since = new Map(), codeOf = new Map();   // action -> the code holding it
	let seq = 0;

	const ownsKey = e => owned.has(e.code) || owned.has(e.key);
	function release(a, forced) {
		if (!held.has(a)) return;
		held.delete(a); since.delete(a); codeOf.delete(a);
		onRelease(a, { forced: !!forced, source: 'key' });
	}
	const api = {
		// returns true when the event became an action that a handler took
		keydown(e) {
			if (e.isTrusted === false) return false;
			if (!exclusive && inputSuspended()) return false;
			if (ownsKey(e) || typing(e)) return false;
			const a = actionForKey(e);
			if (!a) return false;
			const isDir = DIRECTIONS.includes(a);
			const repeat = !!e.repeat || held.has(a);
			if (repeat && !isDir) return true;   // only directions repeat; swallow the rest (still ours)
			if (!held.has(a)) { held.add(a); since.set(a, ++seq); codeOf.set(a, e.code || e.key); }
			return onPress(a, { repeat, source: 'key', event: e }) === true;
		},
		keyup(e) {
			if (e.isTrusted === false) return;
			const a = actionForKey({ code: e.code, key: e.key });   // a modifier pressed meanwhile still lets go
			if (a && held.has(a) && codeOf.get(a) === (e.code || e.key)) release(a, false);
		},
		releaseAll() { for (const a of [...held]) release(a, true); },
		held: a => held.has(a),
		direction() {
			let best = null, t = -1;
			for (const d of DIRECTIONS) if (held.has(d) && since.get(d) > t) { best = d; t = since.get(d); }
			return best;
		},
		own(list) { for (const k of list || []) owned.add(k); return () => { for (const k of list || []) owned.delete(k); }; },
		disown(list) { for (const k of list || []) owned.delete(k); },
	};
	return api;
}

// ---------- browser wiring ----------
// One keyboard listener (and, with pad:true, one controller poller) feeding the
// same onAction. Returns { held, direction, own, stop, pad, keyboard }.
export function startInput(opts = {}) {
	const onAction = opts.onAction || (() => false);
	const onRelease = opts.onRelease || (() => {});
	const kb = createKeyboard({
		own: opts.own, exclusive: opts.exclusive, isTyping: opts.isTyping,
		onPress: (a, info) => onAction(a, info),
		onRelease: (a, info) => onRelease(a, info),
	});
	const target = opts.target || window;
	const capture = !!opts.capture;
	const down = e => { if (kb.keydown(e)) { e.preventDefault(); if (opts.stopPropagation) e.stopPropagation(); } };
	const up = e => kb.keyup(e);
	const letGo = () => kb.releaseAll();
	const onVis = () => { if (document.hidden) kb.releaseAll(); };
	target.addEventListener('keydown', down, capture);
	target.addEventListener('keyup', up, capture);
	addEventListener('blur', letGo);
	document.addEventListener('visibilitychange', onVis);
	SUSP.boards.add(kb);
	let pad = null;
	if (opts.pad) {
		pad = startGamepad({
			readPads: window.__owFakePads ? () => window.__owFakePads : undefined,
			exclusive: opts.exclusive,
			...(opts.padOptions || {}),
			onPress: (a, info) => onAction(a, { ...info, source: 'pad' }),
			onRelease: (a, info) => onRelease(a, { ...info, source: 'pad' }),
			onFrame: opts.onFrame,
		});
	}
	return {
		keyboard: kb, pad,
		held: a => kb.held(a) || !!(pad && pad.held(a)),
		direction: () => kb.direction() || (pad ? pad.direction() : null),
		own: list => kb.own(list),
		stop() {
			target.removeEventListener('keydown', down, capture);
			target.removeEventListener('keyup', up, capture);
			removeEventListener('blur', letGo);
			document.removeEventListener('visibilitychange', onVis);
			SUSP.boards.delete(kb);
			kb.releaseAll();
			if (pad) pad.stop();
		},
	};
}
export { padsPaused };
