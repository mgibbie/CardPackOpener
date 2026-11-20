// site/ui/sfx.js — the Balatro-style UI kit's sound effects: button presses and other UI sounds, NO music.
//
// It plays Micatro's own sound files (micatro/assets/sounds/*.ogg, Balatro's set) the way Micatro does
// (micatro/js/ui/sound.js): WebAudio, a 0.55 master volume, a 35 ms de-dupe of bursts, the owner's audio swaps
// (site/audioswap.js `mt.sound:<name>`, "-" = silence). It is a small separate module rather than an import of
// Micatro's, because that one pulls in the Micatro engine and its music.
//
// SOUND ON / OFF is Micatro's setting, localStorage `micatro_sfx` ('0' = off), so turning sounds off in Micatro,
// Pocket Enhanced, Pair of Pears or Scoundrel turns them off here too (and sfx.setEnabled() writes the same key).
// It is read on every play, so a change made on another page counts at once.
//
// NOTHING PLAYS BEFORE A USER GESTURE: the AudioContext is only made on the first pointerdown / keydown
// (the browsers' autoplay rule); a call before that is dropped, not queued.
//
//   import { sfx } from '/site/ui/sfx.js';
//   sfx.wire(document);          every .bal-btn / .bal-tab / [data-sfx] click plays its sound (see wire below)
//   sfx.press();                 'button'      a button press (Micatro's every button)
//   sfx.back();  sfx.cancel();   'cancel'      back / close / a refused action (Balatro's "not allowed")
//   sfx.error();                 'cancel' low  something was refused
//   sfx.hover();                 'paper1'      soft pitch-jittered rustle (Balatro's card hover), quiet
//   sfx.select();                'highlight1'  picking / highlighting an item
//   sfx.tab();                   'paper1'      changing tab / sort (Balatro's sort buttons)
//   sfx.open();  sfx.close();    'cardSlide1' / 'cardSlide2'   a panel / dialog sliding in / out
//                                (Balatro has no dedicated panel sounds: these are its card slides, quieter)
//   sfx.coin();                  'coin1..3'    money in or out
//   sfx.card();                  'card1'       a card is played / dealt
//   sfx.chips();                 'chips1'      a score tick
//   sfx.win();                   'win'         a win jingle (a sound effect, not music)
//   sfx.play(name, pitch, vol)   any name in sfx.NAMES (or a family 'coin' / 'crumple' / 'glass' / 'whoosh')
//   sfx.enabled() / sfx.setEnabled(on) / sfx.unlocked()
import { pick } from '../audioswap.js?guest=local';   // (guest=local: a visitor not signed in asks the server nothing)

const KEY_SFX = 'micatro_sfx';
const BASE = new URL('../../micatro/assets/sounds/', import.meta.url).href;
const MASTER = 0.55;   // Micatro's master volume

/** Every sound effect Micatro ships (music1.ogg is music: left out on purpose). */
export const NAMES = ['button', 'cancel', 'card1', 'card3', 'cardFan2', 'cardSlide1', 'cardSlide2', 'chips1', 'chips2',
	'coin1', 'coin2', 'coin3', 'coin4', 'coin5', 'coin6', 'coin7', 'crumple1', 'crumple2', 'crumple3', 'crumple4', 'crumple5',
	'crumpleLong1', 'explosion1', 'foil1', 'foil2', 'generic1', 'glass1', 'glass2', 'glass3', 'glass4', 'gold_seal', 'gong',
	'highlight1', 'highlight2', 'holo1', 'magic_crumple', 'multhit1', 'multhit2', 'negative', 'other1', 'paper1',
	'polychrome1', 'slice1', 'tarot1', 'tarot2', 'timpani', 'whoosh', 'whoosh1', 'whoosh2', 'win'];
const KNOWN = new Set(NAMES);

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsPut = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

let ctx = null, master = null, unlocked = false;
const buffers = {}, loading = {}, lastAt = {};

function unlock() {
	if (unlocked) return;
	unlocked = true;
	try {
		ctx = new (window.AudioContext || window.webkitAudioContext)();
		master = ctx.createGain(); master.gain.value = MASTER; master.connect(ctx.destination);
		if (ctx.state === 'suspended') ctx.resume();
	} catch { ctx = null; }
	if (enabled()) for (const n of ['button', 'cancel', 'paper1']) load(n);   // the ones a first press wants at once
}
if (typeof window !== 'undefined') {
	addEventListener('pointerdown', unlock, { capture: true });
	addEventListener('keydown', unlock, { capture: true });
}

function load(name) {
	if (!ctx || buffers[name] || loading[name]) return loading[name];
	loading[name] = fetch(BASE + name + '.ogg').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing ' + name))))
		.then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
		.then((buf) => { buffers[name] = buf; return buf; }).catch(() => null);
	return loading[name];
}

