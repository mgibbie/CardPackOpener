// bal-ui.js — Battlecards' side of the site's Balatro-style UI (site/ui/). Every Battlecards page loads it:
//   <link rel="stylesheet" href="/site/ui/balatro.css"> <link rel="stylesheet" href="/battlecards/bal-skin.css">
//   <body class="bal-page">   <script type="module" src="/battlecards/bal-ui.js"></script>
//
// It gives every control on the page Balatro's button-press sounds (the kit's sfx.js: Micatro's .ogg files, no
// music). One delegated listener rather than sfx.wire(), because most Battlecards buttons are built by the pages'
// own scripts (the run-mode screens in game.js, the deck builder's rows...) and not all of them carry a kit class,
// and because the game's own 🔊 switch (bc_sfx_muted_v1) has to silence these too.
//   - a kit button / any <button> / a link / [role=button] / a checkbox presses with a sound; a <select> sounds its pick;
//   - Back, Cancel, Close, ✕ and Skip play Balatro's cancel sound (.bal-back, or the label says so);
//   - [data-sfx="none"] is silent; data-sfx="<call or sound name>" picks the sound; disabled controls are silent;
//   - the site topbar's own controls are left to topbar.js (it is shared by every page and wires itself);
//   - nothing plays before a user gesture (sfx.js only makes its AudioContext on the first pointerdown / keydown).
import { sfx } from '/site/ui/sfx.js';

const PRESSABLE = 'button, a[href], [role="button"], [data-sfx], .bal-btn, .bal-tab, input[type="checkbox"], input[type="radio"]';
// the shared site chrome (site/topbar.js, site/chat.js) is not ours to sound
const FOREIGN = '#mp-topbar, #mp-inbox, #mp-inbox-overlay, #mp-deckpick, #mp-chat, .mp-chat';
const BACK_CLASS = '.bal-back, .back, .mm-cancel, .ob-skip, .cf-close, .lf-close, .z-close, .rb-close';
// a label that starts with an arrow / cross on its own ("✕", "← Back"; not a count like "×2") or with one of these words
const BACK_LABEL = /^\s*(?:[←✕×✖](?:\s|$)|(?:cancel|close|back|skip|leave|exit|no thanks|not now)\b)/i;

const isOff = (el) => el.disabled || el.classList.contains('is-disabled') || el.getAttribute('aria-disabled') === 'true';
const muted = () => { try { return localStorage.getItem('bc_sfx_muted_v1') === '1'; } catch { return false; } };

/** The sound a click on `el` makes (a call name of sfx.js or one of its sound names), or null for silence. */
export function soundFor(el) {
	const d = el.getAttribute('data-sfx');
	if (d != null) return d === 'none' || d === '' ? null : d;
	if (el.matches('input[type="checkbox"], input[type="radio"]')) return 'select';
	if (el.matches(BACK_CLASS)) return 'back';
	if (el.classList.contains('bal-tab') || el.getAttribute('role') === 'tab') return 'tab';
	if (el.matches('button, a') && BACK_LABEL.test(el.textContent || el.getAttribute('aria-label') || '')) return 'back';
	return 'press';
}

/** Play `name` (a call of sfx.js, e.g. 'press' / 'back' / 'coin', or a sound name), unless Battlecards is muted. */
export function play(name) {
	if (!name || muted()) return;
	if (typeof sfx[name] === 'function' && name !== 'play' && name !== 'wire') sfx[name]();
	else sfx.play(name);
}

const pressable = (t) => { const el = t && t.closest ? t.closest(PRESSABLE) : null; return el && !isOff(el) && !el.closest(FOREIGN) ? el : null; };
let wired = false, downEl = null, downAt = 0;
export function wire(root = document) {
	if (wired) return;
	wired = true;
	// A mouse press sounds on the way down, as Balatro's buttons do — and some of the game's controls act on
	// pointerdown and close at once (the response window's choices), so they never get a click. Touch waits for
	// the click: a finger that lands on a tile only to scroll the page must stay silent.
	root.addEventListener('pointerdown', (e) => {
		if (e.pointerType !== 'mouse' || e.button !== 0) return;
		const el = pressable(e.target); if (!el) return;
		downEl = el; downAt = performance.now();
		play(soundFor(el));
	}, true);
	root.addEventListener('click', (e) => {
		const el = pressable(e.target); if (!el) return;
		if (el === downEl && performance.now() - downAt < 2000) { downEl = null; return; }   // (it sounded on the way down)
		play(soundFor(el));
	}, true);
	// a <select> (the deck builder's and the gallery's filters) sounds when a choice is picked: a click on it opens the
	// browser's own list, which does not reliably send the page a click
	root.addEventListener('change', (e) => {
		const el = e.target;
		if (!el || !el.matches || !el.matches('select') || isOff(el) || el.closest(FOREIGN)) return;
		const d = el.getAttribute('data-sfx');
		play(d != null ? (d === 'none' || d === '' ? null : d) : 'select');
	}, true);
}

wire(document);
window.__balUi = { soundFor, play, sfx };   // tests