/** Sounds on? (Micatro's setting: anything but '0' is on.) */
export function enabled() { return lsGet(KEY_SFX) !== '0'; }
export function setEnabled(on) { lsPut(KEY_SFX, on ? '1' : '0'); }

/** play(name, pitch = 1, vol = 1): one of NAMES (or 'coin' / 'crumple' / 'glass' / 'whoosh' = its first). */
export function play(name, pitch = 1, vol = 1) {
	if (!unlocked || !ctx || !name || !enabled()) return false;
	name = pick('mt.sound', name, name); if (!name) return false;   // (the owner's swap; "-" is silence)
	if (!KNOWN.has(name)) { if (/^(crumple|coin|glass|whoosh)$/.test(name)) name += '1'; else return false; }
	const now = performance.now();
	if (now - (lastAt[name] || 0) < 35) return false;   // de-dupe bursts (as Micatro)
	lastAt[name] = now;
	if (ctx.state === 'suspended') ctx.resume();
	const go = (buf) => {
		if (!buf || !enabled()) return;
		const s = ctx.createBufferSource(); s.buffer = buf;
		s.playbackRate.value = Math.max(0.3, Math.min(3, pitch || 1));
		const g = ctx.createGain(); g.gain.value = Math.max(0, Math.min(1.5, vol == null ? 1 : vol));
		s.connect(g); g.connect(master); s.start();
	};
	if (buffers[name]) go(buffers[name]); else { const p = load(name); if (p) p.then(go); }
	return true;
}

const jitter = (a) => 1 - a + Math.random() * 2 * a;
const NAMED = {
	press: () => play('button'),
	back: () => play('cancel'),
	cancel: () => play('cancel'),
	error: () => play('cancel', 0.85),
	hover: () => play('paper1', jitter(0.1), 0.35),
	select: () => play('highlight1', 1, 0.5),
	tab: () => play('paper1', 1, 0.7),
	open: () => play('cardSlide1', 1.1, 0.6),
	close: () => play('cardSlide2', 0.9, 0.6),
	coin: () => play('coin' + (1 + Math.floor(Math.random() * 3)), 1, 0.8),
	card: () => play('card1'),
	chips: () => play('chips1', 1, 0.8),
	win: () => play('win', 1, 0.8),
};

/** Which sound a click on `el` makes: its data-sfx (a NAMED key or a sound name; "none" = silent),
 *  else 'back' for .bal-back / [data-sfx-back], 'tab' for a .bal-tab, 'press' for any other button of the kit. */
function soundFor(el) {
	const d = el.getAttribute('data-sfx');
	if (d != null) return d === 'none' || d === '' ? null : d;
	if (el.classList.contains('bal-back')) return 'back';
	if (el.classList.contains('bal-tab')) return 'tab';
	return 'press';
}
const WIRED = '.bal-btn, .bal-tab, [data-sfx], button.bal-row, a.bal-row';
const isOff = (el) => el.disabled || el.classList.contains('is-disabled') || el.getAttribute('aria-disabled') === 'true';

/** wire(root = document, {hover}) — one delegated listener: every click on a kit button inside `root`
 *  (.bal-btn, .bal-tab, button/a.bal-row, or anything with data-sfx) plays its sound (soundFor above). Disabled
 *  buttons are silent. Keyboard Enter/Space and a controller's A (site/focusnav.js .click()) are clicks too.
 *  A mouse hovering a [data-sfx-hover] element (or any kit button, with {hover: true}) plays sfx.hover().
 *  Returns unwire(). Wiring the same root twice does nothing more. */
export function wire(root = document, opts = {}) {
	if (!root || root.__balSfx) return root && root.__balSfx;
	const onClick = (e) => {
		const el = e.target && e.target.closest ? e.target.closest(WIRED) : null;
		if (!el || !root.contains(el) || isOff(el)) return;
		const s = soundFor(el); if (!s) return;
		if (NAMED[s]) NAMED[s](); else play(s);
	};
	const onOver = (e) => {
		if (e.pointerType && e.pointerType !== 'mouse') return;
		const el = e.target && e.target.closest ? e.target.closest(opts.hover ? WIRED + ', [data-sfx-hover]' : '[data-sfx-hover]') : null;
		if (!el || isOff(el) || (e.relatedTarget && el.contains(e.relatedTarget))) return;
		NAMED.hover();
	};
	root.addEventListener('click', onClick, true);
	root.addEventListener('pointerover', onOver, true);
	const off = () => { root.removeEventListener('click', onClick, true); root.removeEventListener('pointerover', onOver, true); root.__balSfx = null; };
	root.__balSfx = off;
	return off;
}

export const sfx = { ...NAMED, play, wire, enabled, setEnabled, unlocked: () => unlocked, NAMES };
export default sfx;
